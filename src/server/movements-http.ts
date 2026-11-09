import "server-only";
import {
  bankReferenceToday,
  formatBankAmount,
} from "../domain/bank-balances.ts";
import { parseMovement, type MovementInput } from "../domain/movements.ts";
import { googlePrivateHeaders } from "./google-http.ts";
import { authOrigin, limitedJson } from "./google-policy.ts";
import type { saveMovement } from "./movements.ts";

const failure = (error: string, status: number) =>
  Response.json({ error }, { status, headers: googlePrivateHeaders });

export async function handleMovement(
  request: Request,
  origin: string | undefined,
  save: (movement: MovementInput) => ReturnType<typeof saveMovement>,
) {
  if (new URL(request.url).search) return failure("Solicitud inválida.", 400);
  try {
    if (
      request.headers.get("origin") !== authOrigin(origin) ||
      request.headers.get("sec-fetch-site") === "cross-site"
    )
      return failure("Solicitud no autorizada.", 403);
  } catch {
    return failure("Solicitud no autorizada.", 403);
  }

  let input: unknown;
  try {
    input = await limitedJson(request);
  } catch {
    return failure("Solicitud inválida.", 400);
  }
  const movement = parseMovement(input, bankReferenceToday());
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
    if (error instanceof Error && error.message === "Acceso denegado")
      return failure("Volvé a entrar para registrar el movimiento.", 401);
    return failure(
      "No pudimos confirmar el guardado. Intentá de nuevo con los mismos datos.",
      503,
    );
  }
}
