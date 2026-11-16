import { expect, test } from "@playwright/test";
import { formatInstallmentPeriod } from "../../src/domain/installments.ts";
import {
  bankReferenceToday,
  formatBankReference,
} from "../../src/domain/bank-balances.ts";
import {
  financeBrowserFixtures,
  financeTestOrigin,
} from "../support/finance-browser.mjs";

// UI-05E: «Nueva recurrencia» es un disclosure; se abre solo si está cerrado.
async function openCreator(page) {
  const creator = page.locator("details.gs-creator");
  if (!(await creator.evaluate((node) => node.open)))
    await creator.locator("summary").click();
}

test("CA-048: pagar alquiler compartido y cobrar una parte más tarde", async ({
  page,
  context,
}, testInfo) => {
  const { cookies } = await financeBrowserFixtures();
  await context.addCookies([cookies.a1]);
  const today = bankReferenceToday();
  const [year, month] = today.split("-").map(Number);
  const previous = new Date(Date.UTC(year, month - 2, 1))
    .toISOString()
    .slice(0, 10);
  const opening = await context.request.post("/api/bank-balances", {
    headers: { origin: financeTestOrigin },
    data: { currency: "UYU", amount: "30000", asOfDate: previous },
  });
  expect(opening.status()).toBe(201);
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
  await page.goto("/deudas");
  await expect(page.getByText("Ana de prueba", { exact: true })).toHaveCount(0);
  await page.goto("/recurrentes");

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
  await past.getByRole("link", { name: /Ver reparto y cobros/ }).click();
  await expect(page.getByText("Gasto propio · 10.000,00 UYU")).toBeVisible();
  await expect(
    page.getByText("Salida registrada en Bancos · 20.000,00 UYU"),
  ).toBeVisible();
  await page
    .getByRole("link", { name: /registrar cobro · Ana de prueba/ })
    .click();
  await page.getByLabel("Importe cobrado en Bancos (UYU)").fill("3000");
  await page.getByRole("button", { name: "Confirmar cobro" }).click();
  await expect(page.getByText("7.000,00 UYU", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Ver gasto de origen" }).click();
  await expect(page.getByText("Pendiente · 7.000,00 UYU")).toBeVisible();

  await page.getByText("Corregir reparto del pago", { exact: true }).click();
  const correction = page.getByRole("form", {
    name: "Corregir reparto del pago",
  });
  await correction.getByLabel("Tu parte del pago").fill("12000");
  await correction.getByLabel(/Parte de Ana de prueba/).fill("8000");
  await correction
    .getByRole("button", { name: "Guardar corrección del reparto" })
    .click();
  await expect(page.getByText("Gasto propio · 12.000,00 UYU")).toBeVisible();
  await expect(page.getByText("Pendiente · 5.000,00 UYU")).toBeVisible();
  await expect(page.getByText(/Reparto corregido/)).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("F4-04-cobro-parcial.png"),
    fullPage: true,
  });
});
