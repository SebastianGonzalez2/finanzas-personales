import assert from "node:assert/strict";
import test from "node:test";
import { Money } from "../money.ts";
import { calendarDate, calendarPeriod, utcInstant } from "../dates.ts";
import { requireOwnedResources } from "../ownership.ts";

for (const code of ["UYU", "USD", "EUR"]) {
  test(`${code}: suma decimal, inversa y serialización exactas`, () => {
    const result = Money.parse("0.1", code).add(Money.parse("0.2", code));
    assert.equal(result.toDecimal(), "0.3000");
    assert.equal(result.add(result.negate()).toDecimal(), "0.0000");
    assert.deepEqual(JSON.parse(JSON.stringify(result)), {
      amount: "0.3000",
      currency: code,
    });
    assert.equal(
      Money.parse("9007199254740993.0001", code).toDecimal(),
      "9007199254740993.0001",
    );
    assert.equal(Money.parse("-0.0000", code).toDecimal(), "0.0000");
  });
}
test("parseo estricto y límites NUMERIC(20,4), sin float ni redondeo", () => {
  for (const value of [
    0.1,
    NaN,
    Infinity,
    null,
    "",
    " 1",
    "1 ",
    "1\n",
    "1.2345\r",
    "1\u2028",
    "1,23",
    "1e2",
    "+1",
    "01",
    ".5",
    "1.",
    "1.00001",
    "10000000000000000",
    "-10000000000000000",
  ]) {
    assert.throws(() => Money.parse(value, "USD"));
  }
  assert.throws(() => Money.parse("1", "ARS"));
  assert.equal(
    Money.parse("9999999999999999.9999", "USD").toDecimal(),
    "9999999999999999.9999",
  );
  assert.throws(() =>
    Money.parse("9999999999999999.9999", "USD").add(
      Money.parse("0.0001", "USD"),
    ),
  );
  assert.throws(() =>
    Money.parse("-9999999999999999.9999", "USD").add(
      Money.parse("-0.0001", "USD"),
    ),
  );
});
test("rechaza mezcla monetaria y reparto con restos; no crea centésimos", () => {
  assert.throws(() => Money.parse("1", "UYU").add(Money.parse("1", "USD")));
  assert.equal(
    Money.parse("12", "EUR").divideEqually(3n).toDecimal(),
    "4.0000",
  );
  assert.throws(() => Money.parse("10", "EUR").divideEqually(3n));
  assert.throws(() => Money.parse("10", "EUR").divideEqually(0n));
});
test("fechas reales, bisiestos y períodos sin desplazamiento de huso", () => {
  assert.equal(calendarDate("2024-02-29"), "2024-02-29");
  assert.equal(calendarPeriod("2026-03-01"), "2026-03");
  assert.equal(calendarPeriod("2026-12-31"), "2026-12");
  for (const value of [
    "2026-02-29",
    "2026-04-31",
    "2026-13-01",
    "0000-01-01",
    "2026-1-01",
    "2026-03-01T00:00:00Z",
    null,
  ])
    assert.throws(() => calendarDate(value));
});
test("auditoría exige instante UTC canónico, separado de fecha efectiva", () => {
  assert.equal(
    utcInstant("2026-03-01T00:30:00.000Z"),
    "2026-03-01T00:30:00.000Z",
  );
  for (const value of [
    "2026-03-01",
    "2026-03-01T00:00:00-03:00",
    "2026-02-29T00:00:00.000Z",
    "2026-03-01T24:00:00.000Z",
    "2026-03-01T00:00:60.000Z",
  ])
    assert.throws(() => utcInstant(value));
});
test("titular válido con evento y relaciones propias", () => {
  assert.equal(
    requireOwnedResources("synthetic-a", [
      { ownerId: "synthetic-a" },
      { ownerId: "synthetic-a" },
    ]),
    "synthetic-a",
  );
});
test("sin identidad, recurso ausente o relación ajena: mismo rechazo", () => {
  for (const owner of [
    undefined,
    null,
    "",
    " synthetic-a ",
    { ownerId: "synthetic-a" },
  ])
    assert.throws(() => requireOwnedResources(owner, []), {
      message: "Acceso denegado",
    });
  for (const resources of [
    [null],
    [undefined],
    [{ ownerId: "synthetic-b" }],
    [{ ownerId: "synthetic-a" }, { ownerId: "synthetic-b" }],
  ])
    assert.throws(() => requireOwnedResources("synthetic-a", resources), {
      message: "Acceso denegado",
    });
});
