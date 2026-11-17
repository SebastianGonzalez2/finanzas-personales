import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import pg from "pg";
import {
  bankReferenceToday,
  formatBankReference,
} from "../../src/domain/bank-balances.ts";
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
      "1250",
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
    const figure = card.getByRole("figure", { name: "Serie anual en UYU" });
    const readout = figure.locator(".gs-annual__readout");
    const point = (label) =>
      card.getByRole("button", { name: label, exact: true });
    const cutoff = formatBankReference(today);
    await expect(point(`${year - 4} · 310,0123 UYU`)).toBeVisible();
    await expect(point(`${year - 3} · Sin registros`)).toBeVisible();
    await expect(point(`${year - 2} · 0,00 UYU · Sin gastos`)).toBeVisible();
    await expect(point(`${year - 1} · 370,00 UYU`)).toBeVisible();
    const current = `${year} · 105,00 UYU · Año parcial al ${cutoff}`;
    await expect(point(current)).toBeVisible();
    await expect(readout).toContainText(`Parcial al ${cutoff}`);
    await expect(figure.locator(".gs-annual__scale")).toHaveText(
      "UYU4003002001000",
    );
    const pathSegments = (
      await figure.locator("svg path").getAttribute("d")
    ).match(/[ML]/g);
    expect(pathSegments).toEqual(["M", "M", "L", "L"]);
    await expect(
      point(`${year - 3} · Sin registros`).locator(".gs-annual__dot"),
    ).toHaveCount(0);
    await expect(
      point(`${year - 2} · 0,00 UYU · Sin gastos`).locator(".gs-annual__dot"),
    ).toHaveAttribute("style", /top:\s*100%/);
    await expect(figure).toMatchAriaSnapshot(`
      - figure "Serie anual en UYU":
        - button "${year - 4} · 310,0123 UYU"
        - button "${year - 3} · Sin registros"
        - button "${year - 2} · 0,00 UYU · Sin gastos"
        - button "${year - 1} · 370,00 UYU"
        - button "${current}"
    `);
    // Tab to a point from the preceding year, then verify the visible readout.
    await point(`${year - 2} · 0,00 UYU · Sin gastos`).focus();
    await page.keyboard.press("Tab");
    await expect(point(`${year - 1} · 370,00 UYU`)).toBeFocused();
    await expect(readout).toContainText("370,00 UYU");
    await expect(point(`${year - 1} · 370,00 UYU`)).toHaveCSS(
      "outline-style",
      "none",
    );
    await expect(
      point(`${year - 1} · 370,00 UYU`).locator(".gs-annual__dot"),
    ).toHaveCSS("outline-style", "solid");
    if (testInfo.project.name === "chromium-mobile") {
      await point(current).tap();
      await expect(readout).toContainText("105,00 UYU");
    } else {
      await point(current).hover();
      await expect(readout).toContainText("105,00 UYU");
      await point(current).focus();
    }
    // Center the card above the fixed navigation before capturing its footer.
    await card.evaluate((element) =>
      element.scrollIntoView({ block: "center" }),
    );
    await card.screenshot({
      path: testInfo.outputPath("evolucion-anual.jpg"),
      quality: 88,
    });
    await point(current).focus();
    await page.keyboard.press("Tab");
    const tableToggle = figure.getByText("Ver datos", { exact: true });
    await expect(tableToggle).toBeFocused();
    await page.keyboard.press("Enter");
    const table = figure.getByRole("table", { name: "Gastos anuales en UYU" });
    await expect(table).toBeVisible();
    await expect(
      table.getByRole("row", {
        name: `${year} 105,00 UYU Año parcial al ${cutoff}`,
      }),
    ).toBeVisible();
    await expect(
      table.getByRole("row", { name: `${year - 3} — Sin registros` }),
    ).toBeVisible();
    await expect(
      table.getByRole("row", { name: `${year - 2} 0,00 UYU Sin gastos` }),
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
    await point(`${year - 4} · Falta cotización`).focus();
    await expect(readout).toContainText("Importe incompleto");
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
      otherCard.getByRole("button", { name: `${year - 3} · 1.250,00 UYU` }),
    ).toBeVisible();
    await expect(
      otherCard.getByRole("button", { name: `${year - 4} · Sin registros` }),
    ).toBeVisible();
    await expect(otherCard.getByText(/^1,5\s+mil$/)).toBeVisible();
    await otherPage.goto("/resumen");
    await expect(otherCard).toHaveCount(0);
  } finally {
    await isolated.close();
    await admin.end();
  }
});
