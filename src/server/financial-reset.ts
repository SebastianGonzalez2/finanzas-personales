import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { googleAuth } from "./google-auth.ts";

export function financialResetProof(sessionToken: string) {
  const secret = googleAuth().options.secret;
  if (!secret) throw new Error("Configuración incompleta");
  return createHmac("sha256", secret)
    .update("finanzas-personales:financial-reset:v1:")
    .update(sessionToken)
    .digest("hex");
}

export function verifyFinancialResetProof(sessionToken: string, proof: string) {
  return (
    /^[a-f0-9]{64}$/.test(proof) &&
    timingSafeEqual(
      Buffer.from(proof, "hex"),
      Buffer.from(financialResetProof(sessionToken), "hex"),
    )
  );
}
