/* global document, getComputedStyle, window */
import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { bankReferenceToday } from "../../src/domain/bank-balances.ts";
import {
  financeBrowserFixtures,
  financeTestOrigin,
} from "../support/finance-browser.mjs";

// UI-04: Historial Glaciar con la búsqueda real del servidor. Datos
// sintéticos en la base PostgreSQL desechable; nunca datos reales.

function daysBefore(iso, days) {
  const date = new Date(`${iso}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

async function seed(request) {
  const today = bankReferenceToday();
  const send = async (path, data) => {
    const response = await request.post(path, {
      headers: { origin: financeTestOrigin },
      data,
    });
    expect(response.status(), `${path}: ${await response.text()}`).toBe(201);
    return response.json();
  };
  for (const currency of ["UYU", "USD"])
    await send("/api/bank-balances", {
      currency,
      amount: "10000",
      asOfDate: daysBefore(today, 6),
    });
  const movement = (data) =>
    send("/api/movements", { idempotencyKey: randomUUID(), ...data });
  await movement({
    kind: "income",
    method: "deposit",
    currency: "UYU",
    amount: "5000",
    effectiveOn: daysBefore(today, 5),
    concept: "Sueldo sintético UI-04",
  });
  await movement({
    kind: "expense",
    method: "debit",
    currency: "UYU",
    amount: "250.50",
    effectiveOn: daysBefore(today, 3),
    concept: "Café sintético UI-04",
  });
  await movement({
    kind: "expense",
    method: "debit",
    currency: "USD",
    amount: "30",
    effectiveOn: daysBefore(today, 2),
    concept: "Suscripción sintética UI-04",
  });
  await movement({
    kind: "bank_transfer",
    sourceCurrency: "UYU",
    sourceAmount: "4000",
    destinationCurrency: "USD",
    destinationAmount: "100",
    effectiveOn: daysBefore(today, 1),
  });
}

const rowTitles = (page) =>
  page.locator(".lab-table tbody .lab-td-concept__title").allTextContents();

test("UI-04: buscador, filtros, chips, orden y filtros guardados con datos reales", async ({
  page,
  context,
  browser,
}) => {
  const { cookies } = await financeBrowserFixtures();
  await context.addCookies([cookies.a1]);
  await seed(page.request);

  await page.goto("/historial");
  await expect(page.getByRole("heading", { name: "Historial" })).toBeVisible();
  const table = page.getByRole("table");
  // Orden del servidor: fecha descendente (saldos iniciales al final).
  expect((await rowTitles(page)).slice(0, 4)).toEqual([
    "Cambio de moneda",
    "Suscripción sintética UI-04",
    "Café sintético UI-04",
    "Sueldo sintético UI-04",
  ]);
  await expect(
    table.getByRole("columnheader", { name: "Fecha" }),
  ).toHaveAttribute("aria-sort", "descending");
  // Iconografía, signo y moneda original; el cambio muestra lo recibido.
  const row = (concept) => table.getByRole("row").filter({ hasText: concept });
  await expect(row("Sueldo sintético")).toContainText("+5.000,00 UYU");
  await expect(row("Café sintético")).toContainText("−250,50 UYU");
  await expect(row("Suscripción sintética")).toContainText("−30,00 USD");
  await expect(row("Cambio de moneda")).toContainText("+100,00 USD");
  await expect(row("Cambio de moneda")).toContainText("4.000,00 UYU");
  await expect(row("Café sintético")).toContainText("Confirmado");
  await expect(row("Café sintético")).toContainText("Débito bancario");

  // Orden por importe (solo esta página, exacto con decimales).
  const amount = table.getByRole("button", { name: "Importe" });
  await amount.click();
  await expect(
    table.getByRole("columnheader", { name: "Importe" }),
  ).toHaveAttribute("aria-sort", "descending");
  await expect(
    table.getByRole("columnheader", { name: "Fecha" }),
  ).toHaveAttribute("aria-sort", "none");
  expect((await rowTitles(page)).slice(0, 2)).toEqual([
    "Saldo inicial",
    "Saldo inicial",
  ]);
  await amount.click();
  await expect(
    table.getByRole("columnheader", { name: "Importe" }),
  ).toHaveAttribute("aria-sort", "ascending");
  expect((await rowTitles(page))[0]).toBe("Suscripción sintética UI-04");
  await table.getByRole("button", { name: "Fecha" }).click();
  expect((await rowTitles(page))[0]).toBe("Cambio de moneda");

  // Búsqueda real en el servidor con Enter; el foco vuelve al buscador.
  const search = page.getByRole("searchbox", { name: "Buscar texto" });
  await search.fill("Café");
  await search.press("Enter");
  await expect(page).toHaveURL(/q=Caf/);
  await expect(search).toBeFocused();
  await expect.poll(() => rowTitles(page)).toEqual(["Café sintético UI-04"]);
  const chips = page.getByRole("list", { name: "Filtros activos" });
  await expect(chips).toContainText("Texto: «Café»");

  // Desplegable principal: aplica al cambiar y conserva la búsqueda.
  await page
    .getByRole("combobox", { name: "Tipo", exact: true })
    .selectOption("expense");
  await expect(page).toHaveURL(/kind=expense/);
  await expect(page).toHaveURL(/q=Caf/);
  await expect(chips).toContainText("Tipo: Gasto");

  // Quitar un chip conserva los demás filtros y lleva el foco a resultados.
  await page
    .getByRole("button", { name: "Quitar filtro Texto: «Café»" })
    .click();
  await expect(page).not.toHaveURL(/q=/);
  await expect(page).toHaveURL(/kind=expense/);
  await expect(
    page.getByRole("heading", { name: "Movimientos", exact: true }),
  ).toBeFocused();
  await expect
    .poll(() => rowTitles(page))
    .toEqual(["Suscripción sintética UI-04", "Café sintético UI-04"]);

  await page
    .getByRole("combobox", { name: "Moneda", exact: true })
    .selectOption("USD");
  await expect(page).toHaveURL(/currency=USD/);
  await expect
    .poll(() => rowTitles(page))
    .toEqual(["Suscripción sintética UI-04"]);

  // Filtro guardado: se crea, aparece en la barra y se aplica después.
  await page
    .getByLabel("Guardar la búsqueda actual como")
    .fill("Gastos en dólares");
  await page.getByRole("button", { name: "Guardar filtro" }).click();
  await expect(page.getByText("Filtro guardado.")).toBeVisible();
  const savedSelect = page.getByRole("combobox", {
    name: "Filtros guardados",
  });
  await expect(savedSelect.locator("option:checked")).toHaveText(
    "Gastos en dólares",
  );
  await page.getByRole("link", { name: "Limpiar todo" }).click();
  await expect(page).toHaveURL(/\/historial$/);
  await expect(savedSelect.locator("option:checked")).toHaveText("Ninguno");
  await savedSelect.selectOption({ label: "Gastos en dólares" });
  await expect(page).toHaveURL(/currency=USD/);
  await expect(page).toHaveURL(/kind=expense/);
  await expect(savedSelect).toBeFocused();
  await expect
    .poll(() => rowTitles(page))
    .toEqual(["Suscripción sintética UI-04"]);

  // Período relativo: se resuelve en la consulta y se informa en el resumen.
  await page
    .getByRole("combobox", { name: "Período", exact: true })
    .selectOption("ultimos-3-meses");
  await expect(page).toHaveURL(/period=ultimos-3-meses/);
  await expect(page.getByText(/· Últimos 3 meses/)).toBeVisible();

  // Sin resultados: estado vacío del diseño con salida a todos los filtros.
  await page.goto("/historial?q=inexistente-ui04");
  await expect(
    page.getByText("No hay movimientos con estos filtros"),
  ).toBeVisible();
  await page.getByRole("link", { name: "Limpiar filtros" }).click();
  await expect(page).toHaveURL(/\/historial$/);

  // Aislamiento por titular: otra cuenta no ve ni filtra estos registros.
  const other = await browser.newContext({ baseURL: financeTestOrigin });
  try {
    await other.addCookies([cookies.b]);
    const otherPage = await other.newPage();
    await otherPage.goto("/historial?q=sint%C3%A9tico");
    await expect(
      otherPage.getByText("No hay movimientos con estos filtros"),
    ).toBeVisible();
    await expect(otherPage.getByText("Café sintético UI-04")).toHaveCount(0);
    await expect(
      otherPage.getByRole("combobox", { name: "Filtros guardados" }),
    ).toHaveCount(0);
  } finally {
    await other.close();
  }
});

test("UI-04: en 375 px las filas se apilan sin desborde y todo se opera con teclado", async ({
  page,
  context,
}) => {
  const { cookies } = await financeBrowserFixtures();
  await context.addCookies([cookies.a1]);
  await seed(page.request);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/historial");

  const layout = await page.evaluate(() => {
    const row = document.querySelector(".lab-table tbody tr");
    return {
      overflow: document.documentElement.scrollWidth - window.innerWidth,
      rowDisplay: row && getComputedStyle(row).display,
      // Encabezados sin orden: ocultos como en el prototipo.
      hiddenHeaders: [
        ...document.querySelectorAll(".lab-table thead th:not([aria-sort])"),
      ].map((th) => th.getBoundingClientRect().width),
      tableOverflow: [...document.querySelectorAll(".lab-table-wrap")].map(
        (wrap) => wrap.scrollWidth - wrap.clientWidth,
      ),
    };
  });
  expect(layout.overflow).toBeLessThanOrEqual(0);
  expect(layout.rowDisplay).toBe("grid");
  expect(layout.hiddenHeaders.every((width) => width <= 1)).toBe(true);
  expect(layout.tableOverflow.every((value) => value <= 0)).toBe(true);
  // Orden visible y operable en móvil.
  const amountSort = page.getByRole("button", { name: "Importe" });
  await expect(amountSort).toBeVisible();
  await amountSort.click();
  await expect(
    page.getByRole("columnheader", { name: "Importe" }),
  ).toHaveAttribute("aria-sort", "descending");
  await page.getByRole("button", { name: "Fecha" }).click();
  const cafe = page.getByRole("row").filter({ hasText: "Café sintético" });
  await expect(cafe.getByText("−250,50 UYU")).toBeVisible();
  await expect(cafe.getByText("Confirmado")).toBeVisible();

  // Más filtros por teclado.
  const more = page.getByRole("button", { name: /Más filtros/ });
  await more.focus();
  await page.keyboard.press("Enter");
  await expect(more).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByLabel("Estado", { exact: true })).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(more).toHaveAttribute("aria-expanded", "false");

  // Selección por teclado y barra de clasificación masiva.
  const check = page.getByRole("checkbox", {
    name: "Seleccionar Café sintético UI-04",
  });
  await check.focus();
  await page.keyboard.press("Space");
  await expect(check).toBeChecked();
  await expect(
    page.getByText("1 registro seleccionado en esta página."),
  ).toBeVisible();
  await expect(page.getByLabel("Categoría o etiqueta")).toBeVisible();
  await page.getByRole("button", { name: "Quitar selección" }).click();
  await expect(check).not.toBeChecked();

  // El detalle existente sigue enlazado desde el concepto.
  await page.getByRole("link", { name: "Café sintético UI-04" }).click();
  await expect(page).toHaveURL(/\/historial\/movimientos\//);
});
