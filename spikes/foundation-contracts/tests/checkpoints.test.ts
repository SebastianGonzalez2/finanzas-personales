import assert from "node:assert/strict";
import test from "node:test";
import { Money } from "../money.ts";
import { correctBankEffect, projectBank } from "../checkpoints.ts";
import type { BankEffect, Checkpoint, TimelineEntry } from "../checkpoints.ts";

const ownerId = "synthetic-a";
const m = (value: string) => Money.parse(value, "UYU");
const effect = (
  id: string,
  effectiveDate: string,
  sequence: number,
  value: string,
  status: BankEffect["status"] = "confirmed",
): BankEffect =>
  Object.freeze({
    kind: "bank-effect",
    id,
    ownerId,
    effectiveDate,
    sequence,
    amount: m(value),
    status,
  });
const anchor = (
  id: string,
  effectiveDate: string,
  sequence: number,
  value: string,
): Checkpoint =>
  Object.freeze({
    kind: "checkpoint",
    id,
    ownerId,
    effectiveDate,
    sequence,
    confirmed: m(value),
  });
const timeline = Object.freeze([
  anchor("opening", "2026-01-01", 0, "1000"),
  effect("february", "2026-02-01", 0, "-100"),
  anchor("march", "2026-03-01", 0, "900"),
  effect("april", "2026-04-01", 0, "100"),
  anchor("may", "2026-05-01", 0, "1000"),
  effect("june", "2026-06-01", 0, "-10"),
]);
const command = {
  eventId: "february",
  replacement: m("-150"),
  reason: "Corrección sintética",
  recordedAt: "2026-06-15T12:00:00.000Z",
};

test("CA-015/I-10: corregir febrero conserva dos anclas y saldo posterior", () => {
  const before = projectBank(ownerId, "UYU", timeline);
  const corrected = correctBankEffect(ownerId, timeline, command);
  const after = projectBank(ownerId, "UYU", corrected.timeline);
  assert.equal(before.balance.toDecimal(), "990.0000");
  assert.equal(after.balance.toDecimal(), "990.0000");
  assert.equal(
    before.differences
      .find((d) => d.checkpointId === "march")
      ?.difference.toDecimal(),
    "0.0000",
  );
  assert.equal(
    after.differences
      .find((d) => d.checkpointId === "march")
      ?.difference.toDecimal(),
    "50.0000",
  );
  assert.equal(
    after.differences
      .find((d) => d.checkpointId === "may")
      ?.difference.toDecimal(),
    "0.0000",
  );
  assert.equal(
    corrected.timeline[1].kind === "bank-effect" &&
      corrected.timeline[1].amount.toDecimal(),
    "-150.0000",
  );
  assert.equal(corrected.timeline[2], timeline[2]);
  assert.equal(corrected.timeline[4], timeline[4]);
  assert.equal(corrected.timeline.length, timeline.length); // No compensating event.
  assert.equal(
    timeline[1].kind === "bank-effect" && timeline[1].amount.toDecimal(),
    "-100.0000",
  );
  assert.equal(corrected.audit.before.amount, "-100.0000");
  assert.equal(corrected.audit.after.amount, "-150.0000");
  assert.equal(corrected.audit.actorOwnerId, ownerId);
});

test("efectos posteriores al último checkpoint sí cambian saldo actual", () => {
  const corrected = correctBankEffect(ownerId, timeline, {
    ...command,
    eventId: "june",
    replacement: m("-20"),
  });
  assert.equal(
    projectBank(ownerId, "UYU", corrected.timeline).balance.toDecimal(),
    "980.0000",
  );
});

test("orden estable explícito el mismo día; array desordenado no altera proyección", () => {
  const entries = [
    effect("after", "2026-01-01", 3, "-20"),
    anchor("same-day", "2026-01-01", 2, "80"),
    effect("before", "2026-01-01", 1, "100"),
  ];
  assert.equal(
    projectBank(ownerId, "UYU", entries).balance.toDecimal(),
    "60.0000",
  );
  assert.equal(
    projectBank(ownerId, "UYU", entries).differences[0].difference.toDecimal(),
    "-20.0000",
  );
  assert.equal(entries[0].id, "after");
});

test("anulación/pending no se contabilizan y monedas independientes", () => {
  const entries = [
    ...timeline,
    effect("pending", "2026-06-02", 0, "-900", "pending"),
    effect("voided", "2026-06-03", 0, "-700", "voided"),
    {
      ...effect("usd", "2026-06-04", 0, "0"),
      amount: Money.parse("25.50", "USD"),
    },
  ];
  assert.equal(
    projectBank(ownerId, "UYU", entries).balance.toDecimal(),
    "990.0000",
  );
  assert.equal(
    projectBank(ownerId, "USD", entries).balance.toDecimal(),
    "25.5000",
  );
  assert.equal(
    projectBank(ownerId, "EUR", entries).balance.toDecimal(),
    "0.0000",
  );
});

test("sin checkpoint, suma exacta; diferencias no crean gasto ni ingreso", () => {
  const entries = [
    effect("a", "2026-01-01", 0, "0.1"),
    effect("b", "2026-01-02", 0, "0.2"),
  ];
  assert.equal(
    projectBank(ownerId, "UYU", entries).balance.toDecimal(),
    "0.3000",
  );
  assert.equal(projectBank(ownerId, "UYU", entries).differences.length, 0);
});

test("rechaza dueño ajeno, duplicación, orden ambiguo y edición de ancla", () => {
  const invalid: readonly TimelineEntry[][] = [
    [
      ...timeline,
      { ...effect("foreign", "2026-07-01", 0, "1"), ownerId: "synthetic-b" },
    ],
    [...timeline, timeline[1]],
    [effect("a", "2026-01-01", 0, "1"), anchor("b", "2026-01-01", 0, "1")],
  ];
  for (const entries of invalid)
    assert.throws(() => projectBank(ownerId, "UYU", entries));
  assert.throws(() => projectBank(null, "UYU", timeline));
  assert.throws(() =>
    correctBankEffect(ownerId, timeline, { ...command, eventId: "march" }),
  );
  assert.throws(() =>
    correctBankEffect(ownerId, timeline, {
      ...command,
      replacement: Money.parse("1", "USD"),
    }),
  );
  assert.throws(() =>
    correctBankEffect(ownerId, timeline, { ...command, reason: "" }),
  );
});

test("corrección inválida por overflow deja entrada intacta, sin resultado parcial", () => {
  const entries = Object.freeze([
    effect("large", "2026-01-01", 0, "9999999999999999.9998"),
    effect("small", "2026-01-02", 0, "0.0001"),
  ]);
  assert.throws(() =>
    correctBankEffect(ownerId, entries, {
      ...command,
      eventId: "small",
      replacement: m("0.0002"),
    }),
  );
  assert.equal(entries[1].amount.toDecimal(), "0.0001");
  assert.equal(
    projectBank(ownerId, "UYU", entries).balance.toDecimal(),
    "9999999999999999.9999",
  );
});
