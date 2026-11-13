import assert from "node:assert/strict";
import test from "node:test";
import {
  ayudaGroups,
  countAyudaEntries,
  filterAyudaGroups,
  normalizeAyudaText,
} from "../../src/domain/ayuda.ts";

test("F6-06: la ayuda cubre los temas previstos con contenido único", () => {
  const ids = ayudaGroups.map((group) => group.id);
  const titles = ayudaGroups.map((group) => group.title);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(new Set(titles).size, titles.length);
  for (const expected of [
    "primeros-pasos",
    "bancos",
    "movimientos",
    "tarjetas",
    "cuotas",
    "presupuestos",
    "fondos",
    "prestamos",
    "recurrentes",
    "categorias",
    "estadisticas",
    "devoluciones",
    "beneficios",
    "correcciones",
    "copias",
    "cuenta",
  ]) {
    assert.ok(ids.includes(expected), `Falta el tema ${expected}`);
  }
  const questions = ayudaGroups.flatMap((group) =>
    group.entries.map((entry) => entry.question),
  );
  assert.ok(questions.length >= 30);
  assert.equal(new Set(questions).size, questions.length);
  for (const group of ayudaGroups) {
    assert.ok(group.entries.length > 0, `Tema vacío: ${group.id}`);
    for (const entry of group.entries) {
      assert.ok(entry.answer.length > 0);
      for (const link of entry.links ?? []) {
        assert.match(link.href, /^\/[a-z-]+$/);
        assert.ok(link.label.length > 0);
      }
    }
  }
});

test("F6-06: la búsqueda ignora mayúsculas y tildes", () => {
  assert.equal(normalizeAyudaText("Cambio de Moneda"), "cambio de moneda");
  assert.equal(normalizeAyudaText("Devolución"), "devolucion");
});

test("F6-06: sin consulta se muestran todos los temas completos", () => {
  for (const query of ["", "   "]) {
    const filtered = filterAyudaGroups(query, ayudaGroups);
    assert.equal(filtered.length, ayudaGroups.length);
    assert.equal(countAyudaEntries(filtered), countAyudaEntries(ayudaGroups));
  }
});

test("F6-06: la consulta filtra preguntas y respuestas por tema", () => {
  const cuotas = filterAyudaGroups("cuotas", ayudaGroups);
  assert.ok(cuotas.length > 0);
  assert.ok(cuotas.every((group) => group.entries.length > 0));
  assert.ok(
    cuotas.some((group) =>
      group.entries.some((entry) => entry.question.includes("cuotas")),
    ),
  );
  const saldos = filterAyudaGroups("saldo inicial", ayudaGroups);
  assert.ok(
    saldos.some((group) =>
      group.entries.some((entry) =>
        `${entry.question} ${entry.answer}`
          .toLowerCase()
          .includes("saldo inicial"),
      ),
    ),
  );
});

test("F6-06: la consulta sin tildes encuentra respuestas con tildes", () => {
  const devolucion = filterAyudaGroups("devolucion", ayudaGroups);
  assert.ok(devolucion.length > 0);
  assert.ok(devolucion.some((group) => group.id === "devoluciones"));
});

test("F6-06: los términos se combinan y las consultas sin resultados quedan vacías", () => {
  const combinada = filterAyudaGroups("préstamo capital", ayudaGroups);
  assert.ok(
    combinada.every((group) =>
      group.entries.every((entry) => {
        const haystack = normalizeAyudaText(
          `${group.title} ${entry.question} ${entry.answer}`,
        );
        return ["prestamo", "capital"].every((token) =>
          haystack.includes(token),
        );
      }),
    ),
  );
  assert.deepEqual(filterAyudaGroups("xyz sin resultados", ayudaGroups), []);
});
