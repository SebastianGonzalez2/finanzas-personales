import assert from "node:assert/strict";
import test from "node:test";
import { URL } from "node:url";
import {
  historyChips,
  historyPeriodLabel,
} from "../../src/domain/history-chips.ts";
import { parseHistoryParams } from "../../src/domain/history.ts";

const category = "11111111-1111-4111-8111-111111111111";
const tagA = "22222222-2222-4222-8222-222222222222";
const tagB = "33333333-3333-4333-8333-333333333333";
const merchant = "44444444-4444-4444-8444-444444444444";
const names = {
  categories: [{ id: category, name: "Supermercado" }],
  tags: [
    { id: tagA, name: "Viaje" },
    { id: tagB, name: "Trabajo" },
  ],
  merchants: [{ id: merchant, name: "Mercado Central" }],
};

test("UI-04: cada chip quita solo su criterio y vuelve a la primera página", () => {
  const filters = {
    q: "café",
    period: "mes-actual",
    kind: "expense",
    currency: "USD",
    status: "pending",
    method: "debit",
    category,
    merchant,
    min: "10,5",
    tags: `${tagA},${tagB}`,
  };
  const chips = historyChips(filters, names);
  assert.deepEqual(
    chips.map(({ title, value }) => `${title}: ${value}`),
    [
      "Tipo: Gasto",
      "Moneda: USD",
      "Estado: Pendiente",
      "Medio: Débito bancario",
      "Categoría: Supermercado",
      "Comercio: Mercado Central",
      "Etiqueta: Viaje",
      "Etiqueta: Trabajo",
      "Importe mínimo: 10,5",
      "Texto: «café»",
    ],
  );
  for (const chip of chips) {
    const params = new URL(chip.href, "https://example.invalid").searchParams;
    // El período no es un chip: se cambia desde su desplegable.
    assert.equal(params.get("period"), "mes-actual");
    assert.equal(params.has("before"), false);
    const parsed = parseHistoryParams(Object.fromEntries(params));
    assert.ok(!("error" in parsed), chip.href);
  }
  const kind = chips.find(({ key }) => key === "kind");
  const kept = new URL(kind.href, "https://x.invalid").searchParams;
  assert.equal(kept.has("kind"), false);
  assert.equal(kept.get("currency"), "USD");
  assert.equal(kept.get("q"), "café");
  const viaje = chips.find(({ value }) => value === "Viaje");
  assert.equal(
    new URL(viaje.href, "https://x.invalid").searchParams.get("tags"),
    tagB,
  );
  const lastTag = historyChips({ tags: tagA }, names)[0];
  assert.equal(lastTag.href, "/historial");
});

test("UI-04: chips de criterios sin nombre conocido y sin categorizar", () => {
  const unknown = "55555555-5555-4555-8555-555555555555";
  assert.deepEqual(
    historyChips(
      { category: unknown, merchant: unknown, tags: unknown },
      names,
    ).map(({ value }) => value),
    ["Categoría del enlace", "Comercio del enlace", "Etiqueta del enlace"],
  );
  assert.equal(
    historyChips({ category: "none" }, names)[0].value,
    "Sin categorizar",
  );
  assert.deepEqual(historyChips({}, names), []);
});

test("UI-04: rótulo del período y del rango de fechas", () => {
  assert.equal(historyPeriodLabel({}), "Todas las fechas");
  assert.equal(historyPeriodLabel({ period: "mes-anterior" }), "Mes anterior");
  assert.equal(
    historyPeriodLabel({ from: "2026-11-01", to: "2026-11-30" }),
    "Del 01/11/2026 al 30/11/2026",
  );
  assert.equal(
    historyPeriodLabel({ from: "2026-11-01" }),
    "Desde el 01/11/2026",
  );
  assert.equal(historyPeriodLabel({ to: "2026-11-30" }), "Hasta el 30/11/2026");
  const chips = historyChips({ from: "2026-11-01", to: "2026-11-30" }, names);
  assert.deepEqual(
    chips.map(({ title, value }) => `${title}: ${value}`),
    ["Desde: 01/11/2026", "Hasta: 30/11/2026"],
  );
});
