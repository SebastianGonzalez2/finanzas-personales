import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { bankReferenceToday } from "../../src/domain/bank-balances.ts";
import { installmentPeriodAt } from "../../src/domain/installments.ts";
import { summaryPeriods } from "../../src/domain/summary-period.ts";
import {
  financeBrowserFixtures,
  financeTestOrigin,
} from "../support/finance-browser.mjs";

test.use({ launchOptions: { ignoreDefaultArgs: ["--hide-scrollbars"] } });

async function expectApprovedSummary(page) {
  await expect(
    page.getByRole("heading", {
      name: /Saldo disponible equivalente|Flujo registrado ·|Cambios de moneda recientes/,
    }),
  ).toHaveCount(0);
  await expect(
    page.getByText("Saldo bancario registrado", { exact: false }),
  ).toHaveCount(0);
  await expect(
    page.getByText("Cotizaciones del flujo", { exact: true }),
  ).toHaveCount(0);
}

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
      amount: "5100",
      effectiveOn: today,
      concept: "Compra Visa UI-03",
      covered: false,
      categoryId,
      plan: { installmentAmount: "2550", count: 2, firstPeriod: current },
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
    await expectApprovedSummary(page);
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

    await expect(
      page.getByRole("list", { name: "Cuotas del mes" }),
    ).toContainText("Compra Visa UI-03");

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
    // HOTFIX: el vidrio aprobado sobrevive a la minificación en Chromium.
    for (const surface of [
      panel("Gastos del mes"),
      panel("Flujo de los últimos seis meses"),
      page.locator(
        testInfo.project.name === "chromium-mobile"
          ? ".finance-dock"
          : ".finance-sidebar",
      ),
    ])
      expect(
        await surface.evaluate(
          (element) => globalThis.getComputedStyle(element).backdropFilter,
        ),
      ).toMatch(/blur\(\d+px\)/);
    await flow.getByText("Ver como tabla", { exact: true }).click();
    await heading("Resumen financiero").focus();
    await page.screenshot({
      path: testInfo.outputPath("resumen-glaciar.jpg"),
      fullPage: true,
      quality: 87,
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

    await usd.press("ArrowRight");
    const eur = accountTabs.getByRole("tab", { name: "EUR" });
    await expect(eur).toBeFocused();
    await expect(eur).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("tabpanel", { name: "EUR" })).toContainText(
      "Saldo bancario 490,00 EUR",
    );

    // Simula que el navegador difiere el foco inicial hasta después de que
    // el usuario entra a un campo. El formulario debe respetar ese foco.
    const register = page
      .getByRole("banner")
      .getByRole("link", { name: "Registrar movimiento" });
    const delayedFocus = await register.evaluateHandle((link) => {
      link.focus();
      const callbacks = [];
      const requestFrame = globalThis.requestAnimationFrame;
      globalThis.requestAnimationFrame = (callback) => callbacks.push(callback);
      try {
        link.click();
      } finally {
        globalThis.requestAnimationFrame = requestFrame;
      }
      return () => {
        callbacks.forEach((callback) => callback(globalThis.performance.now()));
        return callbacks.length;
      };
    });
    const concept = page
      .getByRole("form", { name: "Nueva transacción" })
      .getByLabel("Concepto", { exact: true });
    await concept.fill("Borrador de prueba");
    expect(await delayedFocus.evaluate((run) => run())).toBeGreaterThan(0);
    await delayedFocus.dispose();
    await expect(concept).toBeFocused();
    await page.getByRole("button", { name: "Cancelar", exact: true }).click();

    const recent = panel("Movimientos recientes");
    const transferRow = recent.getByRole("listitem").filter({
      has: page.locator(`a[href="/historial/movimientos/${transfer.id}"]`),
    });
    await expect(transferRow).toBeVisible();
    await expect(transferRow.getByLabel(/^Más acciones de/)).toHaveCount(0);
    const conceptLink = recent.getByRole("link", {
      name: "Compra sintética UI-03",
      exact: true,
    });
    const originalDetail = await conceptLink.getAttribute("href");
    const menu = recent.getByLabel("Más acciones de Compra sintética UI-03");
    const correct = recent.getByRole("button", {
      name: "Corregir importe",
      exact: true,
    });
    await expect(correct).toHaveCount(0);
    await menu.focus();
    await page.keyboard.press("Enter");
    await page.keyboard.press("Tab");
    await expect(correct).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(correct).toHaveCount(0);
    await expect(menu).toBeFocused();

    await menu.click();
    await expect(correct).toBeVisible();
    const menuCapture = {
      path: testInfo.outputPath("menu-movimiento.jpg"),
      quality: 87,
    };
    if (width === 375) {
      await recent.evaluate((panel) =>
        panel.scrollIntoView({ block: "start" }),
      );
      await page.screenshot(menuCapture);
    } else {
      await recent.screenshot(menuCapture);
    }
    await recent
      .getByRole("heading", { name: "Movimientos recientes" })
      .click();
    await expect(correct).toHaveCount(0);
    await expect(menu).toBeFocused();

    await menu.press("Enter");
    await correct.press("Enter");
    const editor = recent.getByRole("form", {
      name: "Corregir importe de Compra sintética UI-03",
    });
    const amount = editor.getByLabel("Importe correcto");
    await expect(amount).toBeFocused();
    await expect(amount).toHaveValue("18250,0000");
    await amount.fill("importe inválido");
    await editor.getByRole("button", { name: "Guardar corrección" }).click();
    await expect(editor.getByRole("alert")).toContainText(/importe|monto/i);
    await editor.getByRole("button", { name: "Cancelar" }).click();
    await expect(editor).toHaveCount(0);
    await expect(menu).toBeFocused();

    await menu.press("Enter");
    await correct.press("Enter");
    await amount.fill("18251");
    expect(
      await page.evaluate(
        () => globalThis.document.documentElement.scrollWidth,
      ),
    ).toBeLessThanOrEqual(width);
    const correction = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/movements") &&
        response.request().method() === "PATCH",
    );
    await editor.getByRole("button", { name: "Guardar corrección" }).click();
    const corrected = await correction;
    expect(corrected.status(), await corrected.text()).toBe(200);
    const { id: replacement } = await corrected.json();
    await expect(conceptLink).toHaveAttribute(
      "href",
      `/historial/movimientos/${replacement}`,
    );
    await expect(conceptLink).not.toHaveAttribute("href", originalDetail);
    await expect(
      recent.getByRole("listitem").filter({
        has: page.locator(`a[href="/historial/movimientos/${replacement}"]`),
      }),
    ).toContainText("18.251,00 UYU");

    await page.getByRole("link", { name: "Mes anterior" }).click();
    await expect(page).toHaveURL(new RegExp(`month=${previous}`));

    await page.goto("/historial?kind=bank_transfer");
    const recordedTransfer = page.locator(
      `a[href^="/historial/movimientos/${transfer.id}"]`,
    );
    await expect(recordedTransfer).toBeVisible();
    await recordedTransfer.click();
    await expect(page.getByRole("main")).toContainText("150,00 EUR");
    await expect(page.getByRole("main")).toContainText("6.450,00 UYU");

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

    expect(errors).toEqual([]);
  } finally {
    await other.close();
  }
});

test("OPS: Resumen con un gasto y sin otros movimientos", async ({
  page,
  context,
}, testInfo) => {
  const { cookies } = await financeBrowserFixtures();
  await context.addCookies([cookies.a1]);
  const today = bankReferenceToday();
  const width = testInfo.project.name === "chromium-mobile" ? 375 : 1440;
  await page.setViewportSize({ width, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const record = (path, data) =>
    context.request.post(`/api/${path}`, {
      data,
      headers: { origin: financeTestOrigin },
    });
  const opening = await record("bank-balances", {
    currency: "UYU",
    amount: "1000",
    asOfDate: today,
  });
  expect(opening.status(), await opening.text()).toBe(201);
  const expense = await record("movements", {
    idempotencyKey: randomUUID(),
    kind: "expense",
    method: "debit",
    currency: "UYU",
    amount: "1000",
    effectiveOn: today,
    concept: "Único gasto de prueba",
  });
  expect(expense.status(), await expense.text()).toBe(201);
  await page.goto("/resumen#titulo-pagina");
  await expectApprovedSummary(page);
  await expect(
    page.getByRole("list", { name: "Ingresos del mes" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("region", { name: "Tarjetas de crédito" }),
  ).toContainText(/sin tarjetas|todavía no hay tarjetas/i);
  await expect(
    page.getByRole("region", { name: "Fondos de ahorro" }),
  ).toContainText(/sin fondos|todavía no hay fondos/i);
  await expect(page.getByRole("list", { name: "Gastos del mes" })).toHaveText(
    "1.000,00 UYU",
  );
  await expect(
    page.getByRole("link", { name: "Único gasto de prueba", exact: true }),
  ).toBeVisible();
  await page.getByRole("heading", { level: 1 }).focus();
  await page.screenshot({
    path: testInfo.outputPath("resumen-cuenta-casi-vacia.jpg"),
    fullPage: true,
    quality: 87,
  });

  // Sacá el puntero del viewport para medir el color en reposo.
  await page.mouse.move(-1, -1);
  const scrollBar = await page.evaluate(() => {
    const root = globalThis.document.documentElement;
    return {
      width: globalThis.getComputedStyle(root, "::-webkit-scrollbar").width,
      track: globalThis.getComputedStyle(root, "::-webkit-scrollbar-track")
        .backgroundColor,
      thumb: globalThis.getComputedStyle(root, "::-webkit-scrollbar-thumb")
        .backgroundColor,
    };
  });
  expect(scrollBar).toEqual({
    width: "9px",
    track: "rgb(7, 10, 13)",
    thumb: "rgb(104, 115, 127)",
  });
  await page.keyboard.press("End");
  await expect
    .poll(() => page.evaluate(() => globalThis.scrollY))
    .toBeGreaterThan(0);

  const navigation = page.getByRole("navigation", {
    name: width === 375 ? "Accesos rápidos" : "Navegación principal",
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  for (const name of ["Historial", "Estadísticas", "Resumen"]) {
    const link = navigation.getByRole("link", { name, exact: true });
    await link.focus();
    await expect(link).toHaveCSS("outline-style", "solid");
    await page.keyboard.press("Enter");
    await page.waitForLoadState("load");
    const title = page.getByRole("heading", {
      level: 1,
      name: name === "Resumen" ? "Resumen financiero" : name,
      exact: true,
    });
    await expect(title).toBeFocused();
    await expect(title).toHaveCSS("outline-style", "none");
    await expect(title).toHaveCSS("text-decoration-line", "underline");
  }
  expect(errors).toEqual([]);
});
