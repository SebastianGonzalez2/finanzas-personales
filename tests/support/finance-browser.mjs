import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { URL } from "node:url";
import { getCookies } from "better-auth/cookies";
import { makeSignature } from "better-auth/crypto";
import pg from "pg";
import { migrateInTransaction } from "../../src/db/migrations.mts";
import { testDatabaseConfig } from "./test-database.mjs";

export const financeTestOrigin = "http://localhost:3108";
export const financeTestSecret = "isolated-finance-browser-fixture-secret";
export const runtimePassword = "isolated-finance-browser-only";

export default async function prepareFinanceBrowserDatabase() {
  const admin = new pg.Client(testDatabaseConfig());
  await admin.connect();
  try {
    await admin.query("BEGIN");
    const {
      rows: [existing],
    } = await admin.query(`
      SELECT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname IN
        ('app_auth','app_access','app_auth_meta','finance','finance_meta','neon_auth'))
        OR EXISTS (SELECT 1 FROM pg_roles WHERE rolname IN
        ('finanzas_google_auth','finanzas_google_finance','finanzas_app')) AS found
    `);
    if (existing.found)
      throw new Error("La base local de pruebas debe estar vacía");
    await admin.query(
      "CREATE SCHEMA neon_auth; REVOKE ALL ON SCHEMA neon_auth FROM PUBLIC",
    );
    await migrateInTransaction(admin);
    await admin.query(
      await readFile(
        new URL(
          "../../src/db/proposals/0003_F0-04_google_only.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    await admin.query(
      `ALTER ROLE finanzas_google_auth PASSWORD '${runtimePassword}'; ALTER ROLE finanzas_google_finance PASSWORD '${runtimePassword}'`,
    );
    await admin.query("COMMIT");
  } finally {
    await admin.end();
  }
  return async () => {
    const cleanup = new pg.Client(testDatabaseConfig());
    await cleanup.connect();
    try {
      await cleanup.query(
        "DROP SCHEMA app_auth,app_access,app_auth_meta,finance,finance_meta,neon_auth CASCADE; DROP ROLE finanzas_google_auth,finanzas_google_finance,finanzas_app",
      );
    } finally {
      await cleanup.end();
    }
  };
}

export async function financeBrowserFixtures() {
  const admin = new pg.Client(testDatabaseConfig());
  await admin.connect();
  try {
    await admin.query("BEGIN");
    const owners = { a: randomUUID(), b: randomUUID() };
    for (const [key, owner] of Object.entries(owners)) {
      const email = `finance-${owner}@example.invalid`;
      const subject = `finance-${owner}`;
      await admin.query("INSERT INTO app_access.allowlist(email) VALUES($1)", [
        email,
      ]);
      await admin.query(
        'INSERT INTO app_auth."user"(id,name,email,"emailVerified","googleSubject") VALUES($1,$2,$3,true,$4)',
        [owner, `Titular de prueba ${key}`, email, subject],
      );
      await admin.query(
        'INSERT INTO app_auth.account("accountId","providerId","userId") VALUES($1,\'google\',$2)',
        [subject, owner],
      );
    }
    const { sessionToken } = getCookies({
      baseURL: financeTestOrigin,
      advanced: { cookiePrefix: "finanzas-google" },
    });
    const cookies = {};
    for (const [session, owner] of [
      ["a1", owners.a],
      ["a2", owners.a],
      ["b", owners.b],
    ]) {
      const token = randomUUID();
      await admin.query(
        'INSERT INTO app_auth.session(token,"userId","expiresAt") VALUES($1,$2,now()+interval \'1 hour\')',
        [token, owner],
      );
      cookies[session] = {
        name: sessionToken.name,
        value: encodeURIComponent(
          `${token}.${await makeSignature(token, financeTestSecret)}`,
        ),
        url: financeTestOrigin,
        httpOnly: true,
      };
    }
    await admin.query("COMMIT");
    return { cookies, owners };
  } finally {
    await admin.end();
  }
}
