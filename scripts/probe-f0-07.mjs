import { writeFile } from "node:fs/promises";

// Fixed, public read-only sources. No user data or credentials are accepted.
const urls = [
  "https://datosuruguay.com/api/v1/exchange-rates/usd?to=2026-11-06&limit=2",
  "https://datosuruguay.com/api/v1/exchange-rates/eur?to=2026-11-06&limit=2",
  "https://datosuruguay.com/api/v1/exchange-rates/usd?to=2026-11-01&limit=2",
  "https://api.frankfurter.dev/v2/rates?date=2026-11-06&base=USD&quotes=UYU,EUR",
  "https://api.frankfurter.dev/v2/rates?date=2026-11-01&base=USD&quotes=UYU,EUR",
  "https://api.frankfurter.dev/v1/2026-11-06?base=USD&symbols=UYU,EUR",
];
const observations = [];
for (const url of urls) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
    const body = await response.text();
    let sample;
    try { sample = JSON.parse(body); } catch { sample = { invalidJson: true }; }
    observations.push({ url, status: response.status, contentType: response.headers.get("content-type"), retryAfter: response.headers.get("retry-after"), sample });
  } catch {
    observations.push({ url, error: "Solicitud pública fallida o timeout; cobertura no verificada" });
  }
}
await writeFile(new URL("../docs/evidence/f0-07-probe.json", import.meta.url), `${JSON.stringify({ observedAt: new Date().toISOString(), purpose: "Public source availability only; not financial data", observations }, null, 2)}\n`);
console.log(observations.map(({ url, status, error }) => ({ url, status, error })));
