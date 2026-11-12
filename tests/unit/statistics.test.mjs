import assert from "node:assert/strict";
import test from "node:test";
import { URLSearchParams } from "node:url";
import {
  categoryChildren,
  chartScale,
  comparison,
  favoriteLabel,
  parseStatisticsParams,
  percentageChange,
  sumAmounts,
  statisticsComparisonRange,
  statisticsHistoryRange,
  statisticsSearch,
  statisticsSummary,
} from "../../src/domain/statistics.ts";

const today = "2026-11-11";
const uuid = "11075139-c46d-4cb4-9a2c-92ae733e6e57";

test("F5-05: los períodos y el rango personalizado se validan", () => {
  const current = parseStatisticsParams({}, today);
  assert.ok(!("error" in current));
  assert.equal(current.range.from, "2026-11-01");
  assert.equal(current.range.to, today);
  assert.equal(current.range.complete, false);

  const previous = parseStatisticsParams({ period: "mes-anterior" }, today);
  assert.ok(!("error" in previous));
  assert.equal(previous.range.from, "2026-10-01");
  assert.equal(previous.range.to, "2026-10-31");
  assert.equal(previous.range.complete, true);
  assert.equal(previous.previous.from, "2026-09-01");
  assert.equal(previous.previous.to, "2026-09-30");

  const custom = parseStatisticsParams(
    { from: "2026-01-15", to: "2026-02-14" },
    today,
  );
  assert.ok(!("error" in custom));
  assert.equal(custom.filters.period, "personalizado");
  assert.equal(custom.range.from, "2026-01-15");
  assert.equal(custom.range.to, "2026-02-14");

  assert.ok("error" in parseStatisticsParams({ from: "2026-01-15" }, today));
  assert.ok(
    "error" in
      parseStatisticsParams({ from: "2026-02-01", to: "2026-01-01" }, today),
  );
  assert.ok(
    "error" in
      parseStatisticsParams({ from: "2026-01-01", to: "2027-01-01" }, today),
  );
});

test("F5-05: filtros de moneda, categoría, medio y vista", () => {
  const parsed = parseStatisticsParams(
    {
      period: "ultimos-3-meses",
      currency: "UYU",
      category: uuid,
      tag: uuid.toUpperCase(),
      method: "credit",
      view: "favoritos",
    },
    today,
  );
  assert.ok(!("error" in parsed));
  assert.equal(parsed.filters.currency, "UYU");
  assert.equal(parsed.filters.category, uuid);
  assert.equal(parsed.filters.tag, uuid);
  assert.equal(
    new URLSearchParams(statisticsSearch(parsed.filters)).get("tag"),
    uuid,
  );
  assert.equal(parsed.filters.method, "credit");
  assert.equal(parsed.filters.view, "favoritos");
  assert.equal(parsed.range.from, "2026-09-01");

  assert.ok("error" in parseStatisticsParams({ currency: "ARS" }, today));
  assert.ok(
    "error" in parseStatisticsParams({ category: "no-es-uuid" }, today),
  );
  assert.ok("error" in parseStatisticsParams({ method: "cheque" }, today));
  assert.ok("error" in parseStatisticsParams({ tag: "no-es-uuid" }, today));
  assert.ok("error" in parseStatisticsParams({ view: "otra" }, today));
  assert.ok(!("error" in parseStatisticsParams({ category: "none" }, today)));
});

test("F5-05: el rango de comparación es calendario o de igual duración", () => {
  assert.deepEqual(statisticsComparisonRange("2026-10-01", "2026-10-31"), {
    from: "2026-09-01",
    to: "2026-09-30",
  });
  assert.deepEqual(statisticsComparisonRange("2026-11-01", "2026-11-11"), {
    from: "2026-10-21",
    to: "2026-10-31",
  });
  assert.deepEqual(
    statisticsHistoryRange(
      {
        from: "2026-11-01",
        to: today,
        label: "",
        complete: false,
      },
      today,
    ),
    {
      from: "2026-11-01",
      to: today,
      label: "01/11/2026 – 11/11/2026",
      complete: false,
    },
  );
});

test("F5-05: compara años distintos y valida el límite del calendario", () => {
  const params = {
    from: "2026-10-01",
    to: "2026-10-31",
    compareFrom: "2025-10-01",
    compareTo: "2025-10-31",
    card: uuid,
    kind: "expense",
  };
  const parsed = parseStatisticsParams(params, today);
  assert.equal(parsed.previous.from, params.compareFrom);
  assert.equal(parsed.previous.to, params.compareTo);
  assert.equal(parsed.filters.card, uuid);
  assert.equal(parsed.filters.kind, "expense");
  assert.ok(
    "error" in parseStatisticsParams({ ...params, compareTo: "" }, today),
  );
  const earliest = parseStatisticsParams(
    { from: "0001-01-01", to: "0001-01-31" },
    today,
  );
  assert.equal(earliest.previous, null);
});

test("F5-05: búsqueda de estadísticas conserva y elimina filtros", () => {
  const filters = {
    period: "mes-actual",
    currency: "USD",
    category: uuid,
    method: "debit",
    view: "todas",
  };
  const search = statisticsSearch(filters, { category: undefined });
  assert.equal(
    search,
    "?period=mes-actual&currency=USD&method=debit&view=todas",
  );
  assert.equal(
    statisticsSearch({ period: "mes-actual" }),
    "?period=mes-actual",
  );
});

test("F5-05: comparaciones sin base cero ni porcentaje infinito, CA-059/064", () => {
  assert.equal(percentageChange("120.0000", "100.0000"), "+20,0 %");
  assert.equal(percentageChange("80.0000", "100.0000"), "−20,0 %");
  assert.equal(percentageChange("100.0000", "0.0000"), null);
  assert.equal(percentageChange("799.5", "1000"), "−20,1 %");
  assert.equal(percentageChange("-80", "-100"), "+20,0 %");
  assert.equal(
    sumAmounts(["9999999999999999.9999", "0.0001"]),
    "10000000000000000.0000",
  );

  const zero = comparison("50.0000", "0.0000", 10, "octubre de 2026");
  assert.equal(zero.status, "zero-base");
  assert.equal(zero.percent, null);
  assert.match(zero.label, /Sin base de comparación/);

  const few = comparison("50.0000", "40.0000", 2, "octubre de 2026");
  assert.equal(few.status, "insufficient");
  assert.match(few.label, /Muestra insuficiente/);

  const normal = comparison("50.0000", "40.0000", 10, "octubre de 2026");
  assert.equal(normal.status, "ok");
  assert.equal(normal.percent, "+25,0 %");
  assert.match(normal.label, /respecto de octubre de 2026/);
});

test("F5-05: resumen determinista y advertencia de muestra insuficiente", () => {
  const base = {
    range: {
      from: "2026-11-01",
      to: "2026-11-11",
      label: "01/11/2026 – 11/11/2026",
      complete: false,
    },
    previous: null,
    totals: [],
    previousTotals: [],
    movementCount: 0,
  };
  const few = statisticsSummary({ ...base, movementCount: 2 });
  assert.equal(few.status, "insufficient");
  assert.match(few.paragraphs[0], /Muestra insuficiente/);
  assert.match(few.paragraphs[1], /No se afirman tendencias/);

  const ready = statisticsSummary({
    ...base,
    movementCount: 8,
    totals: [
      {
        currency: "UYU",
        income: "10000.0000",
        expense: "12500.0000",
        refunds: "500.0000",
        movements: 8,
      },
    ],
  });
  assert.equal(ready.status, "ready");
  assert.match(ready.paragraphs[0], /10\.000,00 UYU/);
  assert.match(ready.paragraphs[1], /125,0 %/);
  assert.match(ready.paragraphs[1], /superan los ingresos/);
  assert.match(ready.paragraphs[2], /Devoluciones registradas/);
  assert.match(ready.paragraphs.at(-1), /solo movimientos registrados/);
});

test("F5-05: escalas, jerarquía de categorías y etiquetas accesibles", () => {
  assert.deepEqual(chartScale(["10.0000", "20.0000", "0.0000"]), [50, 100, 0]);
  assert.deepEqual(chartScale(["0.0000", "0.0000"]), [0, 0]);

  const categories = [
    {
      categoryId: "parent",
      parentId: null,
      category: "Alimentación",
      kind: "expense",
      currency: "UYU",
      amount: "10.0000",
      count: 2,
    },
    {
      categoryId: "child",
      parentId: "parent",
      category: "Supermercado",
      kind: "expense",
      currency: "UYU",
      amount: "8.0000",
      count: 1,
    },
  ];
  assert.deepEqual(
    categoryChildren(categories, "parent", "expense", "UYU").map(
      ({ categoryId }) => categoryId,
    ),
    ["child"],
  );

  assert.equal(
    favoriteLabel("metrics", false),
    "Añadir Indicadores del período a favoritos",
  );
  assert.equal(
    favoriteLabel("metrics", true),
    "Quitar Indicadores del período de favoritos",
  );
});
