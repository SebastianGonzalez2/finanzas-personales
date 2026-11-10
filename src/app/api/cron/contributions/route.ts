import { timingSafeEqual } from "node:crypto";
import { withOwnerTransaction } from "@/db/owner-context";
import { googleAuthEnabled } from "@/server/google-auth";
import { assertGoogleRuntime, googlePool } from "@/server/google-database";
import { googlePrivateHeaders } from "@/server/google-http";
import {
  contributionPlansReady,
  processDueContributions,
} from "@/server/scheduled-contributions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const supplied = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret ?? ""}`);
  if (
    !secret ||
    secret.length < 16 ||
    supplied.length !== expected.length ||
    !timingSafeEqual(supplied, expected)
  ) {
    return new Response(null, { status: 401, headers: googlePrivateHeaders });
  }
  try {
    if (!googleAuthEnabled()) throw new Error();
    const authClient = await googlePool("auth").connect();
    let owners: { user_id: string }[];
    try {
      await assertGoogleRuntime(authClient, "auth");
      ({ rows: owners } = await authClient.query<{ user_id: string }>(
        "SELECT user_id FROM app_access.allowlist WHERE enabled AND user_id IS NOT NULL ORDER BY user_id",
      ));
    } finally {
      authClient.release();
    }
    let failed = false;
    for (const { user_id: ownerId } of owners) {
      try {
        await withOwnerTransaction(
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
          async (client, authorizedOwner) => {
            if (!(await contributionPlansReady(client))) throw new Error();
            await processDueContributions(client, authorizedOwner);
          },
        );
      } catch {
        failed = true;
      }
    }
    return new Response(null, {
      status: failed ? 503 : 204,
      headers: googlePrivateHeaders,
    });
  } catch {
    return new Response(null, { status: 503, headers: googlePrivateHeaders });
  }
}
