import { withGoogleOwner } from "@/server/google-auth.ts";
import { googlePrivateHeaders } from "@/server/google-http.ts";
export const runtime = "nodejs";
export async function GET(request: Request) {
  if (new URL(request.url).search)
    return Response.json(
      { error: "Solicitud inválida" },
      { status: 400, headers: googlePrivateHeaders },
    );
  try {
    const data = await withGoogleOwner(
      request,
      async (client) =>
        (
          await client.query(
            "SELECT display_currency,language FROM finance.user_preferences",
          )
        ).rows[0] ?? null,
    );
    return Response.json(
      { preferences: data },
      { headers: googlePrivateHeaders },
    );
  } catch {
    return Response.json(
      { error: "Acceso denegado" },
      { status: 401, headers: googlePrivateHeaders },
    );
  }
}
