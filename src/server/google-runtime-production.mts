import { randomBytes } from "node:crypto";
import type pg from "pg";
import { assertGoogleAuthAppliedProduction } from "../db/google-auth-production.mts";
import { productionTarget } from "./neon-production-config.ts";

// Herramienta EXCLUSIVA de Neon production para crear las credenciales de los
// dos roles runtime. Espeja el aprovisionamiento de development: contraseñas
// aleatorias sin privilegios adicionales, conexiones pooled con TLS verificado
// y channel binding, y un archivo local privado creado sin sobrescribir. Las
// contraseñas y secretos generados nunca se imprimen ni se registran.
export class GoogleRuntimeProductionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GoogleRuntimeProductionError";
  }
}

export const productionRuntimeRoles = [
  "finanzas_google_auth",
  "finanzas_google_finance",
] as const;

export type ProductionRuntimeRole = (typeof productionRuntimeRoles)[number];

export type ProductionRuntimeRoleRow = {
  privileged?: unknown;
  can_login?: unknown;
};

// Sin privilegios adicionales y con LOGIN: exactamente lo que la migración
// Google creó. Cualquier rol ausente o con superuser/bypassrls/createdb/
// createrole rechaza el aprovisionamiento.
export function assertProductionRuntimeRoleRow(
  row: ProductionRuntimeRoleRow | undefined,
  role: ProductionRuntimeRole,
) {
  if (!row || row.privileged !== false || row.can_login !== true) {
    throw new GoogleRuntimeProductionError(
      `El rol runtime ${role} no existe o tiene privilegios inesperados en production`,
    );
  }
}

export function productionRuntimeConnectionUrl(
  role: ProductionRuntimeRole,
  password: string,
) {
  const url = new URL(
    `postgresql://${productionTarget.endpointHost.replace(".", "-pooler.")}/${productionTarget.database}`,
  );
  url.username = role;
  url.password = password;
  url.searchParams.set("sslmode", "verify-full");
  url.searchParams.set("channel_binding", "require");
  return url.href;
}

export type ProductionRuntimeFileValues = {
  authUrl: string;
  financeUrl: string;
  secret: string;
};

// Contenido del archivo privado .env.production.google.local. Los valores
// sensibles se serializan con JSON como en development; el titular completa
// después ORIGIN y credenciales OAuth en Vercel (ver docs/production-neon.md).
export function productionRuntimeFileLines(
  values: ProductionRuntimeFileValues,
) {
  const lines: Array<[string, string]> = [
    ["NEON_PROJECT_ID", productionTarget.projectId],
    ["NEON_BRANCH_ID", productionTarget.branchId],
    ["DATABASE_URL", ""],
    ["DATABASE_URL_UNPOOLED", ""],
    ["GOOGLE_AUTH_DATABASE_URL", values.authUrl],
    ["GOOGLE_FINANCE_DATABASE_URL", values.financeUrl],
    ["GOOGLE_AUTH_SECRET", values.secret],
    ["GOOGLE_AUTH_READY", "false"],
    ["GOOGLE_AUTH_ORIGIN", ""],
    ["GOOGLE_CLIENT_ID", ""],
    ["GOOGLE_CLIENT_SECRET", ""],
  ];
  return (
    lines.map(([key, value]) => `${key}=${JSON.stringify(value)}`).join("\n") +
    "\n"
  );
}

// El llamador debe tener BEGIN abierta en este mismo client y hacer
// COMMIT/ROLLBACK después. Genera ALTER ROLE con quoting del propio servidor
// (format %I/%L); no concede membresías ni privilegios: solo contraseñas.
export async function provisionGoogleRuntimeProduction(client: pg.Client) {
  await assertGoogleAuthAppliedProduction(client);
  const generated: Array<{ role: ProductionRuntimeRole; password: string }> =
    [];
  for (const role of productionRuntimeRoles) {
    const result = await client.query<{
      privileged: boolean;
      can_login: boolean;
    }>(
      "SELECT rolsuper OR rolbypassrls OR rolcreatedb OR rolcreaterole AS privileged, rolcanlogin AS can_login FROM pg_roles WHERE rolname=$1",
      [role],
    );
    assertProductionRuntimeRoleRow(result.rows[0], role);
    const password = randomBytes(32).toString("base64url");
    const statement = (
      await client.query<{ statement: string }>(
        "SELECT format('ALTER ROLE %I PASSWORD %L',$1::text,$2::text) AS statement",
        [role, password],
      )
    ).rows[0].statement;
    await client.query(statement);
    generated.push({ role, password });
  }
  return {
    secret: randomBytes(32).toString("base64url"),
    authUrl: productionRuntimeConnectionUrl(
      generated[0].role,
      generated[0].password,
    ),
    financeUrl: productionRuntimeConnectionUrl(
      generated[1].role,
      generated[1].password,
    ),
  };
}
