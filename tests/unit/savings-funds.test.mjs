import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import {
  monthsUntil,
  orientativeMonthlySaving,
  parseFundCommand,
  parseFundDate,
} from "../../src/domain/savings-funds.ts";

const create = {
  action: "create",
  name: " Vacaciones ",
  currency: "USD",
  idempotencyKey: randomUUID(),
};

test("F3-01 normaliza el alta de un fondo sin aceptar dinero ni propietario", () => {
  assert.deepEqual(parseFundCommand(create), {
    ...create,
    name: "Vacaciones",
    idempotencyKey: create.idempotencyKey.toLowerCase(),
  });
  for (const invalid of [
    { ownerId: "otro" },
    { reservedAmount: "100" },
    { targetAmount: "100" },
    { status: "closed" },
    { currency: "BRL" },
    { name: "" },
    { name: " ".repeat(3) },
    { name: "x".repeat(101) },
    { name: "fondo\0oculto" },
    { idempotencyKey: "no-es-uuid" },
  ])
    assert.ok("error" in parseFundCommand({ ...create, ...invalid }));
});

test("F3-01 permite editar nombre y estado sin cambiar moneda ni reservas", () => {
  const update = {
    action: "update",
    fundId: randomUUID(),
    version: 2,
    name: " Emergencia ",
    status: "paused_manual",
    idempotencyKey: randomUUID(),
  };
  assert.deepEqual(parseFundCommand(update), {
    ...update,
    fundId: update.fundId.toLowerCase(),
    name: "Emergencia",
    targetAmount: null,
    targetDate: null,
    idempotencyKey: update.idempotencyKey.toLowerCase(),
  });
  for (const invalid of [
    { currency: "USD" },
    { reservedAmount: "1" },
    { version: 0 },
    { version: 1.5 },
    { fundId: "no-es-uuid" },
    { status: "closed" },
    { status: "paused_target_reached" },
    { status: "active " },
  ])
    assert.ok("error" in parseFundCommand({ ...update, ...invalid }));
});

test("F3-01 normaliza importes exactos y valida ambos extremos del traspaso", () => {
  const reserve = {
    action: "reserve",
    fundId: randomUUID(),
    version: 1,
    amount: " 12,3401 ",
    idempotencyKey: randomUUID(),
  };
  assert.deepEqual(parseFundCommand(reserve), {
    ...reserve,
    amount: "12.3401",
  });
  const transfer = {
    ...reserve,
    action: "transfer",
    destinationFundId: randomUUID(),
    destinationVersion: 2,
  };
  assert.deepEqual(parseFundCommand(transfer), {
    ...transfer,
    amount: "12.3401",
  });
  for (const invalid of [
    { amount: 1 },
    { amount: "0" },
    { amount: "-1" },
    { amount: "1e3" },
    { amount: "1.00001" },
    { amount: "10000000000000000" },
    { ownerId: "otro" },
    { currency: "EUR" },
    { destinationFundId: reserve.fundId.toUpperCase() },
    { destinationVersion: 0 },
  ])
    assert.ok("error" in parseFundCommand({ ...transfer, ...invalid }));
  assert.ok("error" in parseFundCommand({ ...transfer, action: "release" }));
});

test("F3-04 acepta meta y fecha objetivo opcionales al editar un fondo", () => {
  const update = {
    action: "update",
    fundId: randomUUID(),
    version: 3,
    name: " Con meta ",
    targetAmount: " 1200,50 ",
    targetDate: " 2027-09-30 ",
    idempotencyKey: randomUUID(),
  };
  assert.deepEqual(parseFundCommand(update), {
    action: "update",
    fundId: update.fundId.toLowerCase(),
    version: 3,
    name: "Con meta",
    targetAmount: "1200.5000",
    targetDate: "2027-09-30",
    idempotencyKey: update.idempotencyKey.toLowerCase(),
  });
  const bare = {
    action: "update",
    fundId: update.fundId,
    version: 3,
    name: "Sin meta",
    targetAmount: null,
    targetDate: null,
    idempotencyKey: randomUUID(),
  };
  const parsed = parseFundCommand(bare);
  assert.ok(!("status" in parsed));
  assert.deepEqual(parsed, {
    ...bare,
    fundId: bare.fundId.toLowerCase(),
    idempotencyKey: bare.idempotencyKey.toLowerCase(),
  });
  for (const invalid of [
    { targetAmount: "0" },
    { targetAmount: "-5" },
    { targetAmount: "1.00001" },
    { targetAmount: 100 },
    { targetDate: "2026-02-30" },
    { targetDate: "2026-13-01" },
    { targetDate: "30/09/2027" },
    { targetDate: 2027 },
    { status: "closed" },
    { status: "paused_target_reached" },
    { extra: "clave" },
  ])
    assert.ok("error" in parseFundCommand({ ...update, ...invalid }));
});

test("F3-04 valida fechas y calcula el ahorro orientativo exacto", () => {
  assert.equal(parseFundDate("2027-09-30"), "2027-09-30");
  assert.equal(parseFundDate(" 2027-09-30 "), "2027-09-30");
  for (const invalid of [
    null,
    "2026-2-3",
    "2026-02-30",
    "2026-13-01",
    "no-fecha",
    20260930,
  ])
    assert.equal(parseFundDate(invalid), null);
  assert.equal(monthsUntil("2026-11-10", "2027-09-30"), 10);
  assert.equal(monthsUntil("2026-11-10", "2026-11-25"), 1);
  assert.equal(orientativeMonthlySaving("400.0000", 10), "40.0000");
  assert.equal(orientativeMonthlySaving("400.0000", 12), "33.3333");
  assert.equal(orientativeMonthlySaving("0.0001", 2), "0.0001");
  assert.equal(orientativeMonthlySaving("50.0000", 1), "50.0000");
  assert.equal(orientativeMonthlySaving("400.0000", 0), null);
  assert.equal(orientativeMonthlySaving("400.0000", 1.5), null);
});
