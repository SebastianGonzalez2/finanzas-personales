import { parseRecurrence } from "@/domain/recurrence-definition";
import { withGoogleOwner } from "@/server/google-auth";
import { googlePrivateHeaders } from "@/server/google-http";
import { authOrigin, limitedJson } from "@/server/google-policy";
import { createRecurrence, recurrencesReady } from "@/server/recurrences";

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
  const command = parseRecurrence(
    await limitedJson(request, 16384).catch(() => null),
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
      const result = await createRecurrence(client, ownerId, command);
      if (result.status === "invalid-people")
        return reply(
          { error: "Elegí personas distintas y contactos disponibles." },
          409,
        );
      if (result.status === "sharing-unavailable")
        return reply(
          {
            error:
              "El reparto estará disponible cuando se actualice la base de datos.",
          },
          409,
        );
      if (result.status === "not-found")
        return reply({ error: "La categoría no está disponible." }, 404);
      if (result.status === "conflict")
        return reply({ error: "Ese envío ya se usó con otros datos." }, 409);
      return reply({ id: result.id }, result.status === "created" ? 201 : 200);
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Acceso denegado")
      return reply(
        { error: "Volvé a entrar para gestionar recurrencias." },
        401,
      );
    return reply(
      { error: "No pudimos confirmar el guardado. Reintentá el mismo envío." },
      503,
    );
  }
}
