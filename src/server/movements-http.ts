import "server-only";
import {
  bankReferenceToday,
  formatBankAmount,
} from "../domain/bank-balances.ts";
import {
  parseMovement,
  parseMovementRevision,
  type MovementInput,
  type MovementRevision,
} from "../domain/movements.ts";
import { googlePrivateHeaders } from "./google-http.ts";
import { authOrigin, limitedJson } from "./google-policy.ts";
import type { reviseMovement, saveMovement } from "./movements.ts";

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
  save: (movement: MovementInput) => ReturnType<typeof saveMovement>,
) {
  const body = await readMovementRequest(request, origin);
  if (body.response) return body.response;
  const movement = parseMovement(body.input, bankReferenceToday());
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
          "Configurá el saldo inicial de esta moneda e intentá de nuevo.",
          409,
        );
      case "invalid-category":
        return failure(
          "La categoría no está disponible. Elegí otra o dejá el movimiento sin categorizar.",
          400,
        );
      case "insufficient-funds":
        return failure(
          `Saldo disponible insuficiente. Faltan ${formatBankAmount({ amount: result.shortfall, currency: movement.currency })} para registrar el gasto.`,
          409,
        );
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
          "El movimiento ya fue corregido o anulado. Revisá Resumen.",
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
