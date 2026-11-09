import { withGoogleOwner } from "@/server/google-auth";
import { reviseMovement, saveMovement } from "@/server/movements";
import {
  handleMovement,
  handleMovementRevision,
} from "@/server/movements-http";

export const runtime = "nodejs";

export function POST(request: Request) {
  return handleMovement(request, process.env.GOOGLE_AUTH_ORIGIN, (movement) =>
    withGoogleOwner(request, (client, ownerId) =>
      saveMovement(client, ownerId, movement),
    ),
  );
}

export function PATCH(request: Request) {
  return handleMovementRevision(
    request,
    process.env.GOOGLE_AUTH_ORIGIN,
    (revision) =>
      withGoogleOwner(request, (client, ownerId) =>
        reviseMovement(client, ownerId, revision),
      ),
  );
}
