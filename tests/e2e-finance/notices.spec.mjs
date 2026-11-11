import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import pg from "pg";
import { bankReferenceToday } from "../../src/domain/bank-balances.ts";
import {
  financeBrowserFixtures,
  financeTestOrigin,
} from "../support/finance-browser.mjs";
import { testDatabaseConfig } from "../support/test-database.mjs";

test("F3-07: el centro conserva los cruces y aísla los avisos de cada titular", async ({
  page,
  context,
  browser,
}, testInfo) => {
  const { cookies, owners } = await financeBrowserFixtures();
  await context.addCookies([cookies.a1]);
  const other = await browser.newContext({ baseURL: financeTestOrigin });
  await other.addCookies([cookies.b]);
  const admin = new pg.Client(testDatabaseConfig());
  await admin.connect();
  const today = bankReferenceToday();
  const category = randomUUID();
  const fund = randomUUID();
  const send = (url, data) =>
    context.request.post(url, { data, headers: { origin: financeTestOrigin } });
  try {
    await admin.query(
      "INSERT INTO finance.categories(owner_id,id,kind,name) VALUES ($1,$2,'expense','Alimentación sintética')",
      [owners.a, category],
    );
    await admin.query(
      `INSERT INTO finance.savings_funds(owner_id,id,name,currency,reserved_amount,target_amount,target_date)
       VALUES ($1,$2,'Meta sintética','UYU',1600,2000,$3::date-1)`,
      [owners.a, fund, today],
    );
    await admin.query(
      `INSERT INTO finance.contribution_plans(owner_id,fund_id,amount,preferred_day,version,next_on,next_amount)
       VALUES ($1,$2,100,1,1,$3::date+32,100)`,
      [owners.a, fund, today],
    );
    expect(
      (
        await send("/api/bank-balances", {
          currency: "UYU",
          amount: "50000",
          asOfDate: today,
        })
      ).status(),
    ).toBe(201);
    expect(
      (
        await send("/api/budgets", {
          action: "save",
          categoryId: category,
          currency: "UYU",
          amount: "10000",
          idempotencyKey: randomUUID(),
        })
      ).status(),
    ).toBe(201);
    for (const amount of ["8000", "2000", "1000"]) {
      const expense = {
        kind: "expense",
        method: "debit",
        currency: "UYU",
        amount,
        categoryId: category,
        effectiveOn: today,
        concept: "Compra sintética",
        idempotencyKey: randomUUID(),
      };
      expect((await send("/api/movements", expense)).status()).toBe(201);
      expect((await send("/api/movements", expense)).status()).toBe(200);
    }

    await page.goto("/avisos");
    for (let visit = 0; visit < 2; visit++) {
      const budgets = page.getByRole("region", { name: "Presupuestos" });
      await expect(budgets.getByRole("listitem")).toHaveCount(2);
      await expect(budgets.getByRole("listitem").nth(0)).toContainText("100%");
      await expect(budgets.getByRole("listitem").nth(1)).toContainText("80%");
      const goals = page.getByRole("region", { name: "Metas de fondos" });
      await expect(goals.getByRole("listitem")).toHaveCount(1);
      await expect(goals).toContainText("1.600,00 UYU");
      await page.reload();
    }
    const {
      rows: [state],
    } = await admin.query(
      `SELECT f.status, f.reserved_amount::numeric(20,4)::text AS reserved, p.version, p.next_on IS NOT NULL AS scheduled
       FROM finance.savings_funds f JOIN finance.contribution_plans p ON (p.owner_id,p.fund_id)=(f.owner_id,f.id)
       WHERE f.owner_id=$1 AND f.id=$2`,
      [owners.a, fund],
    );
    expect(state).toEqual({
      status: "active",
      reserved: "1600.0000",
      version: 1,
      scheduled: true,
    });
    await page.screenshot({
      path: testInfo.outputPath("F3-07-avisos.png"),
      fullPage: true,
    });
    const foreign = await other.newPage();
    await foreign.goto("/avisos");
    await expect(foreign.getByText("No tenés avisos nuevos.")).toBeVisible();
    await expect(
      foreign.getByText(/Alimentación sintética|Meta sintética/),
    ).toHaveCount(0);
  } finally {
    await admin.end();
    await other.close();
  }
});
