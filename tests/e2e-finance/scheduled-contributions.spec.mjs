import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import pg from "pg";
import {
  bankReferenceToday,
  formatBankReference,
} from "../../src/domain/bank-balances.ts";
import { firstContributionDate } from "../../src/domain/scheduled-contributions.ts";
import {
  financeBrowserFixtures,
  financeTestOrigin,
} from "../support/finance-browser.mjs";
import { testDatabaseConfig } from "../support/test-database.mjs";

test("F3-03: programación, aviso sin duplicados y confirmación manual entre sesiones", async ({
  browser,
  context,
  page,
}, testInfo) => {
  const { cookies, owners } = await financeBrowserFixtures();
  await context.addCookies([cookies.a1]);
  const today = bankReferenceToday();
  const origin = { origin: financeTestOrigin };
  const post = (path, data) =>
    context.request.post(`/api/${path}`, { data, headers: origin });
  const opening = await post("bank-balances", {
    currency: "UYU",
    amount: "700",
    asOfDate: today,
  });
  expect(opening.status()).toBe(201);
  const created = await post("funds", {
    action: "create",
    currency: "UYU",
    name: "Vacaciones F3-03",
    idempotencyKey: randomUUID(),
  });
  expect(created.status()).toBe(201);
  const { id } = await created.json();

  await page.goto("/fondos");
  await page.getByText("Aportaciones mensuales", { exact: true }).click();
  await page.getByLabel("Importe mensual (UYU)").fill("1000");
  await page.getByLabel("Día del mes").fill("31");
  await expect(
    page.getByText(
      `Desde el próximo mes 1.000,00 UYU. Primera fecha ${formatBankReference(firstContributionDate(today, 31))}.`,
    ),
  ).toBeVisible();
  await page.getByRole("button", { name: "Activar aportaciones" }).click();
  await expect(
    page.getByText("Aportaciones mensuales · Activas"),
  ).toBeVisible();

  const admin = new pg.Client(testDatabaseConfig());
  await admin.connect();
  try {
    const result = await admin.query(
      "UPDATE finance.contribution_plans SET next_on = $3 WHERE owner_id = $1 AND fund_id = $2",
      [owners.a, id, today],
    );
    expect(result.rowCount).toBe(1);
  } finally {
    await admin.end();
  }
  const job = (headers) =>
    context.request.get("/api/cron/contributions", { headers });
  expect((await job({ authorization: "Bearer invalid" })).status()).toBe(401);
  const jobs = await Promise.all([
    job({ authorization: "Bearer synthetic-finance-cron-secret" }),
    job({ authorization: "Bearer synthetic-finance-cron-secret" }),
  ]);
  expect(jobs.map((response) => response.status())).toEqual([204, 204]);

  await page.goto("/avisos");
  await expect(
    page.getByText("No había suficiente dinero disponible."),
  ).toHaveCount(1);
  await expect(
    page.getByText(
      `Vacaciones F3-03 · 1.000,00 UYU · ${formatBankReference(today)}`,
    ),
  ).toBeVisible();
  const notice = page.getByRole("link", {
    name: "Ver aportación de Vacaciones F3-03",
  });
  const periodId = (await notice.getAttribute("href")).split("#aporte-")[1];
  const other = await browser.newContext({ baseURL: financeTestOrigin });
  try {
    await other.addCookies([cookies.b]);
    const otherPage = await other.newPage();
    await otherPage.goto("/avisos");
    await expect(otherPage.getByText("No tenés avisos nuevos.")).toBeVisible();
    const forbidden = await other.request.post("/api/funds/contributions", {
      data: { action: "complete", periodId, idempotencyKey: randomUUID() },
      headers: origin,
    });
    expect(forbidden.status()).toBe(404);
  } finally {
    await other.close();
  }
  await notice.click();
  await page.getByRole("button", { name: "Completar aportación" }).click();
  await expect(
    page.getByText(
      `Reservar 1.000,00 UYU para la aportación del ${formatBankReference(today)}.`,
    ),
  ).toBeVisible();
  await page.getByRole("button", { name: "Confirmar aportación" }).click();
  await expect(
    page.getByRole("alert").filter({
      hasText:
        "El disponible en UYU no alcanza para completar esta aportación.",
    }),
  ).toBeVisible();
  const confirmation = page.getByRole("button", {
    name: "Confirmar aportación",
  });
  await confirmation.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: testInfo.outputPath("confirmacion-aporte.png"),
  });
  expect(
    await page.evaluate(
      () =>
        globalThis.document.documentElement.scrollWidth <=
        globalThis.innerWidth,
    ),
  ).toBe(true);

  const adjustment = await post("bank-balances/adjustments", {
    currency: "UYU",
    amount: "2000",
    asOfDate: today,
    note: "Prueba sintética",
    idempotencyKey: randomUUID(),
  });
  expect(adjustment.status()).toBe(201);
  await page.reload();
  await expect(page.getByText("Disponible actual 2.000,00 UYU")).toBeVisible();
  await page.getByRole("button", { name: "Completar aportación" }).click();
  const saving = page.waitForResponse((response) =>
    response.url().endsWith("/api/funds/contributions"),
  );
  await page.getByRole("button", { name: "Confirmar aportación" }).click();
  expect((await saving).status()).toBe(200);
  await expect(
    page.getByText("Historial de aportaciones", { exact: true }),
  ).toBeVisible();
  await page.goto("/avisos");
  await expect(page.getByText("No tenés avisos nuevos.")).toBeVisible();
  await page.getByText("Avisos resueltos", { exact: true }).click();
  await expect(
    page.getByText(`Completada el ${formatBankReference(today)}`),
  ).toBeVisible();
  await page.goto("/resumen");
  await expect(
    page.getByRole("list", { name: "Saldos bancarios por moneda" }),
  ).toContainText("2.000,00 UYU");
  await expect(
    page.getByText("Los gastos registrados aparecerán acá."),
  ).toBeVisible();
});
