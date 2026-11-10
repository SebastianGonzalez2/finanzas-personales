import assert from "node:assert/strict";
import test from "node:test";
import {
  contributionDate,
  contributionDayInMonth,
  contributionIsDue,
  contributionMonthAfter,
  daysInContributionMonth,
  firstContributionDate,
  isCalendarDate,
  isContributionDay,
  isContributionMonth,
} from "../../src/domain/scheduled-contributions.ts";

test("F3-03 valida meses, días y fechas calendario sin aceptar valores ambiguos", () => {
  for (const month of ["2026-01", "2024-02", "9999-12"])
    assert.equal(isContributionMonth(month), true);
  for (const month of [
    "2026-00",
    "2026-13",
    "2026-1",
    "0000-01",
    "2026-01-01",
    202601,
  ])
    assert.equal(isContributionMonth(month), false);

  for (const day of [1, 28, 29, 30, 31])
    assert.equal(isContributionDay(day), true);
  for (const day of [
    0,
    32,
    -1,
    1.5,
    "10",
    Number.NaN,
    Number.POSITIVE_INFINITY,
  ])
    assert.equal(isContributionDay(day), false);

  for (const date of ["2026-11-10", "2024-02-29", "2000-02-29"])
    assert.equal(isCalendarDate(date), true);
  for (const date of [
    "2025-02-29",
    "2026-02-30",
    "2026-04-31",
    "2026-11-00",
    "2026-13-01",
    "0000-01-01",
    "2026-1-01",
    "2026-01-01T00:00:00Z",
  ])
    assert.equal(isCalendarDate(date), false);
});

test("F3-03 conoce la longitud real de cada mes, incluidos siglos no bisiestos", () => {
  const cases = {
    "2025-01": 31,
    "2024-02": 29,
    "2025-02": 28,
    "2000-02": 29,
    "1900-02": 28,
    "2100-02": 28,
    "2026-04": 30,
    "2026-06": 30,
    "2026-09": 30,
    "2026-11": 30,
    "2026-12": 31,
  };
  for (const [month, days] of Object.entries(cases))
    assert.equal(daysInContributionMonth(month), days, month);
  for (const invalid of ["2026-00", "2026-13", "2026-1", "febrero"])
    assert.throws(() => daysInContributionMonth(invalid));
});

test("F3-03 ajusta días inexistentes al último día del mes y recupera el día elegido después", () => {
  const cases = [
    ["2024-02", 31, "2024-02-29"],
    ["2025-02", 31, "2025-02-28"],
    ["2024-02", 29, "2024-02-29"],
    ["2025-02", 29, "2025-02-28"],
    ["2024-02", 30, "2024-02-29"],
    ["2026-04", 31, "2026-04-30"],
    ["2026-04", 30, "2026-04-30"],
    ["2026-06", 31, "2026-06-30"],
    ["2026-09", 31, "2026-09-30"],
    ["2026-11", 31, "2026-11-30"],
    ["2026-12", 31, "2026-12-31"],
    ["2026-01", 31, "2026-01-31"],
  ];
  for (const [month, day, expected] of cases)
    assert.equal(contributionDate(month, day), expected, `${month}/${day}`);
  assert.equal(contributionDayInMonth("2024-02", 31), 29);
  assert.equal(contributionDayInMonth("2025-02", 31), 28);
  assert.equal(contributionDayInMonth("2026-04", 31), 30);

  assert.deepEqual(
    ["2024-01", "2024-02", "2024-03", "2024-04", "2024-05"].map((month) =>
      contributionDate(month, 31),
    ),
    ["2024-01-31", "2024-02-29", "2024-03-31", "2024-04-30", "2024-05-31"],
  );
  for (const invalid of [0, 32, 1.5])
    assert.throws(() => contributionDate("2026-11", invalid));
});

test("F3-03 agenda la primera ejecución en el mes calendario siguiente", () => {
  assert.equal(firstContributionDate("2026-11-20", 10), "2026-12-10");
  assert.equal(firstContributionDate("2026-11-05", 10), "2026-12-10");
  assert.equal(firstContributionDate("2026-11-30", 31), "2026-12-31");
  assert.equal(firstContributionDate("2026-12-31", 31), "2027-01-31");
  assert.equal(firstContributionDate("2026-01-31", 31), "2026-02-28");
  assert.equal(firstContributionDate("2024-01-31", 31), "2024-02-29");
  assert.equal(firstContributionDate("2026-10-01", 15), "2026-11-15");
  assert.equal(contributionMonthAfter("2026-11-30"), "2026-12");
  assert.equal(contributionMonthAfter("2026-12-01"), "2027-01");
  assert.equal(contributionMonthAfter("2024-02-29"), "2024-03");
  for (const invalid of ["2026-11-31", "0000-01-01", "2026-11"])
    assert.throws(() => contributionMonthAfter(invalid));
  assert.throws(() => firstContributionDate("9999-12-31", 1));
});

test("F3-03 compara vencimientos por fecha efectiva sin adelantar ni repetir aportes", () => {
  assert.equal(contributionIsDue("2026-11", 10, "2026-11-10"), true);
  assert.equal(contributionIsDue("2026-11", 10, "2026-11-09"), false);
  assert.equal(contributionIsDue("2026-11", 10, "2026-11-11"), true);
  assert.equal(contributionIsDue("2025-02", 31, "2025-02-27"), false);
  assert.equal(contributionIsDue("2025-02", 31, "2025-02-28"), true);
  assert.equal(contributionIsDue("2024-02", 31, "2024-02-28"), false);
  assert.equal(contributionIsDue("2024-02", 31, "2024-02-29"), true);
  assert.equal(contributionIsDue("2026-04", 31, "2026-04-29"), false);
  assert.equal(contributionIsDue("2026-04", 31, "2026-04-30"), true);
  assert.equal(contributionIsDue("2026-12", 31, "2026-12-30"), false);
  assert.equal(contributionIsDue("2026-12", 31, "2027-01-01"), true);
  assert.throws(() => contributionIsDue("2026-11", 10, "2026-02-30"));
});
