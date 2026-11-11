import assert from "node:assert/strict";
import test from "node:test";
import {
  budgetAlertMessage,
  budgetAlertPercent,
  budgetAlerts,
  budgetAlertState,
  fundGoalMessage,
  fundGoalOverdue,
  goalAlerts,
} from "../../src/domain/notices.ts";

const today = "2026-11-11";

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
        progress: { month: "2026-11", consumed: "10000" },
      },
      {
        id: "b2",
        categoryName: "Transporte",
        currency: "UYU",
        effectiveLimit: "5000",
        progress: { month: "2026-11", consumed: "4400" },
      },
      {
        id: "b3",
        categoryName: "Salud",
        currency: "UYU",
        effectiveLimit: "3000",
        progress: { month: "2026-11", consumed: "600" },
      },
      {
        id: "b4",
        categoryName: "Sin consumo",
        currency: "UYU",
        effectiveLimit: "3000",
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

test("F3-07: meta incumplida cuando la fecha venció y falta reservado (CA-050)", () => {
  const fund = {
    name: "Vacaciones",
    currency: "UYU",
    reservedAmount: "1600",
    targetAmount: "2000",
    targetDate: "2026-10-31",
    status: "active",
  };
  assert.equal(fundGoalOverdue(fund, today), true);
  const message = fundGoalMessage(fund);
  assert.match(message, /2026-10-31/);
  assert.match(message, /1.600,00 UYU/);
  assert.match(message, /2.000,00 UYU/);
  assert.match(message, /conserva lo reservado/);
  assert.equal(
    fundGoalOverdue({ ...fund, reservedAmount: "2000" }, today),
    false,
  );
  assert.equal(
    fundGoalOverdue({ ...fund, reservedAmount: "2500" }, today),
    false,
  );
  assert.equal(
    fundGoalOverdue({ ...fund, targetDate: "2026-11-11" }, today),
    true,
  );
  assert.equal(
    fundGoalOverdue({ ...fund, targetDate: "2026-11-12" }, today),
    false,
  );
  assert.equal(fundGoalOverdue({ ...fund, targetAmount: null }, today), false);
  assert.equal(fundGoalOverdue({ ...fund, targetDate: null }, today), false);
  assert.equal(fundGoalOverdue({ ...fund, status: "closed" }, today), false);
  assert.equal(fundGoalOverdue({ ...fund, targetDate: "" }, today), false);
});

test("F3-07: lista de metas incumplidas ignora fondos sin problema", () => {
  const funds = [
    {
      id: "f1",
      name: "Vacaciones",
      currency: "UYU",
      reservedAmount: "1600",
      targetAmount: "2000",
      targetDate: "2026-10-31",
      status: "active",
    },
    {
      id: "f2",
      name: "Colchón",
      currency: "USD",
      reservedAmount: "0",
      targetAmount: null,
      targetDate: null,
      status: "active",
    },
  ];
  assert.deepEqual(
    goalAlerts(funds, today).map(({ fund }) => fund.id),
    ["f1"],
  );
});
