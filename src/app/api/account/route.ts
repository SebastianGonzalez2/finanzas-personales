import { resolveAuthorizedOwner } from "@/server/auth.ts";
import { authPool, assertRuntime } from "@/server/auth-database.ts";
import { withOwnerTransaction } from "@/db/owner-context.ts";
import { authFailure, privateHeaders } from "@/server/auth-http.ts";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  // No selector from the client; this endpoint only reads existing F0-05 preferences.
  if (new URL(request.url).search) return authFailure(400);
  const identity = await resolveAuthorizedOwner(request);
  if (!identity) return authFailure(401);
  try {
    const preferences = await withOwnerTransaction(
      authPool("finance"),
      async () => identity,
      async (client, ownerId) => {
        const result = await client.query(
          "SELECT display_currency,language FROM finance.user_preferences WHERE owner_id=$1",
          [ownerId],
        );
        return result.rows[0] ?? null;
      },
      (client) => assertRuntime(client, "finance"),
    );
    return Response.json(
      { admitted: true, preferences },
      { headers: privateHeaders },
    );
  } catch {
    return authFailure(503);
  }
}
