import assert from "node:assert/strict";
import test from "node:test";
import {
  dueNoticeWindow,
  dueNoticeTimingText,
  loanDueNotice,
  recurrenceDueNotice,
  defaultNoticeLeadDays,
} from "../../src/domain/due-notices.ts";

const today = "2026-11-17";

test("F4-05/CA-049: cuota con fecha cierta 20 y día 17 pendiente genera aviso", () => {
  const notice = loanDueNotice({
    loanId: "0b3fd9f2-1f4a-4a2e-9d1a-3f2b7c6d5e01",
    concept: "Préstamo familiar",
    direction: "payable",
    currency: "UYU",
    dueOn: "2026-11-20",
    outstanding: "5000.0000",
    today,
  });
  assert.ok(notice);
  assert.equal(notice.kind, "loan");
  assert.match(notice.timing, /Vence el 20\/11\/2026, en 3 días/);
  assert.match(notice.amount ?? "", /5\.000,00 UYU/);
});

test("F4-05: sin fecha cierta no inventa vencimiento ni aviso", () => {
  for (const dueOn of [null, undefined, ""]) {
    assert.equal(
      dueNoticeWindow({ today, dueOn, leadDays: defaultNoticeLeadDays }),
      null,
    );
    assert.equal(
      loanDueNotice({
        loanId: "0b3fd9f2-1f4a-4a2e-9d1a-3f2b7c6d5e01",
        concept: "Deuda",
        direction: "payable",
        currency: "UYU",
        dueOn: null,
        outstanding: "1000.0000",
        today,
      }),
      null,
    );
  }
});

test("F4-05: la ventana respeta la antelación configurada por obligación", () => {
  const dueOn = "2026-11-20";
  assert.equal(dueNoticeWindow({ today, dueOn, leadDays: 2 }), null);
  const withLead = dueNoticeWindow({ today, dueOn, leadDays: 4 });
  assert.ok(withLead);
  assert.equal(withLead.daysUntil, 3);
  assert.equal(withLead.state, "upcoming");
  assert.equal(dueNoticeWindow({ today, dueOn: "2026-11-20" })?.daysUntil, 3);
});

test("F4-05: estados del aviso — vence hoy y pendiente sin confirmar", () => {
  const dueToday = dueNoticeWindow({ today, dueOn: "2026-11-17" });
  assert.equal(dueToday?.state, "due-today");
  assert.match(dueNoticeTimingText(dueToday), /Vence hoy, 17\/11\/2026/);
  const past = dueNoticeWindow({ today, dueOn: "2026-11-10" });
  assert.equal(past?.state, "unconfirmed-past");
  assert.match(
    dueNoticeTimingText(past),
    /La fecha registrada \(10\/11\/2026\) ya pasó y seguimos sin confirmar el pago/,
  );
  // Antirruido: nunca declara atraso ni mora bancaria.
  for (const text of [
    dueNoticeTimingText(dueToday),
    dueNoticeTimingText(past),
  ]) {
    assert.doesNotMatch(text, /atras|mora/i);
  }
});

test("F4-05: deuda saldada no genera aviso", () => {
  assert.equal(
    loanDueNotice({
      loanId: "0b3fd9f2-1f4a-4a2e-9d1a-3f2b7c6d5e01",
      concept: "Deuda",
      direction: "payable",
      currency: "UYU",
      dueOn: "2026-11-20",
      outstanding: "0.0000",
      today,
    }),
    null,
  );
});

test("F4-05: período recurrente con fecha cierta pendiente genera un aviso único", () => {
  const seriesId = "1c4e0a13-2b5f-4b3f-8e2b-4a3c6d7e8f02";
  const notice = recurrenceDueNotice({
    seriesId,
    concept: "Alquiler",
    currency: "UYU",
    index: 3,
    key: "2026-11",
    dueOn: "2026-11-20",
    status: "expected",
    referenceAmount: "12000.0000",
    remaining: "12000.0000",
    today,
  });
  assert.ok(notice);
  assert.equal(notice.key, `recurrence:${seriesId}:3`);
  assert.match(notice.amount, /Importe de referencia/);
  assert.match(notice.timing, /Vence el 20\/11\/2026, en 3 días/);

  const partial = recurrenceDueNotice({
    seriesId,
    concept: "Alquiler",
    currency: "UYU",
    index: 3,
    key: "2026-11",
    dueOn: "2026-11-20",
    status: "partial",
    referenceAmount: "12000.0000",
    remaining: "3000.0000",
    today,
  });
  assert.match(partial.amount, /Importe pendiente: 3\.000,00 UYU/);
});

test("UI-05E: el aviso recurrente enlaza a la serie que lo originó", () => {
  const input = {
    concept: "Alquiler",
    currency: "UYU",
    index: 3,
    key: "2026-11",
    dueOn: "2026-11-20",
    status: "expected",
    referenceAmount: "12000.0000",
    remaining: "12000.0000",
    today,
  };
  const first = "1c4e0a13-2b5f-4b3f-8e2b-4a3c6d7e8f02";
  const second = "9d8c7b6a-5f4e-4d3c-8b2a-1f0e9d8c7b6a";
  assert.equal(
    recurrenceDueNotice({ ...input, seriesId: first }).href,
    `/recurrentes?serie=${first}`,
  );
  assert.equal(
    recurrenceDueNotice({ ...input, seriesId: second }).href,
    `/recurrentes?serie=${second}`,
  );
});

test("F4-05: períodos resueltos o fuera de la ventana no generan avisos", () => {
  const base = {
    seriesId: "1c4e0a13-2b5f-4b3f-8e2b-4a3c6d7e8f02",
    concept: "Alquiler",
    currency: "UYU",
    index: 3,
    key: "2026-11",
    dueOn: "2026-11-20",
    referenceAmount: "12000.0000",
    remaining: "12000.0000",
    today,
  };
  for (const status of ["completed", "skipped"])
    assert.equal(recurrenceDueNotice({ ...base, status }), null);
  assert.equal(
    recurrenceDueNotice({ ...base, status: "expected", dueOn: "2026-11-25" }),
    null,
  );
  assert.equal(
    recurrenceDueNotice({ ...base, status: "expected", dueOn: null }),
    null,
  );
});
