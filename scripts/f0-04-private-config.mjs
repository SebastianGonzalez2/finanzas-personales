import { readFile } from "node:fs/promises";
import { parseEnv } from "node:util";
import { URL } from "node:url";

// Administrative scripts retain their owner connection. Only the two explicitly
// named inputs may be filled from private files; never load/echo entire env maps.
export async function admissionInputs(
  env,
  root = new URL("../", import.meta.url),
) {
  const result = { ...env };
  for (const [file, key] of [
    [".env.runtime.local", "NEON_ADMISSION_SECRET"],
    [".env.invitation.local", "NEON_NEXT_INVITATION_CODE"],
  ]) {
    if (result[key]) continue;
    try {
      result[key] = parseEnv(await readFile(new URL(file, root), "utf8"))[key];
    } catch (error) {
      if (error.code !== "ENOENT")
        // Private parsing diagnostics must not propagate into public logs.
        // eslint-disable-next-line preserve-caught-error
        throw new Error("No se pudo leer configuración privada");
    }
  }
  return result;
}
