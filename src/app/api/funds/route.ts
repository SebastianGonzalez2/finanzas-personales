import { parseFundCommand } from "@/domain/savings-funds";
import { saveSavingsFund, savingsFundsReady } from "@/server/savings-funds";
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
  const command = parseFundCommand(
    await limitedJson(request).catch(() => null),
  );
  if ("error" in command) return reply(command, 400);
  try {
    return await withGoogleOwner(request, async (client, ownerId) => {
      if (!(await savingsFundsReady(client)))
        return reply(
          {
            error:
              "Los fondos estarán disponibles cuando se actualice la base de datos.",
          },
          409,
        );
      const result = await saveSavingsFund(client, ownerId, command);
      switch (result.status) {
        case "unavailable":
          return reply(
            {
              error:
                "Las reservas estarán disponibles cuando se actualice la base de datos.",
            },
            409,
          );
        case "conflict":
          return reply({ error: result.message }, 409);
        case "not-found":
          return reply({ error: "El fondo no está disponible." }, 404);
        default:
          return reply(
            { id: result.id },
            result.status === "created" ? 201 : 200,
          );
      }
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Acceso denegado")
      return reply({ error: "Volvé a entrar para gestionar fondos." }, 401);
    return reply(
      { error: "No pudimos confirmar el guardado. Reintentá el mismo envío." },
      503,
    );
  }
}
