import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { bankReferenceToday } from "../../src/domain/bank-balances.ts";
import {
  financeBrowserFixtures,
  financeTestOrigin,
} from "../support/finance-browser.mjs";

test("F5-09 CA-067: registrar cashback en Bancos y tarjeta desde el formulario", async ({
  page,
  context,
  browser,
}, testInfo) => {
  const { cookies } = await financeBrowserFixtures();
  await context.addCookies([cookies.a1]);
  const today = bankReferenceToday();
  const post = (path, data) =>
    context.request.post(`/api/${path}`, {
      data,
      headers: { origin: financeTestOrigin },
    });
  expect(
    (
      await post("bank-balances", {
        currency: "UYU",
        amount: "1000",
        asOfDate: today,
      })
    ).status(),
  ).toBe(201);
  const card = await post("cards", {
    action: "create",
    kind: "credit",
    name: "Tarjeta F5-09",
    currencies: [{ currency: "UYU" }],
    idempotencyKey: randomUUID(),
  });
  expect(card.status()).toBe(201);

  await page.goto("/beneficios");
  await expect(
    page.getByRole("heading", { name: "Beneficios bancarios" }),
  ).toBeVisible();
  const form = page.getByRole("region", {
    name: "Registrar beneficio bancario",
  });
  async function register(destination, concept, amount) {
    await form.getByLabel("¿Dónde se acreditó?").selectOption(destination);
    await form.getByLabel("Importe acreditado").fill(amount);
    await form.getByLabel("Concepto (opcional)").fill(concept);
    await form
      .getByRole("checkbox", { name: "El banco ya acreditó este importe" })
      .check();
    await form.getByRole("button", { name: "Revisar", exact: true }).click();
    const confirm = form.getByRole("button", { name: "Confirmar registro" });
    await expect(confirm).toBeVisible();
    if (destination === "card") {
      await expect(
        form.getByText(/Tarjeta F5-09 recibe un abono/),
      ).toBeVisible();
      await page.screenshot({
        path: testInfo.outputPath("confirmar-abono.png"),
        fullPage: true,
      });
    }
    const response = page.waitForResponse((item) =>
      item.url().endsWith("/api/bank-benefits"),
    );
    await confirm.click();
    const saved = await response;
    expect(saved.status()).toBe(201);
    expect(saved.headers()["cache-control"]).toBe("private, no-store");
    await expect(page.getByRole("link", { name: concept })).toBeVisible();
    return (await saved.json()).id;
  }

  await register("bank", "Cashback en Bancos", "300");
  const cardBenefit = await register("card", "Cashback en tarjeta", "200");
  expect(
    await page.evaluate(
      () =>
        globalThis.document.documentElement.scrollWidth <=
        globalThis.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("beneficios-registrados.png"),
    fullPage: true,
  });

  await page.getByRole("link", { name: "Cashback en tarjeta" }).click();
  await expect(
    page.getByText(/Saldo a favor generado · 200,00 UYU/),
  ).toBeVisible();
  await page.goto("/resumen");
  await expect(
    page.getByRole("list", { name: "Saldos bancarios por moneda" }),
  ).toContainText("1.300,00 UYU");
  await expect(
    page.getByRole("list", { name: "Ingresos del mes" }),
  ).toContainText("500,00 UYU");

  const other = await browser.newContext({ baseURL: financeTestOrigin });
  try {
    await other.addCookies([cookies.b]);
    expect(
      (
        await other.request.get(`/historial/movimientos/${cardBenefit}`)
      ).status(),
    ).toBe(404);
    expect(
      (
        await other.request.post("/api/bank-benefits", {
          data: {
            action: "void",
            eventId: cardBenefit,
            idempotencyKey: randomUUID(),
          },
          headers: { origin: financeTestOrigin },
        })
      ).status(),
    ).toBe(404);
  } finally {
    await other.close();
  }
});
