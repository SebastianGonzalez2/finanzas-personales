import { writeFile } from "node:fs/promises";
import console from "node:console";
import process from "node:process";
import { URL, pathToFileURL } from "node:url";

// Fixed, public read-only sources. No user data or credentials are accepted.
const urls = [
  "https://datosuruguay.com/api/v1/exchange-rates/usd?to=2026-11-06&limit=2",
  "https://datosuruguay.com/api/v1/exchange-rates/eur?to=2026-11-06&limit=2",
  "https://datosuruguay.com/api/v1/exchange-rates/usd?to=2026-11-01&limit=2",
  "https://api.frankfurter.dev/v2/rates?date=2026-11-06&base=USD&quotes=UYU,EUR",
  "https://api.frankfurter.dev/v2/rates?date=2026-11-01&base=USD&quotes=UYU,EUR",
  "https://api.frankfurter.dev/v1/2026-11-06?base=USD&symbols=UYU,EUR",
];
export async function runPublicProbes(fetcher = globalThis.fetch) {
  const observations = [];
  for (const url of urls) {
    try {
      const response = await fetcher(url, {
        signal: globalThis.AbortSignal.timeout(15000),
      });
      const body = await response.text();
      let sample;
      try {
        sample = JSON.parse(body);
      } catch {
        sample = { invalidJson: true };
      }
      observations.push({
        url,
        status: response.status,
        contentType: response.headers.get("content-type"),
        retryAfter: response.headers.get("retry-after"),
        sample,
      });
    } catch {
      observations.push({
        url,
        error: "Solicitud pública fallida o timeout; cobertura no verificada",
      });
    }
  }
  const ok = observations.every(
    (entry) =>
      entry.status === 200 &&
      /^application\/json\b/i.test(entry.contentType ?? "") &&
      entry.sample !== null &&
      typeof entry.sample === "object" &&
      entry.sample.invalidJson !== true,
  );
  return { observations, ok };
}

// Importing for offline tests must not make requests or rewrite evidence.
if (
  process.argv[1] &&
  pathToFileURL(process.argv[1]).href === import.meta.url
) {
  const { observations, ok } = await runPublicProbes();
  await writeFile(
    new URL("../docs/evidence/f0-07-probe.json", import.meta.url),
    `${JSON.stringify({ observedAt: new Date().toISOString(), purpose: "Public source availability only; not financial data", observations }, null, 2)}\n`,
  );
  console.log(
    observations.map(({ url, status, error }) => ({ url, status, error })),
  );
  if (!ok) process.exitCode = 1;
}
