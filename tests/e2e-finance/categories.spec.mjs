import { expect, test } from "@playwright/test";
import {
  financeBrowserFixtures,
  financeTestOrigin,
} from "../support/finance-browser.mjs";

const path = "/api/categories";
const headers = { origin: financeTestOrigin };

test("F5-01 CA-051: crear desde un gasto, archivar y conservar el historial", async ({
  page,
  context,
  browser,
}, testInfo) => {
  const { cookies } = await financeBrowserFixtures();
  const parent = { kind: "expense", name: "Mascotas", parentId: null };
  expect(
    (await context.request.post(path, { headers, data: parent })).status(),
  ).toBe(401);
  await context.addCookies([cookies.a1]);
  expect(
    (
      await context.request.post("/api/bank-balances", {
        headers,
        data: { currency: "UYU", amount: "1000", asOfDate: "2025-01-01" },
      })
    ).status(),
  ).toBe(201);

  await page.goto("/resumen");
  await page
    .getByRole("banner")
    .getByRole("link", { name: "Registrar movimiento" })
    .click();
  const form = page.getByRole("form", { name: "Nueva transacción" });
  await form.getByLabel("Importe").fill("25,1234");
  await form.getByLabel("Fecha").fill("03/02/2025");
  await form.getByLabel("Concepto").fill("Consulta sintética");
  await form.getByLabel("Medio bancario").selectOption("transfer");

  const category = form.getByLabel("Categoría (opcional)");
  await category.selectOption("__create__");
  await form.getByLabel("Nombre de la categoría nueva").fill(parent.name);
  await form.getByLabel("Nombre de la categoría nueva").press("Enter");
  await expect(category.locator("option:checked")).toHaveText(parent.name);
  const id = await category.inputValue();
  await expect(form.getByLabel("Importe")).toHaveValue("25,1234");
  await expect(form.getByLabel("Fecha")).toHaveValue("03/02/2025");
  await expect(form.getByLabel("Concepto")).toHaveValue("Consulta sintética");
  await expect(form.getByLabel("Medio bancario")).toHaveValue("transfer");
  await expect(
    form.getByRole("combobox", { name: "Moneda", exact: true }),
  ).toHaveValue("UYU");
  await expect(
    page.getByRole("list", { name: "Saldos bancarios por moneda" }),
  ).toContainText("1.000,00 UYU");

  const saved = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/movements") &&
      response.request().method() === "POST",
  );
  await form.getByRole("button", { name: "Guardar movimiento" }).click();
  const response = await saved;
  expect(response.status()).toBe(201);
  const { id: eventId } = await response.json();

  const other = await browser.newContext({ baseURL: financeTestOrigin });
  try {
    await other.addCookies([cookies.b]);
    const data = { id, archived: true };
    expect((await other.request.patch(path, { headers, data })).status()).toBe(
      404,
    );
    expect(
      (
        await context.request.patch(path, {
          headers: { origin: "https://example.invalid" },
          data,
        })
      ).status(),
    ).toBe(403);
  } finally {
    await other.close();
  }

  await page.goto("/categorias");
  await page
    .getByRole("button", { name: "Archivar Mascotas", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Restaurar Mascotas", exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("F5-01-catalogo.png") });

  await page.goto("/resumen");
  await page
    .getByRole("banner")
    .getByRole("link", { name: "Registrar movimiento" })
    .click();
  await expect(category.locator(`option[value="${id}"]`)).toHaveCount(0);

  await page.goto(`/historial/movimientos/${eventId}`);
  await expect(page.getByText("Mascotas", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Editar movimiento" }).click();
  const historicalCategory = page.getByRole("combobox", {
    name: "Categoría",
    exact: true,
  });
  await expect(historicalCategory).toHaveValue(id);
  await expect(historicalCategory.locator("option:checked")).toHaveText(
    "Mascotas (archivada)",
  );
  await historicalCategory.selectOption("__create__");
  await page.getByLabel("Nombre de la categoría nueva").fill("Cuidados");
  await page
    .getByRole("button", { name: "Crear categoría", exact: true })
    .click();
  await expect(historicalCategory.locator("option:checked")).toHaveText(
    "Cuidados",
  );
  await expect(page.getByLabel("Concepto")).toHaveValue("Consulta sintética");

  await page.goto("/categorias");
  await page
    .getByRole("button", { name: "Restaurar Mascotas", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Archivar Mascotas", exact: true }),
  ).toBeVisible();
});
