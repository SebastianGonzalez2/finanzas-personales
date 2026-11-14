import assert from "node:assert/strict";
import { test } from "node:test";
import { summaryPeriods } from "../../src/domain/summary-period.ts";

test("UI-03: seis meses atraviesan el año y se comparan ventanas equivalentes", () => {
  const current = summaryPeriods("2026-02", "2026-02-14");
  assert.deepEqual(current.months, [
    "2025-09",
    "2025-10",
    "2025-11",
    "2025-12",
    "2026-01",
    "2026-02",
  ]);
  assert.equal(current.history.from, "2025-09-01");
  assert.equal(current.selected.to, "2026-02-14");
  assert.equal(current.comparison.to, "2026-01-14");
  assert.equal(summaryPeriods("2026-03", "2026-03-29").comparison, null);
  assert.equal(
    summaryPeriods("2024-02", "2024-03-29").selected.to,
    "2024-02-29",
  );
  assert.equal(
    summaryPeriods("2024-02", "2024-03-29").comparison.to,
    "2024-01-31",
  );
});

test("UI-03: el calendario admite proyecciones futuras y el primer mes válido", () => {
  const future = summaryPeriods("2027-09", "2026-11-14");
  assert.equal(future.selected, null);
  assert.equal(future.history.to, "2026-11-14");
  assert.deepEqual(summaryPeriods("0001-02", "2026-11-14").months, [
    "0001-01",
    "0001-02",
  ]);
});
