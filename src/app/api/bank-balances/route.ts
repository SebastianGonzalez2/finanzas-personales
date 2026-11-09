import { handleOpeningBalance } from "@/server/bank-balances-http";
import { saveOpeningBalance } from "@/server/bank-balances";
import { withGoogleOwner } from "@/server/google-auth";

export const runtime = "nodejs";

export function POST(request: Request) {
  return handleOpeningBalance(
    request,
    process.env.GOOGLE_AUTH_ORIGIN,
    (balance) =>
      withGoogleOwner(request, (client, ownerId) =>
        saveOpeningBalance(client, ownerId, balance),
      ),
  );
}
