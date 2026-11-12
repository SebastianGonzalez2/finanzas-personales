import "server-only";
import { isBankReferenceDate } from "../domain/bank-balances.ts";
import { parseFxRate, type FxQuote } from "../domain/exchange-rates.ts";
import type { Currency } from "../domain/money.ts";

type PublicQuote = Omit<FxQuote, "date" | "source"> & {
  source: "datosuruguay" | "frankfurter";
};

const scale = BigInt("1000000000000000000");
const one = BigInt(1);

function units(rate: string) {
  const [whole, fraction = ""] = rate.split(".");
  return BigInt(whole) * scale + BigInt(fraction.padEnd(18, "0"));
}

function divide(numerator: string, denominator: string) {
  const divisor = units(denominator);
  const result = (units(numerator) * scale + divisor / BigInt(2)) / divisor;
  return parseFxRate(
    `${result / scale}.${(result % scale).toString().padStart(18, "0")}`,
  );
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

async function getJson(url: string, request: typeof fetch) {
  try {
    const response = await request(url, {
      signal: AbortSignal.timeout(3500),
      cache: "no-store",
      redirect: "error",
    });
    if (response.ok) {
      // Keep the numeric lexeme from the provider before IEEE-754 conversion.
      const data: unknown = JSON.parse(
        await response.text(),
        (key: string, value: unknown, context?: { source: string }) => {
          if (key === "rate" || key === "value")
            return typeof value === "number" ? context?.source : null;
          return value;
        },
      );
      return { data, retry: 0 };
    }
    const header = response.headers.get("retry-after");
    const retry =
      header && /^\d+$/.test(header)
        ? Number(header)
        : header
          ? Math.ceil((Date.parse(header) - Date.now()) / 1000)
          : 0;
    return {
      data: null,
      retry: Number.isSafeInteger(retry) ? Math.max(0, retry) : 0,
    };
  } catch {
    return { data: null, retry: 0 };
  }
}

export async function fetchReferenceYear(
  year: number,
  today: string,
  request = fetch,
) {
  const calendarYear = String(year).padStart(4, "0");
  const from =
    year === 1 ? "0001-01-01" : `${String(year - 1).padStart(4, "0")}-12-01`;
  const to = `${calendarYear}-12-31`;
  const end = today < to ? today : to;
  const primary = await Promise.all(
    (["USD", "EUR"] as const).map(async (base) => {
      const series = base.toLowerCase();
      const response = await getJson(
        `https://datosuruguay.com/api/v1/exchange-rates/${series}?from=${from}&to=${to}&limit=400`,
        request,
      );
      const body = record(response.data);
      const meta = record(body.meta);
      const rates = new Map<string, string>();
      if (
        meta.unit === `UYU/${base}` &&
        meta.source === "BCU" &&
        meta.has_more === false &&
        Array.isArray(body.data)
      ) {
        for (const value of body.data) {
          const row = record(value);
          const rate = parseFxRate(row.value);
          if (
            row.series === series &&
            rate &&
            isBankReferenceDate(row.date, end) &&
            row.date >= from
          )
            rates.set(row.date, rate);
        }
      }
      return { rates, retry: response.retry };
    }),
  );

  const [usd, eur] = primary.map(({ rates }) => rates);
  const rates: PublicQuote[] = [];
  const dates = new Set([...usd.keys(), ...eur.keys()]);
  function add(
    base: Currency,
    target: Currency,
    observed: string,
    rate: string,
    source: PublicQuote["source"],
  ) {
    const inverse = divide(one.toString(), rate);
    if (!inverse) return;
    rates.push({ base, target, observed, rate, source });
    rates.push({ base: target, target: base, observed, rate: inverse, source });
  }
  for (const date of [...dates].sort()) {
    const dollar = usd.get(date);
    const euro = eur.get(date);
    if (dollar) add("USD", "UYU", date, dollar, "datosuruguay");
    if (euro) add("EUR", "UYU", date, euro, "datosuruguay");
    const cross = dollar && euro && divide(dollar, euro);
    if (cross) add("USD", "EUR", date, cross, "datosuruguay");
  }

  // A Friday observation covers the weekend. Consult the backup for pairs
  // whose primary series leaves a longer gap in the requested calendar year.
  const beginning = `${calendarYear}-01-01`;
  const tolerance = 7 * 86400000;
  function primaryCovers(base: Currency, target: Currency) {
    const observations = rates
      .filter((rate) => rate.base === base && rate.target === target)
      .map(({ observed }) => observed);
    if (
      !observations.length ||
      observations[0] > beginning ||
      Date.parse(end) - Date.parse(observations.at(-1)!) > tolerance
    )
      return false;
    return observations.every(
      (date, index) =>
        index === 0 ||
        date < beginning ||
        Date.parse(date) - Date.parse(observations[index - 1]) <=
          tolerance + 86400000,
    );
  }
  const needed = [
    { base: "USD", target: "UYU" },
    { base: "USD", target: "EUR" },
    { base: "EUR", target: "UYU" },
  ] as const;
  const missing = needed.filter(
    ({ base, target }) => !primaryCovers(base, target),
  );
  const retry = Math.max(...primary.map((result) => result.retry));
  if (missing.length === 0) return { rates, complete: true, retry };

  const backups = await Promise.all(
    (["USD", "EUR"] as const).map(async (base) => {
      const quotes = missing
        .filter((pair) => pair.base === base)
        .map(({ target }) => target);
      if (!quotes.length) return 0;
      const response = await getJson(
        `https://api.frankfurter.dev/v2/rates?from=${from}&to=${to}&base=${base}&quotes=${quotes.join(",")}`,
        request,
      );
      for (const value of Array.isArray(response.data) ? response.data : []) {
        const row = record(value);
        const target = quotes.find((quote) => quote === row.quote);
        const rate = parseFxRate(row.rate);
        if (
          row.base === base &&
          target &&
          rate &&
          isBankReferenceDate(row.date, end) &&
          row.date >= from
        )
          add(base, target, row.date, rate, "frankfurter");
      }
      return response.retry;
    }),
  );
  return { rates, complete: false, retry: Math.max(retry, ...backups) };
}
