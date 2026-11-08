import process from "node:process";
import console from "node:console";
import { randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { URL } from "node:url";
import pg from "pg";
import {
  developmentAuthConfig,
  developmentDatabaseConfig,
  developmentTarget,
} from "../src/server/neon-development-config.mts";
const { fetch, AbortSignal } = globalThis;

// One direct, uninvited synthetic attempt. Requires the explicitly authorized
// phase-2 window, zero existing identities and a revoked invitation. Never opens
// signups itself. Operator MUST close signups on unexpected creation or failure.
if (!process.argv.includes("--approved-phase2-preflight")) {
  console.error("Requiere ventana fase 2 autorizada y código revocado.");
  process.exit(1);
}
const file = new URL(
  "../docs/evidence/f0-04-live-admission.json",
  import.meta.url,
);
const client = new pg.Client(
  developmentDatabaseConfig(process.env, developmentTarget, "direct"),
);
client.on("error", () => {});
try {
  await client.connect();
  const snapshot = async () =>
    (
      await client.query(`SELECT
        current_setting('neon.branch_id',true) AS branch,
        (SELECT count(*)::int FROM neon_auth."user") AS users,
        (SELECT code_hash IS NULL FROM admission.policy WHERE singleton) AS revoked`)
    ).rows[0];
  const before = await snapshot();
  if (
    before.branch !== developmentTarget.branchId ||
    before.users !== 0 ||
    !before.revoked
  )
    throw new Error("Precondición incumplida");
  const { baseUrl } = developmentAuthConfig(process.env, developmentTarget);
  const response = await fetch(`${baseUrl}/sign-up/email`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://finanzas-personales-f0-04.vercel.app",
    },
    body: JSON.stringify({
      name: "Synthetic F0-04",
      email: `f004-${randomBytes(8).toString("hex")}@example.invalid`,
      password: randomBytes(32).toString("base64url"),
    }),
    signal: AbortSignal.timeout(25000),
    redirect: "error",
  });
  const body = await response.json();
  const after = await snapshot();
  const result = {
    checkedAt: new Date().toISOString(),
    method: "direct_email_without_invitation",
    status: response.status,
    code:
      typeof body.code === "string" && /^[A-Z0-9_]{1,100}$/.test(body.code)
        ? body.code
        : "UNRECOGNIZED",
    userReturned: !!body.user,
    tokenReturned: !!body.token,
    authUsersBefore: before.users,
    authUsersAfter: after.users,
    codeRevoked: after.revoked,
  };
  const evidence = JSON.parse(await readFile(file, "utf8"));
  evidence.attempts.push(result);
  await writeFile(file, JSON.stringify(evidence, null, 2) + "\n");
  console.log(JSON.stringify(result));
  if (
    response.ok ||
    result.code !== "INVITATION_REQUIRED" ||
    result.userReturned ||
    result.tokenReturned ||
    after.users !== 0 ||
    !after.revoked
  )
    process.exitCode = 1;
} catch {
  console.error(
    "Preflight falló; cerrar altas y revisar diagnóstico sanitizado.",
  );
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
