import { getCookies } from "better-auth/cookies";
import { NextResponse } from "next/server";
import { accountDeletionConfirmation } from "@/lib/account-deletion";
import { verifyAccountDeletionProof } from "@/server/account-deletion";
import { googleAuth, withGoogleOwner } from "@/server/google-auth";
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

  const body = await limitedJson(request, 256).catch(() => null);
  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    Object.keys(body).length !== 2 ||
    body.confirmation !== accountDeletionConfirmation ||
    typeof body.proof !== "string"
  ) {
    return exportFailure("Escribí ELIMINAR para confirmar.", 400);
  }

  const { proof } = body;
  try {
    const status = await withGoogleOwner(
      request,
      async (client, _ownerId, sessionToken) => {
        if (!verifyAccountDeletionProof(sessionToken, proof)) return "changed";
        const {
          rows: [result],
        } = await client.query<{ status: string }>(
          "SELECT finance.delete_own_account($1) AS status",
          [sessionToken],
        );
        return result.status;
      },
      { exclusive: true },
    );
    if (status === "changed") {
      return exportFailure(
        "La sesión cambió. Volvé a abrir Mi cuenta y confirmá de nuevo.",
        409,
      );
    }
    if (status === "stale") {
      return exportFailure(
        "Cerrá sesión, volvé a entrar con Google y regresá a Mi cuenta para confirmar.",
        409,
      );
    }
    if (status !== "deleted") {
      return exportFailure("Volvé a entrar para continuar.", 401);
    }
    const response = NextResponse.json(
      { deleted: true },
      { headers: googlePrivateHeaders },
    );
    for (const { name, attributes } of Object.values(
      getCookies(googleAuth().options),
    )) {
      response.cookies.set(name, "", {
        path: attributes.path,
        domain: attributes.domain,
        secure: attributes.secure,
        httpOnly: attributes.httpOnly,
        sameSite: "lax",
        maxAge: 0,
      });
    }
    return response;
  } catch (error) {
    return exportOperationError(error);
  }
}
