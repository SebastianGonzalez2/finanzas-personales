import assert from "node:assert/strict";
import test from "node:test";
import { parseRecurrence } from "../../src/domain/recurrence-definition.ts";
import {
  parseUsualShares,
  suggestShares,
} from "../../src/domain/recurring-shares.ts";

test("F4-04: los porcentajes habituales se validan y conservan el total al redondear", () => {
  const rows = parseUsualShares([
    { name: "  Ana  de prueba ", percentage: "33,3333" },
    { name: "Belén", percentage: "33.3333" },
    { name: "Caro", percentage: "33.3334" },
  ]);
  assert.equal(rows[0].name, "Ana de prueba");
  assert.throws(() =>
    parseUsualShares([...rows, { name: "Otra persona", percentage: "0.0001" }]),
  );
  const shares = rows.map((row, index) => ({ ...row, id: String(index) }));
  assert.deepEqual(suggestShares("0,0002", shares), [
    "0.0000",
    "0.0001",
    "0.0000",
    "0.0001",
  ]);
  assert.deepEqual(
    suggestShares("20000", [{ id: "a", name: "Ana", percentage: "50.0000" }]),
    ["10000.0000", "10000.0000"],
  );
  assert.ok(
    "error" in
      parseRecurrence({
        kind: "income",
        concept: "Ingreso sintético",
        currency: "UYU",
        firstPeriod: "2026-01-01",
        idempotencyKey: "f48d1072-d125-4a46-86b7-349bd8d7befc",
        usualShares: rows,
      }),
  );
});
