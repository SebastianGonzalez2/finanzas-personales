import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { bankReferenceToday } from "../../src/domain/bank-balances.ts";
import {
  financeBrowserFixtures,
  financeTestOrigin,
} from "../support/finance-browser.mjs";

test.use({ locale: "es-UY" });

test("F2-04: resumen oficial y pago desde un aviso en escritorio y móvil", async ({
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
  const post = (actor, path, data) =>
    actor.request.post(`/api/${path}`, {
      headers: { origin: financeTestOrigin },
      data,
    });
  const today = bankReferenceToday();
  const period = today.slice(0, 7);
  const snapshot = async (name) => {
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
    const card = await post(context, "cards", {
      action: "create",
      kind: "credit",
      name: "Visa F2-04",
      currencies: [{ currency: "UYU" }, { currency: "USD" }],
      idempotencyKey: randomUUID(),
    });
    expect(card.status()).toBe(201);
    const { id: cardId } = await card.json();
    expect(
      (
        await post(context, "cards/operations", {
          action: "purchase",
          cardId,
          currency: "UYU",
          concept: "Compra de prueba F2-04",
          effectiveOn: today,
          amount: "4000",
          covered: false,
          idempotencyKey: randomUUID(),
        })
      ).status(),
    ).toBe(201);

    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto("/tarjetas");
    await page.getByRole("link", { name: "Resúmenes y ciclos" }).click();
    await expect(
      page.getByRole("heading", { name: "Resumen de Visa F2-04" }),
    ).toBeVisible();
    await page
      .getByText("Calendario habitual de la tarjeta", { exact: true })
      .click();
    await page.getByLabel("Día habitual de cierre").fill(today.slice(-2));
    await page.getByLabel("Día habitual de vencimiento").fill(today.slice(-2));
    await page
      .getByRole("button", { name: "Guardar calendario habitual" })
      .click();
    await expect(page.getByText("Cambios guardados.")).toBeVisible();
    const official = page
      .getByText("Editar resumen oficial", { exact: true })
      .first();
    await official.click();
    await page.getByLabel("Total oficial en UYU").fill("5500");
    await page.getByLabel("Mínimo oficial en UYU").fill("1000");
    await page.getByLabel("Vencimiento oficial en UYU").fill(today);
    await page.getByRole("button", { name: "Guardar resumen UYU" }).click();
    await expect(
      page.getByText(/Diferencia pendiente de revisión · \+1\.500,00 UYU/),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Revisar mis compras" })
      .first()
      .click();
    await expect(
      page.getByRole("link", { name: "Compra de prueba F2-04" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Revisar más tarde" }).click();
    await expect(
      page.getByText("La diferencia en UYU queda pendiente de revisión."),
    ).toBeVisible();
    await snapshot("resumen-escritorio.png");

    const route = `/tarjetas/${cardId}/resumen?ciclo=${period}`;
    expect((await other.request.get(route)).status()).toBe(404);
    const forged = {
      scope: "statement",
      version: 1,
      cardId,
      period,
      currency: "UYU",
      officialAmount: "0",
      minimumAmount: "",
      dueOn: "",
      idempotencyKey: randomUUID(),
    };
    expect((await post(other, "cards/cycles", forged)).status()).toBe(404);
    expect(
      (
        await context.request.post("/api/cards/cycles", {
          headers: { origin: "https://external.invalid" },
          data: forged,
        })
      ).status(),
    ).toBe(403);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/tarjetas");
    const notices = page.getByRole("region", { name: "Avisos de tarjetas" });
    await expect(notices.getByRole("listitem")).toHaveCount(1);
    await expect(notices).toContainText("5.500,00 UYU");
    await notices.getByRole("link", { name: "Registrar pago" }).click();
    await expect(
      page.getByRole("heading", { name: "Registrar pago · Visa F2-04" }),
    ).toBeFocused();
    await expect(page.getByLabel("Deuda cancelada en UYU")).toHaveValue(
      "5500,0000",
    );
    await expect(
      page.getByLabel("Saldo bancario para deuda en UYU"),
    ).toHaveValue("");
    await page.getByLabel("Deuda cancelada en UYU").fill("1000");
    await page
      .getByLabel("Saldo bancario para deuda en UYU")
      .selectOption("UYU");
    await snapshot("pago-movil.png");
    await page
      .getByRole("form", { name: "Registrar pago · Visa F2-04" })
      .getByRole("button", { name: "Registrar pago", exact: true })
      .click();
    await expect(page.getByText("Pago de tarjeta registrado.")).toBeVisible();
    await expect(page.getByText("4.500,00 UYU", { exact: true })).toBeVisible();
    await page.goto("/tarjetas");
    await expect(notices.getByRole("listitem")).toHaveCount(1);
    await expect(notices).toContainText(
      "Mínimo cubierto según tus pagos registrados · 4.500,00 UYU",
    );
    await page.goto("/resumen");
    await expect(
      page.getByRole("list", { name: "Saldos bancarios por moneda" }),
    ).toContainText("9.000,00 UYU");
    await expect(page.getByRole("list", { name: "Gastos del mes" })).toHaveText(
      "4.000,00 UYU",
    );
    expect(errors).toEqual([]);
  } finally {
    await other.close();
  }
});
