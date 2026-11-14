import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { bankReferenceToday } from "../../src/domain/bank-balances.ts";
import { installmentPeriodAt } from "../../src/domain/installments.ts";
import { summaryPeriods } from "../../src/domain/summary-period.ts";
import {
  financeBrowserFixtures,
  financeTestOrigin,
} from "../support/finance-browser.mjs";

test("UI-03: saldos por moneda, flujo accesible y widgets aislados por titular", async ({
  page,
  context,
  browser,
}, testInfo) => {
  const { cookies } = await financeBrowserFixtures();
  const errors = [];
  page.on("pageerror", (error) =>
    errors.push(`${page.url()}: ${error.message}`),
  );
  await context.addCookies([cookies.a1]);
  const other = await browser.newContext({
    baseURL: financeTestOrigin,
    storageState: testInfo.project.use.storageState,
  });
  await other.addCookies([cookies.b]);
  const today = bankReferenceToday();
  const current = today.slice(0, 7);
  const previous = installmentPeriodAt(current, -1);
  const first = installmentPeriodAt(current, -5);
  const heading = (name) => page.getByRole("heading", { name, exact: true });
  const panel = (name) => page.getByRole("region", { name });
  const expenseCategory = "Supermercado UI-03";
  const fees = "Visa UI-03";
  const fundName = "Vacaciones UI-03";
  async function record(path, data, status = 201) {
    const response = await context.request.post(`/api/${path}`, {
      data:
        path === "categories" || path === "display-currency"
          ? data
          : { idempotencyKey: randomUUID(), ...data },
      headers: { origin: financeTestOrigin },
    });
    expect(response.status(), await response.text()).toBe(status);
    return response.json();
  }
  try {
    await record("display-currency", { currency: "UYU" }, 200);
    // La apertura inicial conserva el contrato original sin clave.
    for (const [currency, amount] of [
      ["UYU", "185000"],
      ["USD", "3215.40"],
      ["EUR", "640"],
    ]) {
      const opened = await context.request.post("/api/bank-balances", {
        data: { currency, amount, asOfDate: `${first}-01` },
        headers: { origin: financeTestOrigin },
      });
      expect(opened.status(), await opened.text()).toBe(201);
    }
    const { id: categoryId } = await record("categories", {
      kind: "expense",
      name: expenseCategory,
    });
    await record("budgets", {
      action: "save",
      categoryId,
      currency: "UYU",
      amount: "22000",
    });
    for (const [name, amount] of [
      ["Vivienda UI-03", "32000"],
      ["Servicios UI-03", "7152"],
      ["Restaurantes UI-03", "6980"],
      ["Ocio UI-03", "4720"],
    ]) {
      const category = await record("categories", { kind: "expense", name });
      for (const period of [previous, current]) {
        await record("movements", {
          kind: "expense",
          method: "debit",
          amount: period === current ? amount : "5000",
          concept: name,
          categoryId: category.id,
          currency: "UYU",
          effectiveOn: `${period}-01`,
        });
      }
    }
    for (let index = 0; index < 6; index += 1) {
      const period = installmentPeriodAt(first, index);
      const effectiveOn = `${period}-01`;
      for (const kind of ["income", "expense"]) {
        const currentExpense = index === 5 && kind === "expense";
        await record("movements", {
          kind,
          method: kind === "income" ? "deposit" : "debit",
          effectiveOn,
          currency: "UYU",
          amount:
            kind === "income"
              ? String(125000 + index * 3500)
              : String(9000 + index * 1850),
          concept: currentExpense
            ? "Compra sintética UI-03"
            : `${kind === "income" ? "Sueldo" : "Compras"} ${period}`,
          ...(kind === "expense" ? { categoryId } : {}),
        });
      }
    }
    const { id: fundId } = await record("funds", {
      action: "create",
      name: fundName,
      currency: "UYU",
    });
    await record(
      "funds",
      {
        action: "update",
        version: 1,
        fundId,
        name: fundName,
        targetAmount: "20000",
      },
      200,
    );
    await record(
      "funds",
      { action: "reserve", version: 2, fundId, amount: "12000" },
      200,
    );
    const { id: cardId } = await record("cards", {
      action: "create",
      kind: "credit",
      name: fees,
      currencies: [{ currency: "UYU" }, { currency: "USD" }],
    });
    await record("cards/operations", {
      action: "purchase",
      cardId,
      currency: "UYU",
      amount: "2550",
      effectiveOn: today,
      concept: "Compra Visa UI-03",
      covered: false,
      categoryId,
    });
    await record("cards/cycles", {
      scope: "schedule",
      cardId,
      version: 0,
      closingDay: 31,
      dueDay: 31,
      leadDays: 3,
    });
    await record("cards/cycles", {
      scope: "statement",
      cardId,
      version: 0,
      period: current,
      currency: "UYU",
      officialAmount: "2550",
      minimumAmount: "",
      dueOn: today,
    });
    await record("recurrences", {
      kind: "expense",
      concept: "Internet UI-03",
      currency: "UYU",
      referenceAmount: "1730",
      firstPeriod: today,
      frequency: "monthly",
      dateMode: "exact",
      dueDay: Number(today.slice(-2)),
    });
    const transfer = await record("movements", {
      kind: "bank_transfer",
      sourceCurrency: "EUR",
      sourceAmount: "150",
      destinationCurrency: "UYU",
      destinationAmount: "6450",
      effectiveOn: today,
    });

    const width = testInfo.project.name === "chromium-mobile" ? 375 : 1440;
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/resumen");
    await expect(heading("Resumen financiero")).toBeVisible();
    const accountTabs = page.getByRole("tablist", { name: "Moneda del saldo" });
    const uyu = accountTabs.getByRole("tab", { name: "UYU" });
    await expect(uyu).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("list", { name: "Gastos del mes" })).toHaveText(
      "71.652,00 UYU",
    );
    await expect(
      page.getByRole("list", { name: "Ingresos del mes" }),
    ).toHaveText("142.500,00 UYU");
    await expect(panel("Ingresos del mes").locator(".lab-delta")).toHaveCount(
      0,
    );
    await expect(panel("Gastos del mes").locator(".lab-delta")).toHaveCount(
      summaryPeriods(current, today).comparison ? 1 : 0,
    );
    await expect(panel("Gastos por categoría")).toContainText(expenseCategory);
    await expect(panel("Gastos por categoría")).toContainText("20.800,00 UYU");
    await expect(panel("Gastos por categoría")).toContainText("32.000,00 UYU");
    await expect(panel("Fondos de ahorro")).toContainText("60 %");
    await expect(panel("Presupuestos")).toContainText("Cerca");
    await expect(panel("Avisos")).toContainText("Aviso de presupuesto");
    await expect(
      panel("Tarjetas de crédito").getByRole("link", { name: fees }),
    ).toHaveAttribute("href", `/tarjetas/${cardId}/resumen?ciclo=${current}`);
    await expect(panel("Próximos pagos")).toContainText("Internet UI-03");
    await expect(
      panel("Próximos pagos").getByRole("link", { name: fees }),
    ).toHaveCount(1);
    await expect(panel("Movimientos recientes")).toContainText(
      "Compra sintética UI-03",
    );
    await expect(
      panel("Movimientos recientes").locator(
        `a[href="/historial/movimientos/${transfer.id}"]`,
      ),
    ).toBeVisible();

    const flow = panel("Flujo de los últimos seis meses");
    await flow.locator(".lab-hit").last().focus();
    await expect(flow.getByRole("status")).toContainText("70.848,00 UYU");
    await flow.getByText("Ver como tabla", { exact: true }).click();
    await expect(flow.getByRole("table").getByRole("row").last()).toContainText(
      "70.848,00 UYU",
    );
    expect(
      await page.evaluate(
        () => globalThis.document.documentElement.scrollWidth,
      ),
    ).toBeLessThanOrEqual(width);
    const animationSeconds = await page
      .locator(".b-hero")
      .evaluate((element) =>
        Number.parseFloat(
          globalThis.getComputedStyle(element).animationDuration,
        ),
      );
    expect(animationSeconds).toBeLessThan(0.001);
    await expect(page.locator(".finance-shell [data-ambient]")).toHaveCount(2);
    await flow.getByText("Ver como tabla", { exact: true }).click();
    await heading("Resumen financiero").focus();
    await page.screenshot({
      path: testInfo.outputPath("resumen-glaciar.png"),
      fullPage: true,
    });

    await uyu.focus();
    await page.keyboard.press("ArrowRight");
    const usd = accountTabs.getByRole("tab", { name: "USD" });
    await expect(usd).toBeFocused();
    await expect(usd).toHaveAttribute("aria-selected", "true");
    const usdPanel = page.getByRole("tabpanel", { name: "USD" });
    await expect(usdPanel).toContainText("Saldo bancario 3.215,40 USD");
    await expect(
      page
        .getByRole("group", { name: "Moneda de visualización" })
        .getByRole("button", { name: "UYU" }),
    ).toHaveAttribute("aria-pressed", "true");
    await usdPanel.getByRole("button", { name: "Cambio de moneda" }).click();
    await expect(page.getByLabel("Tipo de movimiento")).toHaveValue(
      "bank_transfer",
    );
    await page.getByRole("button", { name: "Cancelar", exact: true }).click();
    await expect(
      usdPanel.getByRole("button", { name: "Cambio de moneda" }),
    ).toBeFocused();
    await usdPanel
      .getByRole("button", { name: "Confirmar saldo real de Bancos USD" })
      .click();
    await expect(usdPanel.getByLabel("Saldo real (USD)")).toBeFocused();
    await usdPanel
      .getByRole("button", { name: "Cancelar", exact: true })
      .click();
    await page.getByRole("link", { name: "Mes anterior" }).click();
    await expect(page).toHaveURL(new RegExp(`month=${previous}`));

    const visitor = await other.newPage();
    await visitor.goto("/resumen");
    const main = visitor.getByRole("main");
    await expect(main).toContainText("Sin configurar");
    for (const privateText of [
      expenseCategory,
      fees,
      fundName,
      "Internet UI-03",
      "Compra sintética UI-03",
    ])
      await expect(main).not.toContainText(privateText);

    await page.goto("/prototipos/ui/final");
    await expect(heading("Resumen financiero")).toBeVisible();
    expect(
      await page.evaluate(
        () => globalThis.document.documentElement.scrollWidth,
      ),
    ).toBeLessThanOrEqual(width);
    await page.screenshot({
      path: testInfo.outputPath("prototipo-glaciar.png"),
      fullPage: true,
    });
    expect(errors).toEqual([]);
  } finally {
    await other.close();
  }
});
