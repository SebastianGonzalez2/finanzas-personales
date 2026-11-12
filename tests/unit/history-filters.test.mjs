import assert from "node:assert/strict";
import test from "node:test";
import {
  historyPeriodRange,
  historyPeriods,
  historySearch,
  parseHistoryParams,
} from "../../src/domain/history.ts";
import {
  normalizeFilterName,
  parseSavedFilterCommand,
  savedFilterCriteria,
  savedFilterNeedsReview,
} from "../../src/domain/history-filters.ts";

const uuidA = "11075139-c46d-4cb4-9a2c-92ae733e6e57";
const uuidB = "e8ec105e-847e-4650-8267-3423bf72ac27";

test("F5-04: los períodos relativos se validan y no combinan con fechas", () => {
  for (const period of Object.keys(historyPeriods)) {
    const parsed = parseHistoryParams({ period });
    assert.ok(!("error" in parsed));
    assert.equal(parsed.filters.period, period);
  }
  assert.ok("error" in parseHistoryParams({ period: "semana" }));
  assert.ok(
    "error" in parseHistoryParams({ period: "mes-actual", from: "2026-11-01" }),
  );
  assert.ok(
    "error" in parseHistoryParams({ period: "mes-actual", to: "2026-11-30" }),
  );
  // Las fechas específicas siguen siendo válidas sin período.
  assert.ok(
    !("error" in parseHistoryParams({ from: "2026-11-01", to: "2026-11-30" })),
  );
});

test("F5-04: el rango relativo resuelve el período vigente, CA-058", () => {
  assert.deepEqual(historyPeriodRange("mes-actual", "2026-11-11"), {
    from: "2026-11-01",
    to: "2026-11-30",
  });
  assert.deepEqual(historyPeriodRange("mes-anterior", "2026-11-11"), {
    from: "2026-10-01",
    to: "2026-10-31",
  });
  // Año bisiesto y cambio de año.
  assert.deepEqual(historyPeriodRange("mes-actual", "2024-02-15"), {
    from: "2024-02-01",
    to: "2024-02-29",
  });
  assert.deepEqual(historyPeriodRange("mes-anterior", "2026-01-05"), {
    from: "2025-12-01",
    to: "2025-12-31",
  });
  assert.deepEqual(historyPeriodRange("ultimos-3-meses", "2026-11-11"), {
    from: "2026-09-01",
    to: "2026-11-30",
  });
  assert.deepEqual(historyPeriodRange("ultimos-3-meses", "2026-01-31"), {
    from: "2025-11-01",
    to: "2026-01-31",
  });
  assert.deepEqual(historyPeriodRange("anio-actual", "2026-11-11"), {
    from: "2026-01-01",
    to: "2026-12-31",
  });
  assert.throws(() => historyPeriodRange("mes-actual", "11/11/2026"));
});

test("F5-04: el filtro guardado viaja en la URL y la paginación lo conserva", () => {
  const query = historySearch({ period: "mes-actual", category: "none" });
  assert.equal(query, "?period=mes-actual&category=none");
  const page = historySearch(
    { period: "mes-actual" },
    { date: "2026-11-10", id: uuidA, kind: "expense" },
  );
  assert.ok(page.includes("period=mes-actual"));
  assert.ok(page.includes("before=2026-11-10."));
});

test("F5-04: comandos de filtros guardados, v9.47", () => {
  const valid = {
    action: "create",
    idempotencyKey: uuidA,
    name: "  Ropa   Mes Actual ",
    criteria: { period: "mes-actual", category: "none", before: "x" },
  };
  const command = parseSavedFilterCommand(valid);
  assert.ok(!("error" in command));
  assert.equal(command.action, "create");
  assert.equal(command.name, "Ropa   Mes Actual");
  // El cursor de paginación nunca se guarda y se normalizan espacios vía trim.
  assert.deepEqual(command.criteria, {
    period: "mes-actual",
    category: "none",
  });
  assert.equal(command.idempotencyKey, uuidA.toLowerCase());

  assert.ok("error" in parseSavedFilterCommand(null));
  assert.ok("error" in parseSavedFilterCommand({ ...valid, extra: 1 }));
  assert.ok("error" in parseSavedFilterCommand({ ...valid, criteria: {} }));
  assert.ok(
    "error" in parseSavedFilterCommand({ ...valid, criteria: { before: "x" } }),
  );
  assert.ok(
    "error" in
      parseSavedFilterCommand({ ...valid, criteria: { period: "semana" } }),
  );
  assert.ok(
    "error" in
      parseSavedFilterCommand({
        ...valid,
        criteria: { period: "mes-actual", from: "2026-01-01" },
      }),
  );
  assert.ok("error" in parseSavedFilterCommand({ ...valid, name: "" }));
  assert.ok(
    "error" in parseSavedFilterCommand({ ...valid, name: "x".repeat(101) }),
  );
  assert.ok(
    "error" in parseSavedFilterCommand({ ...valid, idempotencyKey: "no-uuid" }),
  );

  const rename = parseSavedFilterCommand({
    action: "rename",
    idempotencyKey: uuidB,
    entryId: uuidA,
    version: 2,
    name: "Ropa del mes",
  });
  assert.ok(!("error" in rename));
  assert.equal(rename.entryId, uuidA);
  assert.ok("error" in parseSavedFilterCommand({ ...rename, version: 0 }));
  assert.ok("error" in parseSavedFilterCommand({ ...rename, entryId: "abc" }));

  const remove = parseSavedFilterCommand({
    action: "delete",
    idempotencyKey: uuidB,
    entryId: uuidA,
    version: 1,
  });
  assert.ok(!("error" in remove));
  assert.ok("error" in parseSavedFilterCommand({ ...remove, name: "sobra" }));
});

test("F5-04: criterios y revisión de filtros guardados", () => {
  assert.deepEqual(
    savedFilterCriteria({
      q: "alquiler",
      from: "",
      to: undefined,
      status: "confirmed",
    }),
    { q: "alquiler", status: "confirmed" },
  );
  assert.equal(normalizeFilterName("  Ropa   MES actual "), "ropa mes actual");
  assert.equal(normalizeFilterName("Árbol Ñandú"), "arbol ñandu");
  assert.ok(savedFilterNeedsReview({ category: uuidA }, [{ id: uuidB }]));
  assert.ok(!savedFilterNeedsReview({ category: uuidA }, [{ id: uuidA }]));
  assert.ok(!savedFilterNeedsReview({ category: "none" }, []));
  assert.ok(savedFilterNeedsReview({ kind: "desconocido" }, []));
  assert.ok(!savedFilterNeedsReview({ kind: "expense" }, []));
});
