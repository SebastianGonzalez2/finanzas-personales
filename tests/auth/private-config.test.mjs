import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, unlink, rmdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { admissionInputs } from "../../scripts/f0-04-private-config.mjs";

test("CLI administrativa carga solo admisión y no sustituye la conexión propietaria", async () => {
  const directory = await mkdtemp(join(tmpdir(), "f004-config-"));
  try {
    await writeFile(
      join(directory, ".env.runtime.local"),
      "NEON_ADMISSION_SECRET=synthetic\nDATABASE_URL_UNPOOLED=\nNEON_AUTH_ADMISSION_READY=true\n",
    );
    await writeFile(
      join(directory, ".env.invitation.local"),
      "NEON_NEXT_INVITATION_CODE=synthetic-code\nDATABASE_URL_UNPOOLED=evil\n",
    );
    const original = {
      DATABASE_URL_UNPOOLED: "synthetic-owner-url",
      NEON_AUTH_ADMISSION_READY: "false",
    };
    const result = await admissionInputs(
      original,
      pathToFileURL(directory + "/"),
    );
    assert.equal(result.DATABASE_URL_UNPOOLED, original.DATABASE_URL_UNPOOLED);
    assert.equal(result.NEON_AUTH_ADMISSION_READY, "false");
    assert.equal(result.NEON_ADMISSION_SECRET, "synthetic");
    assert.equal(result.NEON_NEXT_INVITATION_CODE, "synthetic-code");
    assert.equal(original.NEON_ADMISSION_SECRET, undefined);
  } finally {
    await unlink(join(directory, ".env.runtime.local"));
    await unlink(join(directory, ".env.invitation.local"));
    await rmdir(directory);
  }
});
