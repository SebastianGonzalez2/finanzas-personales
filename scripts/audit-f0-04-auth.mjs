import process from "node:process";
import console from "node:console";
import { randomBytes } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { URL } from "node:url";
import pg from "pg";
import {
  developmentAuthConfig,
  developmentDatabaseConfig,
  developmentTarget,
} from "../src/server/neon-development-config.mts";
import { auditManagedConfig } from "./f0-04-auth-audit-lib.mjs";
const { fetch, AbortSignal } = globalThis;

// Read-only SQL. The optional POST only probes signup while disableSignUp=true;
// it never enables signups, rotates codes or allows a before_create event.
const closedProbe = process.argv.includes("--probe-closed-signup");
if (process.argv.slice(2).some((arg) => arg !== "--probe-closed-signup"))
  throw new Error("Opción no admitida");
const client = new pg.Client(
  developmentDatabaseConfig(process.env, developmentTarget, "direct"),
);
client.on("error", () => {});
try {
  const { baseUrl } = developmentAuthConfig(process.env, developmentTarget);
  await client.connect();
  await client.query("BEGIN READ ONLY");
  const branch = await client.query(
    "SELECT current_setting('neon.branch_id',true) AS id",
  );
  if (branch.rows[0]?.id !== developmentTarget.branchId)
    throw new Error("Rama incorrecta");
  const snapshot = async () => {
    const result = await client.query(`SELECT
      current_setting('neon.branch_id',true) AS connected_branch,
      endpoint_id, email_and_password, webhook_config,
      (SELECT code_hash IS NULL FROM admission.policy WHERE singleton) AS code_revoked,
      (SELECT count(*)::int FROM neon_auth."user") AS auth_users
      FROM neon_auth.project_config`);
    if (result.rowCount !== 1) throw new Error("Configuración ambigua");
    return result.rows[0];
  };
  const before = await snapshot();
  const report = {
    ticket: "F0-04",
    checkedAt: new Date().toISOString(),
    project: developmentTarget.projectId,
    branch: developmentTarget.branchId,
    sqlReadOnly: true,
    ...auditManagedConfig(before),
    authUsersBefore: before.auth_users,
  };
  const call = (path, options = {}) =>
    fetch(`${baseUrl}/${path}`, {
      ...options,
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });
  const schema = await call("open-api/generate-schema");
  const contract = await schema.json();
  report.providerContract = {
    status: schema.status,
    ownServerUrl:
      contract.servers?.length === 1 && contract.servers[0].url === baseUrl,
    emailSignupDeclaresAdditionalData: Object.hasOwn(
      contract.paths?.["/sign-up/email"]?.post?.requestBody?.content?.[
        "application/json"
      ]?.schema?.properties ?? {},
      "additionalData",
    ),
  };
  if (closedProbe) {
    // A closed window and zero identities are mandatory. No automatic repair.
    if (
      !report.checks.emailSignupsDisabled ||
      !report.checks.invitationRevoked ||
      before.auth_users !== 0
    )
      throw new Error("Precondición de prueba cerrada incumplida");
    const response = await call("sign-up/email", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "https://finanzas-personales-f0-04.vercel.app",
      },
      body: JSON.stringify({
        name: "Synthetic F0-04 closed probe",
        email: `f004-${randomBytes(8).toString("hex")}@example.invalid`,
        password: randomBytes(32).toString("base64url"),
      }),
    });
    const body = await response.json();
    report.closedSignupProbe = {
      status: response.status,
      code:
        typeof body.code === "string" && /^[A-Z0-9_]{1,100}$/.test(body.code)
          ? body.code
          : "UNRECOGNIZED",
      userReturned: !!body.user,
      tokenReturned: !!body.token,
    };
  }
  const after = await snapshot();
  report.authUsersAfter = after.auth_users;
  report.remainedClosed =
    after.email_and_password?.disableSignUp === true && after.code_revoked;
  await client.query("ROLLBACK");
  await writeFile(
    new URL(
      "../docs/evidence/f0-04-managed-config-audit.json",
      import.meta.url,
    ),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report, null, 2));
  const probe = report.closedSignupProbe;
  if (
    report.blockingReasons.length ||
    !report.providerContract.ownServerUrl ||
    !report.remainedClosed ||
    after.auth_users !== before.auth_users ||
    (probe &&
      (probe.userReturned ||
        probe.tokenReturned ||
        ![
          "SIGN_UP_DISABLED",
          "SIGNUP_DISABLED",
          "EMAIL_PASSWORD_SIGN_UP_DISABLED",
        ].includes(probe.code)))
  )
    process.exitCode = 1;
} catch {
  console.error("Auditoría incompleta; detalles privados omitidos.");
  process.exitCode = 1;
} finally {
  await client.query("ROLLBACK").catch(() => {});
  await client.end().catch(() => {});
}
