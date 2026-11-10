import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import {
  cycleAmount,
  cycleClosingOn,
  defaultCycleDates,
  defaultCycleSchedule,
  defaultStatement,
  parseCycleCommand,
  purchaseCycle,
  statementStatus,
} from "../../src/domain/card-cycles.ts";

const schedule = { ...defaultCycleSchedule, closingDay: 25, dueDay: 10 };

test("F2-04: el cierre mensual respeta excepciones, febrero y fin de año", () => {
  const dates = new Map([
    ["2026-12", { ...defaultCycleDates, closingOn: "2026-12-23" }],
  ]);
  assert.equal(purchaseCycle("2026-12-23", schedule, dates), "2026-12");
  assert.equal(purchaseCycle("2026-12-24", schedule, dates), "2027-01");
  assert.equal(purchaseCycle("2027-01-25", schedule, dates), "2027-01");
  assert.equal(purchaseCycle("2027-01-26", schedule, dates), "2027-02");
  assert.equal(purchaseCycle("2026-12-24", defaultCycleSchedule, dates), null);
  assert.equal(
    cycleClosingOn("2028-02", { ...schedule, closingDay: 31 }),
    "2028-02-29",
  );
  assert.equal(
    cycleClosingOn("2027-02", { ...schedule, closingDay: 31 }),
    "2027-02-28",
  );
});

test("F2-04: fecha oficial y mínimo confirmado prevalecen sobre estimaciones", () => {
  const baseline = {
    period: "2026-12",
    schedule,
    dates: defaultCycleDates,
    statement: defaultStatement,
    estimate: "4000.0001",
    paid: "0.0000",
    today: "2027-01-06",
  };
  assert.equal(statementStatus(baseline).dueOn, "2027-01-10");
  assert.equal(statementStatus(baseline).alert, null);
  assert.equal(
    statementStatus({ ...baseline, today: "2027-01-07" }).alert,
    "pending",
  );
  assert.equal(
    statementStatus({ ...baseline, schedule: { ...schedule, leadDays: 4 } })
      .alert,
    "pending",
  );
  assert.equal(
    statementStatus({ ...baseline, schedule: defaultCycleSchedule }).dueOn,
    null,
  );
  const dates = { ...defaultCycleDates, dueOn: "2027-01-08" };
  assert.equal(statementStatus({ ...baseline, dates }).dueSource, "exception");
  const statement = {
    ...defaultStatement,
    officialAmount: "5500.0000",
    minimumAmount: "1000.0000",
    dueOn: "2027-01-09",
  };
  const result = statementStatus({
    ...baseline,
    statement,
    dates,
    paid: "1000.0000",
  });
  assert.equal(result.dueOn, "2027-01-09");
  assert.equal(result.dueSource, "official");
  assert.equal(result.remaining, "4500.0000");
  assert.equal(result.difference, "1499.9999");
  assert.equal(result.alert, "informative");
  assert.equal(
    statementStatus({ ...baseline, statement, paid: "999.9999" }).alert,
    "pending",
  );
  assert.equal(
    statementStatus({ ...baseline, statement, paid: "5500.0000" }).alert,
    null,
  );
  assert.equal(
    cycleAmount(["9999999999999999.9999", "0.0001"]),
    "10000000000000000.0000",
  );
});

test("F2-04: rechaza datos ambiguos, fechas imposibles y mínimos sin total", () => {
  const base = {
    idempotencyKey: randomUUID(),
    cardId: randomUUID(),
    version: 0,
    period: "2026-02",
  };
  const command = {
    ...base,
    scope: "statement",
    currency: "UYU",
    officialAmount: "12,0001",
    minimumAmount: "12",
    dueOn: "2026-03-10",
  };
  assert.equal(parseCycleCommand(command).officialAmount, "12.0001");
  for (const input of [
    { ...command, officialAmount: "" },
    { ...command, minimumAmount: "13" },
    { ...command, dueOn: "2026-02-29" },
    { ...command, ownerId: "b" },
    { ...command, period: "2026-00" },
    { ...base, scope: "dates", closingOn: "2026-03-01", dueOn: "" },
  ])
    assert.ok("error" in parseCycleCommand(input));
});
