import { parseSavedFilterCommand } from "@/domain/history-filters";
import {
  listSavedFilters,
  savedFiltersReady,
  saveSavedFilterCommand,
} from "@/server/history-filters";
import { withGoogleOwner } from "@/server/google-auth";
import { googlePrivateHeaders } from "@/server/google-http";
import { authOrigin, limitedJson } from "@/server/google-policy";

export const runtime = "nodejs";

function reply(
  body: { error: string } | Record<string, unknown>,
  status: number,
) {
  return Response.json(body, { status, headers: googlePrivateHeaders });
}

function unauthorized(request: Request) {
  try {
    const origin = request.headers.get("origin");
    const expected = authOrigin(process.env.GOOGLE_AUTH_ORIGIN);
    if (
      ((request.method !== "GET" || origin !== null) && origin !== expected) ||
      request.headers.get("sec-fetch-site") === "cross-site"
    )
      throw new Error();
  } catch {
    return reply({ error: "Solicitud no autorizada." }, 403);
  }
}

function unavailable() {
  return reply(
    {
      error:
        "Los filtros guardados estarán disponibles cuando se actualice la base de datos.",
    },
    409,
  );
}

function failure(error: unknown, retry: string) {
  if (error instanceof Error && error.message === "Acceso denegado")
    return reply({ error: "Volvé a entrar para usar tus filtros." }, 401);
  return reply({ error: retry }, 503);
}

export async function GET(request: Request) {
  const rejected = unauthorized(request);
  if (rejected) return rejected;
  if (new URL(request.url).search)
    return reply({ error: "Solicitud inválida." }, 400);
  try {
    return await withGoogleOwner(request, async (client, ownerId) => {
      if (!(await savedFiltersReady(client))) return unavailable();
      const filters = await listSavedFilters(client, ownerId);
      return Response.json({ filters }, { headers: googlePrivateHeaders });
    });
  } catch (error) {
    return failure(
      error,
      "No pudimos cargar tus filtros guardados. Volvé a intentarlo.",
    );
  }
}

export async function POST(request: Request) {
  const rejected = unauthorized(request);
  if (rejected) return rejected;
  if (new URL(request.url).search)
    return reply({ error: "Solicitud inválida." }, 400);
  const command = parseSavedFilterCommand(
    await limitedJson(request).catch(() => null),
  );
  if ("error" in command) return reply(command, 400);
  try {
    return await withGoogleOwner(request, async (client, ownerId) => {
      if (!(await savedFiltersReady(client))) return unavailable();
      const result = await saveSavedFilterCommand(client, ownerId, command);
      switch (result.status) {
        case "conflict":
          return reply({ error: result.message }, 409);
        case "not-found":
          return reply(
            { error: "El filtro guardado no está disponible." },
            404,
          );
        default:
          return reply(
            { id: result.id },
            result.status === "created" ? 201 : 200,
          );
      }
    });
  } catch (error) {
    return failure(
      error,
      "No pudimos confirmar el guardado. Reintentá el mismo envío.",
    );
  }
}
