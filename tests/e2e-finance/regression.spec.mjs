import { randomUUID } from "node:crypto";
import { expect, test as base } from "@playwright/test";
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
      await expect(balances(sessionPage)).toContainText("25.999,9999 UYU");
      await expect(balances(sessionPage)).toContainText("100,1251 USD");
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
    await expect(balances(otherPage)).not.toContainText("100,1251 USD");
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
    await expect(
      page.getByText("1.500,0001 UYU", { exact: true }),
    ).toBeVisible();
  });

  await test.step("La segunda sesión ve la corrección y el saldo confirmado intacto", async () => {
    await secondPage.goto(page.url());
    await expect(
      secondPage.getByRole("link", { name: "Ver registro anterior" }),
    ).toBeVisible();
    await secondPage.goto("/resumen");
    const saldoUYU = balances(secondPage)
      .getByRole("listitem")
      .filter({ hasText: "25.999,9999 UYU" });
    await saldoUYU
      .getByText("Confirmaciones de saldo", { exact: false })
      .click();
    await expect(
      saldoUYU.getByText("01/03/2025 · 30.000,00 UYU confirmado", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      saldoUYU.getByText(/Diferencia de conciliación: −499,9999 UYU/),
    ).toBeVisible();
    await expect(saldoUYU).toContainText("25.999,9999 UYU");
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
