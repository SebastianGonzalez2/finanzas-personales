import process from "node:process";
import console from "node:console";
import pg from "pg";
import { readMigrations, migrateInTransaction } from "../src/db/migrations.mts";
import {
  developmentDatabaseConfig,
  developmentTarget,
} from "../src/server/neon-development-config.mts";

const migrations = await readMigrations();
const args = process.argv.slice(2);
if (args.length === 0) {
  console.log(
    JSON.stringify(
      {
        mode: "plan-only-no-connection",
        target: developmentTarget,
        migrations: migrations.map(({ version, sha256 }) => ({
          version,
          sha256,
        })),
      },
      null,
      2,
    ),
  );
} else if (
  args.length !== 2 ||
  args[0] !== "--apply" ||
  migrations.length !== 1 ||
  args[1] !== migrations[0].sha256
) {
  console.error(
    "Uso: db:migrate -- --apply <sha256 del SQL expresamente autorizado>",
  );
  process.exitCode = 2;
} else {
  let client;
  try {
    client = new pg.Client(
      developmentDatabaseConfig(process.env, developmentTarget, "direct"),
    );
    client.on("error", () => {});
    await client.connect();
    await client.query("BEGIN");
    const target = await client.query(
      "SELECT current_database() = $1 AND current_setting('neon.branch_id', true) = $2 AS matches",
      [developmentTarget.database, developmentTarget.branchId],
    );
    if (target.rows[0]?.matches !== true)
      throw new Error("Destino no autorizado");
    const applied = await migrateInTransaction(client);
    await client.query("COMMIT");
    console.log(JSON.stringify({ development: true, applied, pending: 0 }));
  } catch {
    await client?.query("ROLLBACK").catch(() => {});
    console.error(
      "Migración rechazada o fallida; diagnóstico sensible omitido. Verificar estado antes de reintentar.",
    );
    process.exitCode = 1;
  } finally {
    await client?.end().catch(() => {});
  }
}
