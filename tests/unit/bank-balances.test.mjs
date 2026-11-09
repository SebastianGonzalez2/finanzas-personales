import assert from "node:assert/strict";
import test from "node:test";
import {
  bankReferenceToday,
  formatBankAmount,
  formatBankReference,
  parseBalanceAdjustment,
  parseOpeningBalance,
} from "../../src/domain/bank-balances.ts";
import { handleOpeningBalance } from "../../src/server/bank-balances-http.ts";

const input = { currency: "UYU", amount: "10000,125", asOfDate: "2024-02-29" };
const today = "2026-11-08";

test("F1-02: conserva precisión, cero, negativos y moneda original", () => {
  assert.deepEqual(parseOpeningBalance(input, today), {
    ...input,
    amount: "10000.1250",
  });
  assert.equal(
    parseOpeningBalance({ ...input, amount: "0" }, today).amount,
    "0.0000",
  );
  const maximum = parseOpeningBalance(
    { ...input, amount: "-9999999999999999,9999", currency: "EUR" },
    today,
  );
  assert.equal(formatBankAmount(maximum), "−9.999.999.999.999.999,9999 EUR");
  assert.equal(
    formatBankAmount(
      parseOpeningBalance({ ...input, currency: "USD", amount: "100" }, today),
    ),
    "100,00 USD",
  );
});

test("F1-02: valida calendario de Montevideo y entradas ambiguas o manipuladas", () => {
  assert.equal(bankReferenceToday(new Date("2026-11-09T02:59:59Z")), today);
  assert.equal(
    bankReferenceToday(new Date("2026-11-09T03:00:00Z")),
    "2026-11-09",
  );
  assert.equal(formatBankReference("2024-02-29"), "29/02/2024");
  for (const asOfDate of [
    "2026-11-09",
    "2025-02-29",
    "2026-04-31",
    "0000-12-31",
    "2026-11-08\n",
  ])
    assert.ok(
      parseOpeningBalance({ ...input, asOfDate }, today).error,
      asOfDate,
    );
  for (const amount of [
    1,
    "",
    "1.000,00",
    "1 000",
    "1e2",
    "0.00001",
    "10000000000000000",
  ])
    assert.ok(
      parseOpeningBalance({ ...input, amount }, today).error,
      String(amount),
    );
  for (const invalid of [
    { ...input, currency: "GBP" },
    { ...input, owner_id: "B" },
  ])
    assert.ok(parseOpeningBalance(invalid, today).error);
});

test("F1-02: escritura solo del mismo origen con entrada válida y respuestas privadas", async () => {
  const origin = "https://example.test";
  const request = (body, headers = {}, search = "") =>
    new globalThis.Request(`${origin}/api/bank-balances${search}`, {
      method: "POST",
      headers: { origin, "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
    });

  for (const [invalid, status] of [
    [request(input, { origin: "https://other.test" }), 403],
    [request(input, { "sec-fetch-site": "cross-site" }), 403],
    [request(input, {}, "?owner_id=B"), 400],
    [request({ ...input, ownerId: "B" }), 400],
    [request({ ...input, amount: "0".repeat(4096) }), 400],
  ]) {
    const response = await handleOpeningBalance(invalid, origin, async () =>
      assert.fail("No debe intentar persistir una petición rechazada"),
    );
    assert.equal(response.status, status);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
  }

  for (const [result, status] of [
    ["created", 201],
    ["replayed", 200],
    ["conflict", 409],
  ]) {
    const response = await handleOpeningBalance(
      request(input),
      origin,
      async (balance) => {
        assert.deepEqual(balance, { ...input, amount: "10000.1250" });
        return result;
      },
    );
    assert.equal(response.status, status);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    if (response.ok)
      assert.deepEqual(await response.json(), {
        balance: { ...input, amount: "10000.1250" },
      });
  }
  const denied = await handleOpeningBalance(
    request(input),
    origin,
    async () => {
      throw new Error("detalle privado de DB");
    },
  );
  assert.equal(denied.status, 401);
  assert.doesNotMatch(await denied.text(), /detalle privado/);
});
test("F1-05 valida ajustes fechados, nota e idempotencia sin aceptar titular externo", () => {
  const today = "2026-11-08";
  const input = {
    currency: "EUR",
    amount: "-9007199254740993,1234",
    asOfDate: "2026-02-28",
    note: "  Confirmación de prueba  ",
    idempotencyKey: "E8EC105E-847E-4650-8267-3423BF72AC27",
  };
  assert.deepEqual(parseBalanceAdjustment(input, today), {
    ...input,
    amount: "-9007199254740993.1234",
    note: "Confirmación de prueba",
    idempotencyKey: input.idempotencyKey.toLowerCase(),
  });
  for (const invalid of [
    { ownerId: "B" },
    { amount: 8700 },
    { asOfDate: "2026-11-09" },
    { asOfDate: "2026-02-29" },
    { idempotencyKey: "duplicado" },
    { note: "x".repeat(501) },
    { note: "abc\0" },
  ]) {
    assert.ok(
      "error" in parseBalanceAdjustment({ ...input, ...invalid }, today),
    );
  }
});
