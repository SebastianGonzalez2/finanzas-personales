// F0-04: experimento local; NO es un servicio desplegable ni persistencia F0-05.
// RF-002/004, CA-002/003/004, I-12. No crea identidades ni efectos financieros.
import { createHash, randomUUID, timingSafeEqual } from "node:crypto";

export const digestCode = (code) =>
  createHash("sha256").update(code).digest("hex");
const normalizeEmail = (email) =>
  typeof email === "string" ? email.trim().toLowerCase() : "";
const supported = (provider) =>
  provider === "credential" || provider === "google";
const denied = () => ({
  allowed: false,
  error_code: "INVITATION_REQUIRED",
  error_message: "No se pudo autorizar el registro.",
});

// La integración deberá sustituir los Map por transacciones en PostgreSQL,
// con límites persistentes de intentos ANTES de comprobar el código.
export function createAdmissionExperiment({ codeDigest, now = Date.now }) {
  let activeDigest = codeDigest;
  let generation = 1;
  const admissions = new Map();
  const decisions = new Map();
  const owners = new Set();

  return {
    approveCode({ code, email, provider }) {
      if (
        !activeDigest ||
        !/^[a-f0-9]{64}$/.test(activeDigest) ||
        typeof code !== "string" ||
        code.length > 256 ||
        !normalizeEmail(email) ||
        !supported(provider)
      )
        return null;
      if (
        !timingSafeEqual(
          Buffer.from(digestCode(code), "hex"),
          Buffer.from(activeDigest, "hex"),
        )
      )
        return null;
      const id = randomUUID();
      admissions.set(id, {
        email: normalizeEmail(email),
        provider,
        generation,
        expires: now() + 300_000,
      });
      return id;
    },
    // Solo llamar con payload devuelto por verifyBeforeCreate, nunca JSON del navegador.
    beforeCreate(event) {
      if (
        event?.event_type !== "user.before_create" ||
        typeof event.event_id !== "string" ||
        typeof event.user?.id !== "string" ||
        !event.user.id
      )
        return denied();
      const subject = JSON.stringify([
        event.user.id,
        normalizeEmail(event.user.email),
        event.event_data?.auth_provider,
        event.event_data?.signup_metadata?.admissionId,
      ]);
      const previous = decisions.get(event.event_id);
      if (previous)
        return previous.subject === subject ? previous.result : denied();
      const grant = admissions.get(
        event.event_data?.signup_metadata?.admissionId,
      );
      const allowed =
        !!grant &&
        activeDigest !== null &&
        grant.generation === generation &&
        grant.expires > now() &&
        grant.email === normalizeEmail(event.user.email) &&
        grant.provider === event.event_data?.auth_provider &&
        !grant.used;
      const result = allowed ? { allowed: true } : denied();
      if (allowed) {
        grant.used = true;
        owners.add(event.user.id);
      }
      decisions.set(event.event_id, { subject, result });
      return result;
    },
    rotate(nextDigest) {
      activeDigest = nextDigest;
      generation += 1;
    },
    // Recibe sesión ya validada contra el proveedor EN SERVIDOR, sin caché local.
    // Rotar invitación no revoca titulares admitidos. El owner solicitado no es la identidad.
    canAccessOwner(session, requestedOwner) {
      return (
        !!session?.user?.id &&
        session.user.emailVerified === true &&
        session.session?.userId === session.user.id &&
        new Date(session.session.expiresAt).getTime() > now() &&
        owners.has(session.user.id) &&
        requestedOwner === session.user.id
      );
    },
  };
}
