import "server-only";
import { timingSafeEqual } from "node:crypto";
import { withOwnerTransaction } from "../db/owner-context.ts";
import { googleAuthEnabled } from "./google-auth.ts";
import { assertGoogleRuntime, googlePool } from "./google-database.ts";

export function authorizedCron(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 16) return false;
  const supplied = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return (
    supplied.length === expected.length && timingSafeEqual(supplied, expected)
  );
}

export async function listCronOwners() {
  if (!googleAuthEnabled()) throw new Error("Acceso en preparación");
  const client = await googlePool("auth").connect();
  try {
    await assertGoogleRuntime(client, "auth");
    const { rows } = await client.query<{ user_id: string }>(
      `SELECT user_id FROM app_access.allowlist
        WHERE enabled AND user_id IS NOT NULL
        ORDER BY user_id`,
    );
    return rows.map(({ user_id }) => user_id);
  } finally {
    client.release();
  }
}

export function withCronOwner<T>(
  ownerId: string,
  work: Parameters<typeof withOwnerTransaction<T>>[2],
) {
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
    async () => ({ ownerId }),
    async (client, holder) => {
      const {
        rows: [row],
      } = await client.query<{ active: boolean }>(
        "SELECT finance.cron_owner_is_active() AS active",
      );
      if (!row.active) return;
      return work(client, holder);
    },
  );
}
