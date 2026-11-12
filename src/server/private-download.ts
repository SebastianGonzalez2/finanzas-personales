import "server-only";
import { googlePrivateHeaders } from "./google-http.ts";
import { authOrigin } from "./google-policy.ts";

export function exportFailure(error: string, status: number) {
  return Response.json({ error }, { status, headers: googlePrivateHeaders });
}

export function exportOriginError(request: Request) {
  if (new URL(request.url).search)
    return exportFailure("Solicitud inválida.", 400);
  let origin;
  try {
    origin = authOrigin(process.env.GOOGLE_AUTH_ORIGIN);
  } catch {
    return exportFailure("Acceso en preparación.", 503);
  }
  if (
    request.headers.get("origin") !== origin ||
    request.headers.get("sec-fetch-site") === "cross-site"
  )
    return exportFailure("Solicitud no autorizada.", 403);
}

export function privateDownload(
  body: BodyInit,
  filename: string,
  contentType: string,
) {
  return new Response(body, {
    headers: {
      ...googlePrivateHeaders,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Type": contentType,
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export function exportOperationError(error: unknown) {
  return error instanceof Error && error.message === "Acceso denegado"
    ? exportFailure("Volvé a entrar para continuar.", 401)
    : exportFailure(
        "No se pudo completar la operación. Volvé a intentarlo.",
        503,
      );
}
