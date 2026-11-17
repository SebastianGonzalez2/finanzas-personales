import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import pg from "pg";
import { bankReferenceToday } from "../../src/domain/bank-balances.ts";
import {
  financeBrowserFixtures,
  financeTestOrigin,
} from "../support/finance-browser.mjs";
import { testDatabaseConfig } from "../support/test-database.mjs";

test.use({ hasTouch: true });

test("STAT-ANNUAL: totales por año, cotizaciones, interacción e historial privado", async ({
  page,
  context,
  browser,
}, testInfo) => {
  const { cookies, owners } = await financeBrowserFixtures();
  await context.addCookies([cookies.a1]);
  const admin = new pg.Client(testDatabaseConfig());
  const today = bankReferenceToday();
  const year = Number(today.slice(0, 4));
  const root = randomUUID();
  const child = randomUUID();
  const otherCategory = randomUUID();
  const reference = `${year - 4}-06-09`;
  const older = `${year - 6}-01-01`;

  const create = async (path, data, actor = context.request) => {
    const response = await actor.post(`/api/${path}`, {
      data:
        path === "bank-balances"
          ? data
          : { idempotencyKey: randomUUID(), ...data },
      headers: { origin: financeTestOrigin },
    });
    expect(response.status(), `${path}: ${await response.text()}`).toBe(201);
    return response.json();
  };
  const bank = (currency, actor) =>
    create(
      "bank-balances",
      { currency, amount: "5000", asOfDate: older },
      actor,
    );
  const expense = (
    amount,
    effectiveOn,
    categoryId = child,
    currency = "UYU",
    actor,
  ) =>
    create(
      "movements",
      {
        kind: "expense",
        method: "debit",
        currency,
        amount,
        effectiveOn,
        categoryId,
        concept: "Gasto anual sintético",
      },
      actor,
    );

  const isolated = await browser.newContext({ baseURL: financeTestOrigin });
  await isolated.addCookies([cookies.b]);
  await admin.connect();
  try {
    await admin.query(
      `INSERT INTO finance.categories(owner_id,id,parent_id,kind,name)
       VALUES ($1,$2,NULL,'expense','Alimentación sintética'),
              ($1,$3,$2,'expense','Supermercado sintético'),
              ($1,$4,NULL,'expense','Ocio sintético')`,
      [owners.a, root, child, otherCategory],
    );
    const privateCategory = randomUUID();
    await admin.query(
      `INSERT INTO finance.categories(owner_id,id,kind,name)
       VALUES ($1,$2,'expense','Categoría privada B')`,
      [owners.b, privateCategory],
    );
    await admin.query(
      `INSERT INTO finance.fx_reference_rates
         (base_currency,quote_currency,observed_on,source,rate)
       VALUES ('USD','UYU',$1,'datosuruguay',40)
       ON CONFLICT DO NOTHING`,
      [reference],
    );
    await admin.query(
      `INSERT INTO finance.fx_reference_refreshes(year,retry_at,primary_pairs,backup_pairs)
       VALUES ($1,now()+interval '1 hour',ARRAY['USD/UYU'],ARRAY['EUR/UYU'])
       ON CONFLICT (year) DO UPDATE SET retry_at = EXCLUDED.retry_at`,
      [year - 4],
    );
    await bank("UYU");
    await bank("USD");
    await bank("EUR");
    await bank("UYU", isolated.request);

    await expense("50", `${year - 6}-02-10`);
    const { id: refunded } = await expense("110.0123", reference);
    await expense("5", reference, child, "USD");
    await expense("40", `${year - 2}-02-10`, otherCategory);
    await create("refunds", {
      action: "credit",
      purchaseId: refunded,
      effectiveOn: `${year - 2}-02-10`,
      parts: [{ method: "debit", categoryId: child, amount: "10" }],
    });
    await expense("290", `${year - 1}-12-05`);
    await expense("25", `${year}-01-01`);
    await expense(
      "999",
      `${year - 3}-01-01`,
      privateCategory,
      "UYU",
      isolated.request,
    );

    const { id: cardId } = await create("cards", {
      action: "create",
      kind: "credit",
      name: "Crédito anual sintético",
      currencies: [{ currency: "UYU", limit: null }],
    });
    await create("cards/operations", {
      action: "purchase",
      cardId,
      currency: "UYU",
      amount: "160",
      categoryId: child,
      concept: "Dos cuotas sintéticas",
      covered: false,
      effectiveOn: `${year - 1}-12-05`,
      plan: {
        installmentAmount: "80",
        count: 2,
        firstPeriod: `${year - 1}-12`,
      },
    });
    await create("cards/operations", {
      action: "payment",
      cardId,
      effectiveOn: today,
      lines: [
        {
          currency: "UYU",
          amount: "10",
          bankCurrency: "UYU",
          bankAmount: "10",
        },
      ],
    });

    const path = "/estadisticas?view=todas&display=UYU";
    await page.goto(path);
    const card = page.getByRole("region", {
      name: "Evolución anual por categoría",
    });
    const category = card.getByLabel("Categoría de gasto");
    await category.selectOption(root);
    await card.getByRole("button", { name: "Ver categoría" }).click();
    await expect(page).toHaveURL(
      new RegExp(`category=${root}.*#estadisticas-annual-expenses$`),
    );
    await expect(category).toHaveValue(root);
    const point = (label) =>
      card.getByRole("button", { name: label, exact: true });
    await expect(point(`${year - 4} · 310,0123 UYU`)).toBeVisible();
    await expect(point(`${year - 3} · Sin registros`)).toBeVisible();
    await expect(point(`${year - 2} · 0,00 UYU · Sin gastos`)).toBeVisible();
    await expect(point(`${year - 1} · 370,00 UYU`)).toBeVisible();
    const current = `${year} · 105,00 UYU · Año en curso`;
    await expect(point(current)).toBeVisible();
    // Tab to a point from the preceding year, then verify the visible readout.
    await point(`${year - 2} · 0,00 UYU · Sin gastos`).focus();
    await page.keyboard.press("Tab");
    await expect(point(`${year - 1} · 370,00 UYU`)).toBeFocused();
    await expect(
      card.getByText(`${year - 1} · 370,00 UYU`, { exact: true }),
    ).toBeVisible();
    if (testInfo.project.name === "chromium-mobile") {
      await point(current).tap();
      await expect(card.getByText(current, { exact: true })).toBeVisible();
    } else {
      await point(current).hover();
      await expect(card.getByText(current, { exact: true })).toBeVisible();
      await point(current).focus();
    }
    await card.screenshot({
      path: testInfo.outputPath("evolucion-anual.jpg"),
      quality: 88,
    });
    await card.getByText("Ver datos", { exact: true }).click();
    await expect(
      card.getByRole("row", {
        name: new RegExp(`^${year} 105,00 UYU Año en curso$`),
      }),
    ).toBeVisible();
    await card.getByRole("link", { name: "Años anteriores" }).click();
    await expect(point(`${year - 6} · 50,00 UYU`)).toBeVisible();
    await card.getByRole("link", { name: "Años recientes" }).click();
    await expect(point(current)).toBeVisible();

    // A whole-year report uses the same category and historical exchange rate.
    await page.goto(
      `${path}&category=${root}&from=${year - 4}-01-01&to=${year - 4}-12-31`,
    );
    await expect(
      page
        .getByRole("table", { name: "Indicadores en UYU" })
        .getByRole("row", { name: /^Gastos/ }),
    ).toContainText("310,01 UYU");

    await expense("7", `${year - 4}-01-03`, child, "EUR");
    await page.goto(`${path}&category=${root}`);
    await expect(point(`${year - 4} · Falta cotización`)).toBeVisible();
    await expect(card.getByText(/Importe incompleto/)).toBeVisible();
    await expect(point(current)).toBeVisible();

    await page.goto(
      `/estadisticas?view=todas&display=original&category=${child}`,
    );
    await expect(
      card.getByRole("figure", { name: "Serie anual en UYU" }),
    ).toBeVisible();
    await expect(
      card
        .getByRole("figure", { name: "Serie anual en USD" })
        .getByRole("button", { name: `${year - 4} · 5,00 USD` }),
    ).toBeVisible();
    await expect(
      card
        .getByRole("figure", { name: "Serie anual en EUR" })
        .getByRole("button", { name: `${year - 4} · 7,00 EUR` }),
    ).toBeVisible();

    const otherPage = await isolated.newPage();
    await otherPage.goto(
      `/estadisticas?view=todas&display=original&category=${root}`,
    );
    const otherCard = otherPage.getByRole("region", {
      name: "Evolución anual por categoría",
    });
    await expect(
      otherCard.getByText("Elegí una categoría de gasto disponible."),
    ).toBeVisible();
    await expect(
      otherCard.getByText(/Alimentación sintética|310,0123/),
    ).toHaveCount(0);
    await otherPage.goto("/estadisticas?view=todas&display=original");
    await expect(
      otherCard.getByRole("button", { name: `${year - 3} · 999,00 UYU` }),
    ).toBeVisible();
    await expect(
      otherCard.getByRole("button", { name: `${year - 4} · Sin registros` }),
    ).toBeVisible();
    await otherPage.goto("/resumen");
    await expect(otherCard).toHaveCount(0);
  } finally {
    await isolated.close();
    await admin.end();
  }
});
