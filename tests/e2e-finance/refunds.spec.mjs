import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { bankReferenceToday } from "../../src/domain/bank-balances.ts";
import { installmentPeriodAt } from "../../src/domain/installments.ts";
import {
  financeBrowserFixtures,
  financeTestOrigin,
} from "../support/finance-browser.mjs";

test("F2-09: registrar y consultar una devolución de otro mes desde la compra", async ({
  page,
  context,
  browser,
}) => {
  const { cookies } = await financeBrowserFixtures();
  await context.addCookies([cookies.a1]);
  const today = bankReferenceToday();
  const previous = installmentPeriodAt(today.slice(0, 7), -1);
  const post = (route, data) =>
    context.request.post(`/api/${route}`, {
      data,
      headers: { origin: financeTestOrigin },
    });
  expect(
    (
      await post("bank-balances", {
        currency: "UYU",
        amount: "10000",
        asOfDate: `${previous}-01`,
      })
    ).status(),
  ).toBe(201);
  async function expense(amount, effectiveOn) {
    const response = await post("movements", {
      kind: "expense",
      method: "debit",
      currency: "UYU",
      amount,
      effectiveOn,
      concept: "Ropa sintética F2-09",
      idempotencyKey: randomUUID(),
    });
    expect(response.status()).toBe(201);
    return (await response.json()).id;
  }
  const purchaseId = await expense("2000", `${previous}-02`);
  await expense("3000", today);
  await page.goto(`/historial/movimientos/${purchaseId}`);
  await page.getByText("Registrar devolución", { exact: true }).click();
  await page.getByLabel(/Bancos · débito · Sin categorizar/).fill("500");
  await page.getByRole("button", { name: "Revisar devolución" }).click();
  await expect(page.getByText("Bancos recibe 500,00 UYU.")).toBeVisible();
  const response = page.waitForResponse((item) =>
    item.url().endsWith("/api/refunds"),
  );
  await page
    .getByRole("button", { name: "Confirmar devolución", exact: true })
    .click();
  const saved = await response;
  expect(saved.status()).toBe(201);
  expect(saved.headers()["cache-control"]).toBe("private, no-store");
  const { id } = await saved.json();
  await expect(
    page.getByRole("list", { name: "Historial de devoluciones" }),
  ).toContainText("Devolución recibida · 500,00 UYU");
  expect(
    await page.evaluate(
      () =>
        globalThis.document.documentElement.scrollWidth <=
        globalThis.innerWidth,
    ),
  ).toBe(true);
  await page.goto("/resumen");
  await expect(page.getByRole("list", { name: "Gastos del mes" })).toHaveText(
    "3.000,00 UYU",
  );
  await expect(
    page.getByRole("list", { name: "Saldos bancarios por moneda" }),
  ).toContainText("5.500,00 UYU");
  await expect(
    page.getByRole("heading", { name: "Devoluciones recibidas en el mes" }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "Ver devoluciones en el historial" })
    .click();
  await page.getByRole("link", { name: /^Ropa sintética F2-09/ }).click();
  await expect(
    page.getByRole("link", { name: /Compra original · Ropa sintética/ }),
  ).toBeVisible();
  const other = await browser.newContext({ baseURL: financeTestOrigin });
  try {
    await other.addCookies([cookies.b]);
    const foreign = await other.request.get(`/historial/movimientos/${id}`);
    expect(foreign.status()).toBe(404);
    const spoof = await other.request.post("/api/refunds", {
      data: { ...saved.request().postDataJSON(), idempotencyKey: randomUUID() },
      headers: { origin: financeTestOrigin },
    });
    expect(spoof.status()).toBe(404);
  } finally {
    await other.close();
  }
});
