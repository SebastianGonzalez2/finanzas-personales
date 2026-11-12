import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import {
  parseSettlement,
  settlementAmounts,
} from "../../src/domain/recurrence-settlements.ts";

const today = "2026-12-15";
const command = {
  seriesId: randomUUID(),
  idempotencyKey: randomUUID(),
  action: "record",
  amount: "0,3",
  effectiveOn: today,
  method: "debit",
  targets: [
    { index: 1, version: 2, recorded: "0,8", amount: "0.2", total: "1" },
    { index: 0, version: 0, recorded: "0", amount: "0.1", final: true },
  ],
};

test("F4-02: importes exactos, asignaciones únicas y campos por acción", () => {
  const parsed = parseSettlement(command, today);
  assert.equal(parsed.amount, "0.3000");
  assert.deepEqual(
    parsed.targets.map(({ index, amount }) => [index, amount]),
    [
      [0, "0.1000"],
      [1, "0.2000"],
    ],
  );
  for (const invalid of [
    { amount: "0.3001" },
    { amount: 0.3 },
    { amount: "0.30001" },
    { effectiveOn: "2026-12-16" },
    { method: "credit" },
    { ownerId: randomUUID() },
    { targets: [{ ...command.targets[0], amount: "0.3", index: -1 }] },
    { targets: [command.targets[0], { ...command.targets[1], index: 1 }] },
    { targets: [{ ...command.targets[0], amount: "0.3", final: true }] },
    { targets: [{ ...command.targets[0], amount: "0.3", version: 0.5 }] },
  ])
    assert.ok("error" in parseSettlement({ ...command, ...invalid }, today));
});

test("F4-02: solo un total cierto genera restante tras corregir un cobro", () => {
  assert.deepEqual(settlementAmounts("47000.0000", null, "47000.0000", false), {
    status: "completed",
    confirmedTotal: "47000.0000",
    finalized: true,
    remaining: "0.0000",
  });
  assert.deepEqual(settlementAmounts("46000.0000", null, "47000.0000", false), {
    status: "partial",
    confirmedTotal: null,
    finalized: false,
    remaining: null,
  });
  assert.equal(
    settlementAmounts("800.0000", "1800.0000", null, false).remaining,
    "1000.0000",
  );
  assert.equal(settlementAmounts("0.0000", null, null, true).status, "skipped");
});
