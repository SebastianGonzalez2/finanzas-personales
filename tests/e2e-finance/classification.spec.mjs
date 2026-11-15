import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import pg from "pg";
import { bankReferenceToday } from "../../src/domain/bank-balances.ts";
import {
  financeBrowserFixtures,
  financeTestOrigin,
} from "../support/finance-browser.mjs";
import { testDatabaseConfig } from "../support/test-database.mjs";

test("F5-02: dividir, etiquetar y filtrar el mismo movimiento", async ({
  page,
  context,
  browser,
  request,
}, testInfo) => {
  const { cookies, owners } = await financeBrowserFixtures();
  await context.addCookies([cookies.a1]);
  const other = await browser.newContext({ baseURL: financeTestOrigin });
  await other.addCookies([cookies.b]);
  const admin = new pg.Client(testDatabaseConfig());
  await admin.connect();
  const today = bankReferenceToday();
  const category = randomUUID();
  try {
    await admin.query(
      "INSERT INTO finance.categories(owner_id,id,kind,name) VALUES($1,$2,'expense','Transporte sintético')",
      [owners.a, category],
    );
    await admin.query(
      "INSERT INTO finance.balance_checkpoints(owner_id,id,currency,confirmed_amount,as_of_date) VALUES ($1,$2,'UYU',1000,$3)",
      [owners.a, randomUUID(), today],
    );
    await page.goto("/resumen");
    await page
      .getByRole("banner")
      .getByRole("link", { name: "Registrar movimiento" })
      .click();
    await page
      .getByRole("textbox", { name: /^Importe Sin separador/ })
      .fill("500");
    await page
      .getByLabel("Concepto", { exact: true })
      .fill("Excursión sintética");
    await page.getByLabel("Dividir entre categorías").check();
    await page.getByLabel("Categoría 1").selectOption(category);
    await page.getByLabel("Importe 1").fill("375,0001");
    await page.getByLabel("Importe 2").fill("124,9999");
    await page.getByText("Etiquetas (opcional)", { exact: true }).click();
    for (const name of ["Italia", "Vacaciones"]) {
      await page.getByLabel("Nueva etiqueta").fill(name);
      await page
        .getByRole("button", { name: "Crear etiqueta", exact: true })
        .click();
      await expect(
        page.getByRole("checkbox", { name, exact: true }),
      ).toBeChecked();
    }
    await page.screenshot({
      path: testInfo.outputPath("desglose.png"),
      fullPage: true,
    });
    await page.getByLabel("Importe 2").fill("124,9998");
    await page.getByRole("button", { name: "Guardar movimiento" }).click();
    await expect(
      page.getByRole("alert").filter({ hasText: /suma debe coincidir/ }),
    ).toBeVisible();
    await page.getByLabel("Importe 2").fill("124,9999");
    const pending = page.waitForResponse((response) =>
      response.url().endsWith("/api/movements"),
    );
    await page.getByRole("button", { name: "Guardar movimiento" }).click();
    const response = await pending;
    expect(response.status()).toBe(201);
    const { id } = await response.json();

    await page.goto("/historial");
    await page.getByRole("button", { name: /Más filtros/ }).click();
    await page.getByText("Filtrar por etiquetas", { exact: true }).click();
    await page.getByRole("checkbox", { name: "Italia" }).check();
    await page.getByRole("checkbox", { name: "Vacaciones" }).check();
    await page.getByRole("button", { name: /Aplicar filtros/ }).click();
    const row = page.getByRole("link", { name: /Excursión sintética/ });
    await expect(row).toHaveCount(1);
    await row.click();
    await expect(
      page.getByRole("heading", { name: "Desglose por categorías" }),
    ).toBeVisible();
    await expect(
      page.getByText(/Transporte sintético · 375,00 UYU/),
    ).toBeVisible();
    const foreignEdit = {
      data: {
        eventId: id,
        version: 1,
        idempotencyKey: randomUUID(),
        tagIds: [],
      },
      headers: { origin: financeTestOrigin },
    };
    expect(
      (await other.request.patch("/api/classification", foreignEdit)).status(),
    ).toBe(404);
    expect(
      (await request.patch("/api/classification", foreignEdit)).status(),
    ).toBe(401);
    expect(
      (
        await context.request.patch("/api/classification", {
          ...foreignEdit,
          headers: { origin: "https://example.invalid" },
        })
      ).status(),
    ).toBe(403);
    await page.getByText("Editar clasificación", { exact: true }).click();
    await page.getByLabel("Importe 1").fill("350");
    await page.getByLabel("Importe 2").fill("150");
    await page.getByRole("button", { name: "Guardar clasificación" }).click();
    await expect(
      page.getByText("Transporte sintético · 350,00 UYU"),
    ).toBeVisible();

    await page
      .getByText("Últimas clasificaciones anteriores", { exact: true })
      .click();
    await expect(
      page.getByText("Transporte sintético · 375,00 UYU"),
    ).toBeVisible();

    await page.goto("/estadisticas?display=original");
    await page.getByText("Filtrar por etiquetas", { exact: true }).click();
    await page.getByRole("checkbox", { name: "Italia" }).check();
    await page.getByRole("checkbox", { name: "Vacaciones" }).check();
    await page.getByRole("button", { name: "Aplicar filtros" }).click();
    await expect(page).toHaveURL(/tags=/);
    const totals = page.getByRole("row").filter({
      has: page.getByRole("rowheader", { name: "Gastos", exact: true }),
    });
    await expect(
      totals.getByRole("cell", { name: "500,00 UYU", exact: true }),
    ).toBeVisible();
    const categories = page.getByRole("table", {
      name: "Comparación por categoría en UYU",
    });
    await expect(
      categories.getByRole("cell", { name: "350,00 UYU", exact: true }),
    ).toBeVisible();
    await expect(
      categories.getByRole("cell", { name: "150,00 UYU", exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => globalThis.document.documentElement.scrollWidth,
      ),
    ).toBeLessThanOrEqual(await page.evaluate(() => globalThis.innerWidth));
    await page.screenshot({
      path: testInfo.outputPath("estadisticas.png"),
      fullPage: true,
    });
    await page.goto("/etiquetas");
    const tag = page
      .getByRole("listitem")
      .filter({ has: page.locator('input[value="Italia"]') });
    await tag.getByRole("textbox").fill("Viaje a Italia");
    await tag.getByRole("button", { name: "Renombrar" }).click();
    const renamed = page
      .getByRole("listitem")
      .filter({ has: page.locator('input[value="Viaje a Italia"]') });
    await renamed.getByRole("button", { name: "Archivar" }).click();
    await expect(
      renamed.getByRole("button", { name: "Restaurar" }),
    ).toBeVisible();
    await page.goto(`/historial/movimientos/${id}`);
    await expect(
      page.getByText("Viaje a Italia (archivada)", { exact: true }).first(),
    ).toBeVisible();
  } finally {
    await admin.end();
    await other.close();
  }
});
