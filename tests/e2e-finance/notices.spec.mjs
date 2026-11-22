import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import pg from "pg";
import { bankReferenceToday } from "../../src/domain/bank-balances.ts";
import {
  financeBrowserFixtures,
  financeTestOrigin,
} from "../support/finance-browser.mjs";
import { testDatabaseConfig } from "../support/test-database.mjs";

test("F3-07: el centro conserva los avisos de presupuestos y los aísla por titular", async ({
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
  const send = (url, data) =>
    context.request.post(url, { data, headers: { origin: financeTestOrigin } });
  try {
    await admin.query(
      "INSERT INTO finance.categories(owner_id,id,kind,name) VALUES ($1,$2,'expense','Alimentación sintética')",
      [owners.a, category],
    );
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
      await page.reload();
    }
    await page.screenshot({
      path: testInfo.outputPath("F3-07-avisos.png"),
      fullPage: true,
    });
    const foreign = await other.newPage();
    await foreign.goto("/avisos");
    await expect(foreign.getByText("No tenés avisos nuevos.")).toBeVisible();
    await expect(foreign.getByText(/Alimentación sintética/)).toHaveCount(0);
  } finally {
    await admin.end();
    await other.close();
  }
});
