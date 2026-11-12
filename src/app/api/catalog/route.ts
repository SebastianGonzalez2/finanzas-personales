import {
  parseCatalogCommand,
  parseMerchantPair,
  personNameLimit,
} from "@/domain/catalog";
import {
  listNameCatalog,
  nameCatalogReady,
  previewMerchantMerge,
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
  const isPreview =
    url.searchParams.has("sourceId") || url.searchParams.has("targetId");
  const pair =
    isPreview &&
    parseMerchantPair(
      url.searchParams.get("sourceId"),
      url.searchParams.get("targetId"),
    );
  if (isPreview && (!pair || url.searchParams.size !== 2))
    return reply({ error: "Solicitud inválida." }, 400);
  if (
    !isPreview &&
    ((kind !== null && !kinds.includes(kind)) ||
      (query !== null &&
        (!kind || query.length > personNameLimit || query.includes("\0"))) ||
      url.searchParams.size !== Number(kind !== null) + Number(query !== null))
  )
    return reply({ error: "Solicitud inválida." }, 400);
  try {
    return await withGoogleOwner(request, async (client, ownerId) => {
      if (!(await nameCatalogReady(client))) return unavailable();
      if (pair) {
        const preview = await previewMerchantMerge(client, ownerId, pair);
        return preview
          ? reply({ preview }, 200)
          : reply(
              { error: "Los comercios no están disponibles para unificar." },
              404,
            );
      }
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
