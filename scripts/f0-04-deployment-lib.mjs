import { createHash } from "node:crypto";
import { URL } from "node:url";
import {
  developmentAuthConfig,
  developmentTarget,
} from "../src/server/neon-development-config.ts";
import { restrictedConfig } from "../src/server/auth-database.ts";

const rootFiles = new Set([
  "package.json",
  "package-lock.json",
  "next.config.ts",
  "postcss.config.mjs",
  "tsconfig.json",
  ".nvmrc",
]);
// Deployment inputs are tracked application source, never a recursive workspace copy.
export function deploymentFiles(tracked) {
  return tracked
    .filter((name) => {
      if (
        name.includes("\\") ||
        name.startsWith("/") ||
        name.split("/").some((part) => part === ".." || part.startsWith("."))
      ) {
        return rootFiles.has(name);
      }
      if (rootFiles.has(name)) return true;
      if (!name.startsWith("src/")) return false;
      if (
        /\.(sql|mts)$/.test(name) ||
        name.includes("/migrations/") ||
        name.includes("/proposals/")
      )
        return false;
      return /\.(ts|tsx|css|svg|json)$/.test(name);
    })
    .sort();
}
export function deploymentPackage(original) {
  return {
    ...original,
    scripts: { build: "next build --webpack", start: "next start" },
  };
}
export function digestFiles(files) {
  return createHash("sha256").update(JSON.stringify(files)).digest("hex");
}
export function deploymentEnvironment(env, origin) {
  const url = new URL(origin);
  if (
    url.origin !== origin ||
    url.protocol !== "https:" ||
    !url.hostname.endsWith(".vercel.app")
  )
    throw new Error("Origen de prueba no autorizado");
  developmentAuthConfig(env, developmentTarget);
  restrictedConfig(env, "finance");
  restrictedConfig(env, "admission");
  if (!env.NEON_ADMISSION_SECRET || env.NEON_ADMISSION_SECRET.length < 32)
    throw new Error("Secreto de admisión requerido");
  const keys = [
    "NEON_PROJECT_ID",
    "NEON_BRANCH_ID",
    "NEON_AUTH_BASE_URL",
    "NEON_AUTH_COOKIE_SECRET",
    "NEON_ADMISSION_SECRET",
    "DATABASE_RUNTIME_URL",
    "DATABASE_ADMISSION_URL",
  ];
  // Owner credentials and administrative invitation input cannot be exported.
  return {
    ...Object.fromEntries(keys.map((key) => [key, env[key]])),
    AUTH_APP_ORIGIN: origin,
    NEON_AUTH_ADMISSION_READY: "false",
    NEXT_TELEMETRY_DISABLED: "1",
  };
}
