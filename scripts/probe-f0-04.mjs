import process from "node:process";
import console from "node:console";
import { URL } from "node:url";
import { randomBytes } from "node:crypto";
import { writeFile } from "node:fs/promises";
import pg from "pg";
import {
  developmentAuthConfig,
  developmentDatabaseConfig,
  developmentTarget,
} from "../src/server/neon-development-config.mts";
const { fetch, AbortSignal } = globalThis;

// Real development probes only. Email signup is currently DISABLED; .invalid
// address and ephemeral random password cannot reach an actual recipient.
// This proves the current closed-email setting, NOT the future invitation hook.
const evidence = {
  ticket: "F0-04",
  checkedAt: new Date().toISOString(),
  target: {
    project: developmentTarget.projectId,
    branch: developmentTarget.branchId,
  },
  checks: {},
  notTested: [
    "blocking webhook",
    "valid invitation",
    "Google callback/rejection",
    "OTP delivery/expiry/retries",
    "password reset",
    "authenticated revocation",
    "authenticated A/B isolation",
  ],
};
let client;
try {
  const { baseUrl } = developmentAuthConfig(process.env, developmentTarget);
  const call = (path, options = {}) =>
    fetch(`${baseUrl}/${path}`, {
      ...options,
      redirect: "error",
      signal: AbortSignal.timeout(10000),
      cache: "no-store",
    });
  const anon = await call("get-session?disableCookieCache=true");
  evidence.checks.anonymousSessionDenied =
    anon.ok && (await anon.json()) === null;
  const stale = await call("get-session?disableCookieCache=true", {
    headers: {
      cookie: "__Secure-neon-auth.session_token=synthetic-invalid-session",
    },
  });
  evidence.checks.invalidSessionDenied =
    stale.ok && (await stale.json()) === null;
  const jwks = await call(".well-known/jwks.json");
  evidence.checks.ed25519Available =
    jwks.ok &&
    (await jwks.json()).keys.some(
      (k) => k.kty === "OKP" && k.crv === "Ed25519",
    );
  const signup = await call("sign-up/email", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "http://localhost:3000",
    },
    body: JSON.stringify({
      name: "Synthetic F0-04",
      email: `f004-${randomBytes(8).toString("hex")}@example.invalid`,
      password: randomBytes(32).toString("base64url"),
    }),
  });
  const rejected = await signup.json();
  evidence.checks.directEmailErrorCode =
    typeof rejected.code === "string" &&
    /^[A-Z0-9_]{1,100}$/.test(rejected.code)
      ? rejected.code
      : "UNRECOGNIZED";
  evidence.checks.directEmailSignupCurrentlyDisabled =
    !signup.ok &&
    [
      "SIGN_UP_DISABLED",
      "SIGNUP_DISABLED",
      "EMAIL_PASSWORD_SIGN_UP_DISABLED",
    ].includes(rejected.code);
  evidence.checks.directEmailStatus = signup.status;
  client = new pg.Client(
    developmentDatabaseConfig(process.env, developmentTarget, "direct"),
  );
  client.on("error", () => {});
  await client.connect();
  await client.query("BEGIN READ ONLY");
  const result = await client.query(
    `SELECT current_setting('neon.branch_id',true)=$1 AS branch,
    to_regnamespace('admission') IS NOT NULL AS admission_schema_present,
    (SELECT count(*)::int FROM pg_roles WHERE rolname IN ('finanzas_runtime','finanzas_admission')) AS runtime_roles,
    (SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='finance' AND c.relkind='r' AND c.relrowsecurity AND c.relforcerowsecurity) AS protected_finance_tables`,
    [developmentTarget.branchId],
  );
  Object.assign(evidence.checks, result.rows[0]);
  await client.query("ROLLBACK");
  await writeFile(
    new URL("../docs/evidence/f0-04-auth.json", import.meta.url),
    JSON.stringify(evidence, null, 2) + "\n",
  );
  console.log(JSON.stringify(evidence, null, 2));
  if (
    !evidence.checks.anonymousSessionDenied ||
    !evidence.checks.invalidSessionDenied ||
    !evidence.checks.ed25519Available ||
    !evidence.checks.directEmailSignupCurrentlyDisabled ||
    !evidence.checks.branch
  )
    process.exitCode = 1;
} catch {
  console.error("Sonda F0-04 fallida; diagnóstico sensible omitido.");
  process.exitCode = 1;
} finally {
  await client?.query("ROLLBACK").catch(() => {});
  await client?.end().catch(() => {});
}
