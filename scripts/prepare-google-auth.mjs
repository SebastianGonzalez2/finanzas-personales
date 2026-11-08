import process from "node:process";
import console from "node:console";
import pg from "pg";
import { googleMigration, applyGoogleMigration } from "./google-migration.mjs";
import {
  developmentDatabaseConfig,
  developmentTarget,
} from "../src/server/neon-development-config.ts";
const migration = await googleMigration();
console.log(
  JSON.stringify(
    {
      ticket: "F0-04",
      project: developmentTarget.projectId,
      branch: developmentTarget.branchId,
      database: developmentTarget.database,
      path: `src/db/proposals/${migration.version}`,
      sha256: migration.sha256,
      mode: process.argv.includes("--apply") ? "apply" : "plan",
    },
    null,
    2,
  ),
);
if (process.argv.includes("--apply")) {
  if (!process.argv.includes(`--approved-sha256=${migration.sha256}`))
    throw new Error("Requiere autorización expresa del SQL y hash exactos");
  const client = new pg.Client(
    developmentDatabaseConfig(process.env, developmentTarget, "direct"),
  );
  client.on("error", () => {});
  try {
    await client.connect();
    await client.query("BEGIN");
    const {
      rows: [r],
    } = await client.query(
      "SELECT current_setting('neon.branch_id',true) AS branch,to_regclass('finance_meta.schema_migrations') IS NOT NULL AS finance",
    );
    if (r.branch !== developmentTarget.branchId || !r.finance)
      throw new Error("Destino incorrecto");
    const applied = await applyGoogleMigration(client, migration);
    await client.query("COMMIT");
    console.log(JSON.stringify({ applied, alreadyApplied: !applied }));
  } catch {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Migración rechazada; diagnóstico privado omitido");
    process.exitCode = 1;
  } finally {
    await client.end().catch(() => {});
  }
}
