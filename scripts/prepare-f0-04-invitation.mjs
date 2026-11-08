import console from "node:console";
import process from "node:process";
import { URL } from "node:url";
import { randomBytes } from "node:crypto";
import { writeFile } from "node:fs/promises";

// Local only. The current policy in Neon is NOT rotated or enabled.
try {
  await writeFile(
    new URL("../.env.invitation.local", import.meta.url),
    `NEON_NEXT_INVITATION_CODE=${randomBytes(32).toString("base64url")}\n`,
    { flag: "wx", mode: 0o600 },
  );
  console.log(
    JSON.stringify({
      prepared: true,
      privateFile: ".env.invitation.local",
      remotePolicyChanged: false,
      authEnabled: false,
    }),
  );
} catch {
  console.error(
    "No se creó el código privado; no se sobrescribió un archivo existente ni cambió Neon.",
  );
  process.exitCode = 1;
}
