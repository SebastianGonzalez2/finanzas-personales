import "server-only";
import {
  bankReferenceToday,
  parseBalanceAdjustment,
  parseOpeningBalance,
  type BalanceAdjustment,
  type BankBalance,
} from "../domain/bank-balances.ts";
import type {
  saveBalanceAdjustment,
  saveOpeningBalance,
} from "./bank-balances.ts";
import { googlePrivateHeaders } from "./google-http.ts";
import { authOrigin, limitedJson } from "./google-policy.ts";

const failure = (error: string, status: number) =>
  Response.json({ error }, { status, headers: googlePrivateHeaders });

async function readBalanceRequest(
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

export async function handleOpeningBalance(
  request: Request,
  origin: string | undefined,
  save: (balance: BankBalance) => ReturnType<typeof saveOpeningBalance>,
) {
  const body = await readBalanceRequest(request, origin);
  if (body.response) return body.response;
  const balance = parseOpeningBalance(body.input, bankReferenceToday());
  if ("error" in balance) return failure(balance.error, 400);

  try {
    const result = await save(balance);
    if (result === "conflict")
      return failure("Esta moneda ya tiene un saldo. Recargá el resumen.", 409);
    return Response.json(
      { balance },
      {
        status: result === "created" ? 201 : 200,
        headers: googlePrivateHeaders,
      },
    );
  } catch {
    return failure(
      "No se pudo guardar el saldo. Volvé a entrar e intentá de nuevo.",
      401,
    );
  }
}

export async function handleBalanceAdjustment(
  request: Request,
  origin: string | undefined,
  save: (
    adjustment: BalanceAdjustment,
  ) => ReturnType<typeof saveBalanceAdjustment>,
) {
  const body = await readBalanceRequest(request, origin);
  if (body.response) return body.response;
  const adjustment = parseBalanceAdjustment(body.input, bankReferenceToday());
  if ("error" in adjustment) return failure(adjustment.error, 400);
  try {
    const result = await save(adjustment);
    switch (result.status) {
      case "conflict":
        return failure(
          "Este envío ya se usó con otros datos. Revisá las confirmaciones de saldo.",
          409,
        );
      case "unconfigured":
        return failure(
          "Configurá el saldo inicial de esta moneda primero.",
          409,
        );
      case "before-opening":
        return failure(
          "Elegí una fecha igual o posterior al saldo inicial de esta moneda.",
          409,
        );
      case "unavailable":
        return failure(
          "La actualización de saldos todavía no está disponible.",
          503,
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
      return failure("Volvé a entrar para confirmar el saldo.", 401);
    return failure(
      "No pudimos confirmar el guardado. Reintentá con los mismos datos.",
      503,
    );
  }
}
