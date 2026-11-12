import {
  parseClassificationCommand,
  parseTagCommand,
} from "@/domain/classification";
import { refreshBudgetNotices } from "@/server/budgets";
import {
  classificationReady,
  saveClassification,
  saveTag,
} from "@/server/classification";
import { withGoogleOwner } from "@/server/google-auth";
import { googlePrivateHeaders } from "@/server/google-http";
import { authOrigin, limitedJson } from "@/server/google-policy";

export const runtime = "nodejs";

async function handle(request: Request, tags: boolean) {
  function reply(body: { error: string } | { id: string }, status: number) {
    return Response.json(body, { status, headers: googlePrivateHeaders });
  }
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
  const input = await limitedJson(request).catch(() => null);
  const tag = tags ? parseTagCommand(input) : null;
  const classification = tags ? null : parseClassificationCommand(input);
  if (tag && "error" in tag) return reply(tag, 400);
  if (classification && "error" in classification)
    return reply(classification, 400);

  try {
    return await withGoogleOwner(request, async (client, ownerId) => {
      if (!(await classificationReady(client)))
        return reply(
          {
            error:
              "Actualizá la base de datos para usar desgloses y etiquetas.",
          },
          409,
        );
      if (tag) {
        const result = await saveTag(client, ownerId, tag);
        return "error" in result
          ? reply({ error: result.error }, result.status)
          : reply(result, 200);
      }
      if (!classification) return reply({ error: "Solicitud inválida." }, 400);
      const result = await saveClassification(client, ownerId, classification);
      if ("error" in result)
        return reply({ error: result.error }, result.status);
      if (classification.allocations !== undefined)
        await refreshBudgetNotices(client, ownerId);
      return reply(result, 200);
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Acceso denegado")
      return reply(
        { error: "Volvé a entrar para clasificar el movimiento." },
        401,
      );
    return reply(
      { error: "No pudimos confirmar el guardado. Reintentá el mismo envío." },
      503,
    );
  }
}

export function POST(request: Request) {
  return handle(request, true);
}

export function PATCH(request: Request) {
  return handle(request, false);
}
