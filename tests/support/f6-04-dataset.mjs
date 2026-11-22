import { randomUUID } from "node:crypto";
import { parseBudgetCommand } from "../../src/domain/budgets.ts";
import { parseMovement } from "../../src/domain/movements.ts";
import { parseRecurrence } from "../../src/domain/recurrence-definition.ts";
import { parseSettlement } from "../../src/domain/recurrence-settlements.ts";
import { saveManualFx } from "../../src/server/exchange-rates.ts";
import { saveBudget } from "../../src/server/budgets.ts";
import { saveSavedFilterCommand } from "../../src/server/history-filters.ts";
import { createCatalogCategory } from "../../src/server/categories.ts";
import { saveTag } from "../../src/server/classification.ts";
import { saveMovement } from "../../src/server/movements.ts";
import {
  applySettlement,
  trackedPeriods,
} from "../../src/server/recurrence-settlements.ts";
import { createRecurrence } from "../../src/server/recurrences.ts";
import { saveDisplayCurrency } from "../../src/server/exchange-rates.ts";

const today = "2026-01-15";

function parsed(result) {
  if ("error" in result) throw new Error(result.error);
  return result;
}

function created(result) {
  if (result.status !== "created" && result.status !== "saved")
    throw new Error(`Alta sintética rechazada: ${JSON.stringify(result)}`);
  return result;
}

// F6-04 / SIMP-04: dataset sintético que recorre el dominio de gastos con los
// servicios reales y, además, filas heredadas (tarjetas, saldos, beneficios,
// préstamos y fondos) insertadas como datos preexistentes: la aplicación ya no
// las escribe, pero backup, restauración, reinicio y borrado deben conservarlas.
export async function seedFinancialDomain(
  client,
  ownerId,
  { rich = true, legacy = true } = {},
) {
  await saveDisplayCurrency(client, ownerId, "UYU");
  const food = created(
    await createCatalogCategory(client, ownerId, {
      kind: "expense",
      name: "Comida sintética",
      parentId: null,
    }),
  );
  const tagId = randomUUID();
  await saveTag(client, ownerId, {
    action: "create",
    id: tagId,
    name: "Etiqueta sintética",
  });
  await saveMovement(
    client,
    ownerId,
    parsed(
      parseMovement(
        {
          kind: "expense",
          currency: "UYU",
          amount: "1234.5678",
          effectiveOn: "2026-01-05",
          method: "debit",
          concept: "Almuerzo sintético",
          note: "Nota de prueba",
          merchantName: "Comercio sintético",
          tagIds: [tagId],
          allocations: [
            { categoryId: food.id, amount: "1000.0000" },
            { categoryId: null, amount: "234.5678" },
          ],
          idempotencyKey: randomUUID(),
        },
        today,
      ),
    ),
  );
  if (!rich) return {};

  await createCatalogCategory(client, ownerId, {
    kind: "expense",
    name: "Panadería sintética",
    parentId: food.id,
  });
  await saveBudget(
    client,
    ownerId,
    parsed(
      parseBudgetCommand(
        {
          idempotencyKey: randomUUID(),
          action: "save",
          categoryId: food.id,
          currency: "UYU",
          amount: "5000",
        },
        today,
      ),
    ),
    today,
  );
  const savedFilter = await saveSavedFilterCommand(client, ownerId, {
    action: "create",
    name: "Filtro sintético",
    criteria: { period: "mes-actual", category: food.id },
    idempotencyKey: randomUUID(),
  });
  created(savedFilter);
  // Gasto en cuotas independiente de tarjetas (USD, tres cuotas mensuales).
  created(
    await saveMovement(
      client,
      ownerId,
      parsed(
        parseMovement(
          {
            kind: "expense",
            currency: "USD",
            amount: "300",
            effectiveOn: today,
            method: "unspecified",
            concept: "Compra en cuotas sintética",
            plan: {
              installmentAmount: "100",
              count: 3,
              firstPeriod: "2026-02",
            },
            idempotencyKey: randomUUID(),
          },
          today,
        ),
      ),
    ),
  );
  // Preserve both rate formats in the restore rehearsal.
  await saveBudget(
    client,
    ownerId,
    parsed(
      parseBudgetCommand(
        {
          idempotencyKey: randomUUID(),
          action: "quote",
          fromCurrency: "USD",
          toCurrency: "UYU",
          rate: "40.1234",
          effectiveOn: "2026-01-10",
        },
        today,
      ),
    ),
    today,
  );
  if (
    !(await saveManualFx(client, ownerId, {
      date: "2026-02-01",
      base: "USD",
      target: "UYU",
      rate: "39.321",
    }))
  )
    throw new Error("No se pudo preparar la referencia mensual sintética");
  if (legacy) await seedLegacyRows(client, ownerId);
  const definition = parsed(
    parseRecurrence({
      kind: "expense",
      concept: "Suscripción sintética",
      currency: "UYU",
      categoryId: null,
      firstPeriod: "2026-01-01",
      dateMode: "exact",
      dueDay: 5,
      referenceAmount: "250",
      idempotencyKey: randomUUID(),
    }),
  );
  const saved = created(await createRecurrence(client, ownerId, definition));
  const series = { ...definition, id: saved.id };
  const [period] = await trackedPeriods(client, ownerId, series, [0]);
  created(
    await applySettlement(
      client,
      ownerId,
      parsed(
        parseSettlement(
          {
            idempotencyKey: randomUUID(),
            seriesId: series.id,
            action: "record",
            targets: [
              {
                index: period.index,
                version: period.version,
                recorded: period.recorded,
                amount: "250",
              },
            ],
            amount: "250",
            effectiveOn: "2026-01-10",
            method: "debit",
          },
          today,
        ),
      ),
      today,
    ),
  );
  return {};
}

// Filas heredadas: la aplicación de gastos ya no las crea, pero cuentas
// anteriores las conservan y deben sobrevivir a copia, restauración y reinicio.
async function seedLegacyRows(client, ownerId) {
  // La aplicación ya no escribe estas tablas: se insertan con el rol de la
  // sesión (propietario del esquema) y se vuelve luego al rol de la aplicación.
  await client.query("RESET ROLE");
  const cardId = randomUUID();
  const eventId = randomUUID();
  await client.query(
    `INSERT INTO finance.balance_checkpoints
       (owner_id, id, currency, confirmed_amount, as_of_date)
     VALUES ($1, gen_random_uuid(), 'UYU', '42.0001', '2025-01-01')`,
    [ownerId],
  );
  await client.query(
    "INSERT INTO finance.cards (owner_id, id, kind, name) VALUES ($1, $2, 'credit', 'Tarjeta heredada sintética')",
    [ownerId, cardId],
  );
  await client.query(
    "INSERT INTO finance.card_currencies (owner_id, card_id, kind, currency, debt) VALUES ($1, $2, 'credit', 'UYU', '15.0001')",
    [ownerId, cardId],
  );
  await client.query(
    `INSERT INTO finance.financial_events
       (owner_id, id, kind, concept, effective_on, idempotency_key, command_hash)
     VALUES ($1, $2, 'bank_benefit', 'Beneficio heredado sintético', '2025-01-01', gen_random_uuid(), repeat('a', 64))`,
    [ownerId, eventId],
  );
  await client.query(
    `INSERT INTO finance.bank_benefits (owner_id, event_id, destination, currency, amount)
     VALUES ($1, $2, 'bank', 'UYU', '5.0001')`,
    [ownerId, eventId],
  );
  await client.query("SET LOCAL ROLE finanzas_app");
}
