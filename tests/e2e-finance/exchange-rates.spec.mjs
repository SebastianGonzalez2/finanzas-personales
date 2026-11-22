import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import pg from "pg";
import { formatBankReference } from "../../src/domain/bank-balances.ts";
import {
  financeBrowserFixtures,
  financeTestOrigin,
} from "../support/finance-browser.mjs";
import { testDatabaseConfig } from "../support/test-database.mjs";

test("F5-06 CA-060: domingo, tasa fija, cambio de fecha y preferencia privada", async ({
  page,
  context,
  browser,
  request,
}, testInfo) => {
  const { cookies, owners } = await financeBrowserFixtures();
  await context.addCookies([cookies.a1]);
  const second = await browser.newContext({ baseURL: financeTestOrigin });
  const other = await browser.newContext({ baseURL: financeTestOrigin });
  await second.addCookies([cookies.a2]);
  await other.addCookies([cookies.b]);
  const admin = new pg.Client(testDatabaseConfig());
  // Each browser project gets its own public dates because the cache is
  // shared and the test deliberately adds a later import for the Sunday.
  const [friday, sunday, monday] =
    testInfo.project.name === "chromium-mobile"
      ? ["2025-10-31", "2025-11-02", "2025-11-03"]
      : ["2026-10-30", "2026-11-01", "2026-11-02"];
  const post = (actor, path, data, origin = financeTestOrigin) =>
    actor.post(`/api/${path}`, { data, headers: { origin } });
  const created = async (path, data) => {
    const response = await post(context.request, path, data);
    expect(response.status(), await response.text()).toBe(201);
    return response.json();
  };
  await admin.connect();
  try {
    await admin.query(
      `
      INSERT INTO finance.fx_reference_refreshes(year, retry_at, primary_pairs)
      VALUES ($1, now() + interval '1 hour', '{EUR/USD}')
      ON CONFLICT (year) DO UPDATE SET retry_at = excluded.retry_at, primary_pairs = excluded.primary_pairs`,
      [Number(sunday.slice(0, 4))],
    );
    await admin.query(
      `
      INSERT INTO finance.fx_reference_rates(base_currency, quote_currency, observed_on, source, rate)
      VALUES ('EUR','USD',$1,'datosuruguay',1.25),
             ('EUR','USD',$2,'frankfurter',2),
             ('EUR','USD',$3,'datosuruguay',1.5)
      ON CONFLICT DO NOTHING`,
      [friday, sunday, monday],
    );
    const expense = await created("movements", {
      kind: "expense",
      method: "debit",
      currency: "EUR",
      amount: "10",
      effectiveOn: sunday,
      concept: "Gasto sintético del domingo",
      idempotencyKey: randomUUID(),
    });
    const report = `/estadisticas?from=${sunday}&to=${monday}&display=USD&category=none`;
    await page.goto(report);
    const metrics = page.getByRole("table", { name: "Indicadores en USD" });
    await expect(metrics.getByRole("row", { name: /^Gastos/ })).toContainText(
      "12,50 USD",
    );
    await expect(
      page.locator('g[aria-label*="gastos 12,50 USD"]').first(),
    ).toBeVisible();
    await page.getByText("Cotizaciones utilizadas", { exact: true }).click();
    const quote = page
      .getByRole("row")
      .filter({ hasText: formatBankReference(sunday) })
      .filter({ hasText: formatBankReference(friday) });
    await expect(quote).toContainText("1 EUR = 1,25 USD");
    await expect(quote).toContainText("datosUruguay (BCU)");
    await expect(
      page.getByRole("link", { name: "Gasto sintético del domingo" }),
    ).toContainText("10,00 EUR");
    expect(
      await page.evaluate(
        () =>
          globalThis.document.documentElement.scrollWidth <=
          globalThis.innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath("estadisticas-cotizaciones.png"),
    });

    await admin.query(
      `
      INSERT INTO finance.fx_reference_rates(base_currency, quote_currency, observed_on, source, rate)
      VALUES ('EUR','USD',$1,'datosuruguay',1.9) ON CONFLICT DO NOTHING`,
      [sunday],
    );
    await page.reload();
    await expect(metrics.getByRole("row", { name: /^Gastos/ })).toContainText(
      "12,50 USD",
    );
    const revised = await context.request.patch("/api/movements", {
      headers: { origin: financeTestOrigin },
      data: {
        action: "edit",
        eventId: expense.id,
        idempotencyKey: randomUUID(),
        movement: {
          kind: "expense",
          method: "debit",
          currency: "EUR",
          amount: "10",
          effectiveOn: monday,
          concept: "Gasto sintético del lunes",
        },
      },
    });
    expect(revised.ok(), await revised.text()).toBe(true);
    await page.reload();
    await expect(metrics.getByRole("row", { name: /^Gastos/ })).toContainText(
      "15,00 USD",
    );

    // UI-02: el selector global vive en la barra superior (segmentado).
    await page.goto(`/resumen?month=${monday.slice(0, 7)}`);
    await expect(page.getByRole("list", { name: "Gastos del mes" })).toHaveText(
      "10,00 EUR",
    );
    const categories = page.getByRole("region", {
      name: "Gastos por categoría",
    });
    await expect(categories).toContainText("15,00 USD");
    const flow = page.getByRole("region", {
      name: "Evolución de los últimos seis meses",
    });
    await flow.getByText("Ver como tabla", { exact: true }).click();
    await expect(flow.getByRole("row").last()).toContainText("15,00 USD");
    await flow.getByText("Ver como tabla", { exact: true }).click();
    const selector = page.getByRole("group", {
      name: "Moneda de visualización",
    });
    await expect(
      selector.getByRole("button", { name: "USD", pressed: true }),
    ).toBeVisible();
    await selector.getByRole("button", { name: "EUR" }).click();
    await expect(
      selector.getByRole("button", { name: "EUR", pressed: true }),
    ).toBeVisible();
    await expect(
      selector.getByRole("button", { name: "USD", pressed: false }),
    ).toBeVisible();
    await expect(categories).toContainText("10,00 EUR");
    await page.screenshot({ path: testInfo.outputPath("resumen-moneda.png") });

    const saved = await second.newPage();
    const isolated = await other.newPage();
    await saved.goto("/estadisticas");
    await expect(
      saved.getByRole("combobox", { name: "Moneda de visualización" }),
    ).toHaveValue("EUR");
    await expect(
      saved
        .getByRole("group", { name: "Moneda de visualización" })
        .getByRole("button", { name: "EUR", pressed: true }),
    ).toBeVisible();
    await isolated.goto("/resumen");
    await expect(
      isolated
        .getByRole("group", { name: "Moneda de visualización" })
        .getByRole("button", { name: "USD", pressed: true }),
    ).toBeVisible();
    expect(
      (await post(request, "display-currency", { currency: "UYU" })).status(),
    ).toBe(401);
    expect(
      (
        await post(context.request, "display-currency", {
          currency: "UYU",
          ownerId: owners.b,
        })
      ).status(),
    ).toBe(400);
    expect(
      (
        await post(
          context.request,
          "display-currency",
          { currency: "UYU" },
          "https://invalid.example",
        )
      ).status(),
    ).toBe(403);

    const data = await admin.query(
      `
      SELECT count(*)::int AS effects, sum(amount_signed) = -10 AS exact FROM finance.bank_effects
      WHERE owner_id=$1 AND event_id=$2`,
      [owners.a, expense.id],
    );
    expect(data.rows[0]).toEqual({ effects: 1, exact: true });
  } finally {
    await admin.end();
    await second.close();
    await other.close();
  }
});

test("F5-06: sin cotización histórica, tasa manual reproducible y aislada", async ({
  page,
  context,
  browser,
}) => {
  const { cookies, owners } = await financeBrowserFixtures();
  await context.addCookies([cookies.a1]);
  const second = await browser.newContext({ baseURL: financeTestOrigin });
  await second.addCookies([cookies.a2]);
  const admin = new pg.Client(testDatabaseConfig());
  await admin.connect();
  try {
    await admin.query(`
      INSERT INTO finance.fx_reference_refreshes(year, retry_at)
      VALUES (2000, now() + interval '1 hour') ON CONFLICT DO NOTHING;
      INSERT INTO finance.fx_reference_rates(base_currency, quote_currency, observed_on, source, rate)
      VALUES ('UYU','EUR','2000-01-03','datosuruguay',0.02) ON CONFLICT DO NOTHING`);
    const post = (path, data) =>
      context.request.post(`/api/${path}`, {
        data,
        headers: { origin: financeTestOrigin },
      });
    const expense = await post("movements", {
      kind: "expense",
      method: "debit",
      currency: "UYU",
      amount: "100",
      effectiveOn: "2000-01-02",
      concept: "Gasto sintético sin cotización",
      idempotencyKey: randomUUID(),
    });
    expect(expense.status(), await expense.text()).toBe(201);

    const display = await post("display-currency", { currency: "EUR" });
    expect(display.status()).toBe(200);
    await page.goto("/resumen?month=2000-01");
    await expect(page.getByRole("list", { name: "Gastos del mes" })).toHaveText(
      "100,00 UYU",
    );
    await expect(
      page.getByRole("region", { name: "Gastos por categoría" }),
    ).toContainText(
      "Faltan cotizaciones para mostrar todos los gastos del mes.",
    );

    await page.goto(
      "/estadisticas?from=2000-01-02&to=2000-01-02&display=EUR&category=none",
    );
    await expect(
      page.getByText(/Faltan cotizaciones para consolidar el flujo/),
    ).toBeVisible();
    await expect(
      page.getByRole("table", { name: "Indicadores en EUR" }),
    ).toHaveCount(0);
    await page.getByText("Ingresar una tasa manual", { exact: true }).click();
    await page
      .getByLabel("Fecha efectiva y par de monedas")
      .selectOption("2000-01-02/UYU");
    await page
      .getByLabel("Tasa manual en EUR por unidad de origen")
      .fill("0,025");
    await page.getByRole("button", { name: "Guardar tasa" }).click();
    await expect(
      page
        .getByRole("table", { name: "Indicadores en EUR" })
        .getByRole("row", { name: /^Gastos/ }),
    ).toContainText("2,50 EUR");
    await expect(
      page.getByRole("link", { name: "Gasto sintético sin cotización" }),
    ).toContainText("Tasa manual");

    const same = {
      date: "2000-01-02",
      base: "UYU",
      target: "EUR",
      rate: "0.025",
    };
    const responses = await Promise.all([
      second.request.post("/api/manual-exchange-rate", {
        data: same,
        headers: { origin: financeTestOrigin },
      }),
      post("manual-exchange-rate", { ...same, rate: "0.5" }),
    ]);
    expect(responses.map((response) => response.status())).toEqual([200, 409]);
    const { rows } = await admin.query(
      "SELECT owner_id, source, manual_rate::text FROM finance.fx_valuations WHERE owner_id = ANY($1) AND source = 'manual'",
      [[owners.a, owners.b]],
    );
    expect(rows).toEqual([
      { owner_id: owners.a, source: "manual", manual_rate: "0.025" },
    ]);
  } finally {
    await admin.end();
    await second.close();
  }
});
