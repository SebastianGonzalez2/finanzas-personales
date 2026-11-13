import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID, generateKeyPairSync, sign, createHash } from "node:crypto";
import { Buffer } from "node:buffer";
import { URL } from "node:url";
import pg from "pg";
import { testDatabaseConfig } from "../support/test-database.mjs";
import { migrateInTransaction } from "../../src/db/migrations.mts";
import { createGoogleAuth } from "../../src/server/google-auth-factory.ts";
import { handleGoogleHttp } from "../../src/server/google-http.ts";
import { withOwnerTransaction } from "../../src/db/owner-context.ts";
import { setGoogleAllowed } from "../../scripts/google-allowlist-admin.mjs";
const { Request, Response, Headers, URLSearchParams } = globalThis;

// Real PostgreSQL, actual Better Auth OAuth handler/crypto. Google transport alone
// is simulated; no real Google or Neon request is permitted by this harness.
test(
  "F0-04: Google OAuth, hooks, allowlist, revocación y A/B con PostgreSQL real",
  { timeout: 60000 },
  async (t) => {
    const config = testDatabaseConfig();
    const admin = new pg.Client(config);
    await admin.connect();
    let authPool, financePool;
    try {
      await admin.query("BEGIN");
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
        "ALTER ROLE finanzas_google_auth PASSWORD 'isolated-fixture-only'; ALTER ROLE finanzas_google_finance PASSWORD 'isolated-fixture-only'",
      );
      await admin.query("COMMIT");
      const local = {
        host: "127.0.0.1",
        port: 55432,
        database: "neondb",
        password: "isolated-fixture-only",
        max: 4,
      };
      authPool = new pg.Pool({ ...local, user: "finanzas_google_auth" });
      financePool = new pg.Pool({ ...local, user: "finanzas_google_finance" });
      const origin = "http://localhost:3000";
      const auth = createGoogleAuth(authPool, {
        origin,
        secret: "synthetic-secret-with-more-than-32-characters",
        clientId: "fixture-google-client",
        clientSecret: "fixture-google-secret",
      });
      const { publicKey, privateKey } = generateKeyPairSync("rsa", {
        modulusLength: 2048,
      });
      const jwk = {
        ...publicKey.export({ format: "jwk" }),
        kid: "fixture-key",
        alg: "RS256",
        use: "sig",
      };
      let profile, authorizationUrl;
      let providerUnavailable = false;
      let invalidSignature = false;
      t.mock.method(globalThis, "fetch", async (url, options) => {
        const target = String(url);
        if (target === "https://www.googleapis.com/oauth2/v3/certs")
          return Response.json({ keys: [jwk] });
        assert.equal(
          target,
          "https://oauth2.googleapis.com/token",
          "No network outside simulated Google",
        );
        if (providerUnavailable) throw new Error("Synthetic provider outage");
        const params = new URLSearchParams(options.body);
        assert.equal(
          params.get("redirect_uri"),
          `${origin}/api/auth/callback/google`,
        );
        assert.equal(params.get("client_id"), "fixture-google-client");
        const verifier = params.get("code_verifier");
        assert.equal(
          createHash("sha256").update(verifier).digest("base64url"),
          authorizationUrl.searchParams.get("code_challenge"),
        );
        const now = Math.floor(Date.now() / 1000);
        const claims = {
          iss: "https://accounts.google.com",
          aud: "fixture-google-client",
          iat: now,
          exp: now + 3600,
          ...profile,
        };
        const nonce = authorizationUrl.searchParams.get("nonce");
        if (nonce) claims.nonce = nonce;
        const input =
          Buffer.from(
            JSON.stringify({ alg: "RS256", kid: "fixture-key" }),
          ).toString("base64url") +
          "." +
          Buffer.from(JSON.stringify(claims)).toString("base64url");
        let idToken =
          input +
          "." +
          sign("RSA-SHA256", Buffer.from(input), privateKey).toString(
            "base64url",
          );
        if (invalidSignature) {
          const parts = idToken.split(".");
          parts[2] = (parts[2][0] === "A" ? "B" : "A") + parts[2].slice(1);
          idToken = parts.join(".");
        }
        return Response.json({
          access_token: "synthetic-access-token",
          token_type: "Bearer",
          expires_in: 3600,
          id_token: idToken,
          scope: "openid email profile",
        });
      });
      const deps = { enabled: true, origin, handler: (r) => auth.handler(r) };
      const cookieHeader = (response) =>
        response.headers
          .getSetCookie()
          .map((v) => v.split(";")[0])
          .join("; ");
      async function begin(resetWindow = true) {
        // Independent scenarios model elapsed windows without sleeping. Only
        // this isolated local test admin changes the fixture clock.
        if (resetWindow)
          await admin.query('UPDATE app_auth."rateLimit" SET "lastRequest"=0');
        const r = await handleGoogleHttp(
          new Request(`${origin}/api/auth/sign-in/social`, {
            method: "POST",
            headers: { origin, "content-type": "application/json" },
            body: JSON.stringify({ provider: "google" }),
          }),
          ["sign-in", "social"],
          deps,
        );
        assert.equal(r.status, 200);
        authorizationUrl = new URL((await r.json()).url);
        assert.deepEqual(
          new Set(authorizationUrl.searchParams.get("scope").split(" ")),
          new Set(["openid", "email", "profile"]),
        );
        return {
          state: authorizationUrl.searchParams.get("state"),
          cookie: cookieHeader(r),
        };
      }
      async function callback(start, p) {
        profile = p;
        const url = new URL(`${origin}/api/auth/callback/google`);
        url.searchParams.set("state", start.state);
        url.searchParams.set("code", "synthetic-code");
        return handleGoogleHttp(
          new Request(url, { headers: { cookie: start.cookie } }),
          ["callback", "google"],
          deps,
        );
      }
      const count = async () =>
        Number(
          (await admin.query('SELECT count(*) FROM app_auth."user"')).rows[0]
            .count,
        );
      const google = (email, sub, verified = true) => ({
        email,
        sub,
        email_verified: verified,
        name: "Synthetic",
      });
      const fresh = async (cookie) =>
        auth.api.getSession({
          headers: new Headers({ cookie }),
          query: { disableCookieCache: true },
        });
      await t.test(
        "CA-002: OAuth directo no autorizado y email no verificado no crean usuarios",
        async () => {
          const unauthorized = await callback(
            await begin(),
            google("outsider@example.invalid", "outside"),
          );
          assert.notEqual(
            unauthorized.headers.get("location"),
            `${origin}/resumen`,
          );
          assert.equal(await count(), 0);
          assert.equal(
            (await admin.query("SELECT count(*) FROM app_auth.session")).rows[0]
              .count,
            "0",
          );
          await admin.query(
            "INSERT INTO app_access.allowlist(email) VALUES('a@example.invalid'),('b@example.invalid')",
          );
          await callback(
            await begin(),
            google("a@example.invalid", "google-A", false),
          );
          assert.equal(await count(), 0);
        },
      );
      let a, b;
      await t.test(
        "CA-003: dos OAuth autorizados crean dueños separados; retorno conserva identidad",
        async () => {
          const ar = await callback(
            await begin(),
            google("a@example.invalid", "google-A"),
          );
          assert.equal(ar.headers.get("location"), `${origin}/resumen`);
          const br = await callback(
            await begin(),
            google("b@example.invalid", "google-B"),
          );
          assert.equal(br.headers.get("location"), `${origin}/resumen`);
          a = { cookie: cookieHeader(ar) };
          b = { cookie: cookieHeader(br) };
          a.session = await fresh(a.cookie);
          b.session = await fresh(b.cookie);
          assert.ok(a.session);
          assert.ok(b.session);
          assert.notEqual(a.session.user.id, b.session.user.id);
          const again = await callback(
            await begin(),
            google("a@example.invalid", "google-A"),
          );
          assert.equal(
            (await fresh(cookieHeader(again))).user.id,
            a.session.user.id,
          );
          assert.equal(await count(), 2);
          assert.equal(
            (
              await admin.query(
                'SELECT count(*) FROM app_auth.account WHERE "accessToken" IS NOT NULL OR "idToken" IS NOT NULL',
              )
            ).rows[0].count,
            "0",
          );
        },
      );
      await t.test(
        "runtime no puede habilitar allowlist, acceder a neon_auth/finanzas ni adoptar otra identidad",
        async () => {
          for (const sql of [
            "UPDATE app_access.allowlist SET enabled=true",
            "SELECT * FROM app_access.audit",
            "SELECT * FROM finance.user_preferences",
            "SELECT * FROM neon_auth.project_config",
            "SET ROLE finanzas_app",
          ])
            await assert.rejects(authPool.query(sql));
          await assert.rejects(
            authPool.query(
              "INSERT INTO app_auth.\"user\"(name,email,\"emailVerified\",\"googleSubject\") VALUES('X','outside@example.invalid',true,'outside')",
            ),
          );
          await callback(
            await begin(),
            google("a@example.invalid", "impostor"),
          );
          assert.equal(await count(), 2);
          await assert.rejects(
            financePool.query("SELECT * FROM app_auth.session"),
          );
        },
      );
      const authorizedRead = (s, work) =>
        withOwnerTransaction(
          financePool,
          async () => ({ ownerId: s.user.id }),
          async (c, id) => {
            const {
              rows: [r],
            } = await c.query(
              "SELECT app_access.authorize_session($1) AS owner",
              [s.session.token],
            );
            assert.equal(r.owner, id);
            return work(c, id);
          },
        );
      await t.test(
        "A/B: RLS filtra recursos ajenos, owner inyectado no transfiere acceso",
        async () => {
          await authorizedRead(a.session, (c, id) =>
            c.query(
              "INSERT INTO finance.user_preferences(owner_id,display_currency) VALUES($1,'UYU')",
              [id],
            ),
          );
          await authorizedRead(b.session, (c, id) =>
            c.query(
              "INSERT INTO finance.user_preferences(owner_id,display_currency) VALUES($1,'EUR')",
              [id],
            ),
          );
          const rows = await authorizedRead(a.session, (c) =>
            c.query("SELECT * FROM finance.user_preferences"),
          );
          assert.equal(rows.rowCount, 1);
          assert.equal(rows.rows[0].display_currency, "UYU");
          assert.equal(
            (
              await authorizedRead(a.session, (c) =>
                c.query(
                  "SELECT * FROM finance.user_preferences WHERE owner_id=$1",
                  [b.session.user.id],
                ),
              )
            ).rowCount,
            0,
          );
          await assert.rejects(
            authorizedRead(a.session, (c) =>
              c.query("UPDATE finance.user_preferences SET owner_id=$1", [
                b.session.user.id,
              ]),
            ),
          );
        },
      );
      await t.test(
        "revocación espera la transacción autorizada y bloquea todas las posteriores",
        async () => {
          const financial = await financePool.connect();
          const revoker = new pg.Client(config);
          await revoker.connect();
          let revoke;
          try {
            await financial.query("BEGIN");
            await financial.query("SET LOCAL ROLE finanzas_app");
            const locked = await financial.query(
              "SELECT app_access.authorize_session($1) AS owner",
              [b.session.session.token],
            );
            assert.equal(locked.rows[0].owner, b.session.user.id);
            revoke = revoker.query(
              "UPDATE app_access.allowlist SET enabled=false WHERE email='b@example.invalid'",
            );
            let blocked = false;
            for (let attempt = 0; attempt < 200; attempt++) {
              const r = await admin.query(
                "SELECT cardinality(pg_blocking_pids($1))>0 AS blocked",
                [revoker.processID],
              );
              if (r.rows[0].blocked) {
                blocked = true;
                break;
              }
              await new Promise((resolve) => globalThis.setTimeout(resolve, 5));
            }
            assert.equal(
              blocked,
              true,
              "Revocación debe esperar el lock financiero",
            );
            await financial.query("COMMIT");
            await revoke;
            assert.equal(await fresh(b.cookie), null);
            await financial.query("BEGIN");
            await financial.query("SET LOCAL ROLE finanzas_app");
            const denied = await financial.query(
              "SELECT app_access.authorize_session($1) AS owner",
              [b.session.session.token],
            );
            assert.equal(denied.rows[0].owner, null);
          } finally {
            await financial.query("ROLLBACK");
            await revoke;
            financial.release();
            await revoker.end();
          }
          await admin.query(
            "UPDATE app_access.allowlist SET enabled=true WHERE email='b@example.invalid'",
          );
          const renewed = await callback(
            await begin(),
            google("b@example.invalid", "google-B"),
          );
          b = { cookie: cookieHeader(renewed) };
          b.session = await fresh(b.cookie);
          assert.ok(b.session);
        },
      );
      await t.test(
        "CA-003/005: revocar B invalida cookie existente, nuevos OAuth y sesiones sin afectar A",
        async () => {
          await admin.query(
            "UPDATE app_access.allowlist SET enabled=false WHERE email='b@example.invalid'",
          );
          assert.equal(await fresh(b.cookie), null);
          assert.ok(await fresh(a.cookie));
          await callback(
            await begin(),
            google("b@example.invalid", "google-B"),
          );
          assert.equal(await count(), 2);
          const r = await authorizedRead(a.session, (c) =>
            c.query("SELECT app_access.authorize_session($1) AS owner", [
              b.session.session.token,
            ]),
          );
          assert.equal(r.rows[0].owner, null);
          await assert.rejects(
            authPool.query(
              'INSERT INTO app_auth.session(token,"userId","expiresAt") VALUES($1,$2,now()+interval \'1 day\')',
              [randomUUID(), b.session.user.id],
            ),
          );
          await admin.query(
            "UPDATE app_access.allowlist SET enabled=true WHERE email='b@example.invalid'",
          );
          assert.equal(await fresh(b.cookie), null);
        },
      );
      await t.test(
        "CLI: rehabilitar no duplica altas; un permiso ya vigente no genera auditoría falsa",
        async () => {
          const email = "b@example.invalid";
          const auditCounts = async () =>
            Object.fromEntries(
              (
                await admin.query(
                  "SELECT action,count(*)::int AS n FROM app_access.audit WHERE email=$1 GROUP BY action",
                  [email],
                )
              ).rows.map(({ action, n }) => [action, n]),
            );
          const before = await auditCounts();
          await admin.query("BEGIN");
          try {
            assert.equal(await setGoogleAllowed(admin, email, false), true);
            assert.equal(await setGoogleAllowed(admin, email, true), true);
            assert.equal(await setGoogleAllowed(admin, email, true), false);
            const after = await auditCounts();
            assert.deepEqual(after, {
              ...before,
              enable: (before.enable ?? 0) + 1,
              revoke: (before.revoke ?? 0) + 1,
            });
            await admin.query("COMMIT");
          } catch (error) {
            await admin.query("ROLLBACK");
            throw error;
          }
        },
      );
      await t.test(
        "CA-004/005: state alterado/reutilizado y sesión expirada son rechazados; logout invalida token",
        async () => {
          const start = await begin();
          const changed = await callback(
            { ...start, state: "altered" },
            google("a@example.invalid", "google-A"),
          );
          assert.notEqual(changed.headers.get("location"), `${origin}/resumen`);
          const ok = await callback(
            start,
            google("a@example.invalid", "google-A"),
          );
          const cookie = cookieHeader(ok);
          assert.ok(await fresh(cookie));
          const replay = await callback(
            start,
            google("a@example.invalid", "google-A"),
          );
          assert.notEqual(replay.headers.get("location"), `${origin}/resumen`);
          const out = await handleGoogleHttp(
            new Request(`${origin}/api/auth/sign-out`, {
              method: "POST",
              headers: { origin, cookie, "content-type": "application/json" },
              body: "{}",
            }),
            ["sign-out"],
            deps,
          );
          assert.equal(out.status, 200);
          assert.equal(await fresh(cookie), null);
          await admin.query(
            "UPDATE app_auth.session SET \"expiresAt\"=now()-interval '1 second' WHERE token=$1",
            [a.session.session.token],
          );
          assert.equal(await fresh(a.cookie), null);
        },
      );
      await t.test(
        "cambio de email para el mismo sub revoca sin transferir titular",
        async () => {
          const existing = await callback(
            await begin(),
            google("a@example.invalid", "google-A"),
          );
          const cookie = cookieHeader(existing);
          assert.ok(await fresh(cookie));
          const denied = await callback(
            await begin(),
            google("changed@example.invalid", "google-A"),
          );
          assert.notEqual(denied.headers.get("location"), `${origin}/resumen`);
          assert.equal(await fresh(cookie), null);
          assert.equal(await count(), 2);
          const binding = await admin.query(
            "SELECT email,user_id FROM app_access.allowlist WHERE google_sub='google-A'",
          );
          assert.equal(binding.rows[0].email, "a@example.invalid");
          assert.equal(binding.rows[0].user_id, a.session.user.id);
        },
      );
      await t.test(
        "CA-004: JWT inválido, fallo de red y error DB no crean sesiones ni filtran diagnóstico",
        async () => {
          const sessionsBefore = (
            await admin.query("SELECT count(*) FROM app_auth.session")
          ).rows[0].count;
          for (const invalid of [
            { exp: 1 },
            { aud: "another-client" },
            { iss: "https://evil.invalid" },
          ]) {
            const result = await callback(await begin(), {
              ...google("a@example.invalid", "google-A"),
              ...invalid,
            });
            assert.notEqual(
              result.headers.get("location"),
              `${origin}/resumen`,
            );
          }
          invalidSignature = true;
          try {
            const result = await callback(
              await begin(),
              google("a@example.invalid", "google-A"),
            );
            assert.notEqual(
              result.headers.get("location"),
              `${origin}/resumen`,
            );
          } finally {
            invalidSignature = false;
          }
          const start = await begin();
          providerUnavailable = true;
          try {
            const result = await callback(
              start,
              google("a@example.invalid", "google-A"),
            );
            assert.notEqual(
              result.headers.get("location"),
              `${origin}/resumen`,
            );
          } finally {
            providerUnavailable = false;
          }
          const dbStart = await begin();
          await admin.query(
            "REVOKE SELECT ON app_access.allowlist FROM finanzas_google_auth",
          );
          try {
            const result = await callback(
              dbStart,
              google("a@example.invalid", "google-A"),
            );
            assert.notEqual(
              result.headers.get("location"),
              `${origin}/resumen`,
            );
            assert.doesNotMatch(
              await result.text(),
              /permission denied|app_access|SELECT|postgresql:/i,
            );
          } finally {
            await admin.query(
              "GRANT SELECT ON app_access.allowlist TO finanzas_google_auth",
            );
          }
          assert.equal(
            (await admin.query("SELECT count(*) FROM app_auth.session")).rows[0]
              .count,
            sessionsBefore,
          );
          assert.equal(await count(), 2);
        },
      );
      await t.test(
        "límite de intentos persistente devuelve 429 sin crear identidad",
        async () => {
          await begin();
          await begin(false);
          await begin(false);
          const denied = await handleGoogleHttp(
            new Request(`${origin}/api/auth/sign-in/social`, {
              method: "POST",
              headers: { origin, "content-type": "application/json" },
              body: JSON.stringify({ provider: "google" }),
            }),
            ["sign-in", "social"],
            deps,
          );
          assert.equal(denied.status, 429);
          assert.ok(Number(denied.headers.get("x-retry-after")) > 0);
          assert.equal(await count(), 2);
        },
      );
    } finally {
      await authPool?.end();
      await financePool?.end();
      await admin.query("ROLLBACK");
      await admin.query(
        "DROP SCHEMA IF EXISTS app_auth,app_access,app_auth_meta,finance,finance_meta,neon_auth CASCADE; DROP ROLE IF EXISTS finanzas_google_auth,finanzas_google_finance,finanzas_app",
      );
      await admin.end();
    }
  },
);
