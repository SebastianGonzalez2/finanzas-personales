/* global document, navigator, window */
import { randomUUID } from "node:crypto";
import { expect, test as base } from "@playwright/test";
import { bankReferenceToday } from "../../src/domain/bank-balances.ts";
import {
  financeBrowserFixtures,
  financeTestOrigin,
} from "../support/finance-browser.mjs";

// F6-03 (RF-051/052, CA-065/066): shell, pantallas principales y formulario
// sin conexión con una sesión sintética. Solo datos de prueba.
const test = base.extend({
  fixtures: async ({ context }, run) => {
    const fixtures = await financeBrowserFixtures();
    await context.addCookies([fixtures.cookies.a1]);
    await run(fixtures);
  },
});

const screens = [
  "/resumen",
  "/historial",
  "/estadisticas",
  "/recurrentes",
  "/presupuestos",
  "/categorias",
  "/catalogo",
  "/avisos",
  "/informes",
  "/account",
  "/ayuda",
];

test("CA-066: menú móvil por teclado, Escape, clic en el fondo y foco devuelto", async ({
  page,
  fixtures,
}) => {
  void fixtures;
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/resumen");
  const open = page.getByRole("button", { name: "Abrir navegación" });
  const drawer = page.getByRole("dialog", { name: "Navegación" });
  await expect(open).toHaveAttribute("aria-expanded", "false");
  await expect(drawer).toBeHidden();

  await open.focus();
  await open.press("Enter");
  await expect(drawer).toBeVisible();
  await expect(open).toHaveAttribute("aria-expanded", "true");
  await expect(drawer.getByRole("link", { name: "Resumen" })).toHaveAttribute(
    "aria-current",
    "page",
  );

  // El diálogo modal vuelve inerte el resto: el foco nunca llega a la página
  // de fondo (queda en el diálogo o, al salir del último control, en el navegador).
  for (let step = 0; step < 20; step += 1) {
    await page.keyboard.press("Tab");
    expect(
      await page.evaluate(
        () =>
          document.activeElement === document.body ||
          Boolean(document.activeElement?.closest("dialog")),
      ),
    ).toBe(true);
  }
  await open.focus();
  await expect(open).not.toBeFocused();
  await page.keyboard.press("Escape");
  await expect(drawer).toBeHidden();
  await expect(open).toHaveAttribute("aria-expanded", "false");
  await expect(open).toBeFocused();

  await open.click();
  await expect(drawer).toBeVisible();
  await page.mouse.click(380, 400); // fondo (fuera del panel de 19,25 rem)
  await expect(drawer).toBeHidden();
  await expect(open).toBeFocused();

  // Al pasar a escritorio el diálogo se cierra y la navegación fija sigue accesible.
  await open.click();
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(drawer).toBeHidden();
  await expect(
    page
      .getByRole("navigation", { name: "Navegación principal" })
      .getByRole("link", { name: "Resumen" }),
  ).toBeVisible();
});

test("CA-066: navegación de escritorio con nombre, foco visible y salto al título", async ({
  page,
  fixtures,
}) => {
  void fixtures;
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/resumen");
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Saltar al contenido" }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("main")).toBeFocused();
  const nav = page.getByRole("navigation", { name: "Navegación principal" });
  // SIMP-03: riel agrupado (General / Control / Organización y, abajo, Avisos,
  // Ayuda y Mi cuenta). Se verifican todos los destinos en orden.
  await expect(nav.getByRole("link")).toHaveText([
    "Resumen",
    "Historial",
    "Estadísticas",
    "Informes",
    "Presupuestos",
    "Recurrentes",
    "Categorías",
    "Etiquetas",
    "Comercios y contactos",
    "Avisos",
    "Ayuda",
    "Mi cuenta",
  ]);
  for (const group of ["General", "Control", "Organización"])
    await expect(nav.getByText(group, { exact: true })).toBeAttached();
  await expect(nav.getByRole("link", { name: "Resumen" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await page.keyboard.press("Shift+Tab");
  await expect(page.getByRole("link", { name: "Mi cuenta" })).toBeFocused();
  const history = nav.getByRole("link", { name: "Historial", exact: true });
  await history.focus();
  expect(
    await history.evaluate(
      (link) => window.getComputedStyle(link).outlineStyle,
    ),
  ).toBe("solid");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Historial" })).toBeFocused();
});

for (const width of [360, 768, 1440]) {
  test(`CA-066: pantallas principales en ${width}px sin desborde, con h1, nombres accesibles y controles táctiles`, async ({
    page,
    fixtures,
  }) => {
    void fixtures;
    await page.setViewportSize({ width, height: 900 });
    // Datos sintéticos con texto largo sin espacios para provocar desbordes.
    const today = bankReferenceToday();
    const send = (path, data) =>
      page.request.fetch(path, {
        method: "POST",
        headers: { origin: financeTestOrigin },
        data,
      });
    expect(
      (
        await send("/api/movements", {
          kind: "expense",
          currency: "UYU",
          amount: "987654.32",
          effectiveOn: today,
          concept: "ConceptoSinteticoMuyLargoSinEspacios".repeat(2),
          idempotencyKey: randomUUID(),
        })
      ).status(),
    ).toBe(201);
    const problems = [];
    for (const path of screens) {
      await page.goto(path);
      await expect(page.locator("main#contenido")).toBeVisible();
      // Se mide la pantalla asentada, no un estado intermedio de la carga:
      // con las fuentes listas y repitiendo la medición mientras cambie. Un
      // defecto estable sigue fallando con el mismo informe (y sus medidas).
      await page.evaluate(() => document.fonts.ready);
      const measure = () =>
        page.evaluate(() => {
          const visible = (el) => {
            const box = el.getBoundingClientRect();
            return (
              el.checkVisibility?.() !== false &&
              box.width > 0 &&
              box.height > 0 &&
              !el.closest("dialog:not([open])")
            );
          };
          const name = (el) =>
            el.getAttribute("aria-label")?.trim() ||
            el.getAttribute("aria-labelledby") ||
            el.getAttribute("title")?.trim() ||
            el.textContent?.trim() ||
            el.querySelector("[aria-label]")?.getAttribute("aria-label") ||
            "";
          const controls = [
            ...document.querySelectorAll("input, select, textarea"),
          ].filter(
            (el) => visible(el) && !["hidden", "submit"].includes(el.type),
          );
          const clickable = [
            ...document.querySelectorAll("a[href], button, summary"),
          ].filter(
            (el) =>
              visible(el) &&
              !el.classList.contains("sr-only") &&
              el.getAttribute("href") !== "#contenido",
          );
          return {
            overflow: document.documentElement.scrollWidth - window.innerWidth,
            headings: document.querySelectorAll("h1").length,
            unlabeled: controls
              .filter(
                (el) =>
                  !el.labels?.length &&
                  !el.getAttribute("aria-label") &&
                  !el.getAttribute("aria-labelledby"),
              )
              .map((el) => el.name || el.id || el.tagName),
            unnamed: clickable
              .filter((el) => !name(el))
              .map((el) => el.outerHTML.slice(0, 80)),
            tiny: clickable
              .filter((el) => {
                const box = el.getBoundingClientRect();
                return box.height < 24 || box.width < 24;
              })
              .map((el) => {
                const box = el.getBoundingClientRect();
                return `${el.textContent?.trim().slice(0, 30)} (${Math.round(box.width)}x${Math.round(box.height)})`;
              }),
          };
        });
      const issues = (report) => [
        ...(report.overflow > 0
          ? [`${path}: desborde ${report.overflow}px`]
          : []),
        ...(report.headings !== 1 ? [`${path}: h1=${report.headings}`] : []),
        ...["unlabeled", "unnamed", "tiny"]
          .filter((key) => report[key].length)
          .map((key) => `${path}: ${key} ${report[key]}`),
      ];
      let found = [];
      await expect
        .poll(async () => (found = issues(await measure())), { timeout: 3000 })
        .toEqual([])
        .catch(() => {});
      problems.push(...found);

      if (width === 360 && path === "/estadisticas") {
        const chart = page
          .getByRole("region", { name: /^Gastos por mes en UYU/ })
          .first();
        await chart.focus();
        await expect(chart).toBeFocused();
        await expect
          .poll(() =>
            chart
              .locator("svg text")
              .first()
              .evaluate((label) => {
                const scale = label.getScreenCTM()?.a ?? 0;
                return Math.round(
                  parseFloat(window.getComputedStyle(label).fontSize) * scale,
                );
              }),
          )
          .toBeGreaterThanOrEqual(12);
        await page.keyboard.press("ArrowRight");
        await expect
          .poll(() => chart.evaluate((region) => region.scrollLeft))
          .toBeGreaterThan(0);
      }
    }
    expect(problems).toEqual([]);
  });
}

test("CA-065/066: validación nativa marca el campo y, sin conexión, no se informa éxito ni se pierde el formulario", async ({
  page,
  fixtures,
}) => {
  void fixtures;
  const today = bankReferenceToday();
  const configured = await page.request.fetch("/api/bank-balances", {
    method: "POST",
    headers: { origin: financeTestOrigin },
    data: { currency: "UYU", amount: "10000", asOfDate: today },
  });
  expect(configured.status()).toBe(201);

  await page.goto("/resumen");
  const open = page
    .getByRole("banner")
    .getByRole("link", { name: "Registrar gasto" });
  const form = page.getByRole("form", { name: "Nuevo gasto" });
  await open.focus();
  await open.press("Enter");
  await expect(
    page.getByRole("heading", { name: "Nuevo gasto" }),
  ).toBeFocused();

  // Importe vacío: el navegador rechaza el envío y el control queda marcado.
  const amount = form.getByLabel("Importe");
  await form.getByRole("button", { name: "Guardar gasto" }).click();
  await expect(amount).toHaveAttribute("aria-invalid", "true");
  await amount.fill("500");
  await expect(amount).not.toHaveAttribute("aria-invalid", "true");

  const concept = `Gasto sintético ${randomUUID().slice(0, 8)}`;
  await form.getByLabel("Concepto", { exact: true }).fill(concept);

  const context = page.context();
  await context.setOffline(true);
  try {
    await form.getByRole("button", { name: "Guardar gasto" }).click();
    const alert = form.getByRole("alert");
    await expect(alert).toContainText("Sin conexión");
    await expect(alert).toContainText("Tus datos siguen en el formulario");
    await expect(page.locator("[data-connection]")).toContainText(
      "Sin conexión",
    );
    await expect(page.getByText("Gasto registrado.")).toHaveCount(0);
    // El formulario sigue en memoria: no hubo recarga ni navegación.
    await expect(page).toHaveURL(/\/resumen$/);
    await expect(amount).toHaveValue("500");
    await expect(form.getByLabel("Concepto", { exact: true })).toHaveValue(
      concept,
    );
    await expect(
      form.getByRole("button", { name: "Reintentar guardado" }),
    ).toBeEnabled();
  } finally {
    await context.setOffline(false);
  }

  // Reintento explícito con el mismo envío: se informa éxito solo tras la respuesta.
  await expect(page.locator("[data-connection]")).toContainText(
    "Conexión restablecida",
  );
  const submitted = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/movements") &&
      response.request().method() === "POST",
  );
  await form.getByRole("button", { name: "Reintentar guardado" }).click();
  expect((await submitted).status()).toBe(201);
  await expect(page.getByText("Gasto registrado.")).toBeVisible();
});

test("CA-065: al perder la respuesta del alta, el formulario reintenta el movimiento ya confirmado sin duplicarlo", async ({
  page,
  fixtures,
}) => {
  const context = page.context();
  const origin = { origin: financeTestOrigin };
  const today = bankReferenceToday();
  const concept = "Gasto sintético con respuesta perdida";
  const movement = "**/api/movements";
  const history = `/historial?q=${encodeURIComponent(concept)}`;
  expect(
    (
      await page.request.post("/api/bank-balances", {
        headers: origin,
        data: { currency: "UYU", amount: "10000", asOfDate: today },
      })
    ).status(),
  ).toBe(201);
  await page.goto("/resumen");
  await page
    .getByRole("banner")
    .getByRole("link", { name: "Registrar gasto" })
    .click();
  const form = page.getByRole("form", { name: "Nuevo gasto" });
  const amount = form.getByLabel("Importe");
  await amount.fill("500");
  await form.getByLabel("Concepto", { exact: true }).fill(concept);

  // La solicitud llega al servidor real; Chrome pierde la respuesta. Simulamos
  // también la caída del origen para RSC mientras navigator.onLine sigue true.
  // Los prefetch de los enlaces a Resumen (cabecera `next-router-prefetch`)
  // los dispara el router según el viewport, en cualquier momento: también
  // caen, pero no son un `router.refresh()` del formulario y no se cuentan.
  let refreshes = 0;
  const dropRefresh = async (route) => {
    const headers = route.request().headers();
    if (headers.rsc === "1") {
      if (!headers["next-router-prefetch"]) refreshes++;
      await route.abort("connectionreset");
    } else {
      await route.continue();
    }
  };
  await page.route("**/resumen*", dropRefresh);
  let originalBody;
  let committed;
  await page.route(
    movement,
    async (route) => {
      originalBody = route.request().postData();
      const response = await route.fetch();
      committed = { status: response.status(), body: await response.json() };
      await route.abort("connectionreset");
    },
    { times: 1 },
  );
  const failed = page.waitForEvent("requestfailed", (request) =>
    request.url().endsWith("/api/movements"),
  );
  await form.getByRole("button", { name: "Guardar gasto" }).click();
  expect((await failed).failure()?.errorText).toBe("net::ERR_CONNECTION_RESET");
  expect(committed?.status).toBe(201);
  expect(await page.evaluate(() => navigator.onLine)).toBe(true);
  await expect(form.getByRole("alert")).toContainText(
    "No pudimos confirmar el guardado",
  );
  await expect(page.getByText("Gasto registrado.")).toHaveCount(0);
  await expect(amount).toHaveValue("500");
  await expect(amount).toBeDisabled();
  expect(refreshes).toBe(0);

  // Una segunda sesión comprueba el efecto en el servidor antes del reintento.
  const observer = await context.browser().newContext({
    baseURL: financeTestOrigin,
  });
  try {
    await observer.addCookies([fixtures.cookies.a2]);
    const check = await observer.newPage();
    await check.goto("/resumen");
    await check.goto(history);
    const entries = check.getByRole("link", { name: new RegExp(concept) });
    await expect(entries).toHaveCount(1);

    const allowsUnload = () =>
      page.evaluate(() =>
        window.dispatchEvent(
          new window.Event("beforeunload", { cancelable: true }),
        ),
      );
    expect(await allowsUnload()).toBe(false);
    await page.unroute("**/resumen*", dropRefresh);
    const retry = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/movements") &&
        response.request().method() === "POST",
    );
    await form.getByRole("button", { name: "Reintentar guardado" }).click();
    const response = await retry;
    expect(response.status()).toBe(200);
    expect(response.request().postData()).toBe(originalBody);
    expect(await response.json()).toEqual(committed.body);
    await expect(page.getByText("Gasto registrado.")).toBeVisible();
    await check.reload();
    await expect(entries).toHaveCount(1);
    // Tras la confirmación, la recarga vuelve a funcionar sin advertencia.
    expect(await allowsUnload()).toBe(true);
    await page.reload();
  } finally {
    await observer.close();
  }
});
