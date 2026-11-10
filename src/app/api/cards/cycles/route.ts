import { parseCycleCommand } from "@/domain/card-cycles";
import { cardCyclesReady, saveCardCycle } from "@/server/card-cycles";
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
  const command = parseCycleCommand(
    await limitedJson(request).catch(() => null),
  );
  if ("error" in command) return reply(command, 400);
  try {
    return await withGoogleOwner(request, async (client, ownerId) => {
      if (!(await cardCyclesReady(client)))
        return reply(
          { error: "Actualizá la base de datos para guardar el ciclo." },
          409,
        );
      const result = await saveCardCycle(client, ownerId, command);
      if (result.status === "not-found")
        return reply({ error: "La tarjeta o compra no está disponible." }, 404);
      if (result.status === "conflict")
        return reply({ error: result.message }, 409);
      return reply({ id: result.id }, result.status === "created" ? 201 : 200);
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Acceso denegado")
      return reply({ error: "Volvé a entrar para guardar el ciclo." }, 401);
    return reply(
      { error: "No pudimos confirmar el guardado. Reintentá el mismo envío." },
      503,
    );
  }
}
