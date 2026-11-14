import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { bankReferenceToday } from "../../src/domain/bank-balances.ts";
import {
  financeBrowserFixtures,
  financeTestOrigin,
} from "../support/finance-browser.mjs";

test("F5-03: autocompletar, unificar y consultar las compras de un comercio", async ({
  page,
  context,
  browser,
}) => {
  const { cookies } = await financeBrowserFixtures();
  await context.addCookies([cookies.a1]);
  const other = await browser.newContext({ baseURL: financeTestOrigin });
  await other.addCookies([cookies.b]);
  const effectiveOn = bankReferenceToday();
  const post = (path, data) =>
    context.request.post(`/api/${path}`, {
      data,
      headers: { origin: financeTestOrigin },
    });
  try {
    expect(
      (
        await post("bank-balances", {
          currency: "UYU",
          amount: "100",
          asOfDate: effectiveOn,
        })
      ).status(),
    ).toBe(201);
    const spend = (merchantName, concept, amount) =>
      post("movements", {
        kind: "expense",
        method: "debit",
        currency: "UYU",
        effectiveOn,
        merchantName,
        concept,
        amount,
        idempotencyKey: randomUUID(),
      });
    const first = await spend("Tda. Ing.", "Compra de prueba A", "10.0001");
    expect(first.status()).toBe(201);
    expect(
      (await spend("Tienda Inglesa", "Compra de prueba B", "20.0002")).status(),
    ).toBe(201);
    const { id } = await first.json();

    await page.goto("/catalogo");
    await page
      .getByLabel("Comercio duplicado")
      .selectOption({ label: "Tda. Ing." });
    await page
      .getByLabel("Comercio que se conserva")
      .selectOption({ label: "Tienda Inglesa" });
    await page.getByRole("button", { name: "Ver vista previa" }).click();
    await expect(
      page.getByText(/quedará asociado a 2 movimientos/),
    ).toBeVisible();
    await page.getByRole("button", { name: "Confirmar unificación" }).click();
    await expect(
      page.getByText("Comercios unificados en Tienda Inglesa."),
    ).toBeVisible();
    await expect(page.getByText("30,00 UYU", { exact: true })).toBeVisible();
    await page.getByRole("link", { name: "Tienda Inglesa" }).click();
    await expect(page.getByText("Compra de prueba A")).toBeVisible();
    await expect(page.getByText("Compra de prueba B")).toBeVisible();
    await page.getByText("Compra de prueba A").click();
    await expect(
      page.getByRole("link", { name: "Tienda Inglesa" }),
    ).toBeVisible();
    expect(
      (await other.request.get(`/historial/movimientos/${id}`)).status(),
    ).toBe(404);

    await page.goto("/resumen");
    await page
      .getByRole("banner")
      .getByRole("link", { name: "Registrar movimiento" })
      .click();
    const merchant = page.getByRole("combobox", {
      name: "Comercio (opcional)",
    });
    await merchant.fill("TDA.");
    await expect(merchant).toBeFocused();
    await expect(
      page.getByRole("option", { name: "Tienda Inglesa" }),
    ).toBeVisible();
    await merchant.press("ArrowDown");
    await merchant.press("Enter");
    await expect(merchant).toHaveValue("Tienda Inglesa");
    const otherSuggestions = await other.request.get(
      "/api/catalog?kind=merchant&q=TDA.",
    );
    expect(otherSuggestions.status()).toBe(200);
    expect(await otherSuggestions.json()).toEqual({ entries: [] });
    expect(
      await page.evaluate(
        () =>
          globalThis.document.documentElement.scrollWidth <=
          globalThis.innerWidth,
      ),
    ).toBe(true);
  } finally {
    await other.close();
  }
});
