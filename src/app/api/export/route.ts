import { freshGoogleSession } from "@/server/google-auth";
import { googlePrivateHeaders } from "@/server/google-http";
import { authOrigin } from "@/server/google-policy";

export const runtime = "nodejs";

// F5-07 (MIX): andamiaje del endpoint de exportación con la verificación de
// sesión ya resuelta. La generación segura del archivo (datos solo del
// titular, cifrado opcional, backups y restore) es la parte crítica del
// ticket a cargo de Codex; hasta entonces el endpoint responde 501 y no
// expone ningún dato (CA-061).
export async function POST(request: Request) {
  let origin: string;
  try {
    origin = authOrigin(process.env.GOOGLE_AUTH_ORIGIN);
  } catch {
    return Response.json(
      { error: "Acceso en preparación." },
      { status: 503, headers: googlePrivateHeaders },
    );
  }
  if (
    request.headers.get("origin") !== origin ||
    request.headers.get("sec-fetch-site") === "cross-site"
  )
    return Response.json(
      { error: "Solicitud no autorizada." },
      { status: 403, headers: googlePrivateHeaders },
    );

  const session = await freshGoogleSession(request).catch(() => null);
  if (!session)
    return Response.json(
      { error: "Sesión requerida." },
      { status: 401, headers: googlePrivateHeaders },
    );

  return Response.json(
    {
      error:
        "La exportación del informe se activa al completar la parte crítica de F5-07 (cifrado y restore seguros).",
    },
    { status: 501, headers: googlePrivateHeaders },
  );
}
