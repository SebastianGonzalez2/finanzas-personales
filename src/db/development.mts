import "server-only";
import process from "node:process";
import pg from "pg";
import {
  developmentDatabaseConfig,
  developmentTarget,
} from "../server/neon-development-config.mts";

// Infrastructure probe only. This is not a financial repository and does not
// authorize user data. F0-04/F0-05 must supply fresh identity + ownership first.
export async function probeDevelopmentDatabase(
  mode: "pooled" | "direct" = "pooled",
) {
  const client = new pg.Client(
    developmentDatabaseConfig(process.env, developmentTarget, mode),
  );
  client.on("error", () => {}); // Never emit provider diagnostics/credentials.
  try {
    await client.connect();
    await client.query("BEGIN READ ONLY");
    const result = await client.query<{
      read_only: string;
      exact_numeric: string;
      database_matches: boolean;
      branch_matches: boolean;
    }>(
      `SELECT current_setting('transaction_read_only') AS read_only,
        (0.1::numeric + 0.2::numeric)::text AS exact_numeric,
        current_database() = $1 AS database_matches,
        current_setting('neon.branch_id', true) = $2 AS branch_matches`,
      [developmentTarget.database, developmentTarget.branchId],
    );
    if (
      result.rows[0]?.read_only !== "on" ||
      result.rows[0]?.exact_numeric !== "0.3" ||
      result.rows[0]?.database_matches !== true ||
      result.rows[0]?.branch_matches !== true
    ) {
      throw new Error("Resultado de sonda inesperado");
    }
    return {
      connected: true,
      connectionMode: mode,
      developmentBranch: true,
      readOnly: true,
      numericExact: true,
    };
  } catch {
    throw new Error(
      "Falló la sonda PostgreSQL de development; diagnóstico sensible omitido",
    );
  } finally {
    // ROLLBACK is safe even after a failed statement; no schema/data writes.
    await client.query("ROLLBACK").catch(() => {});
    await client.end().catch(() => {});
  }
}
