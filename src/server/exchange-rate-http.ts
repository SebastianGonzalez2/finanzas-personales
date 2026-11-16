import "server-only";
import type pg from "pg";
import { withGoogleOwner } from "./google-auth.ts";
import { refreshReferenceDates } from "./exchange-rates.ts";
import { googlePrivateHeaders } from "./google-http.ts";
import { authOrigin, limitedJson } from "./google-policy.ts";

const errors: Record<number, string> = {
  400: "Revisá la moneda, fecha o tasa ingresada.",
  401: "Volvé a entrar para guardar el cambio.",
  403: "Solicitud no autorizada.",
  409: "Ya hay una tasa guardada para esta fecha y estas monedas. Actualizá la vista.",
  503: "No pudimos guardar el cambio. Volvé a intentarlo.",
};

function reply(status: number) {
  return Response.json(
    status === 200 ? { saved: true } : { error: errors[status] },
    { status, headers: googlePrivateHeaders },
  );
}

export async function currencyRequest(
  request: Request,
  save: (
    client: pg.PoolClient,
    ownerId: string,
    input: Record<string, unknown>,
  ) => Promise<200 | 400 | 409 | 503>,
) {
  try {
    if (
      request.headers.get("origin") !==
        authOrigin(process.env.GOOGLE_AUTH_ORIGIN) ||
      request.headers.get("sec-fetch-site") === "cross-site"
    )
      return reply(403);
  } catch {
    return reply(403);
  }
  if (new URL(request.url).search) return reply(400);
  const input = await limitedJson(request).catch(() => null);
  if (!input || typeof input !== "object" || Array.isArray(input))
    return reply(400);
  try {
    return reply(
      await withGoogleOwner(request, (client, ownerId) =>
        save(client, ownerId, input),
      ),
    );
  } catch (error) {
    return reply(
      error instanceof Error && error.message === "Acceso denegado" ? 401 : 503,
    );
  }
}

export function refreshOwnerReferences(
  request: Request,
  dates: string[],
  today: string,
) {
  return refreshReferenceDates(
    (work) => withGoogleOwner(request, (client) => work(client)),
    dates,
    today,
  );
}
