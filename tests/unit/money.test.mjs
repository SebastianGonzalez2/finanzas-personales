import assert from "node:assert/strict";
import test from "node:test";
import { Money } from "../../src/domain/money.mts";

test("F0-05: tres monedas exactas, cifras grandes y serialización string", () => {
  for (const currency of ["UYU", "USD", "EUR"]) {
    assert.equal(
      Money.parse("0.1", currency)
        .add(Money.parse("0.2", currency))
        .toDecimal(),
      "0.3000",
    );
    assert.deepEqual(
      JSON.parse(
        JSON.stringify(Money.parse("9007199254740993.0001", currency)),
      ),
      { amount: "9007199254740993.0001", currency },
    );
    assert.equal(
      Money.parse("-9999999999999999.9999", currency).negate().toDecimal(),
      "9999999999999999.9999",
    );
  }
});
test("F0-05: rechaza float, escala excesiva, mezcla, overflow y redondeo implícito", () => {
  for (const amount of [
    0.1,
    NaN,
    Infinity,
    "1e2",
    " 1",
    "01",
    "0.00001",
    "10000000000000000",
  ])
    assert.throws(() => Money.parse(amount, "UYU"));
  assert.throws(() => Money.parse("1", "GBP"));
  assert.throws(() => Money.parse("1", "UYU").add(Money.parse("1", "USD")));
  assert.throws(() =>
    Money.parse("9999999999999999.9999", "UYU").add(
      Money.parse("0.0001", "UYU"),
    ),
  );
  assert.throws(() => Money.parse("1", "UYU").divideEqually(BigInt(3)));
  assert.equal(
    Money.parse("1", "UYU").divideEqually(BigInt(2)).toDecimal(),
    "0.5000",
  );
});
