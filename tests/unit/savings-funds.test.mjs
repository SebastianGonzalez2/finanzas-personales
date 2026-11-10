import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { parseFundCommand } from "../../src/domain/savings-funds.ts";

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
