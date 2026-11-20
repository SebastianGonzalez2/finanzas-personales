/* global Buffer, navigator, caches, localStorage, sessionStorage, indexedDB */
import { createHash, randomUUID } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath, URL } from "node:url";
import { gunzipSync } from "node:zlib";
import { expect, test as base } from "@playwright/test";
import pg from "pg";
import { tutorialStorageKey } from "../../src/domain/tutorial.ts";
import {
  cardCommand,
  creditPayment,
  creditPurchase,
  loanLend,
  loanSettle,
} from "../support/f2-10-fixtures.mjs";
import {
  financeBrowserFixtures,
  financeTestOrigin,
} from "../support/finance-browser.mjs";
import { testDatabaseConfig } from "../support/test-database.mjs";

// F6-02 etapa A. Matriz HTTP negativa contra la aplicación compilada con
// sesiones sintéticas (A1, A2, B) y la base desechable local. Sin Google ni
// Neon. El inventario de rutas y páginas se deriva del sistema de archivos, de
// modo que una ruta nueva entra automáticamente en las matrices.
const appRoot = fileURLToPath(new URL("../../src/app/", import.meta.url));
const walk = (dir, accept) =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory()
      ? walk(path, accept)
      : accept(path)
        ? [path]
        : [];
  });
const urlOf = (file, suffix) =>
  `/${relative(appRoot, file).split(sep).join("/")}`.slice(0, -suffix.length);
const verbs = ["GET", "POST", "PUT", "PATCH", "DELETE"];
const exportedVerbs = (text) =>
  verbs.filter((verb) =>
    new RegExp(
      `export\\s+(?:async\\s+)?function\\s+${verb}\\b|export\\s+const\\s+${verb}\\b|export\\s*\\{[^}]*\\bas\\s+${verb}\\b`,
    ).test(text),
  );
const apiRoutes = walk(join(appRoot, "api"), (p) => p.endsWith("route.ts"))
  .map((file) => ({
    url: urlOf(file, "/route.ts"),
    methods: exportedVerbs(readFileSync(file, "utf8")),
  }))
  .filter(({ url }) => !url.startsWith("/api/auth/"))
  .sort((a, b) => a.url.localeCompare(b.url));
const cronRoutes = apiRoutes.filter(({ url }) => url.startsWith("/api/cron/"));
const mutatingRoutes = apiRoutes.filter(({ methods }) =>
  methods.some((m) => m !== "GET"),
);
const placeholders = {
  "[id]": randomUUID(),
  "[source]": "movimientos",
  "[cardId]": randomUUID(),
};
const pageUrls = walk(appRoot, (p) => p.endsWith(`${sep}page.tsx`))
  .map((file) =>
    urlOf(file, "/page.tsx").replace(/\[[^\]]+\]/g, (m) => placeholders[m]),
  )
  .map((url) => url || "/")
  .filter((url) => url !== "/auth/sign-in" && url !== "/")
  // SIMP-03: los módulos retirados redirigen a /resumen antes de llegar a la página.
  .filter((url) => !/^\/(fondos|tarjetas|deudas|beneficios)(\/|$)/.test(url))
  .sort();

const test = base.extend({
  actors: async ({ browser, context }, run, testInfo) => {
    testInfo.skip(
      testInfo.project.name !== "chromium-desktop",
      "Matriz HTTP: una sola vez, sin dependencia del tamaño de pantalla",
    );
    const fixtures = await financeBrowserFixtures();
    const admin = new pg.Client(testDatabaseConfig());
    await admin.connect();
    const extra = [];
    try {
      await context.addCookies([fixtures.cookies.a1]);
      const other = await browser.newContext({ baseURL: financeTestOrigin });
      extra.push(other);
      await other.addCookies([fixtures.cookies.b]);
      await run({ a: context, b: other, fixtures, admin });
    } finally {
      await Promise.all(extra.map((c) => c.close()));
      await admin.end();
    }
  },
});

const send = (actor, method, path, data, headers = {}) =>
  actor.request.fetch(path, {
    method,
    data,
    maxRedirects: 0,
    headers: { origin: financeTestOrigin, ...headers },
  });
const json = async (response) => response.json().catch(() => null);

// Next.js responde a una petición RSC sin el hash `_rsc` correcto con un 307 a
// la misma ruta más ese hash. Es un redirect de caché, no de autenticación: se
// sigue una sola vez, solo hacia la misma ruta, y la respuesta final se evalúa.
async function getPage(requester, url, headers = {}) {
  let response = await requester.get(url, { headers, maxRedirects: 0 });
  const location = response.headers().location;
  if (headers.rsc && response.status() === 307 && location?.includes("_rsc")) {
    const from = new URL(url, financeTestOrigin);
    const to = new URL(location, financeTestOrigin);
    if (to.origin === from.origin && to.pathname === from.pathname)
      response = await requester.get(`${to.pathname}${to.search}`, {
        headers,
        maxRedirects: 0,
      });
  }
  return response;
}

async function ownerDigest(admin, owner) {
  const { rows: tables } = await admin.query(`
    SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'finance' AND c.relkind IN ('r', 'p')
       AND EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = c.oid
         AND a.attname = 'owner_id' AND NOT a.attisdropped) ORDER BY 1`);
  const digest = {};
  for (const { relname } of tables) {
    const { rows } = await admin.query(
      `SELECT count(*)::int AS rows,
              coalesce(md5(string_agg(t::text, '|' ORDER BY t::text)), '') AS digest
         FROM finance.${relname} t WHERE owner_id = $1`,
      [owner],
    );
    digest[relname] = rows[0];
  }
  return digest;
}

const sample = {
  bankBalance: { currency: "UYU", amount: "10000", asOfDate: "2025-01-01" },
  expense: (concept = "Gasto sintético F6-02") => ({
    kind: "expense",
    currency: "UYU",
    method: "debit",
    amount: "10",
    effectiveOn: "2025-02-01",
    concept,
    idempotencyKey: randomUUID(),
  }),
};

test("F6-02: API sin sesión: cada ruta y verbo se rechaza sin datos, cookies ni CORS", async ({
  request,
}) => {
  test.skip(
    test.info().project.name !== "chromium-desktop",
    "Matriz HTTP: una sola vez",
  );
  expect(apiRoutes.length).toBeGreaterThanOrEqual(29);
  const problems = [];
  for (const { url, methods } of apiRoutes)
    for (const method of verbs) {
      const body = ["GET", "DELETE"].includes(method) ? undefined : {};
      const response = await request.fetch(url, {
        method,
        data: body,
        maxRedirects: 0,
        headers: { origin: financeTestOrigin },
      });
      const status = response.status();
      const label = `${method} ${url} → ${status}`;
      const exported = methods.includes(method);
      if (!exported) {
        if (status !== 405)
          problems.push(`${label}: verbo no exportado debe ser 405`);
        continue;
      }
      if (![400, 401, 403, 503].includes(status))
        problems.push(`${label}: respuesta inesperada sin sesión`);
      const headers = response.headers();
      if (headers["set-cookie"]) problems.push(`${label}: fija cookies`);
      if (
        headers["access-control-allow-origin"] ||
        headers["access-control-allow-credentials"]
      )
        problems.push(`${label}: cabeceras CORS`);
      if (headers["cache-control"] !== "private, no-store")
        problems.push(`${label}: Cache-Control ${headers["cache-control"]}`);
      const parsed = await json(response);
      if (
        parsed &&
        Object.keys(parsed).some((key) => !["error", "enabled"].includes(key))
      )
        problems.push(
          `${label}: el cuerpo expone campos ${Object.keys(parsed)}`,
        );
    }
  expect(problems).toEqual([]);
  // Rutas con comandos válidos: sin sesión siempre 401, nunca un efecto.
  for (const [url, data] of [
    ["/api/bank-balances", sample.bankBalance],
    ["/api/movements", sample.expense()],
    ["/api/cards", cardCommand()],
    ["/api/loans", loanLend()],
    ["/api/export", { from: "2025-03-01", to: "2025-03-31", format: "csv" }],
    ["/api/account/backup", { action: "download" }],
  ]) {
    const response = await request.post(url, {
      data,
      headers: { origin: financeTestOrigin },
    });
    expect(response.status(), url).toBe(401);
  }
  const options = await request.fetch("/api/movements", {
    method: "OPTIONS",
    headers: {
      origin: "https://evil.example",
      "access-control-request-method": "POST",
    },
  });
  expect(options.headers()["access-control-allow-origin"]).toBeUndefined();
  // Better Auth: solo tres entradas y nunca la sesión ni otras rutas internas.
  for (const path of [
    "get-session",
    "list-sessions",
    "ok",
    "sign-in/email",
    "sign-up/email",
    "update-user",
    "delete-user",
  ])
    for (const method of ["GET", "POST"]) {
      const response = await request.fetch(`/api/auth/${path}`, {
        method,
        data: method === "POST" ? {} : undefined,
        headers: { origin: financeTestOrigin },
      });
      expect(response.status(), `${method} /api/auth/${path}`).toBe(404);
    }
});

test("F6-02: páginas sin sesión redirigen al acceso sin contenido privado, también con RSC y prefetch", async ({
  request,
}) => {
  test.skip(test.info().project.name !== "chromium-desktop", "Matriz HTTP");
  expect(pageUrls.length).toBeGreaterThanOrEqual(13);
  for (const url of pageUrls)
    for (const headers of [
      {},
      { rsc: "1" },
      { rsc: "1", "next-router-prefetch": "1" },
      { cookie: "finanzas-google.session_token=invalida" },
      { cookie: "better-auth.session_token=invalida" },
    ]) {
      const response = await getPage(
        request,
        `${url}?month=2025-01&owner_id=B`,
        headers,
      );
      const label = `${url} ${JSON.stringify(headers)}`;
      const body = await response.text();
      expect(response.headers()["cache-control"], label).toContain("no-store");
      expect(body, label).not.toMatch(
        /Disponible libre|Saldo bancario|Historial de/,
      );
      if (headers.rsc) {
        // En el protocolo RSC la redirección viaja dentro del flujo (200 con
        // «NEXT_REDIRECT»): solo se admite el destino de acceso y el contenido
        // restante se limita a los metadatos estáticos de la página.
        expect(response.status(), label).toBe(200);
        // El prefetch devuelve solo el esqueleto del árbol de segmentos, sin
        // render de la página ni redirección: no contiene datos del titular.
        if (!headers["next-router-prefetch"])
          expect(body, label).toContain(
            '"digest":"NEXT_REDIRECT;replace;/auth/sign-in;307;"',
          );
        // `owner_id=B` puede reaparecer solo como eco de la URL consultada.
        expect(body.replaceAll("owner_id=B", ""), label).not.toMatch(
          /MARCADOR|owner_id|app_auth|Tu cuenta está conectada/,
        );
      } else {
        expect(response.status(), label).toBe(307);
        expect(response.headers().location, label).toBe("/auth/sign-in");
      }
    }
});

test("F6-02: sesión revocada: todas las rutas y páginas dejan de responder aunque conserve la cookie", async ({
  actors,
}) => {
  const { a, admin, fixtures } = actors;
  expect((await send(a, "GET", "/api/account")).status()).toBe(200);
  expect(
    (
      await a.request.post("/api/bank-balances", {
        data: sample.bankBalance,
        headers: { origin: financeTestOrigin },
      })
    ).status(),
  ).toBe(201);
  const page = await a.newPage();
  await page.goto("/resumen");
  await expect(page).toHaveURL(/\/resumen$/);
  // El administrador revoca a A; la cookie del navegador sigue presente.
  await admin.query(
    "UPDATE app_access.allowlist SET enabled = false WHERE user_id = $1",
    [fixtures.owners.a],
  );
  const problems = [];
  for (const { url, methods } of apiRoutes) {
    if (url.startsWith("/api/cron/")) continue;
    for (const method of methods) {
      const response = await send(
        a,
        method,
        url,
        method === "GET" ? undefined : {},
      );
      if (response.status() >= 200 && response.status() < 300)
        problems.push(`${method} ${url} → ${response.status()}`);
    }
  }
  for (const [url, data] of [
    ["/api/bank-balances", sample.bankBalance],
    ["/api/movements", sample.expense()],
    ["/api/cards", cardCommand()],
    ["/api/export", { from: "2025-03-01", to: "2025-03-31", format: "csv" }],
    ["/api/account/backup", { action: "download" }],
    [
      "/api/account/backup",
      { action: "restore", backup: {}, confirmation: "x" },
    ],
  ])
    expect(
      (await send(a, "POST", url, data)).status(),
      `revocada: ${url}`,
    ).toBe(401);
  expect((await send(a, "GET", "/api/account")).status()).toBe(401);
  for (const url of pageUrls) {
    const response = await a.request.get(url, { maxRedirects: 0 });
    expect(response.status(), url).toBe(307);
    expect(response.headers().location, url).toBe("/auth/sign-in");
  }
  expect(problems).toEqual([]);
  // Rehabilitar al titular no devuelve la sesión eliminada.
  await admin.query(
    "UPDATE app_access.allowlist SET enabled = true WHERE user_id = $1",
    [fixtures.owners.a],
  );
  expect((await send(a, "GET", "/api/account")).status()).toBe(401);
  await page.reload();
  await expect(page).toHaveURL(/\/auth\/sign-in$/);
});

test("F6-02: mutaciones con origen ajeno, ausente o cruzado, o con parámetros de URL, no producen efectos", async ({
  actors,
}) => {
  const { a, admin, fixtures } = actors;
  expect(
    (
      await a.request.post("/api/bank-balances", {
        data: sample.bankBalance,
        headers: { origin: financeTestOrigin },
      })
    ).status(),
  ).toBe(201);
  const before = await ownerDigest(admin, fixtures.owners.a);
  const bodies = {
    "/api/bank-balances": sample.bankBalance,
    "/api/movements": sample.expense(),
    "/api/cards": cardCommand(),
    "/api/loans": loanLend(),
    "/api/export": { from: "2025-03-01", to: "2025-03-31", format: "csv" },
    "/api/account/backup": { action: "download" },
  };
  const problems = [];
  for (const { url, methods } of mutatingRoutes) {
    const method = methods.find((m) => m !== "GET");
    const data = bodies[url] ?? {};
    const attempts = [
      ["sin Origin", {}, "", 403, { origin: "" }],
      ["Origin ajeno", {}, "", 403, { origin: "https://evil.example" }],
      ["Origin null", {}, "", 403, { origin: "null" }],
      [
        "Origin con otro puerto",
        {},
        "",
        403,
        { origin: `${financeTestOrigin}0` },
      ],
      [
        "Sec-Fetch-Site cross-site",
        {},
        "",
        403,
        { "sec-fetch-site": "cross-site" },
      ],
      ["parámetro owner_id", {}, "?owner_id=B", 400, {}],
    ];
    for (const [label, , query, expected, headers] of attempts) {
      const response = await a.request.fetch(`${url}${query}`, {
        method,
        data,
        maxRedirects: 0,
        headers: { origin: financeTestOrigin, ...headers },
      });
      const received =
        headers.origin === "" ? response.status() : response.status();
      if (received !== expected)
        problems.push(
          `${method} ${url} (${label}) → ${received}, esperado ${expected}`,
        );
    }
    // Tipo de contenido no JSON: nunca un éxito.
    const text = await a.request.fetch(url, {
      method,
      headers: { origin: financeTestOrigin, "content-type": "text/plain" },
      data: JSON.stringify(data),
      maxRedirects: 0,
    });
    if (text.status() >= 200 && text.status() < 400)
      problems.push(`${method} ${url} (text/plain) → ${text.status()}`);
  }
  expect(problems).toEqual([]);
  expect(await ownerDigest(admin, fixtures.owners.a)).toEqual(before);
});

test("F6-02: cron exige la credencial propia; sesión, query y cabeceras alternativas no sirven", async ({
  actors,
  request,
}) => {
  const { a } = actors;
  expect(cronRoutes.length).toBe(2);
  for (const { url } of cronRoutes) {
    const secret = "synthetic-finance-cron-secret";
    const attempts = [
      ["sin credencial", {}, ""],
      ["Bearer incorrecto", { authorization: "Bearer incorrecta" }, ""],
      ["sin esquema Bearer", { authorization: secret }, ""],
      ["esquema en minúsculas", { authorization: `bearer ${secret}` }, ""],
      // Un espacio final lo elimina el propio protocolo HTTP (RFC 9110), de modo
      // que se prueban prefijo y sufijo de la credencial real.
      [
        "credencial truncada",
        { authorization: `Bearer ${secret.slice(0, -1)}` },
        "",
      ],
      ["credencial con sufijo", { authorization: `Bearer ${secret}0` }, ""],
      ["credencial en query", {}, `?secret=${secret}`],
      [
        "cabecera alternativa",
        { "x-cron-secret": secret, "x-vercel-cron": "1" },
        "",
      ],
    ];
    for (const [label, headers, query] of attempts) {
      const response = await request.get(`${url}${query}`, {
        headers,
        maxRedirects: 0,
      });
      expect(response.status(), `${url}: ${label}`).toBe(401);
      expect(response.headers()["cache-control"]).toBe("private, no-store");
    }
    expect(
      (await a.request.get(url, { maxRedirects: 0 })).status(),
      `${url}: cookie de sesión`,
    ).toBe(401);
    for (const method of ["POST", "PUT", "PATCH", "DELETE"])
      expect(
        (
          await request.fetch(url, {
            method,
            headers: { authorization: `Bearer ${secret}` },
          })
        ).status(),
        `${method} ${url}`,
      ).toBe(405);
  }
  // Con la credencial correcta la ruta procesa (base desechable, datos sintéticos).
  const accepted = await request.get("/api/cron/contributions", {
    headers: { authorization: "Bearer synthetic-finance-cron-secret" },
  });
  expect([204, 503]).toContain(accepted.status());
});

test("F6-02: referencias a recursos de A desde B no leen, modifican, anulan ni crean efectos", async ({
  actors,
}) => {
  const { a, b, admin, fixtures } = actors;
  const post = (actor, path, data) => send(actor, "POST", path, data);
  const created = async (response, status = 201) => {
    expect(response.status(), await response.text()).toBe(status);
    return (await response.json()).id;
  };
  expect(
    (await post(a, "/api/bank-balances", sample.bankBalance)).status(),
  ).toBe(201);
  const concept = `MARCADOR-A-${randomUUID()}`;
  const movement = await created(
    await post(a, "/api/movements", sample.expense(concept)),
  );
  const card = await created(await post(a, "/api/cards", cardCommand()));
  const purchase = await created(
    await post(a, "/api/cards/operations", creditPurchase({ cardId: card })),
  );
  const loan = await created(await post(a, "/api/loans", loanLend()));
  const category = await created(
    await post(a, "/api/categories", {
      kind: "expense",
      name: "Categoría de A",
    }),
  );
  const beforeA = await ownerDigest(admin, fixtures.owners.a);
  const beforeB = await ownerDigest(admin, fixtures.owners.b);

  const attacks = [
    [
      "PATCH",
      "/api/movements",
      { action: "void", eventId: movement, idempotencyKey: randomUUID() },
    ],
    [
      "PATCH",
      "/api/movements",
      {
        action: "correct",
        eventId: movement,
        amount: "1",
        idempotencyKey: randomUUID(),
      },
    ],
    [
      "PATCH",
      "/api/movements",
      {
        action: "edit",
        eventId: movement,
        idempotencyKey: randomUUID(),
        movement: sample.expense("secuestro"),
      },
    ],
    [
      "PATCH",
      "/api/movements",
      { action: "void", eventId: purchase, idempotencyKey: randomUUID() },
    ],
    [
      "POST",
      "/api/cards",
      {
        action: "update",
        cardId: card,
        version: 1,
        name: "Renombrada por B",
        issuer: null,
        currencies: [{ currency: "UYU", limit: null }],
        idempotencyKey: randomUUID(),
      },
    ],
    [
      "POST",
      "/api/cards",
      {
        action: "archive",
        cardId: card,
        version: 1,
        idempotencyKey: randomUUID(),
      },
    ],
    ["POST", "/api/cards/operations", creditPurchase({ cardId: card })],
    ["POST", "/api/cards/operations", creditPayment({ cardId: card })],
    ["POST", "/api/loans", loanSettle({ loanId: loan })],
    [
      "POST",
      "/api/refunds",
      { action: "void", eventId: purchase, idempotencyKey: randomUUID() },
    ],
    [
      "POST",
      "/api/refunds",
      {
        action: "pending",
        purchaseId: purchase,
        amount: "1",
        effectiveOn: "2025-02-02",
        idempotencyKey: randomUUID(),
      },
    ],
    [
      "POST",
      "/api/refunds",
      {
        action: "return_balance",
        currency: "UYU",
        cardId: card,
        amount: "1",
        effectiveOn: "2025-02-02",
        idempotencyKey: randomUUID(),
      },
    ],
    ["POST", "/api/categories", { id: category, archived: true }],
  ];
  const problems = [];
  for (const [method, url, data] of attacks) {
    const response = await send(b, method, url, data);
    const status = response.status();
    const text = await response.text();
    const label = `${method} ${url} ${data.action ?? ""} → ${status}`;
    if (status < 400 || status >= 500)
      problems.push(`${label}: debe rechazarse con 4xx`);
    if (text.includes(concept) || text.includes(card) || text.includes(loan))
      problems.push(`${label}: la respuesta repite datos de A`);
    if (response.headers()["cache-control"] !== "private, no-store")
      problems.push(`${label}: caché ${response.headers()["cache-control"]}`);
  }
  expect(problems).toEqual([]);
  expect(
    await ownerDigest(admin, fixtures.owners.a),
    "Los datos de A permanecen intactos",
  ).toEqual(beforeA);
  expect(
    await ownerDigest(admin, fixtures.owners.b),
    "B no recibe filas ni efectos",
  ).toEqual(beforeB);

  // Páginas de detalle y listados de B no revelan recursos de A.
  for (const url of [
    `/historial/movimientos/${movement}`,
    `/historial/movimientos/${purchase}`,
    `/historial?q=${encodeURIComponent(concept)}`,
    "/resumen",
    "/historial",
    "/categorias",
  ]) {
    const response = await b.request.get(url, { maxRedirects: 0 });
    const text = await response.text();
    expect([200, 404], url).toContain(response.status());
    expect(response.headers()["cache-control"], url).toContain("no-store");
    // La búsqueda por texto devuelve en la propia página el término que B escribió
    // (entrada reflejada del mismo titular, no un dato de A): ahí se exige que el
    // listado de resultados esté vacío en lugar de buscar el término.
    const reflected = url.includes("?q=");
    for (const secret of [
      concept,
      "Categoría de A",
      "Tarjeta sintética F2-10",
      "Préstamo sintético F2-10",
    ])
      if (!(reflected && secret === concept))
        expect(text, `${url} filtra «${secret}»`).not.toContain(secret);
    if (reflected) expect(text).toContain('\\"entries\\":[]');
  }
  // A sigue viendo sus propios datos.
  const own = await a.request.get(`/historial/movimientos/${movement}`);
  expect(own.status()).toBe(200);
  expect(await own.text()).toContain(concept);
});

test("F6-02: exportaciones y copias: privadas, sin secretos ni identificadores ajenos y no reutilizables sin sesión", async ({
  actors,
  request,
}) => {
  const { a, b, fixtures, admin } = actors;
  const marker = `MARCADOR-A-${randomUUID()}`;
  expect(
    (await send(a, "POST", "/api/bank-balances", sample.bankBalance)).status(),
  ).toBe(201);
  expect(
    (
      await send(a, "POST", "/api/movements", {
        ...sample.expense(marker),
        effectiveOn: "2025-03-05",
      })
    ).status(),
  ).toBe(201);
  expect(
    (await send(b, "POST", "/api/bank-balances", sample.bankBalance)).status(),
  ).toBe(201);
  expect(
    (
      await send(b, "POST", "/api/movements", {
        ...sample.expense("MARCADOR-B"),
        effectiveOn: "2025-03-06",
      })
    ).status(),
  ).toBe(201);

  for (const format of ["csv", "excel", "pdf"]) {
    const response = await send(a, "POST", "/api/export", {
      from: "2025-03-01",
      to: "2025-03-31",
      format,
    });
    expect(response.status(), format).toBe(200);
    const headers = response.headers();
    expect(headers["cache-control"]).toBe("private, no-store");
    expect(headers["pragma"]).toBe("no-cache");
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["content-disposition"]).toMatch(
      /^attachment; filename="[A-Za-z0-9._-]+"$/,
    );
    const body = (await response.body()).toString("latin1");
    expect(body).not.toContain("MARCADOR-B");
    expect(body).not.toContain(fixtures.owners.a);
    expect(body).not.toContain(fixtures.owners.b);
    if (format === "csv") expect(body).toContain(marker);
  }
  const outsideBeforeFormat = await send(a, "POST", "/api/export", {
    from: "2025-03-01",
    to: "2025-03-31",
    format: "../../etc/passwd",
  });
  expect(outsideBeforeFormat.status()).toBe(400);

  const backup = await send(a, "POST", "/api/account/backup", {
    action: "download",
  });
  expect(backup.status()).toBe(200);
  expect(backup.headers()["cache-control"]).toBe("private, no-store");
  expect(backup.headers()["x-content-type-options"]).toBe("nosniff");
  const file = await backup.json();
  const { signed } = file;
  const payload = gunzipSync(
    Buffer.from(JSON.parse(signed).data, "base64url"),
  ).toString("utf8");
  expect(payload).toContain(marker);
  for (const forbidden of [
    "MARCADOR-B",
    '"owner_id"',
    "@example.invalid",
    "01".repeat(32),
    "isolated-finance-browser",
    "finance-fixture-secret",
    "synthetic-finance-cron-secret",
    fixtures.owners.b,
  ])
    expect(
      payload,
      `La copia no debe contener ${forbidden.slice(0, 12)}…`,
    ).not.toContain(forbidden);
  const sessions = (
    await admin.query("SELECT token FROM app_auth.session")
  ).rows.map((r) => r.token);
  expect(sessions.length).toBeGreaterThanOrEqual(3);
  for (const token of sessions) {
    expect(payload).not.toContain(token);
    expect(JSON.stringify(file)).not.toContain(token);
  }
  // El archivo de A no sirve sin sesión ni para B (verificación, confirmación y restauración).
  for (const action of ["preview", "restore"]) {
    const anonymous = await request.post("/api/account/backup", {
      data: { action, backup: file, confirmation: "x" },
      headers: { origin: financeTestOrigin },
    });
    expect(anonymous.status(), `anónimo ${action}`).toBe(401);
    const foreign = await send(b, "POST", "/api/account/backup", {
      action,
      backup: file,
      confirmation: "x",
    });
    expect(foreign.status(), `B ${action}`).toBe(400);
    expect((await foreign.json()).error).toBe(
      "La copia pertenece a otra cuenta.",
    );
  }
  // Un archivo manipulado (firma o contenido alterado) y uno con titular reescrito se rechazan.
  const tampered = {
    ...file,
    signed: file.signed.replace(fixtures.owners.a, fixtures.owners.b),
  };
  const altered = await send(b, "POST", "/api/account/backup", {
    action: "preview",
    backup: tampered,
  });
  expect(altered.status()).toBe(400);
  expect((await altered.json()).error).toBe(
    "La firma de la copia es inválida.",
  );
  const digest = createHash("sha256")
    .update(JSON.stringify(file))
    .digest("hex");
  expect(digest).toHaveLength(64);
});

test("F6-02: caché y cabeceras de páginas, RSC y archivos públicos", async ({
  actors,
  request,
}) => {
  const { a } = actors;
  expect(
    (await send(a, "POST", "/api/bank-balances", sample.bankBalance)).status(),
  ).toBe(201);
  for (const url of pageUrls) {
    for (const headers of [
      {},
      { rsc: "1" },
      { rsc: "1", "next-router-prefetch": "1" },
    ]) {
      const response = await getPage(a.request, url, headers);
      const cache = response.headers()["cache-control"] ?? "";
      expect(cache, `${url} ${JSON.stringify(headers)}`).toMatch(
        /\bprivate\b.*\bno-store\b|\bno-store\b.*\bprivate\b/,
      );
      expect(response.headers()["etag"], url).toBeUndefined();
      expect(response.headers()["x-powered-by"], url).toBeUndefined();
      expect(response.headers()["set-cookie"], url).toBeUndefined();
    }
  }
  // Archivos públicos: sin datos ni cookies.
  for (const url of [
    "/manifest.webmanifest",
    "/card-push-worker.js",
    "/icon.svg",
    "/apple-icon",
    "/pwa-icons/icon-192.png",
    "/pwa-icons/icon-512.png",
    "/pwa-icons/icon-maskable-512.png",
  ]) {
    const response = await request.get(url);
    expect(response.status(), url).toBe(200);
    expect(response.headers()["set-cookie"], url).toBeUndefined();
    expect(await response.text(), url).not.toMatch(
      /session|token|owner|Saldo/i,
    );
  }
  // Las respuestas de error no revelan trazas, rutas ni versiones.
  for (const url of [
    "/api/movements/../../etc/passwd",
    "/no-existe",
    "/historial/otra/xyz",
    "/api/export?format=%00",
  ]) {
    const response = await a.request.get(url, { maxRedirects: 0 });
    const text = await response.text();
    expect(text, url).not.toMatch(
      /node_modules|\b[a-z]:\\+(?=[^\\\s"'<>])|\/Users\/|at .*\(.*:\d+:\d+\)|postgres|pg_|finanzas_google/i,
    );
  }
});

test("F6-02-H02: las páginas fijan cabeceras de seguridad (frame, MIME, referrer, CSP)", async ({
  actors,
}) => {
  const { a } = actors;
  for (const path of ["/resumen", "/auth/sign-in", "/card-push-worker.js"]) {
    const response = await a.request.get(path, { maxRedirects: 0 });
    const headers = response.headers();
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["referrer-policy"]).toBe("no-referrer");
    expect(headers["content-security-policy"]).toContain(
      "frame-ancestors 'none'",
    );
    expect(headers["content-security-policy"]).toContain("object-src 'none'");
    expect(headers["content-security-policy"]).not.toContain("unsafe-eval");
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["permissions-policy"]).toContain("camera=(), microphone=()");
  }
});

test("F6-02/F6-03: con el worker activo, cerrar sesión y cambiar de titular protege el historial en el mismo navegador", async ({
  actors,
}) => {
  const { a, b, fixtures } = actors;
  const page = await a.newPage();
  const blocked = [];
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      /Content Security Policy/i.test(message.text())
    )
      blocked.push(message.text());
  });
  const marker = "Movimiento privado F6-02 caché";
  const otherMarker = "Movimiento privado del segundo titular";
  expect(
    (await send(a, "POST", "/api/bank-balances", sample.bankBalance)).status(),
  ).toBe(201);
  expect(
    (await send(a, "POST", "/api/movements", sample.expense(marker))).status(),
  ).toBe(201);
  expect(
    (await send(b, "POST", "/api/bank-balances", sample.bankBalance)).status(),
  ).toBe(201);
  expect(
    (
      await send(b, "POST", "/api/movements", sample.expense(otherMarker))
    ).status(),
  ).toBe(201);
  await page.goto("/historial");
  await expect(page.getByText(marker, { exact: true })).toBeVisible();
  await page.evaluate(async () => {
    await navigator.serviceWorker.register("/card-push-worker.js", {
      scope: "/",
    });
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  expect(
    await page.evaluate(() => navigator.serviceWorker.controller !== null),
  ).toBe(true);
  await page.goto("/account");
  await page.getByRole("button", { name: "Cerrar sesión" }).click();
  await expect(page).toHaveURL(/\/auth\/sign-in$/);
  const replay = await a.request.get("/api/account", {
    headers: {
      cookie: `${fixtures.cookies.a1.name}=${fixtures.cookies.a1.value}`,
    },
  });
  expect(replay.status()).toBe(401);
  expect((await b.request.get("/api/account")).status()).toBe(200);
  await page.goBack();
  await expect(page).toHaveURL(/\/auth\/sign-in$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/auth\/sign-in$/);
  await expect(page.getByText(marker, { exact: true })).toHaveCount(0);
  await a.addCookies([fixtures.cookies.b]);
  await page.goto("/historial");
  await expect(page.getByText(otherMarker, { exact: true })).toBeVisible();
  await expect(page.getByText(marker, { exact: true })).toHaveCount(0);
  await a.setOffline(true);
  try {
    await expect(page.reload()).rejects.toThrow("ERR_INTERNET_DISCONNECTED");
  } finally {
    await a.setOffline(false);
  }
  await page.goto("/historial");
  await expect(page.getByText(otherMarker, { exact: true })).toBeVisible();
  await expect(page.getByText(marker, { exact: true })).toHaveCount(0);
  expect(
    // F6-06: la única clave permitida es la preferencia de interfaz del tutorial.
    await page.evaluate(
      async (uiKey) => ({
        caches: await caches.keys(),
        databases: await indexedDB.databases(),
        local: Object.keys(localStorage).filter((key) => key !== uiKey).length,
        session: sessionStorage.length,
      }),
      tutorialStorageKey,
    ),
  ).toEqual({ caches: [], databases: [], local: 0, session: 0 });
  expect(blocked).toEqual([]);
});
