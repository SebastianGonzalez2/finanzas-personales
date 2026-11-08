import process from "node:process";
import console from "node:console";
import { open } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { URL } from "node:url";
import pg from "pg";
import {
  developmentDatabaseConfig,
  developmentTarget,
} from "../src/server/neon-development-config.ts";
const roles = ["finanzas_google_auth", "finanzas_google_finance"];
if (!process.argv.includes("--approved-runtime-credentials")) {
  console.log(
    JSON.stringify(
      {
        mode: "plan",
        project: developmentTarget.projectId,
        branch: developmentTarget.branchId,
        roles,
        file: ".env.google.local",
        authReady: false,
        requires:
          "Autorización de contraseñas aleatorias para esos dos roles, posterior al SQL",
      },
      null,
      2,
    ),
  );
} else {
  // wx never overwrites existing local work. Failure retains a closed private
  // file so credentials are not lost if COMMIT's response was ambiguous.
  const file = await open(
    new URL("../.env.google.local", import.meta.url),
    "wx",
    0o600,
  );
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
      "SELECT current_setting('neon.branch_id',true) AS branch,to_regclass('app_auth_meta.migrations') IS NOT NULL AS ready",
    );
    if (r.branch !== developmentTarget.branchId || !r.ready) throw new Error();
    const values = [];
    for (const role of roles) {
      const result = await client.query(
        "SELECT rolsuper OR rolbypassrls OR rolcreatedb OR rolcreaterole AS privileged FROM pg_roles WHERE rolname=$1",
        [role],
      );
      if (result.rowCount !== 1 || result.rows[0].privileged) throw new Error();
      const password = randomBytes(32).toString("base64url");
      const statement = (
        await client.query(
          "SELECT format('ALTER ROLE %I PASSWORD %L',$1::text,$2::text) AS statement",
          [role, password],
        )
      ).rows[0].statement;
      await client.query(statement);
      const url = new URL(
        `postgresql://${developmentTarget.endpointHost.replace(".", "-pooler.")}/${developmentTarget.database}`,
      );
      url.username = role;
      url.password = password;
      url.searchParams.set("sslmode", "verify-full");
      url.searchParams.set("channel_binding", "require");
      values.push(url.href);
    }
    const lines = {
      NEON_PROJECT_ID: developmentTarget.projectId,
      NEON_BRANCH_ID: developmentTarget.branchId,
      DATABASE_URL: "",
      DATABASE_URL_UNPOOLED: "",
      GOOGLE_AUTH_DATABASE_URL: values[0],
      GOOGLE_FINANCE_DATABASE_URL: values[1],
      GOOGLE_AUTH_SECRET: randomBytes(32).toString("base64url"),
      GOOGLE_AUTH_READY: "false",
      GOOGLE_AUTH_ORIGIN: "http://localhost:3000",
      GOOGLE_CLIENT_ID: "",
      GOOGLE_CLIENT_SECRET: "",
    };
    await file.writeFile(
      Object.entries(lines)
        .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
        .join("\n") + "\n",
    );
    await client.query("COMMIT");
    console.log(
      JSON.stringify({
        createdPrivateRuntime: true,
        roles: 2,
        authReady: false,
        oauthCredentialsPresent: false,
      }),
    );
  } catch {
    await client.query("ROLLBACK").catch(() => {});
    console.error(
      "Runtime no confirmado. Archivo privado conservado cerrado; revisar sin imprimirlo.",
    );
    process.exitCode = 1;
  } finally {
    await file.close();
    await client.end().catch(() => {});
  }
}
