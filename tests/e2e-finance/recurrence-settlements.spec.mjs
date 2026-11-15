import { randomUUID } from "node:crypto";
import { URLSearchParams } from "node:url";
import { expect, test } from "@playwright/test";
import { bankReferenceToday } from "../../src/domain/bank-balances.ts";
import {
  financeBrowserFixtures,
  financeTestOrigin,
} from "../support/finance-browser.mjs";

const path = "/api/recurrences/settlements";
const seriesPath = "/api/recurrences/series";
const post = (context, route, data, origin = financeTestOrigin) =>
  context.request.post(route, { data, headers: { origin } });

function monthBefore(today, offset) {
  const [year, month] = today.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1 - offset, 1))
    .toISOString()
    .slice(0, 10);
}

test.describe("Calendario de Montevideo", () => {
  test.use({ timezoneId: "America/Montevideo" });

  test("F4-06: pago tardío, reintento y cierre de una factura variable", async ({
    page,
    context,
    browser,
  }) => {
    const { cookies } = await financeBrowserFixtures();
    await context.addCookies([cookies.a1]);
    const today = bankReferenceToday();
    const firstPeriod = monthBefore(today, 1);
    const concept = "Factura variable sintética";
    expect(
      (
        await post(context, "/api/bank-balances", {
          currency: "UYU",
          amount: "1000",
          asOfDate: firstPeriod,
        })
      ).status(),
    ).toBe(201);
    const definition = await post(context, "/api/recurrences", {
      kind: "expense",
      concept,
      currency: "UYU",
      firstPeriod,
      endDate: firstPeriod,
      dateMode: "exact",
      dueDay: 1,
      referenceAmount: "300",
      idempotencyKey: randomUUID(),
    });
    expect(definition.status()).toBe(201);
    const { id } = await definition.json();
    const payment = {
      action: "record",
      seriesId: id,
      idempotencyKey: randomUUID(),
      method: "transfer",
      effectiveOn: today,
      amount: "125.50",
      targets: [{ index: 0, version: 0, recorded: "0", amount: "125.50" }],
    };
    const second = await browser.newContext({ baseURL: financeTestOrigin });
    try {
      await second.addCookies([cookies.a2]);
      const responses = await Promise.all([
        post(context, path, payment),
        post(second, path, payment),
      ]);
      expect(responses.map((response) => response.status()).sort()).toEqual([
        200, 201,
      ]);
      const [original, retry] = await Promise.all(
        responses.map((response) => response.json()),
      );
      expect(original.id).toBe(retry.id);
    } finally {
      await second.close();
    }

    await page.goto("/avisos");
    const notices = page.getByRole("region", { name: "Recurrentes" });
    const notice = notices.getByRole("listitem").filter({ hasText: concept });
    await expect(notice).toHaveCount(1);
    await expect(notice.getByRole("status")).toContainText("ya pasó");
    await expect(notice).not.toContainText(/Importe|300,00/);
    const link = notice.getByRole("link", { name: "Ver recurrentes" });
    await expect(link).toHaveAttribute("href", `/recurrentes?serie=${id}`);
    await link.click();
    await expect(page).toHaveURL(new RegExp(`/recurrentes\\?serie=${id}`));
    const period = page.locator(`#periodo-${id}-0`);
    await expect(period).toContainText(firstPeriod.slice(0, 7));
    await expect(period).toContainText("Pago parcial");
    await expect(period).not.toContainText("Restante");
    await expect(
      period
        .getByRole("list", { name: "Movimientos vinculados" })
        .getByRole("link"),
    ).toHaveCount(1);
    await period.getByRole("button", { name: "Confirmar total" }).click();
    await period.getByLabel("Con esto queda pagado el período").check();
    await period
      .getByRole("button", { name: "Confirmar", exact: true })
      .click();
    await expect(period).toContainText("Total definitivo");
    await expect(period).toContainText("125,50 UYU");
    await page.goto("/avisos");
    await expect(notice).toHaveCount(0);
    await page.goto("/resumen");
    await expect(
      page.getByRole("list", { name: "Saldos bancarios por moneda" }),
    ).toContainText("874,50 UYU");
  });
});

test("F4-03: omite un período, cambia el día futuro y reanuda la serie", async ({
  page,
  context,
  browser,
}, testInfo) => {
  const { cookies } = await financeBrowserFixtures();
  await context.addCookies([cookies.a1]);
  const today = bankReferenceToday();
  const response = await post(context, "/api/recurrences", {
    kind: "income",
    concept: "Sueldo sintético F4-03",
    currency: "UYU",
    firstPeriod: monthBefore(today, 1),
    dateMode: "exact",
    dueDay: 5,
    idempotencyKey: randomUUID(),
  });
  expect(response.status()).toBe(201);
  const { id } = await response.json();
  await page.goto("/recurrentes");
  const series = page.locator(`#serie-${id}`);
  const previous = page.locator(`#periodo-${id}-0`);
  const current = page.locator(`#periodo-${id}-1`);
  await previous.getByRole("button", { name: "Omitir este período" }).click();
  await previous
    .getByRole("button", { name: "Confirmar", exact: true })
    .click();
  await expect(previous).toContainText("No corresponde cobrar");
  await expect(current).toContainText("Sin cobro confirmado");
  const currentDue = ["05", today.slice(5, 7), today.slice(0, 4)].join("/");
  await expect(current).toContainText(currentDue);

  await series.getByText("Editar día de vencimiento", { exact: true }).click();
  const nextMonth = monthBefore(today, -1);
  await expect(series.getByText(/Nuevo día a partir de/)).toContainText(
    `${nextMonth.slice(5, 7)}/${nextMonth.slice(0, 4)}`,
  );
  await series.getByLabel("Nuevo día de vencimiento").fill("10");
  await series.getByRole("button", { name: "Guardar día" }).click();
  await expect(series.getByText("Día 10", { exact: true })).toBeVisible();
  await expect(current).toContainText(currentDue);
  await series.getByRole("button", { name: "Pausar serie" }).click();
  await expect(series.getByText(/Serie pausada/)).toBeVisible();
  await expect(previous).toContainText("No corresponde cobrar");
  await expect(current).toContainText("Sin cobro confirmado");
  await page.screenshot({
    path: testInfo.outputPath("F4-03-pausa.png"),
    fullPage: true,
  });
  await series.getByRole("button", { name: "Reanudar serie" }).click();
  await expect(
    series.getByRole("button", { name: "Pausar serie" }),
  ).toBeVisible();
  await expect(previous).toContainText("No corresponde cobrar");
  await expect(current).toContainText(currentDue);

  const foreign = await browser.newContext({ baseURL: financeTestOrigin });
  const pause = { action: "pause", seriesId: id, idempotencyKey: randomUUID() };
  try {
    expect((await post(foreign, seriesPath, pause)).status()).toBe(401);
    await foreign.addCookies([cookies.b]);
    expect(
      (
        await post(foreign, seriesPath, pause, "https://example.invalid")
      ).status(),
    ).toBe(403);
    expect((await post(foreign, seriesPath, pause)).status()).toBe(404);
  } finally {
    await foreign.close();
  }
});

test("F4-02: depósitos desde Recurrentes, efectos reales y privacidad", async ({
  page,
  context,
  browser,
}, testInfo) => {
  const { cookies } = await financeBrowserFixtures();
  await context.addCookies([cookies.a1]);
  const today = bankReferenceToday();
  const reference = monthBefore(today, 2);
  const first = monthBefore(today, 1).replace(/01$/, "03");
  const second = monthBefore(today, 1).replace(/01$/, "08");
  const series = "Sueldo sintético F4-02";
  expect(
    (
      await post(context, "/api/bank-balances", {
        currency: "UYU",
        amount: "0",
        asOfDate: reference,
      })
    ).status(),
  ).toBe(201);
  const definition = await post(context, "/api/recurrences", {
    kind: "income",
    concept: series,
    currency: "UYU",
    firstPeriod: reference,
    referenceAmount: "50000",
    idempotencyKey: randomUUID(),
  });
  expect(definition.status()).toBe(201);
  const { id } = await definition.json();
  await page.goto("/recurrentes");
  const period = page.locator(`#periodo-${id}-0`);
  await expect(period).toContainText("Sin cobro confirmado");
  await expect(page.locator(`#periodo-${id}-1`)).toContainText(
    "Sin cobro confirmado",
  );
  await period.getByRole("button", { name: "Registrar cobro" }).click();
  await period.getByLabel("Fecha real de cobro").fill(first);
  await period.getByLabel("Importe cobrado").fill("30000");
  await period.getByRole("button", { name: "Confirmar", exact: true }).click();
  await expect(period).toContainText("Cobro parcial");
  await expect(period).toContainText("30.000,00 UYU");
  await expect(period).not.toContainText("Restante");
  await period.getByRole("button", { name: "Registrar otro cobro" }).click();
  await period.getByLabel("Fecha real de cobro").fill(second);
  await period.getByLabel("Importe cobrado").fill("17000");
  await period.getByLabel("Eso fue todo lo cobrado en este período").check();
  await period.getByRole("button", { name: "Confirmar", exact: true }).click();
  await expect(period).toContainText("Cobrado completo");
  await expect(period).toContainText("47.000,00 UYU");
  await expect(period).toContainText("50.000,00 UYU");
  await expect(period).not.toContainText("Restante");
  await expect(
    period
      .getByRole("list", { name: "Movimientos vinculados" })
      .getByRole("link"),
  ).toHaveCount(2);
  await page.screenshot({
    path: testInfo.outputPath("F4-02-cobros.png"),
    fullPage: true,
  });
  await period.getByRole("link", { name: /17.000,00 UYU/ }).click();
  await expect(page.getByRole("heading", { name: series })).toBeVisible();
  await expect(page.getByText("Período al que corresponde")).toBeVisible();
  await page
    .getByRole("link", { name: reference.slice(0, 7), exact: true })
    .click();
  await expect(period).toContainText("Cobrado completo");
  await page.goto("/resumen");
  await expect(
    page.getByRole("list", { name: "Saldos bancarios por moneda" }),
  ).toContainText("47.000,00 UYU");

  const foreign = await browser.newContext({ baseURL: financeTestOrigin });
  const data = {
    action: "record",
    seriesId: id,
    idempotencyKey: randomUUID(),
    amount: "1",
    method: "deposit",
    effectiveOn: today,
    targets: [
      { index: 1, version: 0, recorded: "0", amount: "1", final: true },
    ],
  };
  try {
    expect((await post(foreign, path, data)).status()).toBe(401);
    await foreign.addCookies([cookies.b]);
    expect(
      (await post(foreign, path, data, "https://example.invalid")).status(),
    ).toBe(403);
    expect((await post(foreign, path, data)).status()).toBe(404);
    expect(
      (
        await foreign.request.get(
          path + "?" + new URLSearchParams({ serie: id, fecha: second }),
        )
      ).status(),
    ).toBe(404);
    expect(
      (
        await foreign.request.get(
          path + "?" + new URLSearchParams({ serie: id, hasta: "0" }),
        )
      ).status(),
    ).toBe(404);
  } finally {
    await foreign.close();
  }
});

test("F4-02: vincula un pago existente y lo reparte entre períodos", async ({
  page,
  context,
}, testInfo) => {
  const { cookies } = await financeBrowserFixtures();
  await context.addCookies([cookies.a1]);
  const today = bankReferenceToday();
  const old = monthBefore(today, 7);
  const recent = monthBefore(today, 1);
  expect(
    (
      await post(context, "/api/bank-balances", {
        currency: "UYU",
        amount: "10000",
        asOfDate: old,
      })
    ).status(),
  ).toBe(201);
  const definition = await post(context, "/api/recurrences", {
    kind: "expense",
    concept: "Seguro sintético F4-02",
    currency: "UYU",
    firstPeriod: old,
    referenceAmount: "1500",
    idempotencyKey: randomUUID(),
  });
  expect(definition.status()).toBe(201);
  const { id } = await definition.json();
  const payment = await post(context, "/api/movements", {
    kind: "expense",
    currency: "UYU",
    amount: "3000",
    concept: "Pago agrupado sintético",
    effectiveOn: today,
    method: "debit",
    idempotencyKey: randomUUID(),
  });
  expect(payment.status()).toBe(201);
  await page.goto("/recurrentes");
  const period = page.locator(`#periodo-${id}-6`);
  await period
    .getByRole("button", { name: "Vincular movimiento registrado" })
    .click();
  await period.getByRole("button", { name: "Buscar movimientos" }).click();
  await period.getByLabel("Movimiento registrado").selectOption({
    label: "Pago agrupado sintético · 3.000,00 UYU · Débito bancario",
  });
  await period.getByText("Distribuir el pago entre varios períodos").click();
  await period.getByRole("button", { name: "Buscar otros períodos" }).click();
  await period
    .getByRole("checkbox", { name: old.slice(0, 7), exact: true })
    .check();
  for (const month of [recent, old]) {
    await period
      .getByLabel(`Importe asignado a ${month.slice(0, 7)}`)
      .fill("1500");
    await period
      .getByRole("group", { name: month.slice(0, 7), exact: true })
      .getByLabel("Con esto queda pagado el período")
      .check();
  }
  await page.screenshot({
    path: testInfo.outputPath("F4-02-pago-repartido.png"),
    fullPage: true,
  });
  await period.getByRole("button", { name: "Confirmar", exact: true }).click();
  await expect(period.getByText("Pagado", { exact: true })).toBeVisible();
  const detail = await payment.json();
  await expect(
    period
      .getByRole("list", { name: "Movimientos vinculados" })
      .getByRole("link"),
  ).toHaveAttribute("href", `/historial/movimientos/${detail.id}`);
  await page.getByRole("link", { name: "Períodos anteriores" }).click();
  const older = page.locator(`#periodo-${id}-0`);
  await expect(older.getByText("Pagado", { exact: true })).toBeVisible();
  await older.getByRole("button", { name: "Desvincular movimiento" }).click();
  await older.getByRole("button", { name: "Confirmar", exact: true }).click();
  await expect(older).toContainText("Sin pago confirmado");
  await page.getByRole("link", { name: "Períodos más recientes" }).click();
  await expect(period).toContainText("Sin pago confirmado");
  await page.goto("/resumen");
  await expect(
    page.getByRole("list", { name: "Saldos bancarios por moneda" }),
  ).toContainText("7.000,00 UYU");
});
