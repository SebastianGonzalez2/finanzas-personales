import { freshGoogleSession, withGoogleOwner } from "@/server/google-auth";
import { refreshBudgetNotices } from "@/server/budgets";
import {
  reviseMovement,
  saveBankTransfer,
  saveMovement,
} from "@/server/movements";
import {
  handleMovement,
  handleMovementRevision,
} from "@/server/movements-http";

export const runtime = "nodejs";

export function POST(request: Request) {
  return handleMovement(
    request,
    process.env.GOOGLE_AUTH_ORIGIN,
    (movement) =>
      withGoogleOwner(request, async (client, ownerId) => {
        if (movement.kind === "bank_transfer")
          return saveBankTransfer(client, ownerId, movement);
        const result = await saveMovement(client, ownerId, movement);
        if (movement.kind === "expense" && result.status === "created")
          await refreshBudgetNotices(client, ownerId);
        return result;
      }),
    async (r) => Boolean(await freshGoogleSession(r)),
  );
}

export function PATCH(request: Request) {
  return handleMovementRevision(
    request,
    process.env.GOOGLE_AUTH_ORIGIN,
    (revision) =>
      withGoogleOwner(request, async (client, ownerId) => {
        const result = await reviseMovement(client, ownerId, revision);
        if (result.status === "revised")
          await refreshBudgetNotices(client, ownerId);
        return result;
      }),
  );
}
