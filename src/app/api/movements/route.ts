import { withGoogleOwner } from "@/server/google-auth";
import { saveMovement } from "@/server/movements";
import { handleMovement } from "@/server/movements-http";

export const runtime = "nodejs";

export function POST(request: Request) {
  return handleMovement(request, process.env.GOOGLE_AUTH_ORIGIN, (movement) =>
    withGoogleOwner(request, (client, ownerId) =>
      saveMovement(client, ownerId, movement),
    ),
  );
}
