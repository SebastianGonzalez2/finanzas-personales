import process from "node:process";
import console from "node:console";
import { URL } from "node:url";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import pg from "pg";
import {
  developmentDatabaseConfig,
  developmentTarget,
} from "../src/server/neon-development-config.mts";

const sql = await readFile(
  new URL("../src/db/proposals/0002_F0-04_admission.sql", import.meta.url),
  "utf8",
);
const sha256 = createHash("sha256").update(sql).digest("hex");
const args = process.argv.slice(2);
if (args.length === 0)
  console.log(
    JSON.stringify(
      {
        mode: "plan-no-connection",
        target: developmentTarget,
        sql: "src/db/proposals/0002_F0-04_admission.sql",
        sha256,
      },
      null,
      2,
    ),
  );
else if (
  args.length !== 2 ||
  args[0] !== "--apply-approved-sql" ||
  args[1] !== sha256
) {
  console.error(
    "Se requiere --apply-approved-sql <sha256 expresamente autorizado>.",
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
    const exists = await client.query(
      "SELECT to_regclass('admission.schema_version') IS NOT NULL AS present",
    );
    if (exists.rows[0].present) {
      const history = await client.query(
        "SELECT version,sha256 FROM admission.schema_version",
      );
      if (
        history.rows.length !== 1 ||
        history.rows[0].sha256 !== sha256 ||
        history.rows[0].version !== "0002_F0-04_admission.sql"
      )
        throw new Error("Divergencia");
      console.log(JSON.stringify({ development: true, alreadyApplied: true }));
    } else {
      // Non-secret session setting is consumed by the exact approved SQL ledger.
      await client.query(
        "SELECT set_config('admission.migration_sha256',$1,false)",
        [sha256],
      );
      const result = await client.query(sql);
      if (result.at(-1)?.command !== "COMMIT")
        throw new Error("Sin confirmación");
      console.log(JSON.stringify({ development: true, applied: true, sha256 }));
    }
  } catch {
    await client?.query("ROLLBACK").catch(() => {});
    console.error(
      "Preparación rechazada o fallida; diagnóstico sensible omitido.",
    );
    process.exitCode = 1;
  } finally {
    await client?.end().catch(() => {});
  }
}
