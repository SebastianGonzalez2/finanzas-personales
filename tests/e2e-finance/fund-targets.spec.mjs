import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import pg from "pg";
import { bankReferenceToday } from "../../src/domain/bank-balances.ts";
import { firstContributionDate } from "../../src/domain/scheduled-contributions.ts";
import {
  financeBrowserFixtures,
  financeTestOrigin,
} from "../support/finance-browser.mjs";
import { testDatabaseConfig } from "../support/test-database.mjs";

test("F3-04: fecha vencida, aporte exacto, aviso, reactivación y cierre", async ({
  browser,
  context,
  page,
}, testInfo) => {
  const { cookies, owners } = await financeBrowserFixtures();
  await context.addCookies([cookies.a1]);
  const today = bankReferenceToday();
  const post = (path, data) =>
    context.request.post(`/api/${path}`, {
      headers: { origin: financeTestOrigin },
      data: {
        ...(path === "bank-balances" ? {} : { idempotencyKey: randomUUID() }),
        ...data,
      },
    });
  expect(
    (
      await post("bank-balances", {
        currency: "UYU",
        amount: "2025",
        asOfDate: today,
      })
    ).status(),
  ).toBe(201);
  const created = await post("funds", {
    action: "create",
    currency: "UYU",
    name: "Meta sintética",
  });
  expect(created.status()).toBe(201);
  const { id } = await created.json();
  expect(
    (
      await post("funds", {
        action: "reserve",
        fundId: id,
        amount: "1600",
        version: 1,
      })
    ).status(),
  ).toBe(200);
  expect(
    (
      await post("funds/contributions", {
        action: "configure",
        fundId: id,
        version: 0,
        amount: "200",
        preferredDay: 31,
      })
    ).status(),
  ).toBe(200);

  await page.goto("/fondos");
  await page.getByRole("button", { name: "Editar Meta sintética" }).click();
  await page.getByLabel("Meta (UYU, opcional)").fill("2000");
  await page.getByLabel("Fecha objetivo (opcional)").fill("2020-12-01");
  await page.getByRole("button", { name: "Guardar fondo" }).click();
  await expect(
    page.getByText(/Pasó la fecha objetivo.*400,00 UYU/),
  ).toBeVisible();
  await expect(
    page.getByText("Aportaciones mensuales · Activas"),
  ).toBeVisible();
  await page.goto("/avisos");
  await expect(
    page.getByText(/Pasó la fecha objetivo.*400,00 UYU/),
  ).toHaveCount(1);
  await page
    .getByRole("link", { name: "Revisar meta, fecha y aportaciones" })
    .click();
  expect(
    (
      await post("funds", {
        action: "reserve",
        fundId: id,
        amount: "350",
        version: 3,
      })
    ).status(),
  ).toBe(200);

  const admin = new pg.Client(testDatabaseConfig());
  await admin.connect();
  try {
    await admin.query(
      "UPDATE finance.contribution_plans SET next_on = $3 WHERE owner_id = $1 AND fund_id = $2",
      [owners.a, id, today],
    );
  } finally {
    await admin.end();
  }
  await page.goto("/avisos");
  await expect(
    page.getByText(/Alcanzaste tu meta en Meta sintética/),
  ).toHaveCount(1);
  await expect(page.getByText(/Pasó la fecha objetivo/)).toHaveCount(0);
  const second = await browser.newContext({ baseURL: financeTestOrigin });
  try {
    await second.addCookies([cookies.a2]);
    const secondPage = await second.newPage();
    await secondPage.goto("/avisos");
    await expect(
      secondPage.getByText(/Alcanzaste tu meta en Meta sintética/),
    ).toHaveCount(1);
  } finally {
    await second.close();
  }

  await page.getByRole("link", { name: "Aumentar meta" }).click();
  await expect(
    page.getByRole("button", { name: "Aumentar meta" }),
  ).toBeVisible();
  await page.getByText("Historial de aportaciones", { exact: true }).click();
  await expect(
    page.getByText(/50,00 UYU.*Aportación final para completar meta/),
  ).toBeVisible();
  expect(
    (
      await post("funds", {
        action: "release",
        fundId: id,
        amount: "100",
        version: 5,
      })
    ).status(),
  ).toBe(200);
  await page.goto("/avisos");
  await expect(
    page.getByText(/Las aportaciones automáticas continúan pausadas/),
  ).toHaveCount(1);
  await page.getByRole("link", { name: "Reactivar aportaciones" }).click();
  await page.getByRole("button", { name: "Reactivar aportaciones" }).click();
  await expect(
    page.getByText(
      `Primera aportación prevista: 100,00 UYU el ${firstContributionDate(today, 31)}.`,
    ),
  ).toBeVisible();
  await page.getByRole("button", { name: "Confirmar reactivación" }).click();
  await expect(
    page.getByText("Aportaciones mensuales · Activas"),
  ).toBeVisible();

  await page.getByRole("button", { name: "Cerrar fondo" }).click();
  await expect(
    page.getByRole("heading", { name: "Cerrar fondo · Meta sintética" }),
  ).toBeFocused();
  await expect(
    page.getByText("Volverán 1.900,00 UYU al disponible libre."),
  ).toBeVisible();
  await expect(
    page.getByText("Aportaciones pendientes que se descartarán: 0."),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("confirmacion-cierre.png"),
  });
  expect(
    await page.evaluate(
      () =>
        globalThis.document.documentElement.scrollWidth <=
        globalThis.innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Confirmar cierre" }).click();
  await expect(page.getByText("Fondo cerrado.", { exact: true })).toBeVisible();
  await page.getByText("Fondos cerrados (1)").click();
  await expect(
    page.getByText(/Se liberaron 1.900,00 UYU al disponible libre/),
  ).toBeVisible();
});
