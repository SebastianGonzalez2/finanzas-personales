import {
  authorizedCron,
  listCronOwners,
  withCronOwner,
} from "@/server/google-cron";
import { googlePrivateHeaders } from "@/server/google-http";
import {
  contributionPlansReady,
  processDueContributions,
} from "@/server/scheduled-contributions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!authorizedCron(request)) {
    return new Response(null, { status: 401, headers: googlePrivateHeaders });
  }
  try {
    let failed = false;
    for (const ownerId of await listCronOwners()) {
      try {
        await withCronOwner(ownerId, async (client, authorizedOwner) => {
          if (!(await contributionPlansReady(client))) throw new Error();
          await processDueContributions(client, authorizedOwner);
        });
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
