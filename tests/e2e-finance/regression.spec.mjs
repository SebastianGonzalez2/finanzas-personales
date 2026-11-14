import { randomUUID } from "node:crypto";
import { expect, test as base } from "@playwright/test";
import { bankReferenceToday } from "../../src/domain/bank-balances.ts";
import {
  cardCommand,
  creditPurchase,
  loanLend,
  loanSettle,
} from "../support/f2-10-fixtures.mjs";
import {
  financeBrowserFixtures,
  financeTestOrigin,
} from "../support/finance-browser.mjs";

const test = base.extend({
  actors: async ({ browser, context }, run, testInfo) => {
    const fixtures = await financeBrowserFixtures();
    const contexts = [];
    try {
      await context.addCookies([fixtures.cookies.a1]);
      for (const cookie of [fixtures.cookies.a2, fixtures.cookies.b]) {
        const other = await browser.newContext({
          baseURL: financeTestOrigin,
          viewport: testInfo.project.use.viewport,
        });
        contexts.push(other);
        await other.addCookies([cookie]);
      }
      const [a2, b] = contexts;
      await run({ a1: context, a2, b, fixtures });
    } finally {
      await Promise.all(contexts.map((context) => context.close()));
    }
  },
});

const command = (actor, method, path, data) =>
  actor.request.fetch(path, {
    method,
    data,
    headers: { origin: financeTestOrigin },
  });

async function payload(response, status) {
  expect(response.status()).toBe(status);
  expect(response.headers()["cache-control"]).toBe("private, no-store");
  return response.json();
}

const movementPath = "/api/movements";
const detail = (id) => `/historial/movimientos/${id}`;
const balances = (page) =>
  page.getByRole("list", { name: "Saldos bancarios por moneda" });

test("F6-01 CA-010/014/018/019/065: saldo calculado, fecha futura, desconexión y Deshacer", async ({
  actors,
  page,
}) => {
  const { a1, a2 } = actors;
  await page.goto("/resumen");
  await expect(balances(page)).toContainText("Sin configurar");
  await expect(balances(page)).not.toContainText(/confirmado|verificado/i);
  await payload(
    await command(a1, "POST", "/api/bank-balances", {
      currency: "UYU",
      amount: "10000",
      asOfDate: "2025-01-01",
    }),
    201,
  );
  await page.reload();
  const uyu = balances(page)
    .getByRole("listitem")
    .filter({ hasText: "Saldo bancario 10.000,00 UYU" });
  await expect(uyu).toContainText("Confirmado al 01/01/2025");
  const tomorrow = new Date(`${bankReferenceToday()}T00:00:00Z`);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const concept = "Gasto sintético sin conexión";
  await payload(
    await command(a1, "POST", movementPath, {
      kind: "expense",
      currency: "UYU",
      method: "debit",
      amount: "500",
      effectiveOn: tomorrow.toISOString().slice(0, 10),
      concept,
      idempotencyKey: randomUUID(),
    }),
    400,
  );
  const open = page.getByRole("button", { name: "+ Nueva transacción" });
  const form = page.getByRole("form", { name: "Nueva transacción" });
  const fillExpense = async () => {
    await open.focus();
    await open.press("Enter");
    await expect(
      page.getByRole("heading", { name: "Nueva transacción" }),
    ).toBeFocused();
    await form.getByLabel("Importe").fill("500");
    await form.getByLabel("Concepto", { exact: true }).fill(concept);
  };
  await fillExpense();

  await a1.setOffline(true);
  try {
    const failed = page.waitForEvent(
      "requestfailed",
      (request) =>
        request.url().endsWith(movementPath) && request.method() === "POST",
    );
    await form.getByRole("button", { name: "Guardar movimiento" }).click();
    expect((await failed).failure()?.errorText).toBe(
      "net::ERR_INTERNET_DISCONNECTED",
    );
    await expect(page.getByText("Gasto registrado.")).toHaveCount(0);
    await expect(page.getByText("Saldo bancario 9.500,00 UYU")).toHaveCount(0);
    const online = await a2.newPage();
    await online.goto("/resumen");
    await expect(balances(online)).toContainText(
      "Saldo bancario 10.000,00 UYU",
    );
    await online.close();
  } finally {
    await a1.setOffline(false);
  }

  const submitted = page.waitForResponse(
    (response) =>
      response.url().endsWith(movementPath) &&
      response.request().method() === "POST",
  );
  await form.getByRole("button", { name: "Reintentar guardado" }).click();
  const response = await submitted;
  const saved = await payload(response, 201);
  expect(
    await payload(
      await command(
        a2,
        "POST",
        movementPath,
        response.request().postDataJSON(),
      ),
      200,
    ),
  ).toEqual(saved);
  await expect(page.getByText("Gasto registrado.")).toBeVisible();
  await expect(balances(page)).toContainText("Saldo bancario 9.500,00 UYU");
  await expect(balances(page)).toContainText(
    "Calculado · 10.000,00 UYU confirmado al 01/01/2025",
  );
  await expect(balances(page)).not.toContainText(/saldo real verificado/i);
  const history = await a2.newPage();
  await history.goto(`/historial?q=${encodeURIComponent(concept)}`);
  const entry = history.getByRole("link", { name: new RegExp(concept) });
  await expect(entry).toHaveCount(1);
  await entry.click();
  await expect(history.getByText(/Sin categorizar/).first()).toBeVisible();

  await page.getByRole("button", { name: "Deshacer", exact: true }).click();
  await expect(page.getByText("Registro anulado.")).toBeVisible();
  await expect(balances(page)).toContainText("Saldo bancario 10.000,00 UYU");
  await history.reload();
  await expect(
    history.getByText("Gasto · Anulado", { exact: true }),
  ).toBeVisible();
});

test("F6-01 CA-001/016/034: recursos ajenos, reintentos de crédito y cobro superior al saldo", async ({
  actors,
}) => {
  const { a1, a2, b } = actors;
  const opening = { currency: "UYU", amount: "10000", asOfDate: "2025-01-01" };
  await payload(await command(a1, "POST", "/api/bank-balances", opening), 201);
  const { id: cardId } = await payload(
    await command(a1, "POST", "/api/cards", cardCommand()),
    201,
  );
  const creditPath = "/api/cards/operations";
  const loanPath = "/api/loans";
  const today = bankReferenceToday();
  const purchase = creditPurchase({ cardId, effectiveOn: today });
  const lending = loanLend({ effectiveOn: today });

  async function assertReplay(path, input) {
    const responses = await Promise.all([
      command(a1, "POST", path, input),
      command(a2, "POST", path, input),
    ]);
    responses.sort((a, b) => b.status() - a.status());
    const saved = await payload(responses[0], 201);
    expect(await payload(responses[1], 200)).toEqual(saved);
    expect(await payload(await command(a2, "POST", path, input), 200)).toEqual(
      saved,
    );
    await payload(
      await command(a2, "POST", path, { ...input, amount: "1500" }),
      409,
    );
    return saved.id;
  }

  await assertReplay(creditPath, purchase);
  const loanId = await assertReplay(loanPath, lending);
  const collection = loanSettle({ loanId, amount: "1001", effectiveOn: today });
  for (const [path, field, input, id] of [
    [creditPath, "cardId", purchase, cardId],
    [loanPath, "loanId", collection, loanId],
  ]) {
    const rejected = (target) =>
      command(b, "POST", path, { ...input, [field]: target });
    expect(await payload(await rejected(id), 404)).toEqual(
      await payload(await rejected(randomUUID()), 404),
    );
  }
  await payload(await command(a2, "POST", loanPath, collection), 409);

  for (const [path, existing, missing, privateText] of [
    ["/deudas", loanId, randomUUID(), lending.concept],
    [
      "/tarjetas",
      `${cardId}/resumen`,
      `${randomUUID()}/resumen`,
      "Tarjeta sintética F2-10",
    ],
  ]) {
    const owned = await a1.request.get(`${path}/${existing}`);
    expect(owned.status()).toBe(200);
    expect(await owned.text()).toContain(privateText);
    for (const target of [existing, missing]) {
      const foreign = await b.request.get(`${path}/${target}`);
      expect(foreign.status()).toBe(404);
      expect(foreign.headers()["cache-control"]).toContain("no-store");
      expect(await foreign.text()).not.toContain(privateText);
    }
  }

  const period = { from: today, to: today, format: "csv" };
  const exportPath = "/api/export";
  const owned = await command(a1, "POST", exportPath, period);
  expect(owned.status()).toBe(200);
  expect(await owned.text()).toContain(purchase.concept);
  const other = await command(b, "POST", exportPath, period);
  expect(other.status()).toBe(200);
  expect(await other.text()).not.toContain(purchase.concept);
  const summary = await a2.newPage();
  await summary.goto("/resumen");
  await expect(balances(summary)).toContainText("Saldo bancario 9.000,00 UYU");
  await expect(
    summary.getByRole("list", { name: "Gastos del mes" }),
  ).toHaveText("1.000,00 UYU");
});

test("CA-027: registra EUR 50 como referencia y contabiliza USD 58 una vez", async ({
  actors,
  page,
}) => {
  const { a1, b } = actors;
  const today = bankReferenceToday();
  await payload(
    await command(a1, "POST", "/api/cards", cardCommand({ currency: "USD" })),
    201,
  );
  await payload(
    await command(a1, "POST", "/api/bank-balances", {
      currency: "USD",
      amount: "100",
      asOfDate: today,
    }),
    201,
  );
  const { id: categoryId } = await payload(
    await command(a1, "POST", "/api/categories", {
      kind: "expense",
      name: "Compras CA-027",
    }),
    201,
  );
  await payload(
    await command(a1, "POST", "/api/budgets", {
      action: "save",
      categoryId,
      currency: "USD",
      amount: "100",
      idempotencyKey: randomUUID(),
    }),
    201,
  );
  await page.goto("/tarjetas");
  const register = page.getByRole("button", {
    name: "Registrar compra",
    exact: true,
  });
  await register.click();
  await expect(page.getByLabel("Importe original de la compra")).toBeHidden();
  await page.getByLabel("Importe cargado por el emisor").fill("58");
  await page
    .getByLabel("Concepto", { exact: true })
    .fill("Compra sintética CA-027");
  await page.getByLabel("Categoría (opcional)").selectOption(categoryId);
  await page.getByText("Importe y moneda originales (opcional)").click();
  await page.getByLabel("Importe original de la compra").fill("50");
  await page.getByLabel("Moneda original").selectOption("EUR");
  const saved = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/cards/operations") &&
      response.request().method() === "POST",
  );
  await page
    .getByRole("form", { name: /Registrar compra/ })
    .getByRole("button", { name: "Registrar compra", exact: true })
    .click();
  const response = await saved;
  const { id } = await payload(response, 201);
  const purchase = response.request().postDataJSON();
  const replay = await command(a1, "POST", "/api/cards/operations", purchase);
  expect(await payload(replay, 200)).toEqual({ id });
  await payload(
    await command(a1, "POST", "/api/cards/operations", {
      ...purchase,
      originalAmount: "51",
    }),
    409,
  );
  await payload(
    await command(b, "POST", "/api/cards/operations", purchase),
    404,
  );
  expect((await b.request.get(detail(id))).status()).toBe(404);
  await page.goto("/resumen");
  await expect(page.getByRole("list", { name: "Gastos del mes" })).toHaveText(
    "58,00 USD",
  );
  await expect(
    balances(page).getByText("100,00 USD", { exact: true }),
  ).toBeVisible();
  await page.goto("/tarjetas");
  await expect(
    page.getByText("58,00 USD", { exact: true }).first(),
  ).toBeVisible();
  await page.goto(detail(id));
  await expect(
    page.getByText("Cargo confirmado por el emisor · 58,00 USD"),
  ).toBeVisible();
  await expect(
    page.getByText("Importe original de la compra (referencia) · 50,00 EUR"),
  ).toBeVisible();
  await page.goto("/presupuestos");
  await expect(page.getByText("58,00 USD de 100,00 USD (58%)")).toBeVisible();
  await page.goto("/estadisticas?display=original");
  const metrics = page.getByRole("table", { name: "Indicadores en USD" });
  await expect(metrics.getByRole("row", { name: /^Gastos/ })).toContainText(
    "58,00 USD",
  );
  await expect(
    page.getByRole("table", { name: "Indicadores en EUR" }),
  ).toHaveCount(0);
});

test("F1-08 CA-001/006: A/B, dos sesiones de A, reintentos, conciliación y auditoría", async ({
  actors,
  page,
}) => {
  const { a1, a2, b, fixtures } = actors;
  const secondPage = await a2.newPage();
  const otherPage = await b.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.name));

  await test.step("Saldos iniciales separados y gasto con confirmación posterior", async () => {
    for (const [actor, currency, amount] of [
      [a1, "UYU", "32000"],
      [a1, "USD", "0"],
      [b, "UYU", "900"],
    ]) {
      await payload(
        await command(actor, "POST", "/api/bank-balances", {
          currency,
          amount,
          asOfDate: "2025-01-01",
        }),
        201,
      );
    }
    await secondPage.goto("/resumen");
    await expect(balances(secondPage)).toContainText("32.000,00 UYU");
  });

  const concept = "Alquiler sintético A";
  const expense = {
    kind: "expense",
    method: "debit",
    currency: "UYU",
    amount: "2000",
    concept,
    note: "Nota privada de prueba A",
    effectiveOn: "2025-02-04",
    idempotencyKey: randomUUID(),
  };
  const { id: original } = await payload(
    await command(a1, "POST", movementPath, expense),
    201,
  );
  await payload(
    await command(a2, "POST", "/api/bank-balances/adjustments", {
      currency: "UYU",
      amount: "30000",
      asOfDate: "2025-03-01",
      idempotencyKey: randomUUID(),
    }),
    201,
  );

  const transfer = {
    kind: "bank_transfer",
    sourceCurrency: "UYU",
    sourceAmount: "4000.0001",
    destinationCurrency: "USD",
    destinationAmount: "100.1251",
    effectiveOn: "2025-04-01",
    idempotencyKey: randomUUID(),
  };
  await test.step("Reintento simultáneo y rechazo sin débito ni crédito parcial", async () => {
    const responses = await Promise.all([
      command(a1, "POST", movementPath, transfer),
      command(a2, "POST", movementPath, transfer),
    ]);
    responses.sort((first, second) => second.status() - first.status());
    expect(await payload(responses[0], 201)).toEqual(
      await payload(responses[1], 200),
    );
    await payload(
      await command(a2, "POST", movementPath, {
        ...transfer,
        destinationAmount: "1000",
      }),
      409,
    );
    const failed = await payload(
      await command(a2, "POST", movementPath, {
        ...transfer,
        sourceAmount: "26000",
        idempotencyKey: randomUUID(),
      }),
      409,
    );
    expect(failed.error).toContain("Saldo disponible insuficiente");
    for (const sessionPage of [page, secondPage]) {
      const summary = await sessionPage.goto("/resumen");
      expect(summary.headers()["cache-control"]).toContain("no-store");
      await expect(balances(sessionPage)).toContainText("26.000,00 UYU");
      await expect(balances(sessionPage)).toContainText("100,13 USD");
    }
  });

  await test.step("Una URL ajena y su API responden igual que un registro inexistente", async () => {
    const bConcept = "Ingreso sintético B";
    const { id: bId } = await payload(
      await command(b, "POST", movementPath, {
        kind: "income",
        method: "deposit",
        currency: "UYU",
        amount: "11.25",
        concept: bConcept,
        effectiveOn: expense.effectiveOn,
        idempotencyKey: transfer.idempotencyKey,
      }),
      201,
    );
    const nonexistent = randomUUID();
    for (const [actor, actorPage, target, privateConcept] of [
      [b, otherPage, original, concept],
      [a2, secondPage, bId, bConcept],
    ]) {
      for (const id of [target, nonexistent]) {
        const navigation = await actorPage.goto(detail(id));
        expect(navigation.status()).toBe(404);
        expect(navigation.headers()["cache-control"]).toContain("no-store");
        expect(await navigation.text()).not.toContain(privateConcept);
      }
      const voidRequest = (eventId) =>
        command(actor, "PATCH", movementPath, {
          action: "void",
          eventId,
          idempotencyKey: randomUUID(),
        });
      const denied = await payload(await voidRequest(target), 404);
      expect(denied).toEqual(
        await payload(await voidRequest(nonexistent), 404),
      );
      expect(denied).toEqual({ error: "El movimiento no está disponible." });
      await actorPage.goto(
        `/historial?q=${encodeURIComponent(privateConcept)}`,
      );
      await expect(
        actorPage.getByText("No hay registros que coincidan."),
      ).toBeVisible();
    }
    const forgedOwner = await payload(
      await command(b, "POST", movementPath, {
        ...expense,
        ownerId: fixtures.owners.a,
      }),
      400,
    );
    expect(forgedOwner).toEqual({ error: "Solicitud inválida." });
    await otherPage.goto("/resumen");
    await expect(balances(otherPage)).toContainText("911,25 UYU");
    await expect(balances(otherPage)).not.toContainText("100,13 USD");
  });

  await test.step("Si se pierde la respuesta, la UI reenvía la corrección original", async () => {
    await page.goto(detail(original));
    await page.getByRole("button", { name: "Editar movimiento" }).click();
    await page.getByLabel("Importe", { exact: true }).fill("1500,0001");
    let sent;
    let committedStatus;
    await page.route(
      `**${movementPath}`,
      async (route) => {
        sent = route.request().postData();
        committedStatus = (await route.fetch()).status();
        await route.abort("failed");
      },
      { times: 1 },
    );
    await page.getByRole("button", { name: "Guardar corrección" }).click();
    await expect(page.getByRole("main").getByRole("alert")).toContainText(
      "Reintentá el mismo envío",
    );
    expect(committedStatus).toBe(200);
    await expect(page.getByLabel("Importe", { exact: true })).toBeDisabled();
    const [retry] = await Promise.all([
      page.waitForResponse(
        (response) =>
          response.url().endsWith(movementPath) &&
          response.request().method() === "PATCH",
      ),
      page.getByRole("button", { name: "Reintentar mismo envío" }).click(),
    ]);
    expect(retry.status()).toBe(200);
    expect(retry.request().postData()).toBe(sent);
    await expect(
      page.getByText("Gasto · Corregido", { exact: true }),
    ).toBeVisible();
    await page.getByRole("link", { name: "Ver reemplazo" }).click();
    await expect(page.getByText("1.500,00 UYU", { exact: true })).toBeVisible();
  });

  await test.step("La segunda sesión ve la corrección y el saldo confirmado intacto", async () => {
    await secondPage.goto(page.url());
    await expect(
      secondPage.getByRole("link", { name: "Ver registro anterior" }),
    ).toBeVisible();
    await secondPage.goto("/resumen");
    const saldoUYU = balances(secondPage)
      .getByRole("listitem")
      .filter({ hasText: "26.000,00 UYU" });
    await saldoUYU
      .getByText("Confirmaciones de saldo", { exact: false })
      .click();
    await expect(
      saldoUYU.getByText("01/03/2025 · 30.000,00 UYU confirmado", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      saldoUYU.getByText(/Diferencia de conciliación: −500,00 UYU/),
    ).toBeVisible();
    await expect(saldoUYU).toContainText("26.000,00 UYU");
  });

  await test.step("Anulación auditada y cierre independiente de la primera sesión", async () => {
    await page.getByRole("button", { name: "Anular registro" }).click();
    await page.getByRole("button", { name: "Confirmar anulación" }).click();
    await expect(
      page.getByText("Gasto · Anulado", { exact: true }),
    ).toBeVisible();
    await secondPage.goto(page.url());
    await expect(
      secondPage.getByText("Gasto · Anulado", { exact: true }),
    ).toBeVisible();
    await payload(await command(a1, "POST", "/api/auth/sign-out", {}), 200);
    await a1.addCookies([fixtures.cookies.a1]);
    await payload(
      await command(a1, "POST", movementPath, {
        ...expense,
        idempotencyKey: randomUUID(),
      }),
      401,
    );
    await page.goto(detail(original));
    await expect(page).toHaveURL(/\/auth\/sign-in$/);
    await secondPage.reload();
    await expect(
      secondPage.getByText("Gasto · Anulado", { exact: true }),
    ).toBeVisible();
    await otherPage.reload();
    await expect(balances(otherPage)).toContainText("911,25 UYU");
  });

  expect(errors).toEqual([]);
});
