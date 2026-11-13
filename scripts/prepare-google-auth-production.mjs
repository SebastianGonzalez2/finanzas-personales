import process from "node:process";
import console from "node:console";
import pg from "pg";
import {
  GoogleAuthProductionError,
  applyGoogleAuthProduction,
  googleAuthProductionMigration,
} from "../src/db/google-auth-production.mts";
import {
  ProductionConfigError,
  assertProductionOwnerSession,
  productionDatabaseConfig,
  productionTarget,
} from "../src/server/neon-production-config.mts";

// Herramienta EXCLUSIVA de Neon production para el SQL de Google Auth. El plan
// no abre conexión; aplicar exige el SHA-256 exacto del SQL vigente. Rechaza
// ejecuciones duplicadas e historiales divergentes; idempotente por registro.
const migration = await googleAuthProductionMigration();
const args = process.argv.slice(2);
console.log(
  JSON.stringify(
    {
      ticket: "F0-04",
      environment: "production",
      project: productionTarget.projectId,
      branch: productionTarget.branchId,
      database: productionTarget.database,
      path: `src/db/proposals/${migration.version}`,
      sha256: migration.sha256,
      mode: args.includes("--apply") ? "apply" : "plan",
    },
    null,
    2,
  ),
);
if (!args.includes("--apply")) {
  // Solo plan: sin conexión ni cambios.
} else if (!args.includes(`--approved-sha256=${migration.sha256}`)) {
  console.error("Requiere autorización expresa del SQL y hash exactos");
  process.exitCode = 2;
} else {
  let client;
  try {
    client = new pg.Client(
      productionDatabaseConfig(process.env, productionTarget, "direct"),
    );
    client.on("error", () => {});
    await client.connect();
    await client.query("BEGIN");
    await assertProductionOwnerSession(client);
    await applyGoogleAuthProduction(client, migration, migration.sha256);
    await client.query("COMMIT");
    console.log(JSON.stringify({ applied: true, alreadyApplied: false }));
  } catch (error) {
    await client?.query("ROLLBACK").catch(() => {});
    const controlled =
      error instanceof GoogleAuthProductionError ||
      error instanceof ProductionConfigError;
    console.error(
      controlled
        ? `Migración rechazada: ${error.message}`
        : "Migración rechazada o fallida; diagnóstico sensible omitido",
    );
    process.exitCode = 1;
  } finally {
    await client?.end().catch(() => {});
  }
}
