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
    "gastos",
    "cuotas",
    "presupuestos",
    "recurrentes",
    "categorias",
    "estadisticas",
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
  // SIMP-03: la ayuda ya no describe los módulos retirados.
  for (const removed of ["bancos", "tarjetas", "fondos", "prestamos"])
    assert.ok(!ids.includes(removed), `Tema retirado: ${removed}`);
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
  const recibos = filterAyudaGroups("recibo", ayudaGroups);
  assert.ok(
    recibos.some((group) =>
      group.entries.some((entry) =>
        `${entry.question} ${entry.answer}`.toLowerCase().includes("recibo"),
      ),
    ),
  );
});

test("F6-06: la consulta sin tildes encuentra respuestas con tildes", () => {
  const categorias = filterAyudaGroups("categorias", ayudaGroups);
  assert.ok(categorias.length > 0);
  assert.ok(categorias.some((group) => group.id === "categorias"));
});

test("F6-06: los términos se combinan y las consultas sin resultados quedan vacías", () => {
  const combinada = filterAyudaGroups("presupuesto límite", ayudaGroups);
  assert.ok(combinada.length > 0);
  assert.ok(
    combinada.every((group) =>
      group.entries.every((entry) => {
        const haystack = normalizeAyudaText(
          `${group.title} ${entry.question} ${entry.answer}`,
        );
        return ["presupuesto", "limite"].every((token) =>
          haystack.includes(token),
        );
      }),
    ),
  );
  assert.deepEqual(filterAyudaGroups("xyz sin resultados", ayudaGroups), []);
});
