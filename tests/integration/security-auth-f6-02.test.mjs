/* global Headers, Request */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { makeSignature } from "better-auth/crypto";
import pg from "pg";
import { createGoogleAuth } from "../../src/server/google-auth-factory.ts";
import { handleGoogleHttp } from "../../src/server/google-http.ts";
import { testDatabaseConfig } from "../support/test-database.mjs";
import prepareDatabase from "../support/f6-02-clean-database.mjs";
import {
  financeBrowserFixtures,
  financeTestOrigin,
  financeTestSecret,
  runtimePassword,
} from "../support/finance-browser.mjs";

// F6-02 etapa A. Better Auth real sobre PostgreSQL desechable, con el rol de
// runtime de Auth. Sin Google ni Neon: solo cookies sintéticas firmadas con el
// secreto de prueba. Las identidades son titulares sintéticos (.invalid).
const cookieName = "finanzas-google.session_token";
const authPoolConfig = {
  host: "127.0.0.1",
  port: 55432,
  database: "finanzas_test",
  user: "finanzas_google_auth",
  password: runtimePassword,
  max: 3,
};
const config = (origin, secret = financeTestSecret) => ({
  origin,
  secret,
  clientId: "fixture-client",
  clientSecret: "fixture-secret",
});

const signed = async (token, secret = financeTestSecret) =>
  encodeURIComponent(`${token}.${await makeSignature(token, secret)}`);

test("F6-02: cookies de sesión falsificadas, manipuladas, reutilizadas o expiradas no autentican", async (t) => {
  const clean = await prepareDatabase();
  const admin = new pg.Pool(testDatabaseConfig());
  const authPool = new pg.Pool(authPoolConfig);
  try {
    const { owners } = await financeBrowserFixtures();
    const auth = createGoogleAuth(authPool, config(financeTestOrigin));
    const tokenOf = async (owner, index = 0) =>
      (
        await admin.query(
          'SELECT token FROM app_auth.session WHERE "userId" = $1 ORDER BY "createdAt" LIMIT 1 OFFSET $2',
          [owner, index],
        )
      ).rows[0].token;
    const session = (cookie) =>
      auth.api.getSession({
        headers: new Headers(cookie === null ? {} : { cookie }),
        query: { disableCookieCache: true },
      });
    const tokenA = await tokenOf(owners.a);
    const tokenB = await tokenOf(owners.b);

    await t.test(
      "la cookie firmada válida resuelve al titular correcto",
      async () => {
        const resolved = await session(`${cookieName}=${await signed(tokenA)}`);
        assert.equal(resolved?.user.id, owners.a);
        assert.equal(resolved?.session.token, tokenA);
        assert.equal(
          (await session(`${cookieName}=${await signed(tokenB)}`))?.user.id,
          owners.b,
        );
      },
    );

    await t.test(
      "firmas ajenas, alteradas, truncadas o sin firma no autentican",
      async () => {
        const goodSignature = await makeSignature(tokenA, financeTestSecret);
        const flipped = `${goodSignature.slice(0, -2)}${goodSignature.endsWith("AA") ? "BB" : "AA"}`;
        const cases = {
          "sin cookie": null,
          "cookie vacía": `${cookieName}=`,
          "token sin firma": `${cookieName}=${tokenA}`,
          "firma con otro secreto": `${cookieName}=${await signed(tokenA, "otro-secreto-sintetico-de-prueba-0000")}`,
          "firma alterada": `${cookieName}=${encodeURIComponent(`${tokenA}.${flipped}`)}`,
          "firma truncada": `${cookieName}=${encodeURIComponent(`${tokenA}.${goodSignature.slice(0, 10)}`)}`,
          "firma de B sobre token de A": `${cookieName}=${encodeURIComponent(`${tokenA}.${await makeSignature(tokenB, financeTestSecret)}`)}`,
          "token inexistente firmado": `${cookieName}=${await signed(randomUUID())}`,
          "token en mayúsculas firmado": `${cookieName}=${await signed(tokenA.toUpperCase())}`,
          "prefijo de cookie genérico": `better-auth.session_token=${await signed(tokenA)}`,
          "prefijo seguro en origen http": `__Secure-${cookieName}=${await signed(tokenA)}`,
          "parámetro de URL en lugar de cookie": `session_token=${await signed(tokenA)}`,
        };
        for (const [label, cookie] of Object.entries(cases))
          assert.equal(await session(cookie), null, label);
        // Dos cookies duplicadas: la válida de B no puede ceder la identidad de A.
        const duplicate = await session(
          `${cookieName}=${await signed(tokenB)}; ${cookieName}=${await signed(tokenA)}`,
        );
        assert.ok(
          duplicate === null || duplicate.user.id === owners.b,
          "Una cookie duplicada nunca resuelve a un tercero",
        );
      },
    );

    await t.test(
      "las sesiones expiradas y las de un titular revocado dejan de autenticar",
      async () => {
        const second = await tokenOf(owners.a, 1);
        await admin.query(
          `UPDATE app_auth.session SET "expiresAt" = now() - interval '1 second' WHERE token = $1`,
          [second],
        );
        assert.equal(
          await session(`${cookieName}=${await signed(second)}`),
          null,
        );
        await admin.query(
          "UPDATE app_access.allowlist SET enabled = false WHERE user_id = $1",
          [owners.b],
        );
        assert.equal(
          await session(`${cookieName}=${await signed(tokenB)}`),
          null,
        );
        assert.ok(
          await session(`${cookieName}=${await signed(tokenA)}`),
          "A no se ve afectado",
        );
        await admin.query(
          "UPDATE app_access.allowlist SET enabled = true WHERE user_id = $1",
          [owners.b],
        );
        assert.equal(
          await session(`${cookieName}=${await signed(tokenB)}`),
          null,
          "Rehabilitar no revive la cookie anterior",
        );
      },
    );

    await t.test(
      "cerrar sesión invalida el token y no puede reutilizarse ni afectar a otro dispositivo",
      async () => {
        // La sesión expirada del caso anterior fue eliminada por Better Auth:
        // se crea otra sesión sintética de A para representar su segundo dispositivo.
        const first = tokenA;
        const third = randomUUID();
        await admin.query(
          `INSERT INTO app_auth.session(token, "userId", "expiresAt") VALUES ($1, $2, now() + interval '1 hour')`,
          [third, owners.a],
        );
        const out = await handleGoogleHttp(
          new Request(`${financeTestOrigin}/api/auth/sign-out`, {
            method: "POST",
            headers: {
              origin: financeTestOrigin,
              "content-type": "application/json",
              cookie: `${cookieName}=${await signed(first)}`,
            },
            body: "{}",
          }),
          ["sign-out"],
          {
            enabled: true,
            origin: financeTestOrigin,
            handler: (r) => auth.handler(r),
          },
        );
        assert.equal(out.status, 200);
        assert.equal(
          await session(`${cookieName}=${await signed(first)}`),
          null,
        );
        assert.equal(
          (await session(`${cookieName}=${await signed(third)}`))?.user.id,
          owners.a,
          "Otra sesión de A sigue activa",
        );
        const again = await handleGoogleHttp(
          new Request(`${financeTestOrigin}/api/auth/sign-out`, {
            method: "POST",
            headers: {
              origin: financeTestOrigin,
              "content-type": "application/json",
              cookie: `${cookieName}=${await signed(first)}`,
            },
            body: "{}",
          }),
          ["sign-out"],
          {
            enabled: true,
            origin: financeTestOrigin,
            handler: (r) => auth.handler(r),
          },
        );
        assert.ok(
          [200, 401].includes(again.status),
          `segundo cierre: ${again.status}`,
        );
        assert.equal(
          await session(`${cookieName}=${await signed(first)}`),
          null,
        );
      },
    );
  } finally {
    await Promise.all([admin.end(), authPool.end()]);
    await clean();
  }
});

test("F6-02: atributos de la cookie de sesión y límite de sesión", async () => {
  const clean = await prepareDatabase();
  const authPool = new pg.Pool(authPoolConfig);
  try {
    const attributes = async (origin) => {
      const context = await createGoogleAuth(authPool, config(origin)).$context;
      return {
        name: context.authCookies.sessionToken.name,
        ...context.authCookies.sessionToken.attributes,
        expiresIn: context.sessionConfig.expiresIn,
        updateAge: context.sessionConfig.updateAge,
        cookieCache: context.options.session.cookieCache,
      };
    };
    const secure = await attributes("https://finanzas.example.test");
    assert.equal(secure.name, "__Secure-finanzas-google.session_token");
    assert.equal(secure.secure, true);
    assert.equal(secure.httpOnly, true);
    assert.equal(secure.sameSite, "lax");
    assert.equal(secure.path, "/");
    assert.equal(secure.maxAge, 60 * 60 * 24 * 7);
    assert.equal(
      secure.domain,
      undefined,
      "Sin Domain: la cookie no se comparte con subdominios",
    );
    assert.deepEqual(secure.cookieCache, { enabled: false });
    const plain = await attributes("http://localhost:3000");
    assert.equal(plain.name, "finanzas-google.session_token");
    assert.equal(plain.httpOnly, true);
    assert.equal(plain.sameSite, "lax");
    assert.equal(
      plain.secure,
      false,
      "HTTP solo se admite en localhost con puerto",
    );
  } finally {
    await authPool.end();
    await clean();
  }
});

test("F6-02-H01: un cliente bloqueado no agota el límite de otro ni puede falsificarlo", async () => {
  const clean = await prepareDatabase();
  const authPool = new pg.Pool(authPoolConfig);
  try {
    const auth = createGoogleAuth(authPool, config(financeTestOrigin));
    const attempt = (ip, spoofed, trustVercelClientIp = true) =>
      handleGoogleHttp(
        new Request(`${financeTestOrigin}/api/auth/sign-in/social`, {
          method: "POST",
          headers: {
            origin: financeTestOrigin,
            "content-type": "application/json",
            "x-vercel-forwarded-for": ip,
            "x-forwarded-for": spoofed,
            "x-real-ip": spoofed,
          },
          body: JSON.stringify({ provider: "google" }),
        }),
        ["sign-in", "social"],
        {
          enabled: true,
          trustVercelClientIp,
          origin: financeTestOrigin,
          handler: (r) => auth.handler(r),
        },
      );
    for (let index = 1; index <= 3; index++)
      assert.equal(
        (await attempt("203.0.113.1", `198.51.100.${index}`)).status,
        200,
      );
    const limited = await attempt("203.0.113.1", "198.51.100.4");
    assert.equal(limited.status, 429);
    assert.ok(Number(limited.headers.get("x-retry-after")) > 0);
    assert.equal((await attempt("203.0.113.2", "198.51.100.4")).status, 200);
    for (let index = 3; index <= 6; index++)
      assert.equal(
        (await attempt(`203.0.113.${index}`, "198.51.100.5", false)).status,
        index === 6 ? 429 : 200,
      );
  } finally {
    await authPool.end();
    await clean();
  }
});
