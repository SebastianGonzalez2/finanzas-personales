import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { bankReferenceToday } from "../../src/domain/bank-balances.ts";
import {
  financeBrowserFixtures,
  financeTestOrigin,
} from "../support/finance-browser.mjs";

test("F3-05: autoriza dos fondos, registra un compromiso y paga solo la parte elegida", async ({
  page,
  context,
  browser,
}, testInfo) => {
  const { cookies } = await financeBrowserFixtures();
  await context.addCookies([cookies.a1]);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const today = bankReferenceToday();
  const post = (route, data) =>
    context.request.post(`/api/${route}`, {
      data: { idempotencyKey: randomUUID(), ...data },
      headers: { origin: financeTestOrigin },
    });
  async function record(route, button) {
    const saved = page.waitForResponse((item) =>
      item.url().endsWith(`/api/${route}`),
    );
    await page
      .getByRole("button", { name: button, exact: true })
      .and(page.locator("button:enabled"))
      .click();
    const response = await saved;
    expect(response.status(), await response.text()).toBe(201);
    return (await response.json()).id;
  }
  async function fund(name, amount) {
    const created = await post("funds", {
      action: "create",
      name,
      currency: "UYU",
    });
    expect(created.status()).toBe(201);
    const { id: fundId } = await created.json();
    expect(
      (
        await post("funds", { action: "reserve", fundId, version: 1, amount })
      ).status(),
    ).toBe(200);
    return fundId;
  }
  const opening = await context.request.post("/api/bank-balances", {
    data: { currency: "UYU", amount: "2000", asOfDate: today },
    headers: { origin: financeTestOrigin },
  });
  expect(opening.status()).toBe(201);
  const travel = await fund("Viajes F3-05", "1200");
  const other = await fund("Emergencias F3-05", "600");
  const card = await post("cards", {
    action: "create",
    kind: "credit",
    name: "Visa F3-05",
    currencies: [{ currency: "UYU", limit: null }],
  });
  expect(card.status(), await card.text()).toBe(201);
  const { id: cardId } = await card.json();

  await page.goto("/resumen");
  await page
    .getByRole("button", { name: "+ Nueva transacción", exact: true })
    .click();
  await page
    .getByRole("form", { name: "Nueva transacción" })
    .getByLabel("Importe")
    .fill("1200");
  await page
    .getByLabel("Concepto", { exact: true })
    .fill("Equipo para el viaje");
  await expect(
    page.getByText("Faltan 1.000,00 UYU para cubrir el gasto."),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Pagar usando fondo de ahorro", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Fondo 1", exact: true })
    .selectOption(travel);
  await page.getByLabel("Importe del fondo 1").fill("600");
  await expect(
    page.getByText("Faltan 400,00 UYU para cubrir el gasto."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Agregar otro fondo" }).click();
  await page
    .getByRole("combobox", { name: "Fondo 2", exact: true })
    .selectOption(other);
  await page.getByLabel("Importe del fondo 2").fill("400");
  await expect(
    page.getByText("De fondos: 1.000,00 UYU · Del disponible: 200,00 UYU"),
  ).toBeVisible();
  await page
    .getByRole("group", { name: "Fuentes del gasto" })
    .screenshot({ path: testInfo.outputPath("fuentes-del-gasto.png") });
  const expenseId = await record("movements", "Guardar movimiento");
  await expect(page.getByRole("list", { name: "Gastos del mes" })).toHaveText(
    "1.200,00 UYU",
  );
  await page.goto(`/historial/movimientos/${expenseId}`);
  const linked = page.getByRole("region", { name: "Fondos vinculados" });
  await expect(linked).toContainText("Viajes F3-05 · 600,00 UYU");
  await expect(linked).toContainText("Emergencias F3-05 · 400,00 UYU");

  await page.goto("/tarjetas");
  await page
    .getByRole("button", { name: "Registrar compra", exact: true })
    .click();
  await page.getByLabel("Importe", { exact: true }).fill("500");
  await page.getByLabel("Concepto", { exact: true }).fill("Pasaje F3-05");
  await page.getByRole("button", { name: "Comprometer un fondo" }).click();
  await page
    .getByRole("combobox", { name: "Fondo 1", exact: true })
    .selectOption(travel);
  await page.getByLabel("Importe del fondo 1").fill("500");
  await record("cards/operations", "Registrar compra");
  await page.goto("/fondos");
  await expect(
    page.getByText("Comprometido con tarjeta", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Reserva sin comprometer", { exact: true }),
  ).toBeVisible();

  await page.goto("/tarjetas");
  await page
    .getByRole("button", { name: "Registrar pago", exact: true })
    .click();
  await page.getByLabel("Deuda cancelada en UYU").fill("200");
  await page.getByLabel(/^Pasaje F3-05 ·/).fill("200");
  await page.getByLabel(/^Usar Viajes F3-05 para Pasaje F3-05/).fill("200");
  await expect(
    page.getByText("De fondos: 200,00 UYU · Del disponible: 0,00 UYU"),
  ).toBeVisible();
  await page
    .getByRole("group", { name: "Deuda en UYU" })
    .screenshot({ path: testInfo.outputPath("pago-parcial.png") });
  const paymentId = await record("cards/operations", "Registrar pago");
  await page.goto(`/historial/movimientos/${paymentId}`);
  await expect(linked).toContainText(
    "Aplicado al pago: Viajes F3-05 · 200,00 UYU",
  );
  await expect(
    linked.getByRole("link", { name: "Pasaje F3-05" }),
  ).toBeVisible();
  await page.goto("/resumen");
  await expect(page.getByRole("list", { name: "Gastos del mes" })).toHaveText(
    "1.700,00 UYU",
  );
  expect(
    await page.evaluate(
      () =>
        globalThis.document.documentElement.scrollWidth <=
        globalThis.innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);

  const stranger = await browser.newContext({ baseURL: financeTestOrigin });
  try {
    await stranger.addCookies([cookies.b]);
    expect(
      (
        await stranger.request.get(`/historial/movimientos/${paymentId}`)
      ).status(),
    ).toBe(404);
    expect(
      (
        await stranger.request.post("/api/cards/operations", {
          data: {
            action: "payment",
            cardId,
            effectiveOn: today,
            idempotencyKey: randomUUID(),
            lines: [
              {
                currency: "UYU",
                bankCurrency: "UYU",
                amount: "1",
                bankAmount: "1",
              },
            ],
          },
          headers: { origin: financeTestOrigin },
        })
      ).status(),
    ).toBe(404);
  } finally {
    await stranger.close();
  }
});
