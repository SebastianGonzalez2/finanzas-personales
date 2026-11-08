import process from "node:process";
import console from "node:console";
import { randomBytes } from "node:crypto";
import { writeFile, unlink } from "node:fs/promises";
import { URL } from "node:url";
import pg from "pg";
import {
  developmentDatabaseConfig,
  developmentTarget,
} from "../src/server/neon-development-config.mts";
import {
  restrictedConfig,
  assertRuntime,
} from "../src/server/auth-database.ts";

// Initial credentials for the two explicitly approved roles only. No schema DDL,
// new services or grants. Secret values stay in this process and an ignored file.
const destination = new URL("../.env.runtime.local", import.meta.url);
if (
  process.argv.length !== 3 ||
  process.argv[2] !== "--provision-approved-roles"
) {
  console.error(
    "Requiere --provision-approved-roles; crea configuración privada una sola vez.",
  );
  process.exitCode = 2;
} else {
  let admin;
  let created = false,
    committed = false;
  const probes = [];
  try {
    const roles = ["finanzas_runtime", "finanzas_admission"];
    const passwords = roles.map(() => randomBytes(32).toString("base64url"));
    const env = {
      NEON_PROJECT_ID: developmentTarget.projectId,
      NEON_BRANCH_ID: developmentTarget.branchId,
      NEON_AUTH_BASE_URL: developmentTarget.authBaseUrl,
      NEON_AUTH_COOKIE_SECRET: randomBytes(32).toString("base64url"),
      NEON_ADMISSION_SECRET: randomBytes(32).toString("base64url"),
      AUTH_APP_ORIGIN: "http://localhost:3000",
      NEON_AUTH_ADMISSION_READY: "false",
      // Prevent Next's automatic .env.local loading from filling owner variables.
      DATABASE_URL: "",
      DATABASE_URL_UNPOOLED: "",
    };
    for (let i = 0; i < roles.length; i++) {
      const url = new URL(
        `postgresql://${developmentTarget.endpointHost.replace(".", "-pooler.")}/${developmentTarget.database}`,
      );
      url.username = roles[i];
      url.password = passwords[i];
      url.search = "?sslmode=verify-full&channel_binding=require";
      env[i === 0 ? "DATABASE_RUNTIME_URL" : "DATABASE_ADMISSION_URL"] =
        url.href;
    }
    // Exclusive creation: never overwrite previously configured runtime secrets.
    await writeFile(
      destination,
      Object.entries(env)
        .map(([key, value]) => `${key}=${value}`)
        .join("\n") + "\n",
      { flag: "wx", mode: 0o600 },
    );
    created = true;
    admin = new pg.Client(
      developmentDatabaseConfig(process.env, developmentTarget, "direct"),
    );
    admin.on("error", () => {});
    await admin.connect();
    await admin.query("BEGIN");
    await admin.query("SELECT pg_advisory_xact_lock(704004)");
    const target = await admin.query(
      "SELECT current_setting('neon.branch_id',true)=$1 AND current_database()=$2 AS ok",
      [developmentTarget.branchId, developmentTarget.database],
    );
    if (!target.rows[0].ok) throw new Error("Destino incorrecto");
    const ledger = await admin.query(
      "SELECT sha256 FROM admission.schema_version WHERE version='0002_F0-04_admission.sql'",
    );
    if (
      ledger.rows[0]?.sha256 !==
      "2e085527fae59d84c2ac4183e7f907f219b07c819543a919d7be3fdb078545ab"
    )
      throw new Error("SQL no aprobado");
    for (let i = 0; i < roles.length; i++) {
      // Role identifiers are fixed; generated base64url passwords contain no SQL quotes.
      await admin.query(`ALTER ROLE ${roles[i]} PASSWORD '${passwords[i]}'`);
    }
    if ((await admin.query("COMMIT")).command !== "COMMIT")
      throw new Error("Sin confirmación");
    committed = true;
    for (const kind of ["finance", "admission"]) {
      const pool = new pg.Pool(restrictedConfig(env, kind));
      pool.on("error", () => {});
      const client = await pool.connect();
      try {
        await assertRuntime(client, kind);
        let ownerDenied = false;
        try {
          await client.query("SET ROLE neondb_owner");
        } catch (error) {
          ownerDenied = error.code === "42501";
        }
        if (!ownerDenied) throw new Error("Privilegios excesivos");
        await client.query("RESET ROLE");
        await assertRuntime(client, kind);
        if (kind === "finance") {
          await client.query("BEGIN");
          await client.query("SET LOCAL ROLE finanzas_app");
          const rows = await client.query(
            "SELECT owner_id FROM finance.user_preferences",
          );
          if (rows.rowCount !== 0)
            throw new Error("Contexto ausente con datos");
          await client.query("ROLLBACK");
        }
        probes.push({
          kind,
          login: true,
          ownerRoleDenied: true,
          resetStaysRestricted: true,
        });
      } finally {
        client.release();
        await pool.end();
      }
    }
    console.log(
      JSON.stringify({
        development: true,
        credentialsPrepared: true,
        privateFile: ".env.runtime.local",
        authEnabled: false,
        probes,
      }),
    );
  } catch (error) {
    await admin?.query("ROLLBACK").catch(() => {});
    if (created && !committed) await unlink(destination).catch(() => {});
    console.error(
      JSON.stringify({
        error: "Preparación runtime fallida; secretos omitidos.",
        committed,
        privateFileRetained: created && committed,
        sqlstate:
          typeof error?.code === "string" && /^[A-Z0-9]{5}$/.test(error.code)
            ? error.code
            : null,
      }),
    );
    process.exitCode = 1;
  } finally {
    await admin?.end().catch(() => {});
  }
}
