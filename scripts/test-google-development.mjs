import process from "node:process";
import console from "node:console";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseEnv } from "node:util";
import { createInterface } from "node:readline";
import { URL } from "node:url";
import pg from "pg";
import { getCookies } from "better-auth/cookies";
import { makeSignature } from "better-auth/crypto";
import {
  googleDatabaseConfig,
  assertGoogleRuntime,
} from "../src/server/google-database.ts";
import { normalizeGoogleEmail } from "../src/server/google-policy.ts";
const { fetch } = globalThis;

// Test-only replay of EXISTING Google-created sessions. No users/sessions are
// minted. Secrets remain only in this process, never in stdout, argv or files.
if (!process.argv.includes("--existing-google-sessions"))
  throw new Error("Requiere prueba explícita de sesiones Google existentes");
const origin = "http://localhost:3000";
if (
  process.env.GOOGLE_AUTH_ORIGIN !== origin ||
  process.env.DATABASE_URL !== "" ||
  process.env.DATABASE_URL_UNPOOLED !== "" ||
  !(process.env.GOOGLE_AUTH_SECRET?.length >= 32)
)
  throw new Error("Runtime privado inválido; valores omitidos");
const pool = new pg.Pool({
  ...googleDatabaseConfig(process.env, "auth"),
  max: 1,
});
pool.on("error", () => {});
const cookieName = getCookies({
  baseURL: origin,
  advanced: { cookiePrefix: "finanzas-google", useSecureCookies: false },
}).sessionToken.name;
const sessions = new Map();
const ids = new Map();
const input = createInterface({ input: process.stdin, terminal: false });
const api = (cookie, suffix = "", headers = {}) =>
  fetch(`${origin}/api/account${suffix}`, {
    headers: { cookie, ...headers },
    redirect: "manual",
  });
async function capture(label) {
  const admin = parseEnv(
    await readFile(
      new URL("../.env.google-admin.local", import.meta.url),
      "utf8",
    ),
  );
  const email = normalizeGoogleEmail(admin.GOOGLE_ALLOWLIST_EMAIL);
  const client = await pool.connect();
  try {
    await assertGoogleRuntime(client, "auth");
    const { rows } = await client.query(
      `SELECT s.token,u.id FROM app_auth.session s
      JOIN app_auth."user" u ON u.id=s."userId" AND u."emailVerified"
      JOIN app_auth.account a ON a."userId"=u.id AND a."providerId"='google' AND a."accountId"=u."googleSubject"
      JOIN app_access.allowlist l ON l.user_id=u.id AND l.google_sub=a."accountId" AND l.email=u.email
      WHERE l.email=$1 AND l.enabled AND s."expiresAt">clock_timestamp()
      ORDER BY s."createdAt" DESC LIMIT 1`,
      [email],
    );
    assert.equal(rows.length, 1);
    const { token, id } = rows[0];
    if (ids.has(label)) assert.equal(id, ids.get(label));
    for (const [other, otherId] of ids)
      if (other !== label) assert.notEqual(id, otherId);
    ids.set(label, id);
    const signature = await makeSignature(
      token,
      process.env.GOOGLE_AUTH_SECRET,
    );
    sessions.set(label, {
      id,
      cookie: `${cookieName}=${encodeURIComponent(`${token}.${signature}`)}`,
    });
  } finally {
    client.release();
  }
}
console.log(
  JSON.stringify({
    ready: true,
    existingSessionsOnly: true,
    privateReplayInMemory: true,
    commands: ["capture A|B", "api A|B", "denied A|B", "quit"],
  }),
);
try {
  for await (const line of input) {
    const [command, label] = line.trim().split(/\s+/);
    if (command === "quit") break;
    try {
      assert.ok(["A", "B"].includes(label));
      if (command === "capture") {
        await capture(label);
      } else if (command === "api") {
        const s = sessions.get(label);
        assert.ok(s);
        const response = await api(s.cookie);
        assert.equal(response.status, 200);
        const data = await response.json();
        assert.deepEqual(Object.keys(data), ["preferences"]);
        assert.equal(
          (await api(s.cookie, "?owner_id=another-owner")).status,
          400,
        );
        const other = label === "A" ? "B" : "A";
        assert.equal(
          (
            await api(s.cookie, "", {
              "x-owner-id": ids.get(other) ?? "another-owner",
            })
          ).status,
          200,
        );
        assert.equal(
          (await api(`${cookieName}=invalid.signature`)).status,
          401,
        );
        assert.match(response.headers.get("cache-control"), /no-store/);
      } else if (command === "denied") {
        const s = sessions.get(label);
        assert.ok(s);
        assert.equal((await api(s.cookie)).status, 401);
      } else throw new Error();
      console.log(
        JSON.stringify({ command, label, passed: true, secretsPrinted: false }),
      );
    } catch {
      console.log(
        JSON.stringify({
          command: ["capture", "api", "denied"].includes(command)
            ? command
            : "invalid",
          label: ["A", "B"].includes(label) ? label : "invalid",
          passed: false,
          detailsOmitted: true,
        }),
      );
    }
  }
} finally {
  input.close();
  await pool.end();
}
