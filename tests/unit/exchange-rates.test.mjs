import assert from "node:assert/strict";
import test from "node:test";
import { URL } from "node:url";
import {
  parseFxRate,
  parseManualFx,
  sumFx,
} from "../../src/domain/exchange-rates.ts";
import { fetchReferenceYear } from "../../src/server/exchange-rate-providers.ts";

test("F5-06: exact monetary conversion and validated manual rates", () => {
  assert.equal(
    sumFx([
      { amount: "10.0000", rate: "1.125" },
      { amount: "400", rate: "0.025" },
    ]),
    "21.2500",
  );
  assert.equal(sumFx([{ amount: "-0.0001", rate: "0.5" }]), "-0.0001");
  assert.equal(
    sumFx([
      { amount: "0.0001", rate: "0.3" },
      { amount: "0.0001", rate: "0.3" },
    ]),
    "0.0001",
  );
  assert.equal(sumFx([{ amount: "1", rate: undefined }]), null);
  assert.equal(sumFx([{ amount: "0", rate: undefined }]), "0.0000");
  assert.equal(parseFxRate(" 1,2500 "), "1.25");
  for (const invalid of [
    "0",
    "-1",
    "1e-2",
    "NaN",
    "0.0000000000000000001",
    "1000000000000",
  ])
    assert.equal(parseFxRate(invalid), null);
  const manual = {
    date: "2026-11-01",
    base: "EUR",
    target: "USD",
    rate: "1.25",
  };
  assert.deepEqual(parseManualFx(manual, "2026-11-11"), manual);
  assert.equal(parseManualFx(manual, "2026-10-31"), null);
  assert.equal(parseManualFx({ ...manual, ownerId: "B" }, "2026-11-11"), null);
});

function bcu(base, value, date) {
  return globalThis.Response.json({
    meta: { source: "BCU", unit: `UYU/${base}`, has_more: false },
    data: [{ series: base.toLowerCase(), value, date }],
  });
}

test("F5-06: BCU cross-rate uses both legs from the same observation date", async () => {
  const calls = [];
  const result = await fetchReferenceYear(2026, "2026-01-04", async (url) => {
    calls.push(url);
    const usd = url.includes("/usd?");
    return bcu(usd ? "USD" : "EUR", usd ? 40 : 45, "2025-12-31");
  });
  assert.equal(calls.length, 2);
  assert.equal(result.complete, true);
  assert.deepEqual(
    result.rates.find(({ base, target }) => base === "EUR" && target === "USD"),
    {
      base: "EUR",
      target: "USD",
      observed: "2025-12-31",
      rate: "1.125",
      source: "datosuruguay",
    },
  );
});

test("F5-06: Frankfurter fills missing pairs and rejects dates after today", async () => {
  const result = await fetchReferenceYear(2026, "2026-01-04", async (url) => {
    const link = new URL(url);
    if (link.hostname === "datosuruguay.com") {
      if (link.pathname.endsWith("/usd")) return bcu("USD", 40, "2025-12-31");
      return new globalThis.Response(null, {
        status: 429,
        headers: { "Retry-After": "7200" },
      });
    }
    const base = link.searchParams.get("base");
    const quote = link.searchParams.get("quotes");
    assert.equal(quote, base === "USD" ? "EUR" : "UYU");
    return globalThis.Response.json([
      { base, quote, date: "2026-01-02", rate: base === "USD" ? 0.8 : 50 },
      { base, quote, date: "2026-01-05", rate: 999 },
      { base, quote, date: "2026-01-03", rate: 0 },
      { base, quote: "CAD", date: "2026-01-03", rate: 40 },
    ]);
  });
  assert.equal(result.complete, false);
  assert.equal(result.retry, 7200);
  assert.equal(result.rates.length, 6);
  assert.deepEqual(
    result.rates.find(({ base, target }) => base === "EUR" && target === "USD"),
    {
      base: "EUR",
      target: "USD",
      observed: "2026-01-02",
      rate: "1.25",
      source: "frankfurter",
    },
  );
});
