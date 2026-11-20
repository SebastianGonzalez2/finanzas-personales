import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import pg from "pg";
import { bankReferenceToday } from "../../src/domain/bank-balances.ts";
import { installmentPeriodAt } from "../../src/domain/installments.ts";
import {
  financeBrowserFixtures,
  financeTestOrigin,
} from "../support/finance-browser.mjs";
import { testDatabaseConfig } from "../support/test-database.mjs";

test.use({ locale: "es-UY" });

test("QA-F01: dos gastos EUR muestran 0,80 UYU con la misma tasa y categoría", async ({
  page,
  context,
}, info) => {
  const { cookies, owners } = await financeBrowserFixtures();
  await context.addCookies([cookies.a1]);
  const today = bankReferenceToday();
  const month = today.slice(0, 7);
  const categoryId = randomUUID();
  const category = "Precisión sintética QA";
  const admin = new pg.Client(testDatabaseConfig());
  await admin.connect();
  try {
    await admin.query(
      "INSERT INTO finance.categories(owner_id,id,kind,name) VALUES ($1,$2,'expense',$3)",
      [owners.a, categoryId, category],
    );
    await admin.query(
      "INSERT INTO finance.fx_valuations(owner_id,effective_on,base_currency,quote_currency,observed_on,source,manual_rate) VALUES ($1,$2,'EUR','UYU',$2,'manual',40.2474)",
      [owners.a, today],
    );
    const create = async (path, data) => {
      const response = await context.request.post(`/api/${path}`, {
        data,
        headers: { origin: financeTestOrigin },
      });
      expect(response.status(), await response.text()).toBe(201);
    };
    await create("bank-balances", {
      currency: "EUR",
      amount: "10",
      asOfDate: today,
    });
    await create("budgets", {
      action: "save",
      currency: "UYU",
      amount: "100",
      categoryId,
      idempotencyKey: randomUUID(),
    });
    for (const concept of ["Primer gasto QA", "Segundo gasto QA"])
      await create("movements", {
        kind: "expense",
        method: "debit",
        currency: "EUR",
        amount: "0.01",
        effectiveOn: today,
        categoryId,
        concept,
        idempotencyKey: randomUUID(),
      });

    await page.goto(`/presupuestos?month=${month}`);
    const item = page.getByRole("listitem").filter({
      has: page.getByRole("heading", { name: category }),
    });
    await expect(item).toContainText("0,80 UYU de 100,00 UYU");
    await expect(item).toContainText(/40[.,]2474 UYU/);
    await item.screenshot({
      path: info.outputPath("precision-presupuestos.png"),
      animations: "disabled",
    });

    await page.goto(
      `/estadisticas?from=${month}-01&to=${today}&display=UYU&category=${categoryId}`,
    );
    const table = page.getByRole("table", { name: "Indicadores en UYU" });
    await expect(table.getByRole("row", { name: /^Gastos/ })).toContainText(
      "0,80 UYU",
    );
    for (const concept of ["Primer gasto QA", "Segundo gasto QA"])
      await expect(page.getByRole("link", { name: concept })).toContainText(
        "0,01 EUR",
      );
    await table.screenshot({
      path: info.outputPath("precision-estadisticas.png"),
      animations: "disabled",
    });
  } finally {
    await admin.end();
  }
});

test("FIX-FX: referencia de la cuota compartida y mes futuro estimado", async ({
  page,
  context,
}, testInfo) => {
  const { cookies, owners } = await financeBrowserFixtures();
  await context.addCookies([cookies.a1]);
  const today = bankReferenceToday();
  const month = today.slice(0, 7);
  const first = month + "-01";
  const next = installmentPeriodAt(month, 1);
  const categoryId = randomUUID();
  const category = "Cuotas sintéticas FIX-FX";
  const admin = new pg.Client(testDatabaseConfig());
  await admin.connect();
  const create = async (path, data) => {
    const response = await context.request.post("/api/" + path, {
      data: { idempotencyKey: randomUUID(), ...data },
      headers: { origin: financeTestOrigin },
    });
    expect(response.status(), await response.text()).toBe(201);
    return response.json();
  };
  let seeded = false;
  try {
    await admin.query(
      "INSERT INTO finance.categories(owner_id,id,name,kind) VALUES ($1,$2,$3,'expense')",
      [owners.a, categoryId, category],
    );
    const imported = await admin.query(
      "INSERT INTO finance.fx_reference_rates(base_currency,quote_currency,observed_on,source,rate) VALUES ('EUR','UYU',$1,'datosuruguay',40) ON CONFLICT DO NOTHING",
      [first],
    );
    seeded = imported.rowCount === 1;
    await create("budgets", {
      action: "save",
      currency: "UYU",
      amount: "5000",
      categoryId,
    });
    // SIMP-03: la compra en cuotas es un gasto con plan, sin tarjeta.
    await create("movements", {
      kind: "expense",
      currency: "EUR",
      categoryId,
      concept: "Compra sintética FIX-FX",
      effectiveOn: today,
      plan: { installmentAmount: "100", count: 6, firstPeriod: month },
    });

    await page.goto("/presupuestos?month=" + month);
    const item = page.getByRole("listitem").filter({
      has: page.getByRole("heading", { name: category }),
    });
    await expect(item).toContainText("4.000,00 UYU");
    await expect(item).toContainText("Referencia datosuruguay");
    await page.goto(
      "/estadisticas?from=" +
        first +
        "&to=" +
        today +
        "&display=UYU&category=" +
        categoryId,
    );
    const metrics = page.getByRole("table", { name: "Indicadores en UYU" });
    await expect(metrics.getByRole("row", { name: /^Gastos/ })).toContainText(
      "4.000,00 UYU",
    );
    await expect(
      page.getByRole("link", { name: "Compra sintética FIX-FX" }),
    ).toContainText("100,00 EUR");

    await page.goto("/presupuestos?month=" + next);
    await expect(item).toContainText("Consumo estimado del mes");
    await expect(item).toContainText("Estimación datosuruguay");
    await expect(item).toContainText("4.000,00 UYU");
    await expect(item.getByText(/El consumo llegó al/)).toHaveCount(0);
    const future = await admin.query(
      "SELECT 1 FROM finance.fx_valuations WHERE owner_id=$1 AND effective_on=$2 AND base_currency='EUR' AND quote_currency='UYU'",
      [owners.a, next + "-01"],
    );
    expect(future.rowCount).toBe(0);
    expect(
      await page.evaluate(
        () =>
          globalThis.document.documentElement.scrollWidth <=
          globalThis.innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath("presupuesto-estimado.png"),
      fullPage: true,
    });
  } finally {
    if (seeded) {
      await admin.query(
        "DELETE FROM finance.fx_valuations WHERE owner_id=$1 AND base_currency='EUR' AND quote_currency='UYU'",
        [owners.a],
      );
      await admin.query(
        "DELETE FROM finance.fx_reference_rates WHERE (base_currency,quote_currency,observed_on,source) = ('EUR','UYU',$1,'datosuruguay')",
        [first],
      );
    }
    await admin.end();
  }
});
