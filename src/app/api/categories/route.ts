import { parseCreateCategoryCommand } from "@/domain/categories";
import { createCatalogCategory } from "@/server/categories";
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
  const command = parseCreateCategoryCommand(
    await limitedJson(request).catch(() => null),
  );
  if ("error" in command) return reply(command, 400);
  try {
    return await withGoogleOwner(request, async (client, ownerId) => {
      const result = await createCatalogCategory(client, ownerId, command);
      if (result.status === "conflict")
        return reply({ error: result.message }, 409);
      if (result.status === "invalid-parent")
        return reply({ error: result.message }, 400);
      return reply({ id: result.id }, 201);
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Acceso denegado")
      return reply({ error: "Volvé a entrar para gestionar categorías." }, 401);
    return reply(
      { error: "No pudimos crear la categoría. Reintentá el mismo envío." },
      503,
    );
  }
}
