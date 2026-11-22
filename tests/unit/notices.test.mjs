import assert from "node:assert/strict";
import test from "node:test";
import {
  budgetAlertMessage,
  budgetAlertPercent,
  budgetAlerts,
  budgetAlertState,
} from "../../src/domain/notices.ts";

test("F3-07: umbral de presupuesto advierte al 80% y alerta al 100% (CA-042)", () => {
  assert.equal(budgetAlertPercent("8000", "10000"), 80);
  assert.equal(budgetAlertState(80), "warning");
  assert.equal(budgetAlertState(99), "warning");
  assert.equal(budgetAlertPercent("10000", "10000"), 100);
  assert.equal(budgetAlertState(100), "danger");
  assert.equal(budgetAlertState(120), "danger");
  assert.equal(budgetAlertPercent("7999.9999", "10000"), 79);
  assert.equal(budgetAlertState(79), "ok");
});

test("F3-07: porcentaje con piso entero y casos sin cálculo", () => {
  assert.equal(budgetAlertPercent("999.99995", "10000"), 9);
  assert.equal(budgetAlertPercent("0", "0"), null);
  assert.equal(budgetAlertPercent("100", "0"), null);
  assert.equal(budgetAlertPercent("x", "10"), null);
  assert.equal(budgetAlertPercent("10", ""), null);
  assert.equal(budgetAlertPercent("10", "abc"), null);
});

test("F3-07: mensajes de aviso por nivel", () => {
  assert.match(
    budgetAlertMessage("warning", 80, "Alimentación"),
    /80% del presupuesto de Alimentación/,
  );
  assert.match(
    budgetAlertMessage("danger", 100, "Alimentación"),
    /límite del presupuesto de Alimentación.*100%.*no se bloquean compras/s,
  );
  assert.equal(budgetAlertState(null), "ok");
});

test("F3-07: lista de avisos de presupuesto ordenada y sin repetición por fila", () => {
  const alerts = budgetAlerts(
    [
      {
        id: "b1",
        categoryName: "Alimentación",
        currency: "UYU",
        effectiveLimit: "10000",
        references: [],
        progress: { month: "2026-11", consumed: "10000" },
      },
      {
        id: "b2",
        categoryName: "Transporte",
        currency: "UYU",
        effectiveLimit: "5000",
        references: [],
        progress: { month: "2026-11", consumed: "4400" },
      },
      {
        id: "b3",
        categoryName: "Salud",
        currency: "UYU",
        effectiveLimit: "3000",
        references: [],
        progress: { month: "2026-11", consumed: "600" },
      },
      {
        id: "estimate",
        categoryName: "Cuotas futuras",
        currency: "UYU",
        effectiveLimit: "3000",
        references: [{ provisional: true }],
        progress: { month: "2026-11", consumed: "6000" },
      },
      {
        id: "b4",
        categoryName: "Sin consumo",
        currency: "UYU",
        effectiveLimit: "3000",
        references: [],
        progress: null,
      },
    ],
    "2026-11",
  );
  assert.deepEqual(
    alerts.map(({ budget, state, percent }) => [budget.id, state, percent]),
    [
      ["b1", "danger", 100],
      ["b2", "warning", 88],
    ],
  );
});
