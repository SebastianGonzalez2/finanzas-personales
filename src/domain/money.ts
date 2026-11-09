export type Currency = "UYU" | "USD" | "EUR";
const scale = BigInt(10000);
const maximum = BigInt("99999999999999999999"); // NUMERIC(20,4)

function currency(value: unknown): asserts value is Currency {
  if (value !== "UYU" && value !== "USD" && value !== "EUR") {
    throw new Error("Moneda no soportada");
  }
}

function parseUnits(value: unknown) {
  if (
    typeof value !== "string" ||
    value.trim() !== value ||
    value.length > 22 ||
    !/^-?(0|[1-9]\d{0,15})(\.\d{1,4})?$/.test(value)
  ) {
    throw new Error("Importe decimal inválido");
  }
  const negative = value.startsWith("-");
  const [whole, fraction = ""] = (negative ? value.slice(1) : value).split(".");
  const units = BigInt(whole) * scale + BigInt(fraction.padEnd(4, "0"));
  return negative ? -units : units;
}

function decimal(units: bigint) {
  const absolute = units < BigInt(0) ? -units : units;
  return `${units < BigInt(0) ? "-" : ""}${absolute / scale}.${(absolute % scale).toString().padStart(4, "0")}`;
}

export function normalizeDecimalAmount(value: unknown) {
  return decimal(parseUnits(value));
}

/** Exact transport contract for monetary values. */
export class Money {
  readonly #units: bigint;
  readonly #currency: Currency;

  private constructor(units: bigint, code: Currency) {
    if (units > maximum || units < -maximum)
      throw new Error("Importe fuera de rango");
    this.#units = units;
    this.#currency = code;
    Object.freeze(this);
  }

  static parse(value: unknown, code: unknown): Money {
    currency(code);
    return new Money(parseUnits(value), code);
  }

  get currency(): Currency {
    return this.#currency;
  }

  add(other: Money): Money {
    if (this.#currency !== other.#currency)
      throw new Error("Monedas diferentes");
    return new Money(this.#units + other.#units, this.#currency);
  }

  negate(): Money {
    return new Money(-this.#units, this.#currency);
  }

  /** Equal installments only when exact; caller must resolve any remainder explicitly. */
  divideEqually(count: bigint): Money {
    if (
      typeof count !== "bigint" ||
      count <= BigInt(0) ||
      this.#units % count !== BigInt(0)
    ) {
      throw new Error("División no exacta");
    }
    return new Money(this.#units / count, this.#currency);
  }

  toDecimal(): string {
    return decimal(this.#units);
  }

  toJSON(): { amount: string; currency: Currency } {
    return { amount: this.toDecimal(), currency: this.#currency };
  }
}
