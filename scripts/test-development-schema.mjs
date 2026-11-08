import process from "node:process";
import console from "node:console";
import pg from "pg";
import { schemaContract } from "../tests/support/schema-contract.mjs";
import {
  developmentDatabaseConfig,
  developmentTarget,
} from "../src/server/neon-development-config.mts";
import { readMigrations } from "../src/db/migrations.mts";

// Explicit opt-in because even rolled-back fixtures are writes. This is not the
// disposable localhost test harness; its target is separately pinned to dev.
if (
  process.argv.length !== 3 ||
  process.argv[2] !== "--approved-rollback-fixtures"
) {
  console.error(
    "Requiere autorización explícita de fixtures sintéticos con ROLLBACK en development",
  );
  process.exitCode = 2;
} else {
  let client;
  try {
    const mode =
      process.env.F0_05_TEST_CONNECTION === "pooled" ? "pooled" : "direct";
    client = new pg.Client(
      developmentDatabaseConfig(process.env, developmentTarget, mode),
    );
    client.on("error", () => {});
    await client.connect();
    await client.query("BEGIN");
    const target = await client.query(
      "SELECT current_database()=$1 AND current_setting('neon.branch_id',true)=$2 AS matches",
      [developmentTarget.database, developmentTarget.branchId],
    );
    if (target.rows[0]?.matches !== true)
      throw new Error("Destino no autorizado");
    const expected = await readMigrations();
    const actual = (
      await client.query(
        "SELECT version,sha256 FROM finance_meta.schema_migrations ORDER BY version",
      )
    ).rows;
    if (
      JSON.stringify(actual) !==
      JSON.stringify(
        expected.map(({ version, sha256 }) => ({ version, sha256 })),
      )
    )
      throw new Error("Migración no verificada");
    const result = await schemaContract(client);
    await client.query("ROLLBACK");
    const context = await client.query(
      "SELECT current_user = session_user AS role_reset, nullif(current_setting('finance.owner_id',true),'') IS NULL AS owner_reset",
    );
    if (!context.rows[0].role_reset || !context.rows[0].owner_reset)
      throw new Error("Contexto filtrado");
    console.log(
      JSON.stringify({
        development: true,
        connectionMode: mode,
        ...result,
        rollback: true,
        contextReset: true,
      }),
    );
  } catch {
    await client?.query("ROLLBACK").catch(() => {});
    console.error("Falló la prueba F0-05; diagnóstico sensible omitido");
    process.exitCode = 1;
  } finally {
    await client?.end().catch(() => {});
  }
}
