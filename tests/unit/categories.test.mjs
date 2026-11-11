import assert from "node:assert/strict";
import test from "node:test";
import {
  categoryNameLimit,
  groupCatalogCategories,
  parseCreateCategoryCommand,
} from "../../src/domain/categories.ts";

test("F5-01 comando de creación: valida tipo, nombre y subcategoría", () => {
  assert.deepEqual(
    parseCreateCategoryCommand({ kind: "expense", name: "  Mascotas  " }),
    {
      kind: "expense",
      name: "Mascotas",
      parentId: null,
    },
  );
  assert.deepEqual(
    parseCreateCategoryCommand({
      kind: "income",
      name: "Extras",
      parentId: "0194c0d2-7a9b-7dd3-b52e-5f2c4d9e1a77",
    }).parentId,
    "0194c0d2-7a9b-7dd3-b52e-5f2c4d9e1a77",
  );

  for (const bad of [
    null,
    [],
    { kind: "transfer", name: "Mascotas" },
    { kind: "expense" },
    { kind: "expense", name: 42 },
    { kind: "expense", name: "   " },
    { kind: "expense", name: "x".repeat(categoryNameLimit + 1) },
    { kind: "expense", name: "Mascotas", parentId: "no-uuid" },
    { kind: "expense", name: "Mascotas", extra: true },
  ]) {
    assert.ok("error" in parseCreateCategoryCommand(bad), JSON.stringify(bad));
  }

  const blank = parseCreateCategoryCommand({
    kind: "expense",
    name: "Mascotas",
    parentId: "",
  });
  assert.ok(!("error" in blank) && blank.parentId === null);
});

test("F5-01 catálogo: agrupa subcategorías bajo su categoría", () => {
  const catalog = [
    { id: "a", kind: "expense", name: "Auto", parentId: null },
    { id: "b", kind: "expense", name: "Combustible", parentId: "a" },
    { id: "c", kind: "income", name: "Sueldo", parentId: null },
  ];
  const { tops, childrenOf } = groupCatalogCategories(catalog);
  assert.deepEqual(
    tops.map(({ id }) => id),
    ["a", "c"],
  );
  assert.deepEqual(
    childrenOf("a").map(({ id }) => id),
    ["b"],
  );
  assert.deepEqual(childrenOf("c"), []);
});
