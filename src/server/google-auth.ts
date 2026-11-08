import "server-only";
import process from "node:process";
import { createGoogleAuth } from "./google-auth-factory.ts";
import { authOrigin } from "./google-policy.ts";
import { assertGoogleRuntime, googlePool } from "./google-database.ts";
import { withOwnerTransaction } from "../db/owner-context.ts";
import type pg from "pg";
export const googleAuthEnabled = () => process.env.GOOGLE_AUTH_READY === "true";
let auth: ReturnType<typeof createGoogleAuth> | undefined;
export function googleAuth() {
  if (!googleAuthEnabled()) throw new Error("Acceso en preparación");
  if (!auth) {
    const origin = authOrigin(process.env.GOOGLE_AUTH_ORIGIN);
    const secret = process.env.GOOGLE_AUTH_SECRET ?? "";
    const clientId = process.env.GOOGLE_CLIENT_ID ?? "";
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET ?? "";
    if (secret.length < 32 || !clientId || !clientSecret)
      throw new Error("Configuración incompleta");
    auth = createGoogleAuth(googlePool("auth"), {
      origin,
      secret,
      clientId,
      clientSecret,
    });
  }
  return auth;
}
export async function freshGoogleSession(request: Request) {
  if (!googleAuthEnabled()) return null;
  const client = await googlePool("auth").connect();
  try {
    await assertGoogleRuntime(client, "auth");
  } finally {
    client.release();
  }
  const session = await googleAuth().api.getSession({
    headers: new Headers({ cookie: request.headers.get("cookie") ?? "" }),
    query: { disableCookieCache: true },
  });
  if (
    !session ||
    !session.user.emailVerified ||
    session.session.userId !== session.user.id ||
    new Date(session.session.expiresAt).getTime() <= Date.now()
  )
    return null;
  return session;
}
export async function withGoogleOwner<T>(
  request: Request,
  work: (client: pg.PoolClient, ownerId: string) => Promise<T>,
) {
  const session = await freshGoogleSession(request);
  if (!session) throw new Error("Acceso denegado");
  return withOwnerTransaction(
    {
      connect: async () => {
        const client = await googlePool("finance").connect();
        try {
          await assertGoogleRuntime(client, "finance");
          return client;
        } catch {
          client.release();
          throw new Error("Runtime no autorizado");
        }
      },
    },
    async () => ({ ownerId: session.user.id }),
    async (client, ownerId) => {
      const {
        rows: [authorized],
      } = await client.query(
        "SELECT app_access.authorize_session($1) AS owner_id",
        [session.session.token],
      );
      if (authorized?.owner_id !== ownerId) throw new Error("Acceso denegado");
      return work(client, ownerId);
    },
  );
}
