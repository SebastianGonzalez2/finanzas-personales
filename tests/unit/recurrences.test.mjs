import assert from "node:assert/strict";
import test from "node:test";
import { parseRecurrence } from "../../src/domain/recurrence-definition.ts";
import {
  defaultRecurrenceFrequency,
  daysInRecurrenceMonth,
  isRecurrenceDate,
  isRecurrenceDay,
  isRecurrenceFrequency,
  isRecurrencePeriodStatus,
  isRecurrenceSchedule,
  latestRecurrencePeriod,
  periodIsPending,
  periodIsSettled,
  recurrenceIsFinished,
  recurrenceLifecycle,
  recurrencePeriodAt,
  recurrencePeriodDueDate,
  recurrencePeriodKeyAt,
  recurrencePeriods,
} from "../../src/domain/recurrences.ts";

test("F4-01 valida frecuencias, días y fechas sin aceptar valores ambiguos", () => {
  assert.equal(defaultRecurrenceFrequency, "monthly");
  for (const frequency of ["weekly", "monthly", "quarterly", "yearly"])
    assert.equal(isRecurrenceFrequency(frequency), true);
  for (const frequency of ["daily", "MONTHLY", "semanal", "", null, 1])
    assert.equal(isRecurrenceFrequency(frequency), false);

  for (const day of [1, 28, 29, 30, 31])
    assert.equal(isRecurrenceDay(day), true);
  for (const day of [
    0,
    32,
    -1,
    1.5,
    "10",
    Number.NaN,
    Number.POSITIVE_INFINITY,
  ])
    assert.equal(isRecurrenceDay(day), false);

  for (const date of ["2026-11-10", "2024-02-29", "2000-02-29", "9999-12-31"])
    assert.equal(isRecurrenceDate(date), true);
  for (const date of [
    "2025-02-29",
    "1900-02-29",
    "2026-02-30",
    "2026-04-31",
    "2026-11-00",
    "2026-13-01",
    "0000-01-01",
    "2026-1-01",
    "2026-01-01\n",
    "2026-01-01T00:00:00Z",
  ])
    assert.equal(isRecurrenceDate(date), false);
});

test("F4-01 conoce la longitud real de cada mes, incluidos siglos no bisiestos", () => {
  const cases = {
    [2025]: [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31],
    [2024]: [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31],
    [1900]: [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31],
    [2000]: [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31],
  };
  for (const [year, days] of Object.entries(cases).map(([year, days]) => [
    Number(year),
    days,
  ]))
    for (const [index, expected] of days.entries())
      assert.equal(daysInRecurrenceMonth(year, index + 1), expected);
  for (const [year, month] of [
    [0, 1],
    [10000, 1],
    [2026, 0],
    [2026, 13],
    [2026, 1.5],
  ])
    assert.throws(() => daysInRecurrenceMonth(year, month));
});

test("F4-01 ajusta meses cortos y recupera el día habitual al mes siguiente", () => {
  const schedule = {
    frequency: "monthly",
    firstPeriod: "2026-01-31",
    dueDay: 31,
  };
  const periods = recurrencePeriods(schedule, "2026-06-30");
  assert.deepEqual(
    periods.map((period) => [period.key, period.startsOn, period.dueOn]),
    [
      ["2026-01", "2026-01-01", "2026-01-31"],
      ["2026-02", "2026-02-01", "2026-02-28"],
      ["2026-03", "2026-03-01", "2026-03-31"],
      ["2026-04", "2026-04-01", "2026-04-30"],
      ["2026-05", "2026-05-01", "2026-05-31"],
      ["2026-06", "2026-06-01", "2026-06-30"],
    ],
  );

  assert.equal(
    recurrencePeriodDueDate(
      { frequency: "monthly", firstPeriod: "2024-01-31", dueDay: 31 },
      1,
    ),
    "2024-02-29",
  );
  assert.equal(
    recurrencePeriodDueDate(
      { frequency: "monthly", firstPeriod: "2024-01-31", dueDay: 30 },
      1,
    ),
    "2024-02-29",
  );
  assert.equal(
    recurrencePeriodDueDate(
      { frequency: "monthly", firstPeriod: "2024-01-31", dueDay: 30 },
      2,
    ),
    "2024-03-30",
  );
  assert.equal(
    recurrencePeriodDueDate(
      { frequency: "monthly", firstPeriod: "2026-01-31" },
      1,
    ),
    "2026-02-28",
  );
  assert.equal(
    recurrencePeriodDueDate(
      { frequency: "monthly", firstPeriod: "2026-01-31" },
      2,
    ),
    "2026-03-31",
  );
  assert.equal(
    recurrencePeriodDueDate(
      { frequency: "monthly", firstPeriod: "2026-01-31", dueDay: 31 },
      0,
    ),
    "2026-01-31",
  );
});

test("F4-01 calcula trimestres con fin de mes y cambio de año", () => {
  const schedule = {
    frequency: "quarterly",
    firstPeriod: "2026-11-15",
    dueDay: 31,
  };
  assert.deepEqual(
    [0, 1, 2, 3, 4, 5].map((offset) => recurrencePeriodAt(schedule, offset)),
    [
      {
        index: 0,
        key: "2026-Q4",
        startsOn: "2026-10-01",
        dueOn: "2026-11-15",
      },
      {
        index: 1,
        key: "2027-Q1",
        startsOn: "2027-01-01",
        dueOn: "2027-02-28",
      },
      {
        index: 2,
        key: "2027-Q2",
        startsOn: "2027-04-01",
        dueOn: "2027-05-31",
      },
      {
        index: 3,
        key: "2027-Q3",
        startsOn: "2027-07-01",
        dueOn: "2027-08-31",
      },
      {
        index: 4,
        key: "2027-Q4",
        startsOn: "2027-10-01",
        dueOn: "2027-11-30",
      },
      {
        index: 5,
        key: "2028-Q1",
        startsOn: "2028-01-01",
        dueOn: "2028-02-29",
      },
    ],
  );

  assert.deepEqual(
    [0, 1, 2, 3, 4].map((offset) =>
      recurrencePeriodDueDate(
        { frequency: "quarterly", firstPeriod: "2026-01-31", dueDay: 31 },
        offset,
      ),
    ),
    ["2026-01-31", "2026-04-30", "2026-07-31", "2026-10-31", "2027-01-31"],
  );
});

test("F4-01 calcula años bisiestos y conserva el día habitual", () => {
  const leap = { frequency: "yearly", firstPeriod: "2024-02-29" };
  assert.deepEqual(
    [0, 1, 2, 3, 4].map((offset) => recurrencePeriodAt(leap, offset)),
    [
      {
        index: 0,
        key: "2024",
        startsOn: "2024-01-01",
        dueOn: "2024-02-29",
      },
      {
        index: 1,
        key: "2025",
        startsOn: "2025-01-01",
        dueOn: "2025-02-28",
      },
      {
        index: 2,
        key: "2026",
        startsOn: "2026-01-01",
        dueOn: "2026-02-28",
      },
      {
        index: 3,
        key: "2027",
        startsOn: "2027-01-01",
        dueOn: "2027-02-28",
      },
      {
        index: 4,
        key: "2028",
        startsOn: "2028-01-01",
        dueOn: "2028-02-29",
      },
    ],
  );
  assert.equal(
    recurrencePeriodDueDate(
      { frequency: "yearly", firstPeriod: "2026-12-31", dueDay: 31 },
      1,
    ),
    "2027-12-31",
  );
});

test("F4-01 agenda semanalmente cada siete días sin depender del mes ni del huso", () => {
  const schedule = {
    frequency: "weekly",
    firstPeriod: "2026-12-28",
    dueDay: 15,
  };
  assert.deepEqual(
    [0, 1, 2, 3].map((offset) => recurrencePeriodAt(schedule, offset)),
    [
      {
        index: 0,
        key: "2026-12-28",
        startsOn: "2026-12-28",
        dueOn: "2026-12-28",
      },
      {
        index: 1,
        key: "2027-01-04",
        startsOn: "2027-01-04",
        dueOn: "2027-01-04",
      },
      {
        index: 2,
        key: "2027-01-11",
        startsOn: "2027-01-11",
        dueOn: "2027-01-11",
      },
      {
        index: 3,
        key: "2027-01-18",
        startsOn: "2027-01-18",
        dueOn: "2027-01-18",
      },
    ],
  );
  assert.equal(
    recurrencePeriodDueDate(
      { frequency: "weekly", firstPeriod: "2024-02-26" },
      1,
    ),
    "2024-03-04",
  );
  assert.equal(
    recurrencePeriodDueDate(
      { frequency: "weekly", firstPeriod: "2026-12-31" },
      1,
    ),
    "2027-01-07",
  );
});

test("F4-01 no crea períodos antes del primer período configurado (CA-044)", () => {
  const schedule = {
    frequency: "monthly",
    firstPeriod: "2027-01-10",
    dueDay: 10,
  };
  assert.deepEqual(recurrencePeriods(schedule, "2026-12-31"), []);
  assert.deepEqual(recurrencePeriods(schedule, "2027-01-09"), []);
  assert.deepEqual(
    recurrencePeriods(schedule, "2027-03-31").map((period) => period.key),
    ["2027-01", "2027-02", "2027-03"],
  );
  assert.deepEqual(
    recurrencePeriods(schedule, "2027-01-10").map((period) => period.dueOn),
    ["2027-01-10"],
  );

  const quarterly = {
    frequency: "quarterly",
    firstPeriod: "2027-02-10",
    dueDay: 10,
  };
  assert.deepEqual(recurrencePeriods(quarterly, "2027-01-31"), []);
  assert.deepEqual(
    recurrencePeriods(quarterly, "2027-12-31").map((period) => period.key),
    ["2027-Q1", "2027-Q2", "2027-Q3", "2027-Q4"],
  );

  const yearly = {
    frequency: "yearly",
    firstPeriod: "2027-06-01",
    dueDay: 1,
  };
  assert.deepEqual(recurrencePeriods(yearly, "2026-12-31"), []);
});

test("F4-01 respeta la fecha final inclusive y deja de generar períodos después", () => {
  const schedule = {
    frequency: "monthly",
    firstPeriod: "2026-01-31",
    dueDay: 31,
    endDate: "2026-02-28",
  };
  assert.deepEqual(
    recurrencePeriods(schedule, "2026-12-31").map((period) => period.key),
    ["2026-01", "2026-02"],
  );
  assert.deepEqual(
    recurrencePeriods({ ...schedule, endDate: "2026-02-27" }, "2026-12-31").map(
      (period) => period.key,
    ),
    ["2026-01"],
  );
  assert.deepEqual(
    recurrencePeriods({ ...schedule, endDate: "2025-12-31" }, "2026-12-31"),
    [],
  );
  assert.deepEqual(
    recurrencePeriods(
      {
        frequency: "quarterly",
        firstPeriod: "2026-01-31",
        dueDay: 31,
        endDate: "2026-04-29",
      },
      "2026-12-31",
    ).map((period) => period.key),
    ["2026-Q1"],
  );
  assert.deepEqual(
    recurrencePeriods(
      { frequency: "weekly", firstPeriod: "2026-01-01", endDate: "2026-01-15" },
      "2026-12-31",
    ).map((period) => period.key),
    ["2026-01-01", "2026-01-08", "2026-01-15"],
  );
});

test("F4-01 no inventa vencimientos cuando el día es aproximado o desconocido", () => {
  const schedule = {
    frequency: "monthly",
    firstPeriod: "2026-01-15",
    dueDay: null,
  };
  assert.deepEqual(recurrencePeriodAt(schedule, 0), {
    index: 0,
    key: "2026-01",
    startsOn: "2026-01-01",
    dueOn: null,
  });
  assert.deepEqual(recurrencePeriodAt(schedule, 1), {
    index: 1,
    key: "2026-02",
    startsOn: "2026-02-01",
    dueOn: null,
  });
  assert.deepEqual(
    recurrencePeriods(schedule, "2026-01-31").map((period) => period.key),
    ["2026-01"],
  );
  assert.deepEqual(
    recurrencePeriods(schedule, "2026-02-01").map((period) => period.key),
    ["2026-01", "2026-02"],
  );
  assert.deepEqual(
    recurrencePeriods({ ...schedule, endDate: "2026-01-20" }, "2026-12-31").map(
      (period) => period.key,
    ),
    ["2026-01"],
  );
});

test("F4-01 valida la definición y normaliza solo la referencia y los datos de alta", () => {
  const input = {
    kind: "expense",
    concept: " Seguro sintético ",
    currency: "USD",
    firstPeriod: "2027-01-31",
    idempotencyKey: "e6b60819-779b-4b4a-bf22-99a14a65c405",
  };
  const exact = parseRecurrence({
    ...input,
    dateMode: "exact",
    referenceAmount: "1,2345",
  });
  assert.equal(exact.concept, "Seguro sintético");
  assert.equal(exact.referenceAmount, "1.2345");
  assert.equal(exact.frequency, "monthly");
  assert.equal(exact.dueDay, 31);
  assert.equal(parseRecurrence(input).referenceAmount, null);
  assert.equal(
    parseRecurrence({ ...input, frequency: "weekly", dateMode: "exact" })
      .dueDay,
    null,
  );
  for (const invalid of [
    { firstPeriod: "2027-02-29" },
    { endDate: "2027-01-30" },
    { endDate: "2027-01-31\n" },
    { dateMode: "none", dueDay: 10 },
    { frequency: "weekly", dateMode: "exact", dueDay: 10 },
    { dateMode: "exact", dueDay: 32 },
    { referenceAmount: 1.25 },
    { referenceAmount: "1.00001" },
    { referenceAmount: "0" },
    { referenceAmount: "-1" },
    { ownerId: "ajeno" },
    { paused: true },
  ])
    assert.ok("error" in parseRecurrence({ ...input, ...invalid }));
});

test("F4-01 obtiene el último período previsto sin truncar ni inventar vencimientos", () => {
  for (const frequency of ["weekly", "monthly", "quarterly", "yearly"]) {
    for (const dueDay of [undefined, null, 31]) {
      const schedule = {
        frequency,
        firstPeriod: "2024-02-29",
        endDate: "2027-01-15",
        dueDay,
      };
      for (const through of [
        "2024-02-28",
        "2024-02-29",
        "2024-12-01",
        "2025-03-01",
        "2030-01-01",
      ]) {
        assert.deepEqual(
          latestRecurrencePeriod(schedule, through),
          recurrencePeriods(schedule, through).at(-1) ?? null,
        );
      }
    }
  }
  const weekly = {
    frequency: "weekly",
    firstPeriod: "0001-01-01",
    dueDay: null,
  };
  const latest = latestRecurrencePeriod(weekly, "9999-12-31");
  assert.equal(latest.dueOn, null);
  assert.ok(latest.index > 1000);
  assert.equal(
    recurrencePeriodKeyAt(
      { frequency: "yearly", firstPeriod: "0001-01-01" },
      0,
    ),
    "0001",
  );
});

test("F4-01 expone claves estables y estados sin efectos monetarios", () => {
  assert.equal(
    recurrencePeriodKeyAt(
      { frequency: "monthly", firstPeriod: "2026-01-31", dueDay: 31 },
      1,
    ),
    "2026-02",
  );
  assert.equal(
    recurrencePeriodKeyAt(
      { frequency: "quarterly", firstPeriod: "2026-01-31", dueDay: 31 },
      1,
    ),
    "2026-Q2",
  );
  assert.equal(
    recurrencePeriodKeyAt(
      { frequency: "yearly", firstPeriod: "2026-01-31", dueDay: 31 },
      1,
    ),
    "2027",
  );

  assert.equal(recurrenceIsFinished(null, "2026-11-11"), false);
  assert.equal(recurrenceIsFinished("2026-12-31", "2026-12-31"), false);
  assert.equal(recurrenceIsFinished("2026-12-31", "2027-01-01"), true);
  assert.throws(() => recurrenceIsFinished("2026-02-30", "2026-11-11"));

  assert.equal(recurrenceLifecycle({ paused: false }, "2026-11-11"), "active");
  assert.equal(recurrenceLifecycle({ paused: true }, "2026-11-11"), "paused");
  assert.equal(
    recurrenceLifecycle({ paused: true, endDate: "2026-11-10" }, "2026-11-11"),
    "finished",
  );

  for (const status of ["expected", "partial", "completed", "skipped"])
    assert.equal(isRecurrencePeriodStatus(status), true);
  for (const status of ["paid", "pending", "", null, 1])
    assert.equal(isRecurrencePeriodStatus(status), false);
  assert.equal(periodIsPending("expected"), true);
  assert.equal(periodIsPending("partial"), true);
  assert.equal(periodIsPending("completed"), false);
  assert.equal(periodIsSettled("completed"), true);
  assert.equal(periodIsSettled("skipped"), true);
  assert.equal(periodIsSettled("expected"), false);
});

test("F4-01 rechaza calendarios inválidos, desbordes y límites incorrectos", () => {
  for (const invalid of [
    { frequency: "daily", firstPeriod: "2026-01-01" },
    { frequency: "monthly", firstPeriod: "2026-02-30" },
    { frequency: "monthly", firstPeriod: "2026-01-01", dueDay: 0 },
    { frequency: "monthly", firstPeriod: "2026-01-01", dueDay: 32 },
    { frequency: "monthly", firstPeriod: "2026-01-01", endDate: "2026-02-30" },
  ])
    assert.equal(isRecurrenceSchedule(invalid), false);
  assert.equal(
    isRecurrenceSchedule({
      frequency: "monthly",
      firstPeriod: "2026-01-01",
      dueDay: 31,
      endDate: "2026-12-31",
    }),
    true,
  );

  assert.throws(() =>
    recurrencePeriodAt({ frequency: "monthly", firstPeriod: "2026-01-01" }, -1),
  );
  assert.throws(() =>
    recurrencePeriodAt(
      { frequency: "monthly", firstPeriod: "2026-01-01" },
      1.5,
    ),
  );
  assert.throws(() =>
    recurrencePeriods(
      { frequency: "monthly", firstPeriod: "2026-01-01" },
      "2026-02-30",
    ),
  );
  assert.throws(() =>
    recurrencePeriods(
      { frequency: "monthly", firstPeriod: "2026-01-01" },
      "2026-12-31",
      -1,
    ),
  );
  assert.deepEqual(
    recurrencePeriods(
      { frequency: "monthly", firstPeriod: "2026-01-01" },
      "2026-12-31",
      2,
    ).map((period) => period.key),
    ["2026-01", "2026-02"],
  );

  assert.throws(() =>
    recurrencePeriodAt({ frequency: "monthly", firstPeriod: "9999-12-31" }, 1),
  );
  assert.throws(() =>
    recurrencePeriodAt({ frequency: "yearly", firstPeriod: "9999-01-01" }, 1),
  );
  assert.throws(() =>
    recurrencePeriodAt({ frequency: "weekly", firstPeriod: "9999-12-25" }, 1),
  );
});
