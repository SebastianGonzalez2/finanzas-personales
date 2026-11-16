import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { chooseMonth } from "../support/month-field.mjs";
import { bankReferenceToday } from "../../src/domain/bank-balances.ts";
import { installmentPeriodAt } from "../../src/domain/installments.ts";
import {
  financeBrowserFixtures,
  financeTestOrigin,
} from "../support/finance-browser.mjs";

test.use({ locale: "es-UY" });

test("F2-03: plan de cuotas, reporte mensual y corrección auditada", async ({
  page,
  context,
  browser,
}, testInfo) => {
  const { cookies } = await financeBrowserFixtures();
  await context.addCookies([cookies.a1]);
  const other = await browser.newContext({ baseURL: financeTestOrigin });
  await other.addCookies([cookies.b]);
  const errors = [];
  page.on("pageerror", (error) =>
    errors.push(`${page.url()}: ${error.message}`),
  );
  const today = bankReferenceToday();
  const month = today.slice(0, 7);
  const periods = Array.from({ length: 4 }, (_, index) =>
    installmentPeriodAt(month, index),
  );
  const concept = "Compra sintética F2-03";
  const post = (actor, path, data) =>
    actor.request.post(`/api/${path}`, {
      data,
      headers: { origin: financeTestOrigin },
    });
  const button = (name) =>
    page
      .getByRole("button", { name, exact: true })
      .and(page.locator("button:enabled"));
  const expenses = page.getByRole("list", {
    name: "Gastos del mes",
    exact: true,
  });
  const report = page.getByRole("list", {
    name: "Cuotas del mes",
    exact: true,
  });
  const bank = page.getByRole("list", {
    name: "Saldos bancarios por moneda",
    exact: true,
  });
  const screenshot = async (name) => {
    expect(
      await page.evaluate(
        () =>
          globalThis.document.documentElement.scrollWidth <=
          globalThis.innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(name), fullPage: true });
  };

  try {
    expect(
      (
        await post(context, "bank-balances", {
          currency: "UYU",
          amount: "10000",
          asOfDate: today,
        })
      ).status(),
    ).toBe(201);
    await page.goto("/tarjetas");
    await button("Agregar tarjeta").click();
    await page.getByLabel("Nombre", { exact: true }).fill("Visa F2-03");
    await page.getByLabel("Tipo de tarjeta").selectOption("credit");
    await page.getByRole("checkbox", { name: "UYU", exact: true }).check();
    await button("Guardar tarjeta").click();
    await expect(page.getByText("Tarjeta guardada.")).toBeVisible();

    await page.goto("/resumen");
    await page
      .getByRole("banner")
      .getByRole("link", { name: "Registrar movimiento" })
      .click();
    await button("Compra con tarjeta de crédito").click();
    await page
      .getByRole("checkbox", { name: "Compra en cuotas iguales" })
      .check();
    await page.getByLabel("Importe de cada cuota").fill("2000");
    await page.getByLabel("Cantidad de cuotas").fill("3");
    await chooseMonth(page, "Mes de la primera cuota", month);
    await page
      .getByLabel("Cargo confirmado por el emisor (opcional)")
      .fill("2000");
    await page.getByLabel("Concepto", { exact: true }).fill(concept);
    await expect(
      page.getByText("Total financiado · 6.000,00 UYU"),
    ).toBeVisible();
    await screenshot("compra-en-cuotas.png");
    const created = page.waitForResponse((response) =>
      response.url().endsWith("/api/cards/operations"),
    );
    await button("Registrar compra").click();
    const response = await created;
    expect(response.status()).toBe(201);
    const { id } = await response.json();
    await expect(expenses).toHaveText("2.000,00 UYU");
    await expect(report).toContainText("Cuota 1 · Sin categorizar");
    await expect(bank).toContainText("10.000,00 UYU");

    await page
      .getByRole("group", { name: "Mes del reporte" })
      .locator("summary")
      .click();
    await chooseMonth(page, "Elegir mes", periods[1]);
    await button("Ver mes").click();
    await expect(report).toContainText("Cuota 2");
    await expect(expenses).toHaveText("2.000,00 UYU");
    await expect(bank).toContainText("10.000,00 UYU");
    await screenshot("reporte-mensual.png");
    await page.goto(`/resumen?month=${periods[2]}`);
    await expect(report).toContainText("Cuota 3");
    await expect(expenses).toHaveText("2.000,00 UYU");

    const detail = `/historial/movimientos/${id}`;
    const foreignPage = await other.newPage();
    expect((await foreignPage.goto(detail)).status()).toBe(404);
    expect(
      (
        await post(other, "cards/operations", {
          action: "cancel-installments",
          eventId: id,
          expectedVersion: 1,
          fromPeriod: periods[2],
          idempotencyKey: randomUUID(),
        })
      ).status(),
    ).toBe(404);
    await foreignPage.goto(`/resumen?month=${periods[1]}`);
    await expect(foreignPage.getByText(concept, { exact: true })).toHaveCount(
      0,
    );

    await page.goto("/tarjetas");
    await expect(page.getByText("2.000,00 UYU", { exact: true })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Compras en cuotas (1)" }),
    ).toBeVisible();
    await expect(
      page.getByText(/2 futuras · Compromiso futuro 4.000,00 UYU/),
    ).toBeVisible();
    await page.getByRole("link", { name: concept, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${detail}$`));
    await expect(
      page.getByText("Cargo confirmado por el emisor · 2.000,00 UYU"),
    ).toBeVisible();
    await button("Corregir plan").click();
    await chooseMonth(page, "Mes de la primera cuota", periods[1]);
    await page.getByLabel("Importe de cada cuota").fill("1900.0001");
    await button("Guardar corrección").click();
    await expect(page.getByText("Historial del plan (2)")).toBeVisible();
    await button("Registrar cancelación de cuotas").click();
    await page
      .getByLabel("Primera cuota cancelada por el emisor")
      .selectOption(periods[2]);
    await button("Confirmar cancelación de cuotas").click();
    await expect(page.getByText("Historial del plan (3)")).toBeVisible();
    await expect(
      page
        .getByRole("list", { name: "Calendario de cuotas" })
        .getByText(/Cancelada por el emisor/),
    ).toHaveCount(2);
    await page.getByText("Historial del plan (3)").click();
    await expect(
      page
        .getByRole("list", { name: "Versiones del plan" })
        .getByRole("listitem"),
    ).toHaveCount(3);
    await screenshot("detalle-auditado.png");

    await page.goto(`/resumen?month=${periods[1]}`);
    await expect(expenses).toHaveText("1.900,00 UYU");
    await page.goto(`/resumen?month=${periods[2]}`);
    await expect(report).toHaveCount(0);
    await expect(expenses).toHaveCount(0);
    await expect(bank).toContainText("10.000,00 UYU");
    await page.goto("/resumen");
    await expect(expenses).toHaveCount(0);
    await page.goto("/tarjetas");
    await expect(page.getByText("2.000,00 UYU", { exact: true })).toBeVisible();
    expect(errors).toEqual([]);
  } finally {
    await other.close();
  }
});
