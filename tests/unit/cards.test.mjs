import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { parseCardCommand } from "../../src/domain/cards.ts";

const input = {
  action: "create",
  kind: "credit",
  name: " Tarjeta de prueba ",
  idempotencyKey: randomUUID(),
  currencies: [
    { currency: "USD", limit: "9999999999999999,0001" },
    { currency: "UYU" },
  ],
};

test("F2-01 normaliza límites exactos y monedas para reintentos equivalentes", () => {
  const result = parseCardCommand(input);
  assert.deepEqual(result, {
    ...input,
    name: "Tarjeta de prueba",
    issuer: null,
    currencies: [
      { currency: "UYU", limit: null },
      { currency: "USD", limit: "9999999999999999.0001" },
    ],
  });
  assert.deepEqual(
    parseCardCommand({ ...input, currencies: input.currencies.toReversed() }),
    result,
  );
});

test("F2-01 rechaza propietario, posición financiera y límites inválidos en comandos", () => {
  for (const invalid of [
    { ownerId: "otro" },
    { kind: "debit" },
    { currencies: [] },
    { currencies: [{ currency: "BRL" }] },
    { currencies: [{ currency: "USD" }, { currency: "USD" }] },
    { currencies: [{ currency: "USD", debt: "1" }] },
    { currencies: [{ currency: "USD", creditBalance: "1" }] },
    ...[0, 12.5, "0", "-1", "0.00001", "10000000000000000"].map((limit) => ({
      currencies: [{ currency: "USD", limit }],
    })),
  ])
    assert.ok("error" in parseCardCommand({ ...input, ...invalid }));
});
