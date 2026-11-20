import { expect, test } from "@playwright/test";
import pg from "pg";
import { formatInstallmentPeriod } from "../../src/domain/installments.ts";
import {
  bankReferenceToday,
  formatBankReference,
} from "../../src/domain/bank-balances.ts";
import { financeBrowserFixtures } from "../support/finance-browser.mjs";
import { testDatabaseConfig } from "../support/test-database.mjs";

// UI-05E: «Nueva recurrencia» es un disclosure; se abre solo si está cerrado.
async function openCreator(page) {
  const creator = page.locator("details.gs-creator");
  if (!(await creator.evaluate((node) => node.open)))
    await creator.locator("summary").click();
}

test("CA-048: pagar un alquiler compartido con reparto habitual", async ({
  page,
  context,
}, testInfo) => {
  const { cookies, owners } = await financeBrowserFixtures();
  await context.addCookies([cookies.a1]);
  const today = bankReferenceToday();
  const [year, month] = today.split("-").map(Number);
  const previous = new Date(Date.UTC(year, month - 2, 1))
    .toISOString()
    .slice(0, 10);
  await page.goto("/recurrentes");
  await openCreator(page);
  const creation = page.getByRole("form", { name: "Nueva recurrencia" });
  await creation.getByLabel("Concepto").fill("Alquiler compartido sintético");
  await creation.getByLabel("Comienza en").fill(formatBankReference(previous));
  await creation.getByLabel("Importe de referencia").fill("20000");
  await creation.getByLabel("Compartida", { exact: true }).check();
  await creation.getByLabel("Nombre de la persona 1").fill("Ana de prueba");
  await creation.getByLabel("Porcentaje de la persona 1").fill("50");
  await creation.getByRole("button", { name: "Guardar recurrencia" }).click();
  // P-06: el detalle de la serie seleccionada es una región con su concepto.
  const series = page.getByRole("region", {
    name: "Alquiler compartido sintético",
    exact: true,
  });
  const past = series.getByRole("listitem").filter({
    has: page.getByRole("heading", {
      name: formatInstallmentPeriod(previous.slice(0, 7)),
      exact: true,
    }),
  });
  const current = series.getByRole("listitem").filter({
    has: page.getByRole("heading", {
      name: formatInstallmentPeriod(today.slice(0, 7)),
      exact: true,
    }),
  });
  await expect(past).toContainText("Sin pago confirmado");
  await expect(current).toContainText("Sin pago confirmado");
  await expect(series).toContainText("Ana de prueba · 50 %");

  await past
    .getByRole("button", { name: "Registrar pago", exact: true })
    .click();
  await past.getByLabel("Importe pagado").fill("20000");
  await past.getByRole("button", { name: "Aplicar reparto habitual" }).click();
  await expect(past.getByLabel("Tu parte del pago")).toHaveValue("10000.0000");
  await expect(past.getByLabel("Parte de la persona 1")).toHaveValue(
    "10000.0000",
  );
  await past.getByLabel("Con esto queda pagado el período").check();
  expect(
    await page.evaluate(
      () =>
        globalThis.document.documentElement.scrollWidth <=
        globalThis.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("F4-04-reparto.png"),
    fullPage: true,
  });
  await past.getByRole("button", { name: "Confirmar", exact: true }).click();
  await expect(past.getByText("Pagado", { exact: true })).toBeVisible();
  await expect(current).toContainText("Sin pago confirmado");
  await expect(series).toContainText("Ana de prueba · 50 %");

  await past
    .getByRole("list", { name: "Movimientos vinculados" })
    .getByRole("link")
    .click();
  const reparto = page.getByRole("region", { name: "Obligaciones del gasto" });
  await expect(reparto).toContainText("Gasto propio · 10.000,00 UYU");
  await expect(reparto).toContainText("Pendiente · 10.000,00 UYU");
  await expect(reparto.locator('a[href^="/deudas/"]')).toHaveCount(0);
  await page.goto("/resumen");
  await expect(page.getByRole("list", { name: "Gastos del mes" })).toHaveText(
    "10.000,00 UYU",
  );
  const admin = new pg.Client(testDatabaseConfig());
  await admin.connect();
  try {
    const { rows } = await admin.query(
      `SELECT s.method, count(b.id)::int AS bank_effects
         FROM finance.shared_expenses s
         LEFT JOIN finance.bank_effects b
           ON (s.owner_id, s.event_id) = (b.owner_id, b.event_id)
        WHERE s.owner_id = $1 GROUP BY s.event_id, s.method`,
      [owners.a],
    );
    expect(rows).toEqual([{ method: "unspecified", bank_effects: 0 }]);
  } finally {
    await admin.end();
  }
});
