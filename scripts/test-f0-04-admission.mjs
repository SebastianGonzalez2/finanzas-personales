import assert from "node:assert/strict";
import process from "node:process";
import console from "node:console";
import { randomBytes, randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { URL } from "node:url";
import pg from "pg";
import {
  developmentDatabaseConfig,
  developmentTarget,
} from "../src/server/neon-development-config.mts";
import {
  issueAdmission,
  decideAdmission,
  emailDigest,
} from "../src/server/admission.ts";
import { digest, privateDigest } from "../src/server/auth-policy.ts";

// Prepared, NOT executed until SQL + rollback fixtures are explicitly authorized.
// Real SQL, synthetic signed-event output, NOT an OTP/OAuth/Auth E2E test.
if (
  process.argv.length !== 3 ||
  process.argv[2] !== "--approved-rollback-fixtures"
) {
  console.error(
    "Requiere --approved-rollback-fixtures después de autorizar SQL y pruebas.",
  );
  process.exitCode = 2;
} else {
  let client;
  let checks = 0;
  const check = (actual, expected) => {
    assert.deepEqual(actual, expected);
    checks++;
  };
  try {
    // Ephemeral test-only HMAC key; all rows using it are rolled back.
    process.env.NEON_ADMISSION_SECRET = randomBytes(32).toString("hex");
    client = new pg.Client(
      developmentDatabaseConfig(process.env, developmentTarget, "direct"),
    );
    client.on("error", () => {});
    await client.connect();
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(704004)");
    check(
      (
        await client.query(
          "SELECT current_setting('neon.branch_id',true)=$1 AS matches",
          [developmentTarget.branchId],
        )
      ).rows[0].matches,
      true,
    );
    const code = randomBytes(32).toString("base64url");
    const hash = privateDigest(process.env.NEON_ADMISSION_SECRET, "code", code);
    await client.query(
      "UPDATE admission.policy SET generation=generation+1,code_hash=$1 WHERE singleton",
      [hash],
    );
    // The owner has no SET membership in the new service role. Do not grant it
    // for a test. This harness tests SQL logic as admin, NOT runtime login.
    const transaction = async (work) => work(client);
    const privileges = await client.query(`SELECT
      NOT has_table_privilege('finanzas_admission','admission.policy','UPDATE') AS no_rotation,
      NOT has_schema_privilege('finanzas_admission','finance','USAGE') AS no_finance,
      NOT pg_has_role('finanzas_runtime','neondb_owner','MEMBER') AS no_owner,
      NOT has_table_privilege('finanzas_runtime','admission.owners','INSERT') AS no_admit`);
    for (const value of Object.values(privileges.rows[0])) check(value, true);
    const prefix = randomUUID();
    const emailA = `${prefix}-a@example.invalid`,
      emailB = `${prefix}-b@example.invalid`;
    check(
      await issueAdmission(
        { email: emailA, provider: "credential", code: "invalid" },
        transaction,
      ),
      null,
    );
    const a = await issueAdmission(
      { email: emailA, provider: "credential", code },
      transaction,
    );
    const b = await issueAdmission(
      { email: emailB, provider: "google", code },
      transaction,
    );
    check(typeof a, "string");
    check(typeof b, "string");
    const event = (id, email, provider, token) => ({
      event_id: randomUUID(),
      user: { id, email },
      event_data: {
        auth_provider: provider,
        signup_metadata: { admissionId: token },
      },
    });
    const eventA = event(`${prefix}-A`, emailA, "credential", a);
    const eventB = event(`${prefix}-B`, emailB, "google", b);
    const decide = (e) => decideAdmission(e, JSON.stringify(e), transaction);
    check(await decide(eventA), true);
    check(await decide(eventA), true);
    check(
      await decide({ ...eventA, user: { ...eventA.user, id: "other" } }),
      false,
    );
    check(await decide({ ...eventA, event_id: randomUUID() }), false);
    check(
      await decide({
        ...eventB,
        event_data: { ...eventB.event_data, auth_provider: "credential" },
      }),
      false,
    );
    // Prior denial is persisted: create another event for the valid provider.
    eventB.event_id = randomUUID();
    check(await decide(eventB), true);
    check(
      (
        await client.query("SELECT admission.is_admitted($1,$2) AS ok", [
          eventA.user.id,
          emailDigest(emailA),
        ])
      ).rows[0].ok,
      true,
    );
    check(
      (
        await client.query("SELECT admission.is_admitted($1,$2) AS ok", [
          eventA.user.id,
          emailDigest(emailB),
        ])
      ).rows[0].ok,
      false,
    );
    const exp = await issueAdmission(
      { email: `${prefix}-exp@example.invalid`, provider: "google", code },
      transaction,
    );
    await client.query(
      "UPDATE admission.grants SET expires_at=clock_timestamp()-interval '1 second' WHERE token_hash=$1",
      [digest(exp)],
    );
    check(
      await decide(
        event("expired", `${prefix}-exp@example.invalid`, "google", exp),
      ),
      false,
    );
    const pending = await issueAdmission(
      { email: `${prefix}-pending@example.invalid`, provider: "google", code },
      transaction,
    );
    await client.query(
      "UPDATE admission.policy SET generation=generation+1 WHERE singleton",
    );
    check(
      await decide(
        event(
          "pending",
          `${prefix}-pending@example.invalid`,
          "google",
          pending,
        ),
      ),
      false,
    );
    check(
      (
        await client.query("SELECT admission.is_admitted($1,$2) AS ok", [
          eventA.user.id,
          emailDigest(emailA),
        ])
      ).rows[0].ok,
      true,
    );
    const attemptsEmail = `${prefix}-attempts@example.invalid`;
    for (let i = 0; i < 5; i++)
      check(
        await issueAdmission(
          { email: attemptsEmail, provider: "credential", code: "invalid" },
          transaction,
        ),
        null,
      );
    check(
      await issueAdmission(
        { email: attemptsEmail, provider: "credential", code },
        transaction,
      ),
      null,
    );
    await client.query(
      "UPDATE admission.policy SET code_hash=NULL,generation=generation+1 WHERE singleton",
    );
    check(
      await issueAdmission(
        {
          email: `${prefix}-revoked@example.invalid`,
          provider: "google",
          code,
        },
        transaction,
      ),
      null,
    );
    // Actual F0-05 RLS with synthetic owners: fixtures never commit.
    await client.query(
      "INSERT INTO finance.user_preferences(owner_id,display_currency) VALUES($1,'UYU'),($2,'EUR')",
      [eventA.user.id, eventB.user.id],
    );
    await client.query("SET LOCAL ROLE finanzas_app");
    await client.query("SELECT set_config('finance.owner_id',$1,true)", [
      eventA.user.id,
    ]);
    check(
      (
        await client.query(
          "SELECT display_currency FROM finance.user_preferences",
        )
      ).rows,
      [{ display_currency: "UYU" }],
    );
    check(
      (
        await client.query(
          "SELECT display_currency FROM finance.user_preferences WHERE owner_id=$1",
          [eventB.user.id],
        )
      ).rowCount,
      0,
    );
    await client.query("RESET ROLE");
    await client.query("ROLLBACK");
    check(
      (
        await client.query(
          "SELECT count(*)::int AS n FROM admission.owners WHERE owner_id=$1",
          [eventA.user.id],
        )
      ).rows[0].n,
      0,
    );
    const evidence = {
      ticket: "F0-04",
      checkedAt: new Date().toISOString(),
      development: true,
      checks,
      rollback: true,
      authenticatedIdentities: false,
      admissionRoleLoginTested: false,
    };
    await writeFile(
      new URL("../docs/evidence/f0-04-admission.json", import.meta.url),
      JSON.stringify(evidence, null, 2) + "\n",
    );
    console.log(JSON.stringify(evidence));
  } catch (error) {
    await client?.query("ROLLBACK").catch(() => {});
    console.error(
      JSON.stringify({
        error: "Pruebas de admisión fallidas; datos sensibles omitidos.",
        checksBeforeFailure: checks,
        sqlstate:
          typeof error?.code === "string" && /^[A-Z0-9]{5}$/.test(error.code)
            ? error.code
            : null,
      }),
    );
    process.exitCode = 1;
  } finally {
    await client?.end().catch(() => {});
  }
}
