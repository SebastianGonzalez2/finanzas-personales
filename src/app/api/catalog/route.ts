import { parseCatalogCommand } from "@/domain/catalog";
import {
  listNameCatalog,
  nameCatalogReady,
  saveCatalogCommand,
  searchNameCatalog,
} from "@/server/catalog";
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
    if (
      request.headers.get("origin") !==
        authOrigin(process.env.GOOGLE_AUTH_ORIGIN) ||
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
        "El catálogo estará disponible cuando se actualice la base de datos.",
    },
    409,
  );
}

function failure(error: unknown, retry: string) {
  if (error instanceof Error && error.message === "Acceso denegado")
    return reply({ error: "Volvé a entrar para usar el catálogo." }, 401);
  return reply({ error: retry }, 503);
}

const kinds = ["merchant", "person"];

export async function GET(request: Request) {
  const rejected = unauthorized(request);
  if (rejected) return rejected;
  const url = new URL(request.url);
  const kind = url.searchParams.get("kind");
  const query = url.searchParams.get("q");
  if ((kind && !kinds.includes(kind)) || (query && !kind))
    return reply({ error: "Solicitud inválida." }, 400);
  if (url.searchParams.size > (kind ? 1 : 0) + (query ? 1 : 0))
    return reply({ error: "Solicitud inválida." }, 400);
  try {
    return await withGoogleOwner(request, async (client, ownerId) => {
      if (!(await nameCatalogReady(client))) return unavailable();
      const entries = kind
        ? await searchNameCatalog(
            client,
            ownerId,
            kind as "merchant" | "person",
            query ?? "",
          )
        : await listNameCatalog(client, ownerId);
      return Response.json({ entries }, { headers: googlePrivateHeaders });
    });
  } catch (error) {
    return failure(error, "No pudimos cargar el catálogo. Volvé a intentarlo.");
  }
}

export async function POST(request: Request) {
  const rejected = unauthorized(request);
  if (rejected) return rejected;
  if (new URL(request.url).search)
    return reply({ error: "Solicitud inválida." }, 400);
  const command = parseCatalogCommand(
    await limitedJson(request).catch(() => null),
  );
  if ("error" in command) return reply(command, 400);
  try {
    return await withGoogleOwner(request, async (client, ownerId) => {
      if (!(await nameCatalogReady(client))) return unavailable();
      const result = await saveCatalogCommand(client, ownerId, command);
      switch (result.status) {
        case "conflict":
          return reply({ error: result.message }, 409);
        case "not-found":
          return reply({ error: "La entrada no está disponible." }, 404);
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
