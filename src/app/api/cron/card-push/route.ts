import { bankReferenceToday } from "@/domain/bank-balances";
import {
  cardPushConfig,
  claimCardPush,
  deliverCardPush,
  sendCardPush,
} from "@/server/card-push";
import {
  authorizedCron,
  listCronOwners,
  withCronOwner,
} from "@/server/google-cron";
import { googlePrivateHeaders } from "@/server/google-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const reply = (status: number) =>
    new Response(null, { status, headers: googlePrivateHeaders });
  if (!authorizedCron(request)) return reply(401);
  const config = cardPushConfig();
  if (!config) return reply(204);
  const today = bankReferenceToday();
  let failed = false;
  try {
    for (const ownerId of await listCronOwners()) {
      try {
        const claims = await withCronOwner(ownerId, (client, owner) =>
          claimCardPush(client, owner, today),
        );
        for (const claim of claims ?? []) {
          try {
            await withCronOwner(ownerId, (client, owner) =>
              deliverCardPush(client, owner, today, claim, (subscription) =>
                sendCardPush(subscription, config),
              ),
            );
          } catch {
            failed = true;
          }
        }
      } catch {
        failed = true;
      }
    }
  } catch {
    failed = true;
  }
  return reply(failed ? 503 : 204);
}
