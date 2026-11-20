import { expect, test } from "@playwright/test";
import { financeBrowserFixtures } from "../support/finance-browser.mjs";

test.use({ locale: "en-US" });

test.beforeEach(async ({ context }) => {
  const { cookies } = await financeBrowserFixtures();
  await context.addCookies([cookies.a1]);
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
