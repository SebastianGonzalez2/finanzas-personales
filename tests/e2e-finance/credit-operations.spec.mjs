import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { bankReferenceToday } from "../../src/domain/bank-balances.ts";
import {
  financeBrowserFixtures,
  financeTestOrigin,
} from "../support/finance-browser.mjs";

test("F2-02 CA-020/021: compra y pago parcial y total de crédito sin duplicar gasto", async ({
  page,
  context,
  browser,
}, testInfo) => {
  const { cookies } = await financeBrowserFixtures();
  await context.addCookies([cookies.a1]);
  const other = await browser.newContext({ baseURL: financeTestOrigin });
  await other.addCookies([cookies.b]);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const command = (actor, path, data) =>
    actor.request.post(`/api/${path}`, {
      data,
      headers: { origin: financeTestOrigin },
    });
  const open = (label) =>
    page
      .getByRole("button", { name: label, exact: true })
      .and(page.locator("button:enabled"))
      .click();
  const money = (label) => page.getByRole("list", { name: label, exact: true });
  const balance = (value) =>
    expect(page.getByText(value, { exact: true }).first()).toBeVisible();

  try {
    const today = bankReferenceToday();
    expect(
      (
        await command(context, "bank-balances", {
          currency: "UYU",
          amount: "10000",
          asOfDate: today,
        })
      ).status(),
    ).toBe(201);

    await page.goto("/tarjetas");
    await open("Agregar tarjeta");
    await page.getByLabel("Nombre", { exact: true }).fill("Visa F2-02");
    await page.getByLabel("Tipo de tarjeta").selectOption("credit");
    await page.getByRole("checkbox", { name: "UYU", exact: true }).check();
    await page.getByRole("checkbox", { name: "USD", exact: true }).check();
    await page.getByLabel("Deuda inicial USD").fill("100");
    const created = page.waitForResponse((response) =>
      response.url().endsWith("/api/cards"),
    );
    await open("Guardar tarjeta");
    const response = await created;
    expect(response.status()).toBe(201);
    const { id: cardId } = await response.json();
    await balance("100,00 USD");

    await page.goto("/resumen");
    await balance("10.000,00 UYU");
    await expect(money("Gastos del mes")).toHaveCount(0);
    await open("+ Nueva transacción");
    await open("Compra con tarjeta de crédito");
    await expect(page.getByLabel(/Saldo a favor aplicado/)).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: "Registrar compra · Visa F2-02" }),
    ).toBeFocused();
    await page.getByLabel("Importe", { exact: true }).fill("3000");
    await page
      .getByLabel("Concepto", { exact: true })
      .fill("Compra sintética F2-02");
    const category = page.getByLabel("Categoría (opcional)");
    await category.selectOption("__create__");
    await page
      .getByLabel("Nombre de la categoría nueva")
      .fill("Compras de prueba");
    await open("Crear categoría");
    await expect(category.locator("option:checked")).toHaveText(
      "Compras de prueba",
    );
    await expect(page.getByLabel("Importe", { exact: true })).toHaveValue(
      "3000",
    );
    await expect(money("Gastos del mes")).toHaveCount(0);
    await open("Registrar compra");
    await expect(money("Gastos del mes")).toHaveText("3.000,00 UYU");
    await balance("10.000,00 UYU");

    await page.goto("/tarjetas");
    await balance("3.000,00 UYU");
    const payment = {
      action: "payment",
      cardId,
      effectiveOn: today,
      idempotencyKey: randomUUID(),
      lines: [
        {
          currency: "UYU",
          amount: "1000",
          bankCurrency: "UYU",
          bankAmount: "1000",
        },
        {
          currency: "USD",
          amount: "40",
          bankCurrency: "UYU",
          bankAmount: "9999",
        },
      ],
    };
    expect((await command(other, "cards/operations", payment)).status()).toBe(
      404,
    );
    expect((await command(context, "cards/operations", payment)).status()).toBe(
      409,
    );
    await page.reload();
    await balance("3.000,00 UYU");
    await balance("100,00 USD");

    await open("Registrar pago");
    await page.getByRole("checkbox", { name: /Abonar deuda en UYU/ }).check();
    await page.getByRole("checkbox", { name: /Abonar deuda en USD/ }).check();
    await page.getByLabel("Deuda cancelada en UYU").fill("1000");
    await page.getByLabel("Deuda cancelada en USD").fill("40");
    await page
      .getByLabel("Importe debitado en UYU para deuda en USD")
      .fill("1680");
    await page
      .getByLabel("Comisión bancaria en UYU para deuda en USD (opcional)")
      .fill("20");
    await page.getByText("Asignar a compras en UYU (opcional)").click();
    await page.getByLabel(/Compra sintética F2-02 ·/).fill("1000");
    expect(
      await page.evaluate(
        () =>
          globalThis.document.documentElement.scrollWidth <=
          globalThis.innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath("pago-parcial.png"),
      fullPage: true,
    });
    const recorded = page.waitForResponse((response) =>
      response.url().endsWith("/api/cards/operations"),
    );
    await open("Registrar pago");
    const result = await recorded;
    expect(result.status()).toBe(201);
    const { id: paymentId } = await result.json();
    await balance("2.000,00 UYU");
    await balance("60,00 USD");
    await page.goto("/resumen");
    await balance("7.300,00 UYU");
    await expect(money("Gastos del mes")).toHaveText("3.020,00 UYU");

    await page.goto(`/historial/movimientos/${paymentId}`);
    await expect(
      page.getByText(/Pago parcial según los registros/),
    ).toHaveCount(2);
    const purchaseLink = page.getByRole("link", {
      name: "Compra sintética F2-02",
    });
    await expect(purchaseLink).toBeVisible();
    const purchaseId = (await purchaseLink.getAttribute("href"))
      .split("/")
      .at(-1);
    expect(
      (
        await command(context, "cards/operations", {
          action: "void",
          eventId: purchaseId,
          idempotencyKey: randomUUID(),
        })
      ).status(),
    ).toBe(409);
    await expect(
      page.getByText(/Tasa efectiva aproximada · 42 UYU por USD/),
    ).toBeVisible();
    const foreignPage = await other.newPage();
    expect(
      (await foreignPage.goto(`/historial/movimientos/${paymentId}`)).status(),
    ).toBe(404);

    const complete = {
      ...payment,
      idempotencyKey: randomUUID(),
      lines: [
        {
          currency: "UYU",
          amount: "2000",
          bankCurrency: "UYU",
          bankAmount: "2000",
        },
        {
          currency: "USD",
          amount: "60",
          bankCurrency: "UYU",
          bankAmount: "2520",
        },
      ],
    };
    const replays = await Promise.all([
      command(context, "cards/operations", complete),
      command(context, "cards/operations", complete),
    ]);
    expect(replays.map((response) => response.status()).sort()).toEqual([
      200, 201,
    ]);
    const { id: completeId } = await replays[0].json();
    expect(completeId).toBe((await replays[1].json()).id);
    expect(
      (
        await command(context, "cards/operations", {
          ...complete,
          lines: [complete.lines[0]],
        })
      ).status(),
    ).toBe(409);
    await page.goto("/tarjetas");
    await balance("0,00 UYU");
    await balance("0,00 USD");
    await page.goto("/resumen");
    await balance("2.780,00 UYU");
    await expect(money("Gastos del mes")).toHaveText("3.020,00 UYU");

    await page.goto("/historial?kind=card_payment&currency=USD");
    await expect(
      page.getByRole("link", { name: /Pago de tarjeta · Visa F2-02/ }),
    ).toHaveCount(2);
    await page.goto(`/historial/movimientos/${completeId}`);
    await open("Anular pago");
    await open("Confirmar anulación");
    await expect(page.getByText("Pago de tarjeta · Anulado")).toBeVisible();
    await page.goto("/tarjetas");
    await balance("2.000,00 UYU");
    await balance("60,00 USD");
    await page.goto("/resumen");
    await balance("7.300,00 UYU");
    await expect(money("Gastos del mes")).toHaveText("3.020,00 UYU");

    await page.goto("/tarjetas");
    await open("Actualizar deuda");
    await page.getByLabel("Total confirmado").fill("1800.0001");
    await open("Actualizar deuda");
    await balance("1.800,0001 UYU");
    await open("Registrar compra");
    await page.getByLabel("Importe", { exact: true }).fill("50");
    await page
      .getByLabel("Concepto", { exact: true })
      .fill("Cargo ya incluido F2-02");
    await page
      .getByLabel(
        "La compra ya está incluida en la deuda confirmada de la tarjeta",
      )
      .check();
    await open("Registrar compra");
    await expect(
      page.getByText("Compra con tarjeta registrada."),
    ).toBeVisible();
    await balance("1.800,0001 UYU");
    await page.goto("/resumen");
    await balance("7.300,00 UYU");
    await expect(money("Gastos del mes")).toHaveText("3.070,00 UYU");
    expect(errors).toEqual([]);
  } finally {
    await other.close();
  }
});
