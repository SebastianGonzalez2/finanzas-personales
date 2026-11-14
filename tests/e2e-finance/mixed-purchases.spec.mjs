import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { bankReferenceToday } from "../../src/domain/bank-balances.ts";
import { installmentPeriodAt } from "../../src/domain/installments.ts";
import {
  financeBrowserFixtures,
  financeTestOrigin,
} from "../support/finance-browser.mjs";

test("F2-05: una compra con débito, crédito financiado y categorías", async ({
  page,
  context,
}) => {
  const { cookies } = await financeBrowserFixtures();
  await context.addCookies([cookies.a1]);
  const today = bankReferenceToday();
  const month = today.slice(0, 7);
  const firstPeriod = installmentPeriodAt(month, 1);
  const post = (path, data) =>
    context.request.post(`/api/${path}`, {
      data,
      headers: { origin: financeTestOrigin },
    });
  const button = (name) => page.getByRole("button", { name, exact: true });
  const totals = page.getByRole("list", {
    name: "Gastos del mes",
    exact: true,
  });
  const bank = page.getByRole("list", {
    name: "Saldos bancarios por moneda",
    exact: true,
  });
  const concept = "Compra con dos medios F2-05";
  const operations = (response) =>
    response.url().endsWith("/api/cards/operations");

  expect(
    (
      await post("bank-balances", {
        currency: "UYU",
        amount: "10000",
        asOfDate: today,
      })
    ).status(),
  ).toBe(201);
  for (const kind of ["debit", "credit"])
    expect(
      (
        await post("cards", {
          action: "create",
          kind,
          name: `Tarjeta ${kind}`,
          currencies: [{ currency: "UYU", limit: null }],
          idempotencyKey: randomUUID(),
        })
      ).status(),
    ).toBe(201);

  await page.goto("/resumen");
  await page
    .getByRole("banner")
    .getByRole("link", { name: "Registrar movimiento" })
    .click();
  await button("Compra con tarjeta de crédito").click();
  await page.getByLabel("Pagué una parte con débito").check();
  await page.getByLabel("Total de la compra").fill("12000");
  await page.getByLabel("Débito de Bancos UYU").fill("6000");
  await page
    .getByLabel("Tarjeta de débito (opcional)")
    .selectOption({ label: "Tarjeta debit" });
  await page.getByLabel("Porción de crédito en cuotas iguales").check();
  await page.getByLabel("Importe de cada cuota").fill("2000");
  await page.getByText("Importe y moneda originales (opcional)").click();
  await page.getByLabel("Importe original de la compra").fill("50");
  await page.getByLabel("Moneda original").selectOption("EUR");
  await page.getByLabel("Cantidad de cuotas").fill("3");
  await page.getByLabel("Mes de la primera cuota").fill(firstPeriod);
  await page
    .getByLabel("Cargo confirmado por el emisor (opcional)")
    .fill("6000");
  await page.getByLabel("Concepto", { exact: true }).fill(concept);
  await page.getByLabel("Dividir entre categorías").check();
  const debit = page.getByRole("group", { name: "Porción 1", exact: true });
  const credit = page.getByRole("group", { name: "Porción 2", exact: true });
  await debit
    .getByLabel("Categoría de la porción")
    .selectOption({ label: "Alimentación" });
  await debit.getByLabel("Importe de la porción").fill("6000");
  await credit.getByLabel("Importe de la porción").fill("6000");
  expect(
    await page.evaluate(
      () =>
        globalThis.document.documentElement.scrollWidth <=
        globalThis.innerWidth,
    ),
  ).toBe(true);

  const created = page.waitForResponse(operations);
  await button("Registrar compra").click();
  const response = await created;
  expect(response.status()).toBe(201);
  const { id } = await response.json();
  await expect(totals).toHaveText("6.000,00 UYU");
  await expect(bank).toContainText("4.000,00 UYU");
  const retry = await post(
    "cards/operations",
    response.request().postDataJSON(),
  );
  expect(retry.status()).toBe(200);
  expect(await retry.json()).toEqual({ id });

  await page.goto(`/resumen?month=${firstPeriod}`);
  await expect(totals).toHaveText("2.000,00 UYU");
  await expect(
    page.getByRole("list", { name: "Cuotas del mes" }),
  ).toContainText("Cuota 1");
  await page.goto("/historial");
  const purchase = page.getByRole("link", { name: new RegExp(`^${concept}`) });
  await expect(purchase).toHaveCount(1);
  await purchase.click();
  await expect(page.getByText("12.000,00 UYU", { exact: true })).toBeVisible();
  await expect(
    page.getByText(/Débito de Bancos · Tarjeta debit · 6.000,00 UYU/),
  ).toBeVisible();
  await expect(
    page.getByRole("list", { name: "Reparto por categorías" }),
  ).toContainText("Débito · Alimentación · 6.000,00 UYU");

  await button("Corregir compra con dos medios").click();
  await expect(page.getByLabel("Total de la compra")).toHaveValue("12000,0000");
  await expect(page.getByLabel("Importe original de la compra")).toHaveValue(
    "50,0000",
  );
  await expect(page.getByLabel("Moneda original")).toHaveValue("EUR");
  await page.getByLabel("Importe original de la compra").fill("51");
  await page
    .getByLabel("Concepto", { exact: true })
    .fill(`${concept} corregida`);
  const corrected = page.waitForResponse(operations);
  await button("Corregir compra con dos medios").click();
  expect((await corrected).status()).toBe(201);
  await page.getByRole("link", { name: "Ver reemplazo" }).click();
  await expect(
    page.getByRole("heading", { name: `${concept} corregida` }),
  ).toBeVisible();
  await expect(
    page.getByText("Importe original de la compra (referencia) · 51,00 EUR"),
  ).toBeVisible();
});
