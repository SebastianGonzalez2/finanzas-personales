import { expect, test } from "@playwright/test";
import { bankReferenceToday } from "../../src/domain/bank-balances.ts";
import {
  financeBrowserFixtures,
  financeTestOrigin,
} from "../support/finance-browser.mjs";

test("F2-08: repartir un gasto y saldar una deuda desde Historial", async ({
  page,
  context,
}) => {
  const { cookies } = await financeBrowserFixtures();
  await context.addCookies([cookies.a1]);
  const opening = await context.request.post("/api/bank-balances", {
    headers: { origin: financeTestOrigin },
    data: { currency: "UYU", amount: "6000", asOfDate: bankReferenceToday() },
  });
  expect(opening.status()).toBe(201);
  await page.goto("/resumen");
  const openExpense = async () => {
    await page
      .getByRole("banner")
      .getByRole("link", { name: "Registrar movimiento" })
      .click();
    await page
      .getByRole("button", { name: "Gasto con otras personas" })
      .click();
    return page.getByRole("form", { name: "Gasto con otras personas" });
  };
  let form = await openExpense();
  await form.getByLabel("Concepto").fill("Cena de prueba");
  await form.getByLabel("Quién pagó y cómo").selectOption("debit");
  await form.getByLabel("Importe total").fill("4000");
  await form.getByLabel("Mi parte del gasto").fill("1000");
  for (const [index, name] of ["Ana", "Belén", "Carlos"].entries()) {
    if (index)
      await form.getByRole("button", { name: "Agregar persona" }).click();
    await form.getByLabel(`Nombre de la persona ${index + 1}`).fill(name);
    await form.getByLabel(`Importe de la persona ${index + 1}`).fill("1000");
  }
  expect(
    await page.evaluate(
      () =>
        globalThis.document.documentElement.scrollWidth <=
        globalThis.innerWidth,
    ),
  ).toBe(true);
  await form.getByRole("button", { name: "Confirmar reparto" }).click();
  await page
    .getByRole("status")
    .getByRole("link", { name: "Ver gasto y obligaciones" })
    .click();
  await expect(page.getByText("Gasto propio · 1.000,00 UYU")).toBeVisible();
  const obligations = page.getByRole("region", {
    name: "Obligaciones del gasto",
  });
  await expect(
    obligations.getByRole("link", { name: /registrar cobro/ }),
  ).toHaveCount(3);
  await obligations
    .getByRole("link", { name: /registrar cobro · Ana/ })
    .click();
  const collected = page.getByLabel("Importe cobrado en Bancos (UYU)");
  await expect(collected).toHaveValue("1000.0000");
  await collected.fill("400");
  await page.getByRole("button", { name: "Confirmar cobro" }).click();
  await expect(page.getByText("600,00 UYU", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Ver gasto de origen" }).click();
  await expect(page.getByText("Pendiente · 600,00 UYU")).toBeVisible();

  await page.goto("/resumen");
  form = await openExpense();
  await form.getByLabel("Concepto").fill("Entrada de prueba");
  await form.getByLabel("Importe total").fill("1000");
  await form.getByLabel("Persona o entidad a la que le debés").fill("Diana");
  await form.getByRole("button", { name: "Confirmar gasto y deuda" }).click();
  await page
    .getByRole("status")
    .getByRole("link", { name: "Ver gasto y obligaciones" })
    .click();
  await expect(
    page.getByText("El gasto se registró sin salida de Bancos."),
  ).toBeVisible();
  await page.getByRole("link", { name: /Ver deuda y registrar pago/ }).click();
  await expect(page.getByLabel("Importe pagado en Bancos (UYU)")).toHaveValue(
    "1000.0000",
  );
  await page.getByRole("button", { name: "Confirmar pago" }).click();
  await expect(page.getByText("Saldada", { exact: true })).toBeVisible();
});
