import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import pg from "pg";
import {
  financeBrowserFixtures,
  financeTestOrigin,
} from "../support/finance-browser.mjs";
import { testDatabaseConfig } from "../support/test-database.mjs";

test("F2-01: catálogo multimoneda, archivo, aislamiento e integridad financiera", async ({
  page,
  context,
  browser,
  request,
}, testInfo) => {
  const { cookies, owners } = await financeBrowserFixtures();
  await context.addCookies([cookies.a1]);
  const other = await browser.newContext({
    baseURL: financeTestOrigin,
    viewport: testInfo.project.use.viewport,
  });
  await other.addCookies([cookies.b]);
  const otherPage = await other.newPage();
  const send = (actor, data, origin = financeTestOrigin) =>
    actor.request.post("/api/cards", { data, headers: { origin } });
  const admin = new pg.Client(testDatabaseConfig());
  await admin.connect();
  try {
    await page.goto("/resumen");
    const menu = page.getByRole("button", { name: "Abrir navegación" });
    if (await menu.isVisible()) await menu.click();
    await page.getByRole("link", { name: "Tarjetas" }).click();
    await expect(
      page.getByRole("heading", { name: "Tarjetas", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("Todavía no tenés tarjetas activas."),
    ).toBeVisible();
    await page.getByRole("button", { name: "Agregar tarjeta" }).click();
    await expect(
      page.getByRole("heading", { name: "Agregar tarjeta" }),
    ).toBeFocused();
    await page.getByLabel("Nombre", { exact: true }).fill("Débito sintético");
    await page.getByRole("checkbox", { name: "UYU" }).check();
    await page.getByRole("button", { name: "Guardar tarjeta" }).click();
    await expect(
      page.getByText("Vinculada a Bancos por moneda."),
    ).toBeVisible();
    await expect(page.getByText("Deuda registrada")).toHaveCount(0);

    await page.getByRole("button", { name: "Agregar tarjeta" }).click();
    await page.getByLabel("Nombre", { exact: true }).fill("Crédito sintético");
    await page.getByLabel("Emisor (opcional)").fill("Emisor de prueba");
    await page.getByLabel("Tipo de tarjeta").selectOption("credit");
    await page.getByRole("checkbox", { name: "UYU" }).check();
    await page.getByRole("checkbox", { name: "USD" }).check();
    await page.getByRole("checkbox", { name: "EUR" }).check();
    await page.getByLabel("Límite UYU (opcional)").fill("15000,1234");
    const create = page.waitForResponse((response) =>
      response.url().endsWith("/api/cards"),
    );
    await page.getByRole("button", { name: "Guardar tarjeta" }).click();
    const response = await create;
    expect(response.status()).toBe(201);
    const { id } = await response.json();
    await expect(page.getByText("15.000,12 UYU")).toBeVisible();
    await expect(page.getByText("Límite informado")).toHaveCount(1);

    // Synthetic positions simulate later financial writes solely to exercise the catalog read contract.
    await admin.query(
      `UPDATE finance.card_currencies SET debt = CASE WHEN currency = 'UYU' THEN 3000.0001 END,
      credit_balance = CASE WHEN currency = 'USD' THEN 12.3456 END WHERE owner_id = $1 AND card_id = $2`,
      [owners.a, id],
    );
    await page.reload();
    await expect(page.getByText("3.000,00 UYU")).toBeVisible();
    await expect(page.getByText("12,35 USD")).toBeVisible();
    await otherPage.goto("/tarjetas");
    await expect(otherPage.getByText("Crédito sintético")).toHaveCount(0);
    const update = {
      action: "update",
      cardId: id,
      version: 1,
      name: "Nombre actualizado",
      currencies: [{ currency: "UYU", limit: "12000" }, { currency: "USD" }],
      idempotencyKey: randomUUID(),
    };
    expect((await send(other, update)).status()).toBe(404);
    expect(
      (await send(context, update, "https://example.invalid")).status(),
    ).toBe(403);
    expect(
      (await send(context, { ...update, ownerId: owners.b })).status(),
    ).toBe(400);
    expect(
      (
        await request.post("/api/cards", {
          data: update,
          headers: { origin: financeTestOrigin },
        })
      ).status(),
    ).toBe(401);
    expect(
      (
        await send(context, { ...update, currencies: [{ currency: "UYU" }] })
      ).status(),
    ).toBe(409);
    await page.reload();
    await expect(page.getByText("Crédito sintético")).toBeVisible();
    await expect(page.getByText("12,35 USD")).toBeVisible();

    const results = await Promise.all([
      send(context, update),
      send(context, update),
    ]);
    expect(results.map((result) => result.status())).toEqual([200, 200]);
    expect(
      (await send(context, { ...update, name: "Otra edición" })).status(),
    ).toBe(409);
    expect(
      (
        await send(context, { ...update, idempotencyKey: randomUUID() })
      ).status(),
    ).toBe(409);
    await page.reload();
    await page
      .getByRole("button", { name: "Editar Nombre actualizado" })
      .click();
    await page.getByLabel("Límite UYU (opcional)").fill("");
    await page.getByRole("button", { name: "Guardar tarjeta" }).click();
    await expect(page.getByText("Límite informado")).toHaveCount(0);
    await page
      .getByRole("button", { name: "Editar Nombre actualizado" })
      .click();
    await page.getByRole("button", { name: "Archivar tarjeta" }).click();
    await page.getByRole("button", { name: "Confirmar archivo" }).click();
    await expect(page.getByRole("status")).toHaveText("Tarjeta archivada.");
    await expect(page.getByText("Archivadas (1)")).toBeVisible();
    await expect(page.getByText("3.000,00 UYU")).toBeVisible();
    await expect(page.getByText("12,35 USD")).toBeVisible();
    expect(
      await page.locator("html").evaluate((element) => element.scrollWidth),
    ).toBeLessThanOrEqual(testInfo.project.use.viewport.width);

    const { rows } = await admin.query(
      `SELECT action, version FROM finance.card_changes
      WHERE owner_id = $1 AND card_id = $2 ORDER BY version`,
      [owners.a, id],
    );
    expect(rows.map(({ action }) => action)).toEqual([
      "create",
      "update",
      "update",
      "archive",
    ]);
    for (const relation of [
      "financial_events",
      "bank_effects",
      "balance_checkpoints",
    ]) {
      expect(
        (
          await admin.query(
            `SELECT 1 FROM finance.${relation} WHERE owner_id = $1`,
            [owners.a],
          )
        ).rowCount,
      ).toBe(0);
    }
  } finally {
    await admin.end();
    await other.close();
  }
});
