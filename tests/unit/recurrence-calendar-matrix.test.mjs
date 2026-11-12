// F4-06: regresión de calendario, husos horarios, omisiones, reintentos,
// pagos tardíos y facturas sin importe definitivo. La idempotencia real, la
// concurrencia y la regresión contra PostgreSQL quedan a cargo de Codex.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import process from "node:process";
import test from "node:test";
import { pathToFileURL } from "node:url";

import {
  bankReferenceToday,
  isBankReferenceDate,
} from "../../src/domain/bank-balances.ts";
import {
  dueNoticeWindow,
  recurrenceDueNotice,
} from "../../src/domain/due-notices.ts";
import { parseRecurrence } from "../../src/domain/recurrence-definition.ts";
import { parseRecurrencePause } from "../../src/domain/recurrence-pause.ts";
import {
  followingRecurrenceMonth,
  plannedPeriodAt,
  suppressedByPause,
} from "../../src/domain/recurrence-plan.ts";
import {
  parseSettlement,
  settlementAmounts,
} from "../../src/domain/recurrence-settlements.ts";
import {
  daysInRecurrenceMonth,
  latestRecurrencePeriod,
  recurrencePeriodAt,
  recurrencePeriodDueDate,
  recurrencePeriods,
} from "../../src/domain/recurrences.ts";

test("F4-06 febrero: bisiestos, siglos y día flexible sin desbordes", () => {
  const schedule = (firstPeriod, dueDay = 31) => ({
    frequency: "monthly",
    firstPeriod,
    dueDay,
  });

  assert.deepEqual(
    [0, 1, 2].map((offset) =>
      recurrencePeriodDueDate(schedule("2100-01-31"), offset),
    ),
    ["2100-01-31", "2100-02-28", "2100-03-31"],
  );
  assert.deepEqual(
    [0, 1, 2].map((offset) =>
      recurrencePeriodDueDate(schedule("2400-01-31"), offset),
    ),
    ["2400-01-31", "2400-02-29", "2400-03-31"],
  );
  assert.deepEqual(
    [0, 1, 2].map((offset) =>
      recurrencePeriodDueDate(schedule("2028-01-31"), offset),
    ),
    ["2028-01-31", "2028-02-29", "2028-03-31"],
  );
  assert.deepEqual(
    [0, 1].map((offset) =>
      recurrencePeriodDueDate(schedule("2026-01-30", 31), offset),
    ),
    ["2026-01-30", "2026-02-28"],
  );

  assert.deepEqual(
    [0, 1].map((offset) =>
      recurrencePeriodDueDate(
        { frequency: "yearly", firstPeriod: "2024-02-29" },
        offset,
      ),
    ),
    ["2024-02-29", "2025-02-28"],
  );
  assert.equal(
    recurrencePeriodDueDate(
      { frequency: "yearly", firstPeriod: "2024-02-29" },
      4,
    ),
    "2028-02-29",
  );

  assert.deepEqual(
    [0, 1, 2, 3].map(
      (offset) =>
        recurrencePeriodAt(
          { frequency: "weekly", firstPeriod: "2024-02-26" },
          offset,
        ).dueOn,
    ),
    ["2024-02-26", "2024-03-04", "2024-03-11", "2024-03-18"],
  );
  assert.equal(
    recurrencePeriodDueDate(
      { frequency: "weekly", firstPeriod: "2024-02-29" },
      1,
    ),
    "2024-03-07",
  );

  assert.equal(daysInRecurrenceMonth(2100, 2), 28);
  assert.equal(daysInRecurrenceMonth(2400, 2), 29);
  assert.deepEqual(
    recurrencePeriods(schedule("2024-01-31"), "2024-02-29").map(
      (period) => period.key,
    ),
    ["2024-01", "2024-02"],
  );
});

test("F4-06 fin de año: claves, trimestres y avisos cruzan el 31/12", () => {
  const monthly = {
    frequency: "monthly",
    firstPeriod: "2026-11-30",
    dueDay: 30,
  };
  assert.deepEqual(
    recurrencePeriods(monthly, "2027-02-28").map(({ key, dueOn }) => [
      key,
      dueOn,
    ]),
    [
      ["2026-11", "2026-11-30"],
      ["2026-12", "2026-12-30"],
      ["2027-01", "2027-01-30"],
      ["2027-02", "2027-02-28"],
    ],
  );
  assert.deepEqual(
    recurrencePeriods(
      { frequency: "monthly", firstPeriod: "2026-12-31", dueDay: 31 },
      "2027-02-28",
    ).map((period) => period.dueOn),
    ["2026-12-31", "2027-01-31", "2027-02-28"],
  );

  assert.deepEqual(
    [0, 1, 2].map((offset) =>
      recurrencePeriodAt(
        { frequency: "quarterly", firstPeriod: "2026-11-15", dueDay: 31 },
        offset,
      ),
    ),
    [
      {
        index: 0,
        key: "2026-Q4",
        startsOn: "2026-10-01",
        dueOn: "2026-11-15",
      },
      {
        index: 1,
        key: "2027-Q1",
        startsOn: "2027-01-01",
        dueOn: "2027-02-28",
      },
      {
        index: 2,
        key: "2027-Q2",
        startsOn: "2027-04-01",
        dueOn: "2027-05-31",
      },
    ],
  );

  assert.deepEqual(
    recurrencePeriods(
      {
        frequency: "yearly",
        firstPeriod: "2026-12-31",
        dueDay: 31,
        endDate: "2029-12-31",
      },
      "2030-12-31",
    ).map((period) => period.key),
    ["2026", "2027", "2028", "2029"],
  );

  assert.equal(
    recurrencePeriodDueDate(
      { frequency: "weekly", firstPeriod: "2026-12-31" },
      1,
    ),
    "2027-01-07",
  );
  assert.equal(
    latestRecurrencePeriod(
      { frequency: "weekly", firstPeriod: "2026-12-31" },
      "2027-01-06",
    ).index,
    0,
  );
  assert.equal(
    latestRecurrencePeriod(
      { frequency: "weekly", firstPeriod: "2026-12-31" },
      "2027-01-07",
    ).index,
    1,
  );

  assert.equal(followingRecurrenceMonth("2026-12-15"), "2027-01");
  assert.equal(followingRecurrenceMonth("9999-12-15"), null);

  const window = dueNoticeWindow({
    today: "2026-12-30",
    dueOn: "2027-01-02",
    leadDays: 3,
  });
  assert.equal(window?.daysUntil, 3);
  assert.equal(window?.state, "upcoming");
  assert.equal(
    dueNoticeWindow({
      today: "2026-12-30",
      dueOn: "2027-01-02",
      leadDays: 2,
    }),
    null,
  );
});

test("F4-06 husos horarios: la fecha de referencia es la de Montevideo", () => {
  assert.equal(
    bankReferenceToday(new Date("2026-11-12T02:59:59.999Z")),
    "2026-11-11",
  );
  assert.equal(
    bankReferenceToday(new Date("2026-11-12T03:00:00.000Z")),
    "2026-11-12",
  );
  assert.equal(
    bankReferenceToday(new Date("2026-12-31T23:59:59.000Z")),
    "2026-12-31",
  );
  assert.equal(
    bankReferenceToday(new Date("2027-01-01T02:59:59.999Z")),
    "2026-12-31",
  );
  assert.equal(
    bankReferenceToday(new Date("2027-01-01T03:00:00.000Z")),
    "2027-01-01",
  );

  // Cambios históricos de horario de verano en Uruguay (UTC-3 / UTC-2).
  assert.equal(
    bankReferenceToday(new Date("2014-10-06T02:30:00.000Z")),
    "2014-10-06",
  );
  assert.equal(
    bankReferenceToday(new Date("2014-03-10T02:30:00.000Z")),
    "2014-03-09",
  );

  assert.equal(isBankReferenceDate("2025-12-31", "2026-01-05"), true);
  assert.equal(isBankReferenceDate("2026-01-06", "2026-01-05"), false);
  assert.equal(isBankReferenceDate("2025-02-29", "2026-01-05"), false);

  // Las funciones de calendario no dependen del huso del proceso.
  const root = resolve(import.meta.dirname, "../..");
  const recurrences = pathToFileURL(
    resolve(root, "src/domain/recurrences.ts"),
  ).href;
  const banks = pathToFileURL(
    resolve(root, "src/domain/bank-balances.ts"),
  ).href;
  const script = `
    const recurrences = await import(${JSON.stringify(recurrences)});
    const banks = await import(${JSON.stringify(banks)});
    console.log(JSON.stringify({
      periods: [0, 1, 2].map((offset) =>
        recurrences.recurrencePeriodAt(
          { frequency: "monthly", firstPeriod: "2024-01-31", dueDay: 31 },
          offset,
        )),
      today: banks.bankReferenceToday(new Date("2027-01-01T02:59:59.999Z")),
    }));
  `;
  const outputs = [
    "UTC",
    "America/Montevideo",
    "Pacific/Kiritimati",
    "America/Anchorage",
  ].map((TZ) =>
    execFileSync(process.execPath, ["--input-type=module", "-e", script], {
      cwd: root,
      env: { ...process.env, TZ },
      encoding: "utf8",
    }).trim(),
  );
  assert.equal(new Set(outputs).size, 1);
  assert.equal(JSON.parse(outputs[0]).today, "2026-12-31");
});

test("F4-06 meses omitidos: omitir uno no elimina ni adelanta el siguiente", () => {
  const schedule = {
    frequency: "monthly",
    firstPeriod: "2026-12-10",
    dueDay: 10,
  };
  assert.deepEqual(
    recurrencePeriods(schedule, "2027-01-31").map((period) => period.key),
    ["2026-12", "2027-01"],
  );

  assert.deepEqual(settlementAmounts("0.0000", null, null, true), {
    status: "skipped",
    finalized: false,
    confirmedTotal: null,
    remaining: null,
  });

  const seriesId = randomUUID();
  const december = recurrenceDueNotice({
    seriesId,
    concept: "Ingreso recurrente",
    currency: "UYU",
    index: 0,
    key: "2026-12",
    dueOn: "2026-12-10",
    status: "skipped",
    referenceAmount: "50000.0000",
    remaining: null,
    today: "2026-12-08",
  });
  assert.equal(december, null);

  const january = recurrenceDueNotice({
    seriesId,
    concept: "Ingreso recurrente",
    currency: "UYU",
    index: 1,
    key: "2027-01",
    dueOn: "2027-01-10",
    status: "expected",
    referenceAmount: "50000.0000",
    remaining: "50000.0000",
    today: "2027-01-08",
  });
  assert.equal(january?.key, `recurrence:${seriesId}:1`);

  const paused = {
    changes: [
      { action: "pause", effectiveIndex: 1 },
      { action: "resume", effectiveIndex: 3 },
    ],
  };
  assert.equal(suppressedByPause(paused, 0), null);
  assert.equal(suppressedByPause(paused, 1), 1);
  assert.equal(suppressedByPause(paused, 2), 1);
  assert.equal(suppressedByPause(paused, 3), null);

  const edited = {
    frequency: "monthly",
    firstPeriod: "2026-11-30",
    dueDay: 30,
    dateMode: "exact",
    changes: [{ action: "due-day", effectiveIndex: 2, dueDay: 5 }],
  };
  assert.deepEqual(
    [0, 1, 2, 3].map((index) => plannedPeriodAt(edited, index).dueOn),
    ["2026-11-30", "2026-12-30", "2027-01-05", "2027-02-05"],
  );
});

test("F4-06 pagos tardíos: se registran con la fecha real sin mover el período", () => {
  const seriesId = randomUUID();
  const idempotencyKey = randomUUID();
  const late = parseSettlement(
    {
      seriesId,
      idempotencyKey,
      action: "record",
      amount: "1200,50",
      effectiveOn: "2026-01-15",
      method: "deposit",
      targets: [
        {
          index: 0,
          recorded: "0",
          version: 0,
          total: "1200.5",
          amount: "1200,50",
        },
      ],
    },
    "2026-11-11",
  );
  assert.ok(!("error" in late));
  assert.equal(late.effectiveOn, "2026-01-15");
  assert.equal(late.amount, "1200.5000");

  const previousYear = parseSettlement(
    {
      seriesId,
      idempotencyKey: randomUUID(),
      action: "record",
      amount: "500",
      effectiveOn: "2025-12-31",
      method: "deposit",
      targets: [
        {
          index: 0,
          recorded: "0",
          version: 0,
          total: "1200.5",
          amount: "500",
        },
      ],
    },
    "2026-01-05",
  );
  assert.ok(!("error" in previousYear));

  assert.ok(
    "error" in
      parseSettlement(
        {
          ...late,
          action: "record",
          idempotencyKey: randomUUID(),
          effectiveOn: "2026-11-12",
        },
        "2026-11-11",
      ),
  );

  assert.deepEqual(settlementAmounts("1200.5000", "1200.5000", null, false), {
    status: "completed",
    finalized: false,
    confirmedTotal: "1200.5000",
    remaining: "0.0000",
  });
  assert.equal(
    settlementAmounts("500.0000", "1200.5000", null, false).remaining,
    "700.5000",
  );
  assert.deepEqual(
    recurrencePeriods(
      { frequency: "monthly", firstPeriod: "2026-01-10", dueDay: 10 },
      "2026-02-28",
    ).map((period) => period.dueOn),
    ["2026-01-10", "2026-02-10"],
  );
});

test("F4-06 facturas sin importe definitivo: no inventan restante ni cierran solas", () => {
  assert.deepEqual(settlementAmounts("300.0000", null, null, false), {
    status: "partial",
    finalized: false,
    confirmedTotal: null,
    remaining: null,
  });
  assert.deepEqual(settlementAmounts("300.0000", null, "300.0000", false), {
    status: "completed",
    finalized: true,
    confirmedTotal: "300.0000",
    remaining: "0.0000",
  });
  assert.equal(
    settlementAmounts("300.0000", null, "300.0001", false).status,
    "partial",
  );
  assert.deepEqual(settlementAmounts("300.0000", "1000.0000", null, false), {
    status: "partial",
    finalized: false,
    confirmedTotal: "1000.0000",
    remaining: "700.0000",
  });
  assert.equal(
    settlementAmounts("0.0000", "1000.0000", null, false).status,
    "expected",
  );
  assert.deepEqual(settlementAmounts("300.0000", "1000.0000", null, true), {
    status: "skipped",
    finalized: false,
    confirmedTotal: "1000.0000",
    remaining: null,
  });

  const seriesId = randomUUID();
  const base = {
    seriesId,
    idempotencyKey: randomUUID(),
    action: "record",
    amount: "1000",
    effectiveOn: "2026-11-17",
    method: "debit",
  };
  assert.ok(
    "error" in
      parseSettlement(
        {
          ...base,
          targets: [
            {
              index: 0,
              recorded: "0",
              version: 0,
              total: "1000",
              amount: "1",
              final: true,
            },
          ],
        },
        "2026-11-17",
      ),
  );
  assert.ok(
    !(
      "error" in
      parseSettlement(
        {
          ...base,
          targets: [
            {
              index: 0,
              recorded: "0",
              version: 0,
              total: null,
              amount: "1000",
              final: true,
            },
          ],
        },
        "2026-11-17",
      )
    ),
  );

  const invoice = recurrenceDueNotice({
    seriesId,
    concept: "Factura de servicio",
    currency: "UYU",
    index: 0,
    key: "2026-11",
    dueOn: "2026-11-20",
    status: "partial",
    referenceAmount: null,
    remaining: null,
    today: "2026-11-17",
  });
  assert.ok(invoice);
  assert.equal(invoice.amount, null);
  assert.match(invoice.timing, /en 3 días/);
});

test("F4-06 reintentos base: la misma solicitud se normaliza igual", () => {
  const seriesId = randomUUID();
  const idempotencyKey = randomUUID();
  const command = {
    seriesId: seriesId.toUpperCase(),
    idempotencyKey: idempotencyKey.toUpperCase(),
    action: "record",
    amount: "0,3",
    effectiveOn: "2026-12-15",
    method: "debit",
    targets: [
      { index: 1, version: 2, recorded: "0,8", amount: "0,2", total: "1" },
      { index: 0, version: 0, recorded: "0", amount: "0,1", final: true },
    ],
  };
  const retry = {
    ...command,
    seriesId: seriesId.toLowerCase(),
    idempotencyKey: idempotencyKey.toLowerCase(),
    amount: "0.3000",
    targets: [
      {
        index: 0,
        version: 0,
        recorded: "0.0000",
        amount: "0.1000",
        final: true,
      },
      {
        index: 1,
        version: 2,
        recorded: "0.8000",
        amount: "0.2000",
        total: "1.0000",
      },
    ],
  };
  const first = parseSettlement(command, "2026-12-15");
  assert.deepEqual(parseSettlement(retry, "2026-12-15"), first);
  assert.ok(!("error" in first));
  assert.equal(first.seriesId, seriesId);
  assert.deepEqual(
    first.targets.map(({ index, amount }) => [index, amount]),
    [
      [0, "0.1000"],
      [1, "0.2000"],
    ],
  );

  const recurrence = {
    kind: "expense",
    concept: " Servicio ",
    currency: "UYU",
    firstPeriod: "2027-01-31",
    dateMode: "exact",
    idempotencyKey: idempotencyKey.toUpperCase(),
  };
  assert.deepEqual(
    parseRecurrence(recurrence),
    parseRecurrence({
      ...recurrence,
      concept: "Servicio",
      idempotencyKey,
    }),
  );
  assert.deepEqual(
    parseRecurrencePause({
      seriesId: seriesId.toUpperCase(),
      idempotencyKey: idempotencyKey.toUpperCase(),
      action: "pause",
    }),
    { seriesId, idempotencyKey, action: "pause" },
  );
});
