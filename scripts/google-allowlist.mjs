import process from "node:process";
import console from "node:console";
import pg from "pg";
import {
  developmentDatabaseConfig,
  developmentTarget,
} from "../src/server/neon-development-config.ts";
import { normalizeGoogleEmail } from "../src/server/google-policy.ts";
const action = process.argv.includes("--allow")
  ? "allow"
  : process.argv.includes("--revoke")
    ? "revoke"
    : null;
if (!action)
  throw new Error(
    "Elegir --allow o --revoke; correo en archivo privado GOOGLE_ALLOWLIST_EMAIL",
  );
const email = normalizeGoogleEmail(process.env.GOOGLE_ALLOWLIST_EMAIL);
const client = new pg.Client(
  developmentDatabaseConfig(process.env, developmentTarget, "direct"),
);
client.on("error", () => {});
try {
  await client.connect();
  await client.query("BEGIN");
  if (
    (await client.query("SELECT current_setting('neon.branch_id',true) AS id"))
      .rows[0].id !== developmentTarget.branchId
  )
    throw new Error();
  const result =
    action === "allow"
      ? await client.query(
          "INSERT INTO app_access.allowlist(email) VALUES($1) ON CONFLICT(email) DO UPDATE SET enabled=true",
          [email],
        )
      : await client.query(
          "UPDATE app_access.allowlist SET enabled=false WHERE email=$1",
          [email],
        );
  await client.query("COMMIT");
  console.log(
    JSON.stringify({ action, updated: result.rowCount === 1, audited: true }),
  );
} catch {
  await client.query("ROLLBACK").catch(() => {});
  console.error("Autorización no modificada; diagnóstico privado omitido");
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
