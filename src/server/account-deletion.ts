import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { googleAuth } from "./google-auth.ts";

export function accountDeletionProof(sessionToken: string) {
  const secret = googleAuth().options.secret;
  if (!secret) throw new Error("Configuración incompleta");
  return createHmac("sha256", secret)
    .update("finanzas-personales:delete-account:v1:")
    .update(sessionToken)
    .digest("hex");
}

export function verifyAccountDeletionProof(
  sessionToken: string,
  proof: string,
) {
  return (
    /^[0-9a-f]{64}$/.test(proof) &&
    timingSafeEqual(
      Buffer.from(proof, "hex"),
      Buffer.from(accountDeletionProof(sessionToken), "hex"),
    )
  );
}
