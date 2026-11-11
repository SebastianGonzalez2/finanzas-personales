import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import {
  parseBudgetAmount,
  parseBudgetCommand,
  parseBudgetMonth,
} from "../../src/domain/budgets.ts";

const today = "2026-11-10";

const save = {
  action: "save",
  categoryId: randomUUID(),
  currency: "UYU",
  amount: "10.000",
  idempotencyKey: randomUUID(),
};

test("F3-06 acepta el alta de un presupuesto con importe y moneda normalizados", () => {
  assert.deepEqual(parseBudgetCommand(save, today), {
    ...save,
    categoryId: save.categoryId.toLowerCase(),
    amount: "10.0000",
    idempotencyKey: save.idempotencyKey.toLowerCase(),
  });
  assert.equal(parseBudgetAmount(" 15,5 "), "15.5000");
  for (const invalid of [
    { ...save, amount: "0" },
    { ...save, amount: "-5" },
    { ...save, amount: "1.2.3" },
    { ...save, currency: "BRL" },
    { ...save, categoryId: "no-es-uuid" },
    { ...save, idempotencyKey: "no-es-uuid" },
    { ...save, extra: "dato" },
  ])
    assert.ok("error" in parseBudgetCommand(invalid, today));
});

test("F3-06 edita límite solo con moneda, importe y versión del presupuesto", () => {
  const edit = {
    action: "edit",
    budgetId: randomUUID(),
    version: 3,
    currency: "EUR",
    amount: "220",
    idempotencyKey: randomUUID(),
  };
  assert.deepEqual(parseBudgetCommand(edit, today), {
    ...edit,
    budgetId: edit.budgetId.toLowerCase(),
    amount: "220.0000",
    idempotencyKey: edit.idempotencyKey.toLowerCase(),
  });
  for (const invalid of [
    { ...edit, version: 0 },
    { ...edit, version: 1.5 },
    { ...edit, currency: "USD", amount: "" },
  ])
    assert.ok("error" in parseBudgetCommand(invalid, today));
});

test("F3-06 la excepción aplica solo al mes actual o a un futuro próximo", () => {
  const exception = {
    action: "exception",
    budgetId: randomUUID(),
    version: 1,
    month: "2026-12",
    amount: "15.000",
    idempotencyKey: randomUUID(),
  };
  assert.deepEqual(parseBudgetCommand(exception, today), {
    ...exception,
    budgetId: exception.budgetId.toLowerCase(),
    amount: "15.0000",
    idempotencyKey: exception.idempotencyKey.toLowerCase(),
  });
  assert.equal(parseBudgetMonth("2026-11", today), "2026-11");
  assert.equal(parseBudgetMonth("2027-11", today), "2027-11");
  for (const invalid of [
    "2026-10",
    "2027-12",
    "2026-13",
    "2026-00",
    "dic-2026",
    "",
  ])
    assert.equal(parseBudgetMonth(invalid, today), null);
  assert.ok(
    "error" in parseBudgetCommand({ ...exception, month: "2025-12" }, today),
  );
});

test("F3-06 quitar presupuesto exige identidad y versión del propietario", () => {
  const remove = {
    action: "remove",
    budgetId: randomUUID(),
    version: 2,
    idempotencyKey: randomUUID(),
  };
  assert.deepEqual(parseBudgetCommand(remove, today), {
    ...remove,
    budgetId: remove.budgetId.toLowerCase(),
    idempotencyKey: remove.idempotencyKey.toLowerCase(),
  });
  for (const invalid of [
    { ...remove, version: "2" },
    { ...remove, budgetId: "" },
    { ...remove, action: "delete" },
  ])
    assert.ok("error" in parseBudgetCommand(invalid, today));
});
