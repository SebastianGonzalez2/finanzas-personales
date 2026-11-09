import "server-only";
import {
  bankReferenceToday,
  parseOpeningBalance,
  type BankBalance,
} from "../domain/bank-balances.ts";
import type { saveOpeningBalance } from "./bank-balances.ts";
import { googlePrivateHeaders } from "./google-http.ts";
import { authOrigin, limitedJson } from "./google-policy.ts";

const failure = (error: string, status: number) =>
  Response.json({ error }, { status, headers: googlePrivateHeaders });

export async function handleOpeningBalance(
  request: Request,
  origin: string | undefined,
  save: (balance: BankBalance) => ReturnType<typeof saveOpeningBalance>,
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
  const balance = parseOpeningBalance(input, bankReferenceToday());
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
