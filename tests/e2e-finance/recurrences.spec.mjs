import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { bankReferenceToday } from "../../src/domain/bank-balances.ts";
import {
  financeBrowserFixtures,
  financeTestOrigin,
} from "../support/finance-browser.mjs";

test("F4-01: el primer período futuro se guarda sin pendientes y es privado", async ({
  page,
  context,
  browser,
}, testInfo) => {
  const { cookies } = await financeBrowserFixtures();
  await context.addCookies([cookies.a1]);
  const today = bankReferenceToday();
  const firstPeriod = `${Number(today.slice(0, 4)) + 1}-01-15`;
  await page.goto("/recurrentes");
  await expect(
    page.getByRole("heading", { name: "Recurrentes" }),
  ).toBeVisible();
  await expect(page.getByLabel("Frecuencia")).toHaveValue("monthly");
  await expect(page.getByLabel("Comienza en")).toHaveValue(today);
  await page.getByLabel("Concepto").fill("Seguro sintético de enero");
  await page.getByLabel("Comienza en").fill(firstPeriod);
  await page
    .getByLabel("Vencimiento", { exact: true })
    .selectOption("approximate");
  await page.getByLabel("Importe de referencia (opcional)").fill("125,1234");
  await expect(
    page.getByText(`Primer período ${firstPeriod.slice(0, 7)}`, {
      exact: false,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Guardar recurrencia" }).click();
  const list = page.getByRole("list", { name: "Recurrencias guardadas" });
  await expect(list).toContainText("Seguro sintético de enero");
  await expect(list).toContainText("Fecha aproximada");
  await expect(list).toContainText("125,1234 UYU");
  await expect(list).not.toContainText(/Sin pago confirmado|Vence el/);
  await page.reload();
  await expect(list).toContainText(
    `Comienza el 15/01/${firstPeriod.slice(0, 4)}`,
  );
  await page.screenshot({
    path: testInfo.outputPath("F4-01-recurrentes.png"),
    fullPage: true,
  });

  const data = {
    kind: "income",
    concept: "Ingreso sintético",
    currency: "USD",
    firstPeriod: today,
    frequency: "weekly",
    dateMode: "none",
    idempotencyKey: randomUUID(),
  };
  const other = await browser.newContext({ baseURL: financeTestOrigin });
  try {
    expect(
      (
        await other.request.post("/api/recurrences", {
          data,
          headers: { origin: financeTestOrigin },
        })
      ).status(),
    ).toBe(401);
    await other.addCookies([cookies.b]);
    expect(
      (
        await other.request.post("/api/recurrences", {
          data,
          headers: { origin: "https://example.invalid" },
        })
      ).status(),
    ).toBe(403);
    expect(
      (
        await other.request.post("/api/recurrences", {
          data,
          headers: { origin: financeTestOrigin },
        })
      ).status(),
    ).toBe(201);
    const foreign = await other.newPage();
    await foreign.goto("/recurrentes");
    const foreignList = foreign.getByRole("list", {
      name: "Recurrencias guardadas",
    });
    await expect(foreignList).toContainText("Ingreso sintético");
    await expect(foreignList).toContainText("Sin cobro confirmado");
    await expect(foreignList).not.toContainText(/Seguro sintético|Vence el/);
  } finally {
    await other.close();
  }
});
