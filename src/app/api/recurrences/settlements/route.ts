import {
  bankReferenceToday,
  isBankReferenceDate,
} from "@/domain/bank-balances";
import { movementUuid } from "@/domain/movements";
import { parseSettlement } from "@/domain/recurrence-settlements";
import { refreshBudgetNotices } from "@/server/budgets";
import { withGoogleOwner } from "@/server/google-auth";
import { googlePrivateHeaders } from "@/server/google-http";
import { authOrigin, limitedJson } from "@/server/google-policy";
import { recurrenceTrackingReady } from "@/server/recurrence-links";
import {
  additionalRecurrencePeriods,
  applySettlement,
  linkableRecurrenceEvents,
} from "@/server/recurrence-settlements";

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

const unavailable = () =>
  reply(
    {
      error:
        "El seguimiento estará disponible cuando se actualice la base de datos.",
    },
    409,
  );

export async function GET(request: Request) {
  const search = new URL(request.url).searchParams;
  const seriesId = search.get("serie");
  const date = search.get("fecha");
  const cursor = search.get("hasta");
  const today = bankReferenceToday();
  if (
    search.size !== 2 ||
    !seriesId ||
    !movementUuid.test(seriesId) ||
    (cursor === null
      ? !isBankReferenceDate(date, today)
      : !/^\d{1,6}$/.test(cursor))
  )
    return reply({ error: "Elegí una fecha o un período válido." }, 400);
  try {
    return await withGoogleOwner(request, async (client, ownerId) => {
      if (!(await recurrenceTrackingReady(client))) return unavailable();
      const result =
        cursor === null
          ? await linkableRecurrenceEvents(
              client,
              ownerId,
              seriesId,
              date!,
            ).then((events) => events && { events })
          : await additionalRecurrencePeriods(
              client,
              ownerId,
              seriesId,
              Number(cursor),
              today,
            );
      return result
        ? reply(result)
        : reply({ error: "La recurrencia no está disponible." }, 404);
    });
  } catch (error) {
    return failure(error);
  }
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
  const today = bankReferenceToday();
  const command = parseSettlement(
    await limitedJson(request, 16384).catch(() => null),
    today,
  );
  if ("error" in command) return reply(command, 400);
  try {
    return await withGoogleOwner(request, async (client, ownerId) => {
      if (!(await recurrenceTrackingReady(client))) return unavailable();
      const result = await applySettlement(client, ownerId, command, today);
      if ("error" in result)
        return reply(
          { error: result.error },
          result.status === "not-found" ? 404 : 409,
        );
      if (result.status === "created" && "split" in command && command.split)
        await refreshBudgetNotices(client, ownerId);
      return reply({ id: result.id }, result.status === "created" ? 201 : 200);
    });
  } catch (error) {
    return failure(error);
  }
}
