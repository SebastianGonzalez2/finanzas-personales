import pg from "pg";
import prepareDatabase from "./finance-browser.mjs";
import { testDatabaseConfig } from "./test-database.mjs";

// F6-02: `schema.test.mjs` termina dejando `finance`, `finance_meta` y el rol
// `finanzas_app` en la base desechable (otras pruebas los recrean al empezar).
// `prepareDatabase` exige una base vacía, así que antes de prepararla se elimina
// únicamente ese residuo exacto, con la misma sentencia que usa esa prueba. Si
// existe cualquier otro esquema o rol (p. ej. Auth), no se toca nada y
// `prepareDatabase` rechaza como siempre. `testDatabaseConfig` ya restringe el
// destino al servicio local desechable; esto nunca alcanza a Neon.
export default async function prepareCleanDatabase() {
  const admin = new pg.Client(testDatabaseConfig());
  await admin.connect();
  try {
    const { rows } = await admin.query(`
      SELECT (SELECT array_agg(nspname::text ORDER BY nspname) FROM pg_namespace
               WHERE nspname IN ('app_auth','app_access','app_auth_meta','finance','finance_meta','neon_auth')) AS schemas,
             (SELECT array_agg(rolname::text ORDER BY rolname) FROM pg_roles
               WHERE rolname IN ('finanzas_google_auth','finanzas_google_finance','finanzas_app')) AS roles`);
    const { schemas, roles } = rows[0];
    const onlyKnownResidue =
      JSON.stringify(schemas) === '["finance","finance_meta"]' &&
      JSON.stringify(roles) === '["finanzas_app"]';
    if (onlyKnownResidue)
      await admin.query(
        "DROP SCHEMA finance, finance_meta CASCADE; DROP ROLE finanzas_app",
      );
  } finally {
    await admin.end();
  }
  return prepareDatabase();
}
