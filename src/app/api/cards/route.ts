import { parseCardCommand } from "@/domain/cards";
import { cardsReady, saveCard } from "@/server/cards";
import { withGoogleOwner } from "@/server/google-auth";
import { googlePrivateHeaders } from "@/server/google-http";
import { authOrigin, limitedJson } from "@/server/google-policy";

export const runtime = "nodejs";

function reply(body: { error: string } | { id: string }, status: number) {
  return Response.json(body, { status, headers: googlePrivateHeaders });
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
  const command = parseCardCommand(
    await limitedJson(request).catch(() => null),
  );
  if ("error" in command) return reply(command, 400);
  try {
    return await withGoogleOwner(request, async (client, ownerId) => {
      if (!(await cardsReady(client)))
        return reply(
          {
            error:
              "El catálogo estará disponible cuando se actualice la base de datos.",
          },
          409,
        );
      const result = await saveCard(client, ownerId, command);
      switch (result.status) {
        case "conflict":
          return reply({ error: result.message }, 409);
        case "not-found":
          return reply({ error: "La tarjeta no está disponible." }, 404);
        case "invalid-limit":
          return reply(
            { error: "El límite corresponde a tarjetas de crédito." },
            400,
          );
        default:
          return reply(
            { id: result.id },
            result.status === "created" ? 201 : 200,
          );
      }
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Acceso denegado")
      return reply({ error: "Volvé a entrar para gestionar tarjetas." }, 401);
    return reply(
      { error: "No pudimos confirmar el guardado. Reintentá el mismo envío." },
      503,
    );
  }
}
