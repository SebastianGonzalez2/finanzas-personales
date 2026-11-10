import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { bankReferenceToday } from "../../src/domain/bank-balances.ts";
import {
  financeBrowserFixtures,
  financeTestOrigin,
} from "../support/finance-browser.mjs";

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
