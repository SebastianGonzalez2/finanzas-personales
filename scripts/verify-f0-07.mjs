import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const { observations } = JSON.parse(await readFile(new URL("../docs/evidence/f0-07-probe.json", import.meta.url), "utf8"));
test("seis consultas públicas reales respondieron JSON con HTTP 200", () => {
  assert.equal(observations.length, 6);
  for (const entry of observations) {
    assert.equal(entry.status, 200);
    assert.match(entry.contentType, /application\/json/);
    assert.equal(entry.sample.invalidJson, undefined);
  }
});
test("datosUruguay USD/EUR: fuente, unidad, licencia y datos no posteriores a fecha pedida", () => {
  for (const entry of observations.slice(0, 3)) {
    const cutoff = new URL(entry.url).searchParams.get("to");
    assert.equal(entry.sample.meta.source, "BCU");
    assert.equal(entry.sample.meta.license, "CC-BY-4.0");
    assert.equal(entry.sample.meta.attribution.required, true);
    assert.match(entry.sample.meta.unit, /^UYU\/(USD|EUR)$/);
    assert.ok(entry.sample.data.length > 0);
    assert.ok(entry.sample.data.every((point) => point.date <= cutoff && point.value > 0));
  }
});
test("domingo: primary usa última observación anterior, no meta.last_updated", () => {
  const sample = observations[2].sample;
  assert.equal(sample.data[0].date, "2026-10-30");
  assert.ok(sample.meta.last_updated > "2026-11-01");
});
test("Frankfurter v2 incluye EUR y UYU con base USD y fecha no futura", () => {
  for (const entry of observations.slice(3, 5)) {
    const cutoff = new URL(entry.url).searchParams.get("date");
    assert.deepEqual(entry.sample.map((point) => point.quote).sort(), ["EUR", "UYU"]);
    assert.ok(entry.sample.every((point) => point.base === "USD" && point.rate > 0 && point.date <= cutoff));
  }
});
test("limitación registrada: Frankfurter v1 responde 200 pero omite UYU", () => {
  assert.equal(typeof observations[5].sample.rates.EUR, "number");
  assert.equal(observations[5].sample.rates.UYU, undefined);
});
