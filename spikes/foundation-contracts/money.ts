export type Currency = "UYU" | "USD" | "EUR";
const scale = 10_000n;
const maximum = 99_999_999_999_999_999_999n; // NUMERIC(20,4)

function currency(value: unknown): asserts value is Currency {
  if (value !== "UYU" && value !== "USD" && value !== "EUR") {
    throw new Error("Moneda no soportada");
  }
}

/** Experimental exact transport contract. No implicit rounding or FX. */
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
    if (
      typeof value !== "string" ||
      value.trim() !== value ||
      value.length > 22 ||
      !/^-?(0|[1-9]\d{0,15})(\.\d{1,4})?$/.test(value)
    ) {
      throw new Error("Importe decimal inválido");
    }
    const negative = value.startsWith("-");
    const [whole, fraction = ""] = (negative ? value.slice(1) : value).split(
      ".",
    );
    const units = BigInt(whole) * scale + BigInt(fraction.padEnd(4, "0"));
    return new Money(negative ? -units : units, code);
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
      count <= 0n ||
      this.#units % count !== 0n
    ) {
      throw new Error("División no exacta");
    }
    return new Money(this.#units / count, this.#currency);
  }

  toDecimal(): string {
    const absolute = this.#units < 0n ? -this.#units : this.#units;
    return `${this.#units < 0n ? "-" : ""}${absolute / scale}.${(absolute % scale).toString().padStart(4, "0")}`;
  }

  toJSON(): { amount: string; currency: Currency } {
    return { amount: this.toDecimal(), currency: this.#currency };
  }
}
