import {
  cardPushConfig,
  cardPushEnabled,
  cardPushReady,
  disableCardPush,
  enableCardPush,
  isCardPushEndpoint,
  parseCardPushSubscription,
} from "@/server/card-push";
import { withGoogleOwner } from "@/server/google-auth";
import { googlePrivateHeaders } from "@/server/google-http";
import { authOrigin, limitedJson } from "@/server/google-policy";

export const runtime = "nodejs";

function reply(status: number, enabled = false) {
  return Response.json({ enabled }, { status, headers: googlePrivateHeaders });
}

export async function POST(request: Request) {
  try {
    if (
      request.headers.get("origin") !==
        authOrigin(process.env.GOOGLE_AUTH_ORIGIN) ||
      request.headers.get("sec-fetch-site") === "cross-site"
    )
      return reply(403);
  } catch {
    return reply(403);
  }
  if (new URL(request.url).search) return reply(400);
  const input: unknown = await limitedJson(request).catch(() => null);
  if (!input || typeof input !== "object" || !("action" in input))
    return reply(400);
  const action = input.action;
  const subscription =
    action === "enable" && "subscription" in input
      ? parseCardPushSubscription(input.subscription)
      : null;
  const endpoint =
    subscription?.endpoint ?? ("endpoint" in input ? input.endpoint : null);
  if (
    (action !== "enable" && action !== "disable" && action !== "status") ||
    (action === "enable" && !subscription) ||
    !isCardPushEndpoint(endpoint)
  )
    return reply(400);

  try {
    return await withGoogleOwner(request, async (client, ownerId) => {
      if (!(await cardPushReady(client))) return reply(503);
      if (subscription) {
        if (!cardPushConfig()) return reply(503);
        const enabled = await enableCardPush(client, ownerId, subscription);
        return reply(enabled ? 200 : 409, enabled);
      }
      if (action === "disable") {
        await disableCardPush(client, ownerId, endpoint);
        return reply(200);
      }
      return reply(200, await cardPushEnabled(client, ownerId, endpoint));
    });
  } catch (error) {
    return reply(
      error instanceof Error && error.message === "Acceso denegado" ? 401 : 503,
    );
  }
}
