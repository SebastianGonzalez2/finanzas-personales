import process from "node:process";
import console from "node:console";
import pg from "pg";
import {
  developmentDatabaseConfig,
  developmentTarget,
} from "../src/server/neon-development-config.mts";
import { privateDigest } from "../src/server/auth-policy.ts";

// Administrative local process only. Never deploy owner credentials with Next.
const action = process.argv[2];
if (!["--rotate", "--revoke"].includes(action) || process.argv.length !== 3) {
  console.error(
    "Usar --rotate (NEON_NEXT_INVITATION_CODE privado, mínimo 24 caracteres) o --revoke. No imprimir secretos.",
  );
  process.exitCode = 2;
} else {
  let client;
  try {
    let hash = null;
    if (action === "--rotate") {
      const code = process.env.NEON_NEXT_INVITATION_CODE;
      if (!code || code.length < 24 || code.length > 256)
        throw new Error("Código insuficiente");
      hash = privateDigest(
        process.env.NEON_ADMISSION_SECRET ?? "",
        "code",
        code,
      );
    }
    client = new pg.Client(
      developmentDatabaseConfig(process.env, developmentTarget, "direct"),
    );
    client.on("error", () => {});
    await client.connect();
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(704004)");
    const target = await client.query(
      "SELECT current_setting('neon.branch_id',true)=$1 AS matches",
      [developmentTarget.branchId],
    );
    if (!target.rows[0].matches) throw new Error("Destino incorrecto");
    const result = await client.query(
      "UPDATE admission.policy SET generation=generation+1,code_hash=$1,updated_at=clock_timestamp() WHERE singleton RETURNING generation",
      [hash],
    );
    if (result.rowCount !== 1) throw new Error("Política ausente");
    await client.query(
      "INSERT INTO admission.policy_audit(generation,enabled) VALUES($1,$2)",
      [result.rows[0].generation, hash !== null],
    );
    if ((await client.query("COMMIT")).command !== "COMMIT")
      throw new Error("Sin confirmación");
    console.log(
      JSON.stringify({
        development: true,
        rotated: hash !== null,
        revoked: hash === null,
        generation: result.rows[0].generation,
      }),
    );
  } catch {
    await client?.query("ROLLBACK").catch(() => {});
    console.error(
      "No se pudo confirmar el cambio de invitación; diagnóstico sensible omitido.",
    );
    process.exitCode = 1;
  } finally {
    await client?.end().catch(() => {});
  }
}
