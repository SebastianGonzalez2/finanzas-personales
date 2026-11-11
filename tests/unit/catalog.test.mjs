import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import {
  normalizeName,
  parseCatalogCommand,
} from "../../src/domain/catalog.ts";

test("F5-03/CA-054: la normalización ignora mayúsculas, acentos y espacios extra", () => {
  assert.equal(normalizeName("Tienda Inglesa"), "tienda inglesa");
  assert.equal(normalizeName("TIENDA INGLESA"), "tienda inglesa");
  assert.equal(normalizeName("tienda inglesa"), "tienda inglesa");
  assert.equal(
    normalizeName("  Café   Del  Río\t "),
    normalizeName("cafe del rio"),
  );
  assert.equal(normalizeName("ÁÉÍÓÚ Ü"), "aeiou u");
  // La ñ no es un acento: «Peña» y «Pena» son identidades distintas.
  assert.equal(normalizeName("Peña"), "peña");
  assert.notEqual(normalizeName("Peña"), normalizeName("Pena"));
});

test("F5-03: el comando de alta se recorta y acepta reintentos equivalentes", () => {
  const create = {
    action: "create",
    kind: "merchant",
    name: "  Tienda Inglesa  ",
    idempotencyKey: randomUUID(),
  };
  assert.deepEqual(parseCatalogCommand(create), {
    action: "create",
    kind: "merchant",
    name: "Tienda Inglesa",
    idempotencyKey: create.idempotencyKey.toLowerCase(),
  });
  assert.equal(
    normalizeName(
      parseCatalogCommand({ ...create, name: "tienda inglesa" }).name,
    ),
    normalizeName(parseCatalogCommand(create).name),
  );
});

test("F5-03: el comando de archivo/restauración valida destino y versión", () => {
  const command = {
    action: "archive",
    kind: "person",
    entryId: randomUUID(),
    version: 3,
    idempotencyKey: randomUUID(),
  };
  assert.deepEqual(parseCatalogCommand(command), {
    ...command,
    idempotencyKey: command.idempotencyKey.toLowerCase(),
  });
  for (const version of [0, 1.5, 2147483648]) {
    assert.deepEqual(parseCatalogCommand({ ...command, version }), {
      error: "Revisá los datos del catálogo.",
    });
  }
  assert.deepEqual(parseCatalogCommand({ ...command, action: "restore" }), {
    ...command,
    action: "restore",
    idempotencyKey: command.idempotencyKey.toLowerCase(),
  });
});

test("F5-03: se rechazan comandos con claves, nombres o ids inválidos", () => {
  const key = randomUUID();
  const base = { action: "create", kind: "merchant", idempotencyKey: key };
  const invalid = { error: "Revisá los datos del catálogo." };
  assert.deepEqual(parseCatalogCommand(null), invalid);
  assert.deepEqual(parseCatalogCommand([]), invalid);
  assert.deepEqual(parseCatalogCommand({ ...base, name: "" }), invalid);
  assert.deepEqual(
    parseCatalogCommand({ ...base, name: "a".repeat(101) }),
    invalid,
  );
  assert.deepEqual(parseCatalogCommand({ ...base, name: "ok\0" }), invalid);
  assert.deepEqual(
    parseCatalogCommand({ ...base, name: "ok", extra: 1 }),
    invalid,
  );
  assert.deepEqual(
    parseCatalogCommand({ ...base, name: "ok", kind: "bank" }),
    invalid,
  );
  assert.deepEqual(
    parseCatalogCommand({ ...base, name: "ok", idempotencyKey: "no-uuid" }),
    invalid,
  );
  assert.deepEqual(
    parseCatalogCommand({
      action: "archive",
      kind: "person",
      entryId: "no-uuid",
      version: 1,
      idempotencyKey: key,
    }),
    invalid,
  );
  assert.deepEqual(
    parseCatalogCommand({
      action: "restore",
      kind: "person",
      entryId: randomUUID(),
      idempotencyKey: key,
    }),
    invalid,
  );
});
