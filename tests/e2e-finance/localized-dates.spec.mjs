import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import {
  bankReferenceToday,
  formatBankReference,
} from "../../src/domain/bank-balances.ts";
import {
  financeBrowserFixtures,
  financeTestOrigin,
} from "../support/finance-browser.mjs";

test.use({ locale: "en-US" });

test.beforeEach(async ({ context }) => {
  const { cookies } = await financeBrowserFixtures();
  await context.addCookies([cookies.a1]);
});

test("QA-D02: Tarjetas muestra, valida y guarda la fecha en formato uruguayo", async ({
  page,
  context,
}, testInfo) => {
  const post = (path, data) =>
    context.request.post(path, {
      data,
      headers: { origin: financeTestOrigin },
    });
  expect(
    (
      await post("/api/bank-balances", {
        currency: "UYU",
        amount: "500",
        asOfDate: "2024-02-01",
      })
    ).status(),
  ).toBe(201);
  expect(
    (
      await post("/api/cards", {
        action: "create",
        name: "Visa sintética QA-D02",
        kind: "credit",
        currencies: [{ currency: "UYU" }],
        opening: {
          effectiveOn: "2024-02-01",
          lines: [{ currency: "UYU", amount: "100" }],
        },
        idempotencyKey: randomUUID(),
      })
    ).status(),
  ).toBe(201);

  await page.goto("/tarjetas");
  const pay = page.getByRole("button", { name: "Registrar pago", exact: true });
  await pay.click();
  const form = page.getByRole("form", {
    name: "Registrar pago · Visa sintética QA-D02",
    exact: true,
  });
  const submit = form.getByRole("button", {
    name: "Registrar pago",
    exact: true,
  });
  const date = form.getByRole("textbox", { name: "Fecha", exact: true });
  const today = bankReferenceToday();
  await expect(date).toHaveValue(formatBankReference(today));
  await expect(date).toHaveAccessibleDescription(/DD\/MM\/AAAA/);
  await expect(date).toHaveAttribute("inputmode", "numeric");
  await page.getByRole("checkbox", { name: /Abonar deuda en UYU/ }).check();
  await page.getByLabel("Deuda cancelada en UYU").fill("20");

  for (const [invalid, message] of [
    ["", "Ingresá una fecha."],
    ["02/29/2024", "Ingresá una fecha válida en formato DD/MM/AAAA."],
    ["29/02/2025", "Ingresá una fecha válida en formato DD/MM/AAAA."],
    ["31/12/9999", `Ingresá una fecha hasta el ${formatBankReference(today)}.`],
  ]) {
    await date.fill(invalid);
    await submit.click();
    await expect(date).toBeFocused();
    await expect(date).toHaveAccessibleDescription(message);
  }

  await date.fill("");
  await date.pressSequentially("29022024");
  await expect(date).toHaveValue("29/02/2024");
  await expect(date).not.toHaveAttribute("aria-invalid", "true");
  await date
    .locator("..")
    .screenshot({ path: testInfo.outputPath("tarjetas-fecha.png") });

  const payment = page.waitForResponse((response) =>
    response.url().endsWith("/api/cards/operations"),
  );
  await date.press("Enter");
  const result = await payment;
  expect(result.status()).toBe(201);
  expect(result.request().postDataJSON().effectiveOn).toBe("2024-02-29");
  const { id } = await result.json();
  await expect(page.getByText("Pago de tarjeta registrado.")).toBeVisible();
  await page.goto(`/historial/movimientos/${id}`);
  await expect(
    page.getByText("29/02/2024", { exact: true }).first(),
  ).toBeVisible();
});

test("QA-D02: Presupuestos muestra meses en español y consulta el período elegido", async ({
  page,
}, testInfo) => {
  await page.goto("/presupuestos");
  const group = page.getByRole("group", {
    name: "Mes del presupuesto",
    exact: true,
  });
  const month = group.getByRole("combobox", { name: "Mes", exact: true });
  const year = group.getByRole("textbox", { name: "Año", exact: true });
  const show = page.getByRole("button", { name: "Ver mes", exact: true });
  await expect(month.locator("option")).toHaveText([
    "Elegí",
    "enero",
    "febrero",
    "marzo",
    "abril",
    "mayo",
    "junio",
    "julio",
    "agosto",
    "setiembre",
    "octubre",
    "noviembre",
    "diciembre",
  ]);
  await month.focus();
  await page.keyboard.press("Tab");
  await expect(year).toBeFocused();

  await month.selectOption({ label: "diciembre" });
  await year.fill("");
  await show.click();
  await expect(year).toBeFocused();
  await expect(year).toHaveAccessibleDescription("Ingresá un año.");
  await year.fill("2024");
  await expect(month.locator("option:checked")).toHaveText("diciembre");
  await group
    .locator("..")
    .screenshot({ path: testInfo.outputPath("presupuestos-mes.png") });
  await show.click();
  await expect(page).toHaveURL(/\/presupuestos\?month=2024-12$/);
  await expect(
    page.getByText("Diciembre de 2024", { exact: true }).first(),
  ).toBeVisible();
  await expect(
    page
      .getByRole("combobox", { name: "Mes", exact: true })
      .locator("option:checked"),
  ).toHaveText("diciembre");
  expect(
    await page.evaluate(
      () =>
        globalThis.document.documentElement.scrollWidth <=
        globalThis.innerWidth,
    ),
  ).toBe(true);
});
