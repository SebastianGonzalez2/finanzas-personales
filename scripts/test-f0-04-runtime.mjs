import process from "node:process";
import console from "node:console";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { URL } from "node:url";
import pg from "pg";
import {
  restrictedConfig,
  assertRuntime,
} from "../src/server/auth-database.ts";
import { setOwnerContext } from "../src/db/owner-context.ts";
import { issueAdmission, decideAdmission } from "../src/server/admission.ts";
import { newGrant } from "../src/server/auth-policy.ts";

if (
  process.argv.length !== 3 ||
  process.argv[2] !== "--approved-rollback-fixtures"
) {
  console.error(
    "Requiere --approved-rollback-fixtures; nunca crea identidades Auth.",
  );
  process.exitCode = 2;
} else {
  let checks = 0;
  const pools = [];
  const check = (a, b) => {
    assert.deepEqual(a, b);
    checks++;
  };
  try {
    for (const kind of ["finance", "admission"]) {
      const pool = new pg.Pool(restrictedConfig(process.env, kind));
      pool.on("error", () => {});
      pools.push(pool);
      const client = await pool.connect();
      try {
        await assertRuntime(client, kind);
        checks++;
        await client.query("BEGIN");
        const denied = async (sql) => {
          await client.query("SAVEPOINT denied_probe");
          await assert.rejects(client.query(sql), { code: "42501" });
          checks++;
          await client.query("ROLLBACK TO SAVEPOINT denied_probe");
        };
        await denied("SET ROLE neondb_owner");
        if (kind === "finance") {
          const a = `f004-${randomUUID()}`,
            b = `f004-${randomUUID()}`;
          await setOwnerContext(client, a);
          await client.query(
            "INSERT INTO finance.user_preferences(owner_id,display_currency) VALUES($1,'UYU')",
            [a],
          );
          await setOwnerContext(client, b);
          await client.query(
            "INSERT INTO finance.user_preferences(owner_id,display_currency) VALUES($1,'EUR')",
            [b],
          );
          await setOwnerContext(client, a);
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
                [b],
              )
            ).rowCount,
            0,
          );
          await client.query("SAVEPOINT foreign_insert");
          await assert.rejects(
            client.query(
              "INSERT INTO finance.user_preferences(owner_id) VALUES($1)",
              [`${b}-forged`],
            ),
            { code: "42501" },
          );
          checks++;
          await client.query("ROLLBACK TO SAVEPOINT foreign_insert");
          await client.query("RESET ROLE");
          await assertRuntime(client, kind);
          checks++;
          await denied("SELECT owner_id FROM admission.owners");
          await denied('SELECT * FROM neon_auth."user" LIMIT 0');
        } else {
          // Policy remains revoked. Test the service's real INSERT/SELECT path,
          // inside this rollback transaction, without changing persistent policy.
          const email = `${randomUUID()}@example.invalid`;
          const tx = async (work) => {
            await client.query("SELECT pg_advisory_xact_lock(704004)");
            return work(client);
          };
          check(
            await issueAdmission(
              { email, provider: "credential", code: "invalid" },
              tx,
            ),
            null,
          );
          const event = {
            event_id: randomUUID(),
            user: { id: randomUUID(), email },
            event_data: {
              auth_provider: "google",
              signup_metadata: { admissionId: newGrant() },
            },
          };
          check(await decideAdmission(event, JSON.stringify(event), tx), false);
          await denied("UPDATE admission.policy SET generation=generation+1");
          await denied("SELECT owner_id FROM finance.user_preferences");
        }
        await client.query("ROLLBACK");
        await assertRuntime(client, kind);
        checks++;
      } finally {
        await client.query("ROLLBACK").catch(() => {});
        client.release();
      }
    }
    const evidence = {
      ticket: "F0-04",
      checkedAt: new Date().toISOString(),
      development: true,
      checks,
      rollback: true,
      realRestrictedLogins: true,
      ownerRoleDenied: true,
      syntheticOwners: true,
      authenticatedAuthIdentities: false,
    };
    await writeFile(
      new URL("../docs/evidence/f0-04-runtime.json", import.meta.url),
      JSON.stringify(evidence, null, 2) + "\n",
    );
    console.log(JSON.stringify(evidence));
  } catch (error) {
    console.error(
      JSON.stringify({
        error: "Prueba runtime fallida; secretos omitidos.",
        checks,
        sqlstate:
          typeof error?.code === "string" && /^[A-Z0-9]{5}$/.test(error.code)
            ? error.code
            : null,
      }),
    );
    process.exitCode = 1;
  } finally {
    for (const pool of pools) await pool.end();
  }
}
