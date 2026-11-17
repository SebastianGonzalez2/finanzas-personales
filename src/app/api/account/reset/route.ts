import { financialResetConfirmation } from "@/lib/financial-reset";
import { verifyFinancialResetProof } from "@/server/financial-reset";
import { withGoogleOwner } from "@/server/google-auth";
import { googlePrivateHeaders } from "@/server/google-http";
import { limitedJson } from "@/server/google-policy";
import {
  exportFailure,
  exportOperationError,
  exportOriginError,
} from "@/server/private-download";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const originError = exportOriginError(request);
  if (originError) return originError;

  const body = await limitedJson(request, 512).catch(() => null);
  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    typeof body.proof !== "string"
  )
    return exportFailure("Solicitud inválida.", 400);

  let revision: string | null;
  if (body.action === "prepare" && Object.keys(body).length === 2) {
    revision = null;
  } else if (
    body.action === "reset" &&
    Object.keys(body).length === 4 &&
    body.confirmation === financialResetConfirmation &&
    typeof body.revision === "string" &&
    /^[a-f0-9]{64}$/.test(body.revision)
  ) {
    revision = body.revision;
  } else {
    return exportFailure("Escribí REINICIAR para confirmar.", 400);
  }

  const { proof } = body;
  try {
    const result = await withGoogleOwner(
      request,
      async (client, _ownerId, sessionToken) => {
        if (!verifyFinancialResetProof(sessionToken, proof)) return null;
        const {
          rows: [result],
        } = await client.query<{
          status: "ready" | "reset" | "changed" | "denied";
          revision: string | null;
        }>("SELECT * FROM finance.reset_own_finances($1, $2)", [
          sessionToken,
          revision,
        ]);
        return result;
      },
      { exclusive: true },
    );
    if (!result)
      return exportFailure("La sesión cambió. Volvé a abrir Mi cuenta.", 409);
    if (result.status === "changed")
      return exportFailure(
        "Tus datos cambiaron. Cancelá y volvé a abrir la confirmación.",
        409,
      );
    if (result.status === "denied")
      return exportFailure("Volvé a entrar para continuar.", 401);
    if (result.status === "ready" && revision === null && result.revision)
      return Response.json(
        { revision: result.revision },
        { headers: googlePrivateHeaders },
      );
    if (result.status === "reset" && revision !== null)
      return Response.json({ reset: true }, { headers: googlePrivateHeaders });
    return exportFailure("No se pudo confirmar el reinicio.", 503);
  } catch (error) {
    return exportOperationError(error);
  }
}
