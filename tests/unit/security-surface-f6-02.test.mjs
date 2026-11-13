/* global Request, Response */
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { URL, fileURLToPath } from "node:url";
import test from "node:test";
import { handleGoogleHttp } from "../../src/server/google-http.ts";

// F6-02 etapa A. Contrato estático de la superficie HTTP y de la configuración
// de autenticación. No usa red, base de datos ni datos reales: lee el código
// versionado y ejerce `handleGoogleHttp` con un manejador simulado. Un handler,
// página o configuración nueva que no cumpla el contrato hace fallar esta suite
// y obliga a revisarla. Los defectos confirmados de la auditoría se registran
// como `todo` con su identificador (docs/planning/53-auditoria-seguridad-f6-02.md);
// al corregirlos, el `todo` pasa a prueba ordinaria.
const root = fileURLToPath(new URL("../../", import.meta.url));
const src = (path) => readFileSync(join(root, "src", path), "utf8");
const walk = (dir, accept) =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory()
      ? walk(path, accept)
      : accept(path)
        ? [path]
        : [];
  });
const rel = (path) => relative(join(root, "src"), path).split(sep).join("/");

const routes = walk(join(root, "src/app/api"), (p) =>
  p.endsWith(`${sep}route.ts`),
)
  .map((file) => ({ file: rel(file), text: readFileSync(file, "utf8") }))
  .sort((a, b) => a.file.localeCompare(b.file));
const pages = walk(join(root, "src/app"), (p) => p.endsWith(`${sep}page.tsx`))
  .map((file) => ({ file: rel(file), text: readFileSync(file, "utf8") }))
  .sort((a, b) => a.file.localeCompare(b.file));
const sources = walk(join(root, "src"), (p) => /\.(ts|tsx|mts)$/.test(p)).map(
  (file) => ({ file: rel(file), text: readFileSync(file, "utf8") }),
);

const verbs = ["GET", "HEAD", "OPTIONS", "POST", "PUT", "PATCH", "DELETE"];
function methods(text) {
  const found = new Set();
  for (const verb of verbs) {
    if (
      new RegExp(
        `export\\s+(?:async\\s+)?function\\s+${verb}\\b|export\\s+const\\s+${verb}\\b|export\\s*\\{[^}]*\\bas\\s+${verb}\\b`,
      ).test(text)
    )
      found.add(verb);
  }
  return [...found];
}

// Módulos auxiliares que centralizan origen, tamaño y cabeceras privadas.
const originHelpers = {
  "server/movements-http.ts": ["handleMovement", "handleMovementRevision"],
  "server/bank-balances-http.ts": [
    "handleOpeningBalance",
    "handleBalanceAdjustment",
  ],
  "server/exchange-rate-http.ts": ["currencyRequest"],
  "server/private-download.ts": ["exportOriginError"],
};
const ownerGuards = [
  "withGoogleOwner(",
  "authorizedCron(",
  "handleGoogleHttp(",
];

test("F6-02: inventario de rutas HTTP: cada handler exige titular, cron o el adaptador Google", () => {
  assert.ok(
    routes.length >= 30,
    "El inventario de rutas no puede quedar vacío",
  );
  for (const { file, text } of routes) {
    const helper = Object.values(originHelpers)
      .flat()
      .some((name) => text.includes(`${name}(`));
    assert.ok(
      ownerGuards.some((token) => text.includes(token)) || helper,
      `${file} no declara control de sesión, cron o adaptador Google`,
    );
    assert.ok(methods(text).length > 0, `${file} no exporta métodos HTTP`);
  }
});

test("F6-02: los métodos de lectura permitidos están enumerados; ninguna ruta de lectura muta", () => {
  const readable = new Map();
  for (const { file, text } of routes)
    for (const verb of methods(text))
      if (["GET", "HEAD", "OPTIONS"].includes(verb))
        readable.set(file, [...(readable.get(file) ?? []), verb]);
  assert.deepEqual(Object.fromEntries(readable), {
    "app/api/account/route.ts": ["GET"],
    "app/api/auth/[...path]/route.ts": ["GET"],
    "app/api/catalog/route.ts": ["GET"],
    "app/api/cron/card-push/route.ts": ["GET"],
    "app/api/cron/contributions/route.ts": ["GET"],
    "app/api/history-filters/route.ts": ["GET"],
    "app/api/recurrences/settlements/route.ts": ["GET"],
  });
  for (const { file, text } of routes) {
    if (!methods(text).includes("GET")) continue;
    const body = text.slice(
      text.search(/export\s+(?:async\s+)?function\s+GET\b/),
    );
    if (/\/api\/auth\//.test(`/${file}`)) continue;
    assert.doesNotMatch(
      body.split(/export\s+(?:async\s+)?function\s+POST\b/)[0],
      /\b(INSERT|UPDATE|DELETE)\b/i,
      `${file}: un GET no puede escribir en la base`,
    );
  }
});

test("F6-02: toda mutación valida origen exacto y Sec-Fetch-Site antes de procesar", () => {
  const helperTexts = Object.fromEntries(
    Object.keys(originHelpers).map((file) => [file, src(file)]),
  );
  for (const [file, text] of Object.entries(helperTexts)) {
    assert.match(text, /headers\.get\("origin"\)/, `${file} sin Origin`);
    assert.match(text, /sec-fetch-site/, `${file} sin Sec-Fetch-Site`);
    assert.match(text, /authOrigin\(/, `${file} sin origen canónico`);
    assert.match(
      text,
      /googlePrivateHeaders/,
      `${file} sin cabeceras privadas`,
    );
  }
  for (const { file, text } of routes) {
    const mutating = methods(text).some((v) =>
      ["POST", "PUT", "PATCH", "DELETE"].includes(v),
    );
    if (!mutating || file.startsWith("app/api/auth/")) continue;
    const direct =
      /headers\.get\("origin"\)/.test(text) && /sec-fetch-site/.test(text);
    const delegated = Object.entries(originHelpers).some(([, names]) =>
      names.some((name) => text.includes(`${name}(`)),
    );
    assert.ok(
      direct || delegated,
      `${file}: mutación sin validación de Origin/Sec-Fetch-Site`,
    );
    assert.ok(
      !methods(text).some((v) => ["PUT", "DELETE"].includes(v)),
      `${file}: PUT/DELETE no forman parte de la superficie vigente; revisar origen y titular`,
    );
  }
});

test("F6-02: respuestas de rutas privadas usan Cache-Control private, no-store (directo o por helper)", () => {
  const helperModules = [
    "movements-http",
    "bank-balances-http",
    "exchange-rate-http",
    "private-download",
    "google-http",
  ];
  for (const { file, text } of routes) {
    if (file.startsWith("app/api/auth/")) continue;
    assert.ok(
      text.includes("googlePrivateHeaders") ||
        helperModules.some((name) => text.includes(`@/server/${name}`)),
      `${file} no fija cabeceras privadas`,
    );
  }
  assert.match(
    src("server/google-http.ts"),
    /"Cache-Control":\s*"private, no-store"/,
  );
});

test("F6-02: páginas privadas exigen sesión y titular en servidor y son dinámicas", () => {
  assert.ok(pages.length >= 18);
  const exempt = new Set(["app/auth/sign-in/page.tsx", "app/page.tsx"]);
  for (const { file, text } of pages) {
    if (exempt.has(file)) continue;
    assert.match(
      text,
      /withGoogleOwner\(|requireGoogleOwnerPage\(/,
      `${file}: página sin control de titular en servidor`,
    );
    // `requireGoogleOwnerPage` lee `headers()`, lo que fuerza render dinámico
    // sin caché compartida; las demás páginas lo declaran de forma explícita.
    assert.match(
      text,
      /export const dynamic = "force-dynamic"|requireGoogleOwnerPage\(/,
      `${file}: página privada sin renderizado dinámico`,
    );
    assert.doesNotMatch(
      text,
      /searchParams[^;]*owner/i,
      `${file}: el titular no puede derivarse de parámetros de la URL`,
    );
  }
  assert.match(
    readFileSync(join(root, "src/app/page.tsx"), "utf8"),
    /redirect\("\/resumen"\)/,
    "La raíz solo redirige y no renderiza contenido",
  );
  assert.doesNotMatch(
    readFileSync(join(root, "src/app/auth/sign-in/page.tsx"), "utf8"),
    /withGoogleOwner|finance\./,
    "La pantalla de acceso no consulta datos financieros",
  );
});

test("F6-02: sin caché compartida ni acciones de servidor que eludan el inventario", () => {
  const forbidden = [
    [/"use cache"|'use cache'/, "use cache"],
    [/unstable_cache|cacheLife|cacheTag/, "cache de datos de Next"],
    [/force-static/, "force-static"],
    [/export const revalidate\b/, "revalidate de segmento"],
    [/next:\s*\{\s*revalidate/, "revalidate en fetch"],
    [/"use server"|'use server'/, "acciones de servidor (no inventariadas)"],
    [/generateStaticParams/, "generación estática"],
    [/localStorage|sessionStorage|indexedDB/, "almacenamiento del navegador"],
    [/NEXT_PUBLIC_/, "variables públicas"],
  ];
  for (const { file, text } of sources) {
    for (const [pattern, label] of forbidden)
      assert.doesNotMatch(text, pattern, `${file}: ${label}`);
  }
});

test("F6-02: SQL de runtime sin valores del usuario interpolados (solo fragmentos fijos)", () => {
  // La auditoría F6-02 revisó a mano cada interpolación de `src/server`: son
  // fragmentos construidos con constantes de código (JOIN condicionales, nombres
  // de tabla de un mapa fijo, columnas de listas cerradas) y marcadores `$n`.
  // Este contrato detecta la regresión peligrosa: un valor de la solicitud
  // (comando, filtros, cuerpo, parámetros, texto libre) interpolado como valor.
  const requestValue =
    /^(?:command|input|filters|query|body|params|request|data|payload|movement|definition|search|text|name|concept|note|email|term|q)\b(?!.*(?:\?|===|!==|&&|\|\|))/;
  const pattern =
    /`[^`]*\b(?:SELECT|INSERT INTO|UPDATE|DELETE FROM|WHERE)\b[^`]*\$\{[^}]*\}[^`]*`/gs;
  let reviewed = 0;
  for (const { file, text } of sources) {
    if (!file.startsWith("server/") || !text.includes("client.query")) continue;
    for (const match of text.matchAll(pattern))
      for (const [, expression] of match[0].matchAll(/\$\{([^}]*)\}/g)) {
        reviewed++;
        assert.doesNotMatch(
          expression.trim(),
          requestValue,
          `${file}: valor de la solicitud interpolado en SQL: ${expression.trim()}`,
        );
      }
  }
  assert.ok(
    reviewed > 50,
    "El análisis debe encontrar las interpolaciones revisadas",
  );
  const catalog = src("server/catalog.ts");
  assert.match(
    catalog,
    /const tables(?::[^=]+)? = \{[^}]*\}/s,
    "El catálogo traduce el tipo a una tabla desde un mapa fijo",
  );
});

test("F6-02: Better Auth queda configurado solo para Google con allowlist, sin contraseñas ni OTP", () => {
  const factory = src("server/google-auth-factory.ts");
  assert.match(factory, /emailAndPassword:\s*\{\s*enabled:\s*false\s*\}/);
  assert.match(factory, /disableIdTokenSignIn:\s*true/);
  assert.match(factory, /accountLinking:\s*\{\s*enabled:\s*false/);
  assert.match(factory, /cookieCache:\s*\{\s*enabled:\s*false\s*\}/);
  assert.match(factory, /disableSessionRefresh:\s*true/);
  assert.match(factory, /deleteUser:\s*\{\s*enabled:\s*false\s*\}/);
  assert.match(factory, /changeEmail:\s*\{\s*enabled:\s*false\s*\}/);
  assert.match(factory, /trustedOrigins:\s*\[config\.origin\]/);
  assert.match(factory, /httpOnly:\s*true/);
  assert.match(factory, /sameSite:\s*"lax"/);
  assert.match(
    factory,
    /useSecureCookies:\s*config\.origin\.startsWith\("https:"\)/,
  );
  assert.match(
    factory,
    /rateLimit:\s*\{\s*enabled:\s*true,\s*storage:\s*"database"/,
  );
  assert.match(factory, /expiresIn:\s*60 \* 60 \* 24 \* 7/);
  assert.doesNotMatch(factory, /plugins\s*:/, "Sin plugins de Better Auth");
  assert.doesNotMatch(factory, /better-auth\/plugins/);
  assert.doesNotMatch(
    factory,
    /magicLink|emailOTP|phoneNumber|twoFactor|admin\(/,
  );
  assert.doesNotMatch(
    factory,
    /sendResetPassword|sendVerificationEmail|sendOTP/,
  );
  for (const { file, text } of sources) {
    if (file === "server/google-database.ts") continue;
    assert.doesNotMatch(text, /neon_auth|@neondatabase\/auth|NEON_AUTH/, file);
    assert.doesNotMatch(text, /developmentAuthConfig/, file);
    assert.doesNotMatch(
      text,
      /sign-?in\/email|sign-?up\/email|signInEmail|signUpEmail/,
      `${file}: flujo de contraseña descartado por v9.49`,
    );
  }
});

test("F6-02: el runtime financiero nunca acepta un titular proveniente del cliente", () => {
  for (const { file, text } of [...routes, ...pages]) {
    assert.doesNotMatch(
      text,
      /\b(?:input|body|params|searchParams|command|data)\.owner_?[Ii]d\b|get\("owner|\["owner_?[Ii]d"\]/,
      `${file}: titular tomado de la solicitud`,
    );
  }
  const ownerContext = src("db/owner-context.ts");
  assert.match(ownerContext, /SET LOCAL ROLE finanzas_app/);
  assert.match(ownerContext, /set_config\('finance\.owner_id', \$1, true\)/);
  const auth = src("server/google-auth.ts");
  assert.match(auth, /disableCookieCache:\s*true/);
  assert.match(auth, /app_access\.authorize_session\(\$1\)/);
  assert.match(auth, /authorized\?\.owner_id !== ownerId/);
});

test("F6-02: el cron exige credencial exclusiva y declarada en vercel.json", () => {
  const vercel = JSON.parse(readFileSync(join(root, "vercel.json"), "utf8"));
  const cronFiles = routes.filter(({ file }) => file.includes("/cron/"));
  assert.deepEqual(
    vercel.crons.map(({ path }) => path).sort(),
    cronFiles
      .map(({ file }) => file.replace(/^app/, "").replace(/\/route\.ts$/, ""))
      .sort(),
    "Cada ruta de cron está declarada y viceversa",
  );
  for (const { file, text } of cronFiles) {
    assert.ok(
      text.indexOf("authorizedCron(") < text.indexOf("listCronOwners("),
      `${file}: la credencial debe verificarse antes de enumerar titulares`,
    );
    assert.doesNotMatch(text, /withGoogleOwner|freshGoogleSession/, file);
  }
  const cron = src("server/google-cron.ts");
  assert.match(cron, /secret\.length < 16/);
  assert.match(cron, /timingSafeEqual/);
  assert.match(cron, /Bearer \$\{secret\}/);
});

test("F6-02: el service worker solo gestiona notificaciones y no almacena respuestas", () => {
  const worker = readFileSync(join(root, "public/card-push-worker.js"), "utf8");
  assert.doesNotMatch(worker, /\bfetch\b|caches\.|CacheStorage|importScripts/);
  assert.match(worker, /event\.data\?\.text\(\) !== "card-due"/);
  assert.doesNotMatch(worker, /event\.data\.json|\$\{/, "Sin datos privados");
  const manifest = src("app/manifest.ts");
  assert.match(manifest, /start_url: "\/"/);
  assert.doesNotMatch(
    manifest,
    /scope|share_target|shortcuts|related_applications/,
  );
  const app = readdirSync(join(root, "public"));
  assert.deepEqual(app.sort(), ["card-push-worker.js"]);
});

test("F6-02: la política de origen rechaza esquemas, puertos y hosts no canónicos", async () => {
  const { authOrigin } = await import("../../src/server/google-policy.ts");
  assert.equal(
    authOrigin("https://app.example.com"),
    "https://app.example.com",
  );
  assert.equal(authOrigin("http://localhost:3000"), "http://localhost:3000");
  for (const bad of [
    undefined,
    "",
    "http://app.example.com",
    "http://localhost",
    "http://127.0.0.1:3000",
    "https://app.example.com/",
    "https://app.example.com/path",
    "https://app.example.com:443",
    "https://user@app.example.com",
    "https://APP.example.com",
    "ftp://app.example.com",
  ])
    assert.throws(() => authOrigin(bad), /Origen de Auth inválido|Invalid URL/);
});

const origin = "https://finanzas.example.test";
function exercise(
  path,
  init = {},
  enabled = true,
  trustVercelClientIp = false,
) {
  const calls = [];
  const request = new Request(`${origin}/api/auth/${path}`, {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: "{}",
    ...init,
  });
  return handleGoogleHttp(request, path.split("/"), {
    enabled,
    origin,
    trustVercelClientIp,
    handler: async (forwarded) => {
      calls.push(forwarded);
      return Response.json({ url: "https://accounts.google.com/x" });
    },
  }).then((response) => ({ response, calls }));
}

test("F6-02: el adaptador HTTP expone exactamente tres endpoints de Better Auth", async () => {
  const blocked = [
    "ok",
    "error",
    "get-session",
    "list-sessions",
    "revoke-session",
    "revoke-sessions",
    "revoke-other-sessions",
    "update-user",
    "delete-user",
    "delete-user/callback",
    "change-email",
    "change-password",
    "set-password",
    "forget-password",
    "request-password-reset",
    "reset-password/token",
    "verify-email",
    "send-verification-email",
    "link-social",
    "unlink-account",
    "list-accounts",
    "account-info",
    "refresh-token",
    "get-access-token",
    "token",
    "jwks",
    "sign-in/email",
    "sign-in/anonymous",
    "sign-in/magic-link",
    "sign-in/username",
    "sign-in/email-otp",
    "sign-in/phone-number",
    "sign-up/email",
    "email-otp/send-verification-otp",
    "two-factor/enable",
    "callback/credential",
    "callback/github",
    "admin/list-users",
    "oauth2/callback/google",
    "../sign-out",
    "sign-out/",
    "SIGN-OUT",
  ];
  for (const path of blocked)
    for (const method of ["GET", "POST", "PUT", "PATCH", "DELETE"]) {
      const { response, calls } = await exercise(path, {
        method,
        ...(method === "GET" ? { body: undefined } : {}),
      });
      assert.equal(response.status, 404, `${method} ${path}`);
      assert.equal(calls.length, 0, `${method} ${path} no llega a Better Auth`);
      assert.equal(response.headers.get("cache-control"), "private, no-store");
    }
  for (const [path, method] of [
    ["sign-in/social", "GET"],
    ["sign-in/social", "PUT"],
    ["sign-in/social", "DELETE"],
    ["sign-out", "GET"],
    ["sign-out", "PATCH"],
    ["callback/google", "POST"],
    ["callback/google", "DELETE"],
  ]) {
    const { response, calls } = await exercise(path, {
      method,
      ...(method === "GET" ? { body: undefined } : {}),
    });
    assert.equal(response.status, 404, `${method} ${path}`);
    assert.equal(calls.length, 0);
  }
});

test("F6-02: sign-in y sign-out rechazan CSRF, tipos y tamaños manipulados sin llegar a Better Auth", async () => {
  const cases = [
    ["sin Origin", { headers: { "content-type": "application/json" } }, 403],
    [
      "Origin ajeno",
      {
        headers: {
          origin: "https://evil.example",
          "content-type": "application/json",
        },
      },
      403,
    ],
    [
      "Origin con otro puerto",
      {
        headers: {
          origin: `${origin}:8443`,
          "content-type": "application/json",
        },
      },
      403,
    ],
    [
      "subdominio hermano",
      {
        headers: {
          origin: "https://evil.finanzas.example.test",
          "content-type": "application/json",
        },
      },
      403,
    ],
    [
      "Origin null",
      { headers: { origin: "null", "content-type": "application/json" } },
      403,
    ],
    [
      "Sec-Fetch-Site cross-site con Origin válido",
      {
        headers: {
          origin,
          "sec-fetch-site": "cross-site",
          "content-type": "application/json",
        },
      },
      403,
    ],
  ];
  for (const path of ["sign-in/social", "sign-out"])
    for (const [label, init, status] of cases) {
      const { response, calls } = await exercise(path, {
        ...init,
        body: path === "sign-out" ? "{}" : '{"provider":"google"}',
      });
      assert.equal(response.status, status, `${path}: ${label}`);
      assert.equal(calls.length, 0, `${path}: ${label} no llega a Better Auth`);
    }
  for (const [label, body, type] of [
    ["arreglo JSON", "[]", "application/json"],
    ["null", "null", "application/json"],
    ["JSON inválido", "{", "application/json"],
    ["texto plano", '{"provider":"google"}', "text/plain"],
    ["formulario", "provider=google", "application/x-www-form-urlencoded"],
    [
      "cuerpo gigante",
      JSON.stringify({ provider: "google", pad: "a".repeat(5000) }),
      "application/json",
    ],
  ]) {
    const { response, calls } = await exercise("sign-in/social", {
      headers: { origin, "content-type": type },
      body,
    });
    assert.ok(
      [400, 503].includes(response.status),
      `sign-in/social ${label}: ${response.status}`,
    );
    assert.equal(calls.length, 0, `sign-in/social ${label}`);
  }
  const { response, calls } = await exercise("sign-out", {
    body: '{"callbackURL":"https://evil.example"}',
  });
  assert.equal(response.status, 400);
  assert.equal(calls.length, 0);
});

test("F6-02: el cuerpo enviado a Better Auth es fijo y solo reenvía cookie y origen", async () => {
  const { response, calls } = await exercise("sign-in/social", {
    headers: {
      origin,
      "content-type": "application/json",
      cookie: "finanzas-google.session_token=synthetic",
      authorization: "Bearer attacker",
      "x-forwarded-host": "evil.example",
      "x-forwarded-proto": "http",
      host: "evil.example",
    },
    body: '{"provider":"google"}',
  });
  assert.equal(response.status, 200);
  assert.equal(calls.length, 1);
  const forwarded = calls[0];
  assert.deepEqual(Object.fromEntries(forwarded.headers), {
    "content-type": "application/json",
    cookie: "finanzas-google.session_token=synthetic",
    origin,
  });
  assert.deepEqual(await forwarded.json(), {
    provider: "google",
    callbackURL: `${origin}/resumen`,
    newUserCallbackURL: `${origin}/resumen`,
    errorCallbackURL: `${origin}/auth/sign-in`,
  });
  assert.equal(new URL(forwarded.url).search, "");
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal(response.headers.get("pragma"), "no-cache");
});

test("F6-02: sin credenciales de Google configuradas el acceso falla cerrado", async () => {
  for (const [path, method] of [
    ["sign-in/social", "POST"],
    ["sign-out", "POST"],
    ["callback/google", "GET"],
  ]) {
    const { response, calls } = await exercise(
      path,
      { method, ...(method === "GET" ? { body: undefined } : {}) },
      false,
    );
    assert.equal(response.status, 503, path);
    assert.equal(calls.length, 0);
  }
});

test("F6-02-H01: solo acepta una dirección IP individual del proxy confiable", async () => {
  for (const [trustVercelClientIp, supplied, expected] of [
    [true, "203.0.113.7", "203.0.113.7"],
    [true, "2001:db8::7", "2001:db8::7"],
    [true, "203.0.113.7, 198.51.100.1", null],
    [true, "invalid", null],
    [false, "203.0.113.7", null],
  ]) {
    const headers = {
      "x-vercel-forwarded-for": supplied,
      "x-forwarded-for": "198.51.100.1",
      "x-real-ip": "198.51.100.2",
    };
    const post = await exercise(
      "sign-in/social",
      {
        headers: { origin, "content-type": "application/json", ...headers },
        body: '{"provider":"google"}',
      },
      true,
      trustVercelClientIp,
    );
    assert.equal(post.calls[0].headers.get("x-vercel-forwarded-for"), expected);
    assert.equal(post.calls[0].headers.get("x-forwarded-for"), null);
    assert.equal(post.calls[0].headers.get("x-real-ip"), null);

    const callback = await exercise(
      "callback/google",
      { method: "GET", body: undefined, headers },
      true,
      trustVercelClientIp,
    );
    assert.equal(
      callback.calls[0].headers.get("x-vercel-forwarded-for"),
      expected,
    );
  }
});
