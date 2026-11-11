import { bankReferenceToday } from "@/domain/bank-balances";
import { parseRecurrenceSeriesCommand } from "@/domain/recurrence-pause";
import { withGoogleOwner } from "@/server/google-auth";
import { googlePrivateHeaders } from "@/server/google-http";
import { authOrigin, limitedJson } from "@/server/google-policy";
import { recurrenceTrackingReady } from "@/server/recurrence-links";
import {
  applyRecurrenceSeriesCommand,
  recurrencesReady,
  recurrenceSeriesControlsReady,
} from "@/server/recurrences";

export const runtime = "nodejs";

function reply(body: object, status = 200) {
  return Response.json(body, { status, headers: googlePrivateHeaders });
}

function failure(error: unknown) {
  if (error instanceof Error && error.message === "Acceso denegado")
    return reply({ error: "Volvé a entrar para gestionar recurrencias." }, 401);
  return reply(
    { error: "No pudimos confirmar la solicitud. Volvé a intentarlo." },
    503,
  );
}

export async function POST(request: Request) {
  try {
    if (
      request.headers.get("origin") !==
        authOrigin(process.env.GOOGLE_AUTH_ORIGIN) ||
      request.headers.get("sec-fetch-site") === "cross-site"
    )
      throw new Error();
  } catch {
    return reply({ error: "Solicitud no autorizada." }, 403);
  }
  if (new URL(request.url).search)
    return reply({ error: "Solicitud inválida." }, 400);
  const command = parseRecurrenceSeriesCommand(
    await limitedJson(request).catch(() => null),
  );
  if ("error" in command) return reply(command, 400);

  try {
    return await withGoogleOwner(request, async (client, ownerId) => {
      if (!(await recurrencesReady(client)))
        return reply(
          {
            error:
              "Las recurrencias estarán disponibles cuando se actualice la base de datos.",
          },
          409,
        );
      if (
        !(await recurrenceTrackingReady(client)) ||
        !(await recurrenceSeriesControlsReady(client))
      )
        return reply(
          {
            error:
              "Los cambios de la serie estarán disponibles cuando se actualice la base de datos.",
          },
          409,
        );
      const result = await applyRecurrenceSeriesCommand(
        client,
        ownerId,
        command,
        bankReferenceToday(),
      );
      if (result.status === "not-found")
        return reply({ error: "La recurrencia no está disponible." }, 404);
      if (result.status === "finished")
        return reply(
          { error: "La serie finalizó y su programación quedó cerrada." },
          409,
        );
      if (result.status === "conflict")
        return reply({ error: "Ese envío ya se usó con otros datos." }, 409);
      if (result.status === "stale")
        return reply(
          {
            error:
              "La programación cambió. Actualizá la página antes de guardar.",
          },
          409,
        );
      if (result.status === "no-future-period")
        return reply(
          {
            error:
              "La serie no tiene un vencimiento futuro que admita este día.",
          },
          409,
        );
      return reply({ id: result.id }, result.status === "created" ? 201 : 200);
    });
  } catch (error) {
    return failure(error);
  }
}
