import process from "node:process";
import console from "node:console";
import { open } from "node:fs/promises";
import { URL } from "node:url";
import pg from "pg";
import { GoogleAuthProductionError } from "../src/db/google-auth-production.mts";
import {
  GoogleRuntimeProductionError,
  productionRuntimeFileLines,
  productionRuntimeRoles,
  provisionGoogleRuntimeProduction,
} from "../src/server/google-runtime-production.mts";
import {
  ProductionConfigError,
  assertProductionOwnerSession,
  productionDatabaseConfig,
  productionTarget,
} from "../src/server/neon-production-config.mts";

// Herramienta EXCLUSIVA de Neon production. Genera contraseñas aleatorias para
// los dos roles runtime, las configura sin privilegios adicionales, construye
// sus conexiones pooled y crea un archivo local privado SIN sobrescribir uno
// existente. Nunca imprime ni registra secretos. No se ejecuta en esta tarea:
// es para el titular, con autorización expresa y tras la migración Google.
if (!process.argv.includes("--approved-runtime-credentials")) {
  console.log(
    JSON.stringify(
      {
        mode: "plan",
        environment: "production",
        project: productionTarget.projectId,
        branch: productionTarget.branchId,
        roles: productionRuntimeRoles,
        file: ".env.production.google.local",
        applyFlag: "--approved-runtime-credentials",
        authReady: false,
        requires:
          "Autorización de contraseñas aleatorias para esos dos roles, posterior a la migración Google en production",
      },
      null,
      2,
    ),
  );
} else {
  // wx nunca sobrescribe trabajo local existente. Un fallo conserva el archivo
  // privado cerrado para no perder credenciales si la respuesta de COMMIT es ambigua.
  const file = await open(
    new URL("../.env.production.google.local", import.meta.url),
    "wx",
    0o600,
  );
  const client = new pg.Client(
    productionDatabaseConfig(process.env, productionTarget, "direct"),
  );
  client.on("error", () => {});
  try {
    await client.connect();
    await client.query("BEGIN");
    await assertProductionOwnerSession(client);
    const generated = await provisionGoogleRuntimeProduction(client);
    await file.writeFile(productionRuntimeFileLines(generated));
    await client.query("COMMIT");
    console.log(
      JSON.stringify({
        createdPrivateRuntime: true,
        environment: "production",
        roles: 2,
        authReady: false,
        oauthCredentialsPresent: false,
      }),
    );
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    const controlled =
      error instanceof GoogleRuntimeProductionError ||
      error instanceof GoogleAuthProductionError ||
      error instanceof ProductionConfigError;
    console.error(
      controlled
        ? `Aprovisionamiento rechazado: ${error.message}`
        : "Runtime no confirmado. Archivo privado conservado cerrado; revisar sin imprimirlo.",
    );
    process.exitCode = 1;
  } finally {
    await file.close();
    await client.end().catch(() => {});
  }
}
