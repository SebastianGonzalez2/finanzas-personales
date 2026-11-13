import process from "node:process";
import console from "node:console";
import pg from "pg";
import {
  ProductionMigrationError,
  migrateProductionInTransaction,
  readProductionManifest,
} from "../src/db/production-migrations.mts";
import {
  ProductionConfigError,
  assertProductionOwnerSession,
  productionDatabaseConfig,
  productionTarget,
} from "../src/server/neon-production-config.mts";

// Herramienta EXCLUSIVA de Neon production. El plan no abre conexión; aplicar
// exige el SHA-256 del manifiesto completo impreso por el plan. Las variables
// de entorno no seleccionan el destino: solo confirman el fijado en código.
const manifest = await readProductionManifest();
const args = process.argv.slice(2);
if (args.length === 0) {
  console.log(
    JSON.stringify(
      {
        mode: "plan-only-no-connection",
        environment: "production",
        target: productionTarget,
        migrationsCount: manifest.entries.length,
        migrations: manifest.entries,
        manifestSha256: manifest.sha256,
        applyCommand: `npm run db:migrate:production -- --apply ${manifest.sha256}`,
      },
      null,
      2,
    ),
  );
} else if (args.length !== 2 || args[0] !== "--apply") {
  console.error(
    "Uso: npm run db:migrate:production -- --apply <sha256 del manifiesto impreso por el plan>",
  );
  process.exitCode = 2;
} else if (args[1] !== manifest.sha256) {
  // Rechazo antes de abrir conexión: la autorización debe ser exactamente el
  // hash del manifiesto vigente; si el disco cambió, regenerar el plan.
  console.error(
    "Autorización rechazada: el hash indicado no es el manifiesto vigente; regenerar el plan y revisar los cambios antes de reintentar.",
  );
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
    const result = await migrateProductionInTransaction(
      client,
      manifest.sha256,
    );
    await client.query("COMMIT");
    console.log(
      JSON.stringify(
        {
          production: true,
          manifestSha256: result.manifestSha256,
          applied: result.completed,
          alreadyApplied: result.alreadyApplied,
          pending: 0,
        },
        null,
        2,
      ),
    );
  } catch (error) {
    await client?.query("ROLLBACK").catch(() => {});
    const controlled =
      error instanceof ProductionMigrationError ||
      error instanceof ProductionConfigError;
    console.error(
      controlled
        ? `Migración rechazada: ${error.message}`
        : "Migración rechazada o fallida; diagnóstico sensible omitido. Verificar estado antes de reintentar.",
    );
    process.exitCode = 1;
  } finally {
    await client?.end().catch(() => {});
  }
}
