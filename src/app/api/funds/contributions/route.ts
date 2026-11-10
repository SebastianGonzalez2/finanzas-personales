import { parseContributionCommand } from "@/domain/contribution-plans";
import { withGoogleOwner } from "@/server/google-auth";
import { googlePrivateHeaders } from "@/server/google-http";
import { authOrigin, limitedJson } from "@/server/google-policy";
import {
  contributionPlansReady,
  saveContributionCommand,
} from "@/server/scheduled-contributions";

export const runtime = "nodejs";

function reply(body: { id: string } | { error: string }, status: number) {
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
  const command = parseContributionCommand(
    await limitedJson(request).catch(() => null),
  );
  if ("error" in command) return reply(command, 400);
  try {
    return await withGoogleOwner(request, async (client, ownerId) => {
      if (!(await contributionPlansReady(client)))
        return reply(
          {
            error:
              "Las aportaciones estarán disponibles cuando se actualice la base de datos.",
          },
          409,
        );
      const result = await saveContributionCommand(client, ownerId, command);
      if (result.status === "not-found")
        return reply(
          { error: "La aportación o el fondo no está disponible." },
          404,
        );
      if (result.status === "conflict")
        return reply({ error: result.message }, 409);
      return reply({ id: result.id }, 200);
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Acceso denegado")
      return reply(
        { error: "Volvé a entrar para gestionar aportaciones." },
        401,
      );
    return reply(
      { error: "No pudimos confirmar el guardado. Reintentá el mismo envío." },
      503,
    );
  }
}
