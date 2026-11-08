import { Money } from "./money.ts";
import type { Currency } from "./money.ts";
import { calendarDate, utcInstant } from "./dates.ts";
import { requireOwnedResources } from "./ownership.ts";

type Position = Readonly<{
  id: string;
  ownerId: string;
  effectiveDate: string;
  // Explicit order within a date; never infer the position of a manual anchor.
  sequence: number;
}>;
export type BankEffect = Position &
  Readonly<{
    kind: "bank-effect";
    amount: Money;
    status: "confirmed" | "pending" | "voided";
  }>;
export type Checkpoint = Position &
  Readonly<{
    kind: "checkpoint";
    confirmed: Money;
  }>;
export type TimelineEntry = BankEffect | Checkpoint;

function validate(ownerId: unknown, entries: readonly TimelineEntry[]): string {
  const owner = requireOwnedResources(ownerId, entries);
  const ids = new Set<string>();
  const positions = new Set<string>();
  for (const entry of entries) {
    if (typeof entry.id !== "string" || !entry.id.trim() || ids.has(entry.id)) {
      throw new Error("Identificador ausente o duplicado");
    }
    ids.add(entry.id);
    calendarDate(entry.effectiveDate);
    if (!Number.isSafeInteger(entry.sequence) || entry.sequence < 0)
      throw new Error("Orden explícito inválido");
    const position = `${entry.effectiveDate}:${entry.sequence}`;
    if (positions.has(position)) throw new Error("Orden temporal ambiguo");
    positions.add(position);
    if (entry.kind === "bank-effect") {
      if (
        !(entry.amount instanceof Money) ||
        !["confirmed", "pending", "voided"].includes(entry.status)
      )
        throw new Error("Efecto inválido");
    } else if (
      entry.kind !== "checkpoint" ||
      !(entry.confirmed instanceof Money)
    ) {
      throw new Error("Entrada inválida");
    }
  }
  return owner;
}

/** Pure prototype; no writes, persistence, auth adapter, or inferred movements. */
export function projectBank(
  ownerId: unknown,
  code: Currency,
  entries: readonly TimelineEntry[],
) {
  validate(ownerId, entries);
  let balance = Money.parse("0", code);
  const differences: Readonly<{
    checkpointId: string;
    projected: Money;
    confirmed: Money;
    difference: Money;
  }>[] = [];
  const ordered = [...entries].sort(
    (a, b) =>
      a.effectiveDate.localeCompare(b.effectiveDate) || a.sequence - b.sequence,
  );
  for (const entry of ordered) {
    if (entry.kind === "bank-effect") {
      if (entry.status === "confirmed" && entry.amount.currency === code)
        balance = balance.add(entry.amount);
    } else if (entry.confirmed.currency === code) {
      differences.push(
        Object.freeze({
          checkpointId: entry.id,
          projected: balance,
          confirmed: entry.confirmed,
          difference: entry.confirmed.add(balance.negate()),
        }),
      );
      balance = entry.confirmed;
    }
  }
  return Object.freeze({ balance, differences: Object.freeze(differences) });
}

/** Returns a new timeline plus audit; a failed correction cannot mutate inputs. */
export function correctBankEffect(
  ownerId: unknown,
  entries: readonly TimelineEntry[],
  command: Readonly<{
    eventId: string;
    replacement: Money;
    reason: string;
    recordedAt: string;
  }>,
) {
  const actor = validate(ownerId, entries);
  if (typeof command.reason !== "string" || !command.reason.trim())
    throw new Error("Motivo obligatorio");
  utcInstant(command.recordedAt);
  const original = entries.find((entry) => entry.id === command.eventId);
  if (
    !original ||
    original.kind !== "bank-effect" ||
    original.status !== "confirmed"
  )
    throw new Error("Solo se corrigen efectos confirmados");
  if (
    !(command.replacement instanceof Money) ||
    original.amount.currency !== command.replacement.currency
  )
    throw new Error("No cambiar moneda al corregir importe");
  const replacement = Object.freeze({
    ...original,
    amount: command.replacement,
  });
  const timeline = Object.freeze(
    entries.map((entry) => (entry === original ? replacement : entry)),
  );
  // Validate every currency projection before returning any result (overflow included).
  for (const code of ["UYU", "USD", "EUR"] as const)
    projectBank(actor, code, timeline);
  const audit = Object.freeze({
    actorOwnerId: actor,
    eventId: original.id,
    recordedAt: command.recordedAt,
    reason: command.reason,
    before: Object.freeze(original.amount.toJSON()),
    after: Object.freeze(command.replacement.toJSON()),
  });
  return Object.freeze({ timeline, audit });
}
