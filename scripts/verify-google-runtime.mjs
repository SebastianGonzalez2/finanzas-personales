import process from "node:process";
import console from "node:console";
import assert from "node:assert/strict";
import pg from "pg";
import {
  googleDatabaseConfig,
  assertGoogleRuntime,
} from "../src/server/google-database.ts";
import { developmentTarget } from "../src/server/neon-development-config.ts";
import {
  assertFinanceRlsCoverage,
  financeRlsCoverageSql,
} from "../src/server/finance-rls-coverage.mts";

// Read-only remote diagnostics, no fixtures, identities or secret output.
const results = [];
let stage = "closed-flag";
try {
  assert.equal(process.env.GOOGLE_AUTH_READY, "false");
  for (const kind of ["auth", "finance"]) {
    stage = `${kind}:config`;
    const pool = new pg.Pool(googleDatabaseConfig(process.env, kind));
    pool.on("error", () => {});
    let client;
    try {
      stage = `${kind}:connect`;
      client = await pool.connect();
      await client.query("BEGIN READ ONLY");
      stage = `${kind}:runtime-guard`;
      await assertGoogleRuntime(client, kind);
      stage = `${kind}:privileges`;
      const {
        rows: [p],
      } = await client.query(`SELECT
        has_schema_privilege(current_user,'app_auth','USAGE') AS auth_schema,
        has_schema_privilege(current_user,'finance','USAGE') AS finance_schema,
        (SELECT has_table_privilege(current_user,c.oid,'UPDATE') FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='app_access' AND c.relname='allowlist') AS change_list,
        (SELECT has_table_privilege(current_user,c.oid,'INSERT') FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='app_access' AND c.relname='audit') AS change_audit,
        (SELECT has_table_privilege(current_user,c.oid,'SELECT') FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='finance' AND c.relname='user_preferences') AS finance_read`);
      stage = `${kind}:privileges`;
      assert.equal(p.change_list, false);
      assert.equal(p.change_audit, false);
      assert.equal(p.finance_read, false); // NOINHERIT: finance must SET LOCAL ROLE explicitly.
      assert.equal(p.finance_schema, false);
      assert.equal(p.auth_schema, kind === "auth");
      // Todas las tablas financieras con owner_id: RLS y FORCE RLS (dinámico).
      stage = `${kind}:rls-coverage`;
      const {
        rows: [coverage],
      } = await client.query(financeRlsCoverageSql);
      const financialRlsTables = assertFinanceRlsCoverage(coverage);
      if (kind === "auth") {
        stage = `${kind}:empty-state`;
        const {
          rows: [counts],
        } = await client.query(`SELECT
          (SELECT count(*)::int FROM app_access.allowlist) AS allowed,
          (SELECT count(*)::int FROM app_auth."user") AS users,
          (SELECT count(*)::int FROM app_auth.session) AS sessions`);
        assert.deepEqual(counts, { allowed: 0, users: 0, sessions: 0 });
      } else {
        stage = `${kind}:role-grant`;
        await client.query("SET LOCAL ROLE finanzas_app");
        const {
          rows: [grant],
        } = await client.query(`SELECT
          has_function_privilege(current_user,'app_access.authorize_session(text)','EXECUTE') AS authorize,
          has_table_privilege(current_user,'app_access.allowlist','SELECT') AS list_read,
          has_schema_privilege(current_user,'app_auth','USAGE') AS auth_read`);
        assert.deepEqual(grant, {
          authorize: true,
          list_read: false,
          auth_read: false,
        });
      }
      await client.query("ROLLBACK");
      results.push({
        runtime: kind,
        connected: true,
        leastPrivilege: true,
        financialRlsTables,
      });
    } finally {
      if (client) {
        await client.query("ROLLBACK").catch(() => {});
        client.release();
      }
      await pool.end();
    }
  }
  console.log(
    JSON.stringify(
      {
        project: developmentTarget.projectId,
        branch: developmentTarget.branchId,
        readOnly: true,
        authReady: false,
        emptyAllowlist: true,
        identities: 0,
        sessions: 0,
        results,
      },
      null,
      2,
    ),
  );
} catch (error) {
  const code =
    typeof error?.code === "string" && /^[A-Z0-9_]{1,40}$/.test(error.code)
      ? error.code
      : "SANITIZED";
  console.error(JSON.stringify({ verified: false, stage, code }));
  process.exitCode = 1;
}
