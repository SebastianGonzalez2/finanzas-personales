import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { bankReferenceToday } from "../../src/domain/bank-balances.ts";
import {
  financeBrowserFixtures,
  financeTestOrigin,
} from "../support/finance-browser.mjs";

test.use({ launchOptions: { ignoreDefaultArgs: ["--hide-scrollbars"] } });

const retiredModules = /\/(fondos|tarjetas|deudas|beneficios)(\/|$|\?|#)/;

// SIMP-03 — Resumen de gastos: total, comparación, categorías, evolución,
// últimos gastos y presupuestos; sin saldos, ingresos, tarjetas ni fondos.
test("SIMP-03: Resumen de gastos sin módulos retirados y sin desbordamiento horizontal", async ({
  page,
  context,
}, testInfo) => {
  const { cookies } = await financeBrowserFixtures();
  await context.addCookies([cookies.a1]);
  const today = bankReferenceToday();
  const width = testInfo.project.name === "chromium-mobile" ? 375 : 1440;
  await page.setViewportSize({ width, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const concept = `Gasto SIMP-03 ${randomUUID().slice(0, 8)}`;
  const expense = await context.request.post("/api/movements", {
    data: {
      idempotencyKey: randomUUID(),
      kind: "expense",
      currency: "UYU",
      amount: "1000",
      effectiveOn: today,
      concept,
    },
    headers: { origin: financeTestOrigin },
  });
  expect(expense.status(), await expense.text()).toBe(201);

  await page.goto("/resumen#titulo-pagina");
  await expect(
    page.getByRole("heading", { level: 1, name: "Resumen de gastos" }),
  ).toBeVisible();
  for (const region of [
    "Gastos del mes",
    "Gastos por categoría",
    "Evolución de los últimos seis meses",
    "Presupuestos",
    "Últimos gastos",
  ])
    await expect(page.getByRole("region", { name: region })).toBeVisible();
  await expect(page.getByRole("link", { name: concept })).toBeVisible();

  // Ningún elemento de bancos, ingresos, tarjetas, fondos, préstamos,
  // beneficios ni reembolsos.
  await expect(
    page.getByText(
      /Disponible libre|Saldo bancario|Ingresos del mes|Tarjetas de crédito|Fondos de ahorro|Cambio de moneda|Devoluciones|Beneficios/,
    ),
  ).toHaveCount(0);
  const hrefs = await page
    .locator("a[href]")
    .evaluateAll((links) => links.map((link) => link.getAttribute("href")));
  expect(hrefs.filter((href) => retiredModules.test(href ?? ""))).toEqual([]);

  // El formulario es solo de gastos.
  await page.evaluate(() =>
    globalThis.document
      .querySelector('button[aria-controls="nueva-transaccion"]')
      ?.click(),
  );
  const form = page.getByRole("form", { name: "Nuevo gasto" });
  await expect(form).toBeVisible();
  await expect(form.getByLabel("Tipo de movimiento")).toHaveCount(0);
  await expect(form.getByLabel("Medio bancario")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: /tarjeta|otras personas/i }),
  ).toHaveCount(0);

  // Móvil y escritorio sin desplazamiento horizontal.
  const overflow = await page.evaluate(() => {
    const root = globalThis.document.documentElement;
    return root.scrollWidth - root.clientWidth;
  });
  expect(overflow).toBeLessThanOrEqual(0);

  // Deja los datos compartidos como estaban.
  const { id } = await expense.json();
  await context.request.patch("/api/movements", {
    headers: { origin: financeTestOrigin },
    data: { action: "void", eventId: id, idempotencyKey: randomUUID() },
  });
});

test("SIMP-03: la navegación solo ofrece gastos y los módulos retirados redirigen al Resumen", async ({
  page,
  context,
}, testInfo) => {
  const { cookies } = await financeBrowserFixtures();
  await context.addCookies([cookies.a1]);
  const mobile = testInfo.project.name === "chromium-mobile";
  await page.setViewportSize({ width: mobile ? 375 : 1440, height: 900 });
  await page.goto("/resumen#titulo-pagina");

  if (mobile)
    await page.getByRole("button", { name: "Abrir navegación" }).click();
  const menu = page.getByRole("navigation", { name: "Navegación principal" });
  const labels = await menu.getByRole("link").allTextContents();
  expect(labels.map((label) => label.trim())).toEqual([
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

  for (const path of [
    "/fondos",
    "/tarjetas",
    "/tarjetas/00000000-0000-4000-8000-000000000000/resumen",
    "/deudas",
    "/deudas/00000000-0000-4000-8000-000000000000",
    "/beneficios",
  ]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/resumen$/);
  }
});
