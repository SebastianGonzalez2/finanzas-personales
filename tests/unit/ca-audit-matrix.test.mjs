import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { URL } from "node:url";

// F6-01: protege la integridad del informe de auditoría, no el comportamiento del producto.
const report = await readFile(
  new URL("../../docs/planning/52-auditoria-67-ca-f6-01.md", import.meta.url),
  "utf8",
);
const criteria = await readFile(
  new URL("../../docs/planning/03-criterios-de-aceptacion.md", import.meta.url),
  "utf8",
);
const statuses = ["PASS", "FAIL", "PARTIAL", "BLOCKED", "NOT VERIFIED"];
const risks = ["Alto", "Medio", "Bajo"];

function cells(line) {
  return line
    .trim()
    .slice(1, -1)
    .split("|")
    .map((cell) => cell.trim());
}

const rows = report
  .split("\n")
  .filter((line) => /^\|\s*CA-\d{3}\s*\|/.test(line))
  .map(cells);
const expected = [...criteria.matchAll(/^\| (CA-\d{3}) \|/gm)].map(
  (match) => match[1],
);

test("F6-01: la matriz contiene CA-001 a CA-067 una vez y en orden", () => {
  assert.equal(expected.length, 67);
  assert.deepEqual(
    rows.map((row) => row[0]),
    expected,
  );
  assert.equal(expected[0], "CA-001");
  assert.equal(expected.at(-1), "CA-067");
});

test("F6-01: cada fila tiene siete columnas, estado y riesgo válidos", () => {
  for (const row of rows) {
    assert.equal(row.length, 7, `${row[0]}: columnas`);
    assert.ok(statuses.includes(row[2]), `${row[0]}: estado ${row[2]}`);
    assert.ok(risks.includes(row[6]), `${row[0]}: riesgo ${row[6]}`);
    assert.match(row[1], /^RF-/, `${row[0]}: requisito`);
  }
});

test("F6-01: un PASS exige implementación y evidencia ejecutada [CI] o [LOC]", () => {
  for (const row of rows.filter((item) => item[2] === "PASS")) {
    assert.ok(row[3].length > 3, `${row[0]}: implementación`);
    assert.match(row[4], /\[(CI|LOC)\]/, `${row[0]}: evidencia ejecutada`);
  }
});

test("F6-01: lo que no es PASS declara qué falta", () => {
  for (const row of rows.filter((item) => item[2] !== "PASS")) {
    assert.ok(row[4].length > 3, `${row[0]}: evidencia o motivo`);
    assert.ok(
      row[5].length > 10 && row[5] !== "Ninguno",
      `${row[0]}: pendiente`,
    );
  }
});

test("F6-01: el conteo del resumen coincide con la matriz", () => {
  const declared = report.match(/<!-- conteo: ([^>]+?) -->/)?.[1];
  assert.ok(declared, "falta la línea de conteo");
  const counted = Object.fromEntries(
    statuses.map((status) => [
      status,
      rows.filter((row) => row[2] === status).length,
    ]),
  );
  const actual = statuses.map((s) => `${s}=${counted[s]}`).join(" ");
  assert.equal(declared, actual);
  assert.equal(
    Object.values(counted).reduce((sum, value) => sum + value, 0),
    67,
  );
});
