import { handleBalanceAdjustment } from "@/server/bank-balances-http";
import { saveBalanceAdjustment } from "@/server/bank-balances";
import { withGoogleOwner } from "@/server/google-auth";

export const runtime = "nodejs";

export function POST(request: Request) {
  return handleBalanceAdjustment(
    request,
    process.env.GOOGLE_AUTH_ORIGIN,
    (adjustment) =>
      withGoogleOwner(request, (client, ownerId) =>
        saveBalanceAdjustment(client, ownerId, adjustment),
      ),
  );
}
