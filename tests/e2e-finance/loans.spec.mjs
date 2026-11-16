import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { bankReferenceToday } from "../../src/domain/bank-balances.ts";
import {
  financeBrowserFixtures,
  financeTestOrigin,
} from "../support/finance-browser.mjs";

// UI-05F: «Nueva obligación» es un disclosure; se abre solo si está cerrado.
async function openCreator(page) {
  const creator = page.locator("details.gs-creator");
  if (!(await creator.evaluate((node) => node.open)))
    await creator.locator("summary").click();
}

test("F2-07: pago multimoneda con los dos importes en Historial", async ({
  page,
  context,
}) => {
  const { cookies } = await financeBrowserFixtures();
  await context.addCookies([cookies.a1]);
  const today = bankReferenceToday();
  const post = (path, data) =>
    context.request.post(`/api/${path}`, {
      data,
      headers: { origin: financeTestOrigin },
    });
  for (const [currency, amount] of [
    ["UYU", "6000"],
    ["USD", "200"],
  ])
    expect(
      (
        await post("bank-balances", { currency, amount, asOfDate: today })
      ).status(),
    ).toBe(201);
  const opening = await post("loans", {
    action: "existing",
    direction: "payable",
    currency: "USD",
    installmentLoan: false,
    concept: "Préstamo sintético F2-07",
    amount: "100",
    effectiveOn: today,
    idempotencyKey: randomUUID(),
  });
  expect(opening.status()).toBe(201);
  const { id } = await opening.json();
  await page.goto(`/deudas/${id}`);
  const currency = page.getByLabel("Moneda bancaria");
  await expect(currency).toHaveValue("USD");
  await currency.selectOption("UYU");
  await page.getByLabel("Importe pagado en Bancos (UYU)").fill("4000");
  await page
    .getByLabel("Importe acordado que reduce el pendiente (USD)")
    .fill("100");
  expect(
    await page.evaluate(
      () =>
        globalThis.document.documentElement.scrollWidth <=
        globalThis.innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Confirmar pago" }).click();
  await expect(page.getByText("Saldada", { exact: true })).toBeVisible();
  const history = page.getByRole("link", { name: "Ver registro en Historial" });
  await expect(history).toHaveCount(2);
  await history.first().click();
  await expect(page.getByText(/Bancos −4\.000,00 UYU/)).toBeVisible();
  await expect(page.getByText(/100,00 USD.*40 UYU por USD/)).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Ver obligación e historial" }),
  ).toHaveAttribute("href", `/deudas/${id}`);
});

test("F2-06: alta, pago sin desglose, ajuste e historial privado", async ({
  page,
  context,
  browser,
}, testInfo) => {
  const { cookies } = await financeBrowserFixtures();
  await context.addCookies([cookies.a1]);
  const other = await browser.newContext({ baseURL: financeTestOrigin });
  await other.addCookies([cookies.b]);
  const today = bankReferenceToday();
  const post = (actor, path, data, origin = financeTestOrigin) =>
    actor.request.post(`/api/${path}`, { data, headers: { origin } });
  try {
    expect(
      (
        await post(context, "bank-balances", {
          currency: "UYU",
          amount: "2000",
          asOfDate: today,
        })
      ).status(),
    ).toBe(201);
    await page.goto("/deudas");
    await openCreator(page);
    await page
      .getByRole("combobox", { name: "Operación" })
      .selectOption("borrow");
    await page
      .getByLabel("Persona, entidad o descripción")
      .fill("Préstamo sintético F2-06");
    await page.getByLabel("Capital", { exact: true }).fill("5000");
    await page.getByLabel("Préstamo con cuotas").check();
    await page.getByLabel("Cuota habitual (opcional)").fill("350");
    await page
      .getByRole("combobox", { name: "Frecuencia (opcional)" })
      .selectOption("monthly");
    await page.getByRole("button", { name: "Registrar obligación" }).click();
    const link = page.getByRole("link", { name: /Préstamo sintético F2-06/ });
    await expect(link).toContainText("5.000,00 UYU");
    const path = await link.getAttribute("href");
    await link.click();
    await page.getByLabel("Importe pagado").fill("350");
    await page.getByRole("button", { name: "Confirmar pago" }).click();
    await expect(
      page.getByText("Pendiente de conciliación", { exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () =>
          globalThis.document.documentElement.scrollWidth <=
          globalThis.innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath("pago-pendiente.png"),
      fullPage: true,
    });
    await page.getByRole("combobox", { name: "Acción" }).selectOption("adjust");
    await page.getByLabel("Nuevo pendiente total").fill("4700");
    await page.getByRole("button", { name: "Guardar pendiente" }).click();
    await expect(page.getByText("4.700,00 UYU", { exact: true })).toBeVisible();
    const history = page.getByRole("link", {
      name: "Ver registro en Historial",
    });
    await expect(history).toHaveCount(3);
    await history.first().click();
    await expect(
      page.getByText("Actualización del pendiente", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Ver obligación e historial" }),
    ).toHaveAttribute("href", path);
    await page.goto("/resumen");
    await expect(
      page.getByRole("list", { name: "Saldos bancarios por moneda" }),
    ).toContainText("6.650,00 UYU");
    await expect(
      page.getByRole("list", { name: "Gastos del mes" }),
    ).toHaveCount(0);

    const foreign = await other.newPage();
    expect((await foreign.goto(path)).status()).toBe(404);
    const data = {
      action: "adjust",
      loanId: path.split("/").at(-1),
      expectedVersion: 3,
      effectiveOn: today,
      amount: "0",
      idempotencyKey: randomUUID(),
    };
    expect((await post(other, "loans", data)).status()).toBe(404);
    expect(
      (await post(context, "loans", data, "https://example.invalid")).status(),
    ).toBe(403);
  } finally {
    await other.close();
  }
});
