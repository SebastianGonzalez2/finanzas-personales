import { parseBulkClassification } from "@/domain/history-bulk";
import { withGoogleOwner } from "@/server/google-auth";
import { googlePrivateHeaders } from "@/server/google-http";
import { authOrigin, limitedJson } from "@/server/google-policy";
import {
  bulkClassificationReady,
  saveBulkClassification,
} from "@/server/history-bulk";

export const runtime = "nodejs";

function reply(body: Record<string, unknown>, status: number) {
  return Response.json(body, { status, headers: googlePrivateHeaders });
}

function unauthorized(request: Request) {
  try {
    const origin = request.headers.get("origin");
    const expected = authOrigin(process.env.GOOGLE_AUTH_ORIGIN);
    if (
      origin !== expected ||
      request.headers.get("sec-fetch-site") === "cross-site"
    )
      throw new Error();
  } catch {
    return reply({ error: "Solicitud no autorizada." }, 403);
  }
}

export async function POST(request: Request) {
  const rejected = unauthorized(request);
  if (rejected) return rejected;
  if (new URL(request.url).search)
    return reply({ error: "Solicitud inválida." }, 400);
  const command = parseBulkClassification(
    await limitedJson(request).catch(() => null),
  );
  if ("error" in command) return reply(command, 400);
  try {
    return await withGoogleOwner(request, async (client, ownerId) => {
      if (!(await bulkClassificationReady(client)))
        return reply(
          {
            error:
              "La edición masiva estará disponible cuando se actualice la base de datos.",
          },
          409,
        );
      const result = await saveBulkClassification(client, ownerId, command);
      return "error" in result
        ? reply({ error: result.error }, result.status)
        : reply(result, 200);
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Acceso denegado")
      return reply(
        { error: "Volvé a entrar para editar tus movimientos." },
        403,
      );
    return reply(
      { error: "No pudimos procesar la edición masiva. Volvé a intentarlo." },
      503,
    );
  }
}
