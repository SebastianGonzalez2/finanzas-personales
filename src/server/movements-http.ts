import "server-only";
import {
  bankReferenceToday,
  formatBankAmount,
} from "../domain/bank-balances.ts";
import {
  parseBankTransfer,
  parseMovement,
  parseMovementRevision,
  type BankTransfer,
  type MovementInput,
  type MovementRevision,
} from "../domain/movements.ts";
import { googlePrivateHeaders } from "./google-http.ts";
import { authOrigin, limitedJson } from "./google-policy.ts";
import type {
  reviseMovement,
  saveBankTransfer,
  saveMovement,
} from "./movements.ts";

const failure = (error: string, status: number) =>
  Response.json({ error }, { status, headers: googlePrivateHeaders });

async function readMovementRequest(
  request: Request,
  origin: string | undefined,
) {
  if (new URL(request.url).search)
    return { response: failure("Solicitud inválida.", 400) };
  try {
    if (
      request.headers.get("origin") !== authOrigin(origin) ||
      request.headers.get("sec-fetch-site") === "cross-site"
    )
      return { response: failure("Solicitud no autorizada.", 403) };
  } catch {
    return { response: failure("Solicitud no autorizada.", 403) };
  }

  try {
    return { input: await limitedJson(request) };
  } catch {
    return { response: failure("Solicitud inválida.", 400) };
  }
}

function movementFailure(error: unknown, operation: "registrar" | "modificar") {
  if (error instanceof Error && error.message === "Acceso denegado")
    return failure(`Volvé a entrar para ${operation} el movimiento.`, 401);
  return failure(
    "No pudimos confirmar el guardado. Intentá de nuevo con los mismos datos.",
    503,
  );
}

export async function handleMovement(
  request: Request,
  origin: string | undefined,
  save: (
    movement: MovementInput | BankTransfer,
  ) => Promise<
    Awaited<
      ReturnType<typeof saveMovement> | ReturnType<typeof saveBankTransfer>
    >
  >,
) {
  const body = await readMovementRequest(request, origin);
  if (body.response) return body.response;
  const today = bankReferenceToday();
  const input = body.input;
  const movement =
    input &&
    typeof input === "object" &&
    "kind" in input &&
    input.kind === "bank_transfer"
      ? parseBankTransfer(input, today)
      : parseMovement(input, today);
  if ("error" in movement) return failure(movement.error, 400);

  try {
    const result = await save(movement);
    switch (result.status) {
      case "conflict":
        return failure(
          "Este envío ya se usó con otros datos. Revisá los movimientos recientes.",
          409,
        );
      case "unconfigured":
        return failure(
          "currency" in result
            ? `Configurá el saldo inicial en ${result.currency} e intentá de nuevo.`
            : "Configurá el saldo inicial de esta moneda e intentá de nuevo.",
          409,
        );
      case "unavailable":
        return failure(
          "El registro de cambios de moneda aún no está disponible.",
          409,
        );
      case "invalid-classification":
        return failure(result.message, 400);
      case "invalid-coverage":
        return failure(result.message, 409);
      case "invalid-category":
        return failure(
          "La categoría no está disponible. Elegí otra o dejá el movimiento sin categorizar.",
          400,
        );
      case "insufficient-funds": {
        const currency =
          movement.kind === "bank_transfer"
            ? movement.sourceCurrency
            : movement.currency;
        const operation =
          movement.kind === "bank_transfer"
            ? "el cambio de moneda"
            : "el gasto";
        return failure(
          `Saldo disponible insuficiente. Faltan ${formatBankAmount({ amount: result.shortfall, currency })} para registrar ${operation}.`,
          409,
        );
      }
      default:
        return Response.json(
          { id: result.id },
          {
            status: result.status === "created" ? 201 : 200,
            headers: googlePrivateHeaders,
          },
        );
    }
  } catch (error) {
    return movementFailure(error, "registrar");
  }
}

export async function handleMovementRevision(
  request: Request,
  origin: string | undefined,
  revise: (revision: MovementRevision) => ReturnType<typeof reviseMovement>,
) {
  const body = await readMovementRequest(request, origin);
  if (body.response) return body.response;
  const revision = parseMovementRevision(body.input);
  if ("error" in revision) return failure(revision.error, 400);

  try {
    const result = await revise(revision);
    switch (result.status) {
      case "not-found":
        return failure("El movimiento no está disponible.", 404);
      case "inactive":
        return failure(
          "El movimiento ya fue corregido o anulado. Actualizá la página para ver su estado.",
          409,
        );
      case "conflict":
        return failure(
          "Este envío ya se usó con otros datos. Revisá Resumen.",
          409,
        );
      case "checkpoint":
        return failure(
          "Un saldo confirmado después de este registro cubre su fecha. Compará el movimiento y el saldo confirmado con tu estado de cuenta antes de hacer una corrección.",
          409,
        );
      case "unavailable":
        return failure("La edición del historial aún no está disponible.", 409);
      case "invalid-classification":
        return failure(result.message, 400);
      case "invalid-kind":
        return failure(
          "Elegí los campos que corresponden al tipo de movimiento.",
          400,
        );
      case "invalid-coverage":
        return failure(result.message, 409);
      case "invalid-category":
        return failure(
          "La categoría no está disponible. Elegí otra o dejá el movimiento sin categorizar.",
          400,
        );
      case "unconfigured":
        return failure(
          "Configurá el saldo inicial de esta moneda e intentá de nuevo.",
          409,
        );
      case "insufficient-funds":
        return failure(
          `Faltan ${formatBankAmount({ amount: result.shortfall, currency: result.currency })} para aplicar el cambio. Revisá primero los movimientos que usaron ese saldo.`,
          409,
        );
      default:
        return Response.json(
          { id: result.id },
          { headers: googlePrivateHeaders },
        );
    }
  } catch (error) {
    return movementFailure(error, "modificar");
  }
}
