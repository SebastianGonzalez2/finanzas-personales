import { withGoogleOwner } from "@/server/google-auth";
import { googlePrivateHeaders } from "@/server/google-http";
import { authOrigin, limitedJson } from "@/server/google-policy";

export const runtime = "nodejs";

// F5-04 (parte OpenCode): la selección múltiple del historial envía aquí la
// categorización masiva. El cambio masivo seguro (verificación de propietario
// por movimiento, transacción atómica, protección de gastos divididos que
// requieren revisión, banco/deuda intactos, libro de auditoría y pruebas de
// concurrencia A/B) es la parte asignada a Codex en la matriz del ticket.
//
// Contrato acordado para la implementación (CA-057):
//   POST /  body: { entries: [{ id: uuid, kind }], categoryId: uuid,
//                   idempotencyKey: uuid }
//   Respuestas: 200 { updated: n } · 403 sin sesión u origen · 409 conflicto
//   · 503 reintento. Nunca modifica bank_effects ni checkpoints.
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
  if (!(await limitedJson(request).catch(() => null)))
    return reply({ error: "Solicitud inválida." }, 400);
  try {
    return await withGoogleOwner(request, async () =>
      reply(
        {
          error:
            "La edición masiva de categorías todavía no está habilitada. Podés categorizar cada gasto desde su detalle.",
        },
        501,
      ),
    );
  } catch {
    return reply(
      { error: "No pudimos procesar la edición masiva. Volvé a intentarlo." },
      503,
    );
  }
}
