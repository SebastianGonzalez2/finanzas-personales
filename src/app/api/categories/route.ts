import {
  parseCategoryArchiveCommand,
  parseCreateCategoryCommand,
} from "@/domain/categories";
import {
  createCatalogCategory,
  setCategoryArchived,
} from "@/server/categories";
import { withGoogleOwner } from "@/server/google-auth";
import { googlePrivateHeaders } from "@/server/google-http";
import { authOrigin, limitedJson } from "@/server/google-policy";

export const runtime = "nodejs";

function reply(body: { error: string } | { id: string }, status: number) {
  return Response.json(body, { status, headers: googlePrivateHeaders });
}

async function manageCategory(request: Request, action: "create" | "archive") {
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
  const command =
    action === "archive"
      ? parseCategoryArchiveCommand(input)
      : parseCreateCategoryCommand(input);
  if ("error" in command) return reply(command, 400);
  try {
    return await withGoogleOwner(request, async (client, ownerId) => {
      if ("archived" in command) {
        const result = await setCategoryArchived(client, ownerId, command);
        if (result === "not-found")
          return reply({ error: "No encontramos esa categoría." }, 404);
        if (result === "archived-parent")
          return reply(
            { error: "Restaurá primero la categoría superior." },
            409,
          );
        return reply({ id: command.id }, 200);
      }
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
      {
        error:
          "No pudimos guardar el cambio en el catálogo. Reintentá el envío.",
      },
      503,
    );
  }
}

export function POST(request: Request) {
  return manageCategory(request, "create");
}

export function PATCH(request: Request) {
  return manageCategory(request, "archive");
}
