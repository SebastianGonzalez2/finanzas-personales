import assert from "node:assert/strict";
import test from "node:test";
import {
  deploymentFiles,
  deploymentPackage,
  deploymentEnvironment,
} from "../../scripts/f0-04-deployment-lib.mjs";
import { developmentTarget } from "../../src/server/neon-development-config.ts";

test("paquete HTTPS excluye secretos, enlaces, SQL, herramientas administrativas y archivos ajenos", () => {
  const files = [
    ".env.local",
    ".env.runtime.local",
    ".git/config",
    ".aws/credentials",
    "docs/product/decisiones-producto.md",
    "scripts/provision-f0-04-runtime.mjs",
    "src/db/proposals/0002.sql",
    "src/server/auth.ts",
    "src/app/page.tsx",
    "src/package.json",
    "src/server/../private.ts",
    "src/.private/key.json",
    "../src/leak.ts",
    "src\\private.ts",
    "package.json",
    ".nvmrc",
  ];
  assert.deepEqual(deploymentFiles(files), [
    ".nvmrc",
    "package.json",
    "src/app/page.tsx",
    "src/package.json",
    "src/server/auth.ts",
  ]);
  assert.deepEqual(
    deploymentPackage({
      scripts: { "db:migrate": "unsafe" },
      dependencies: { next: "fixed" },
    }),
    {
      scripts: { build: "next build --webpack", start: "next start" },
      dependencies: { next: "fixed" },
    },
  );
});
test("exportación prevista solo admite runtime development y siempre cierra Auth", () => {
  const env = {
    NEON_PROJECT_ID: developmentTarget.projectId,
    NEON_BRANCH_ID: developmentTarget.branchId,
    NEON_AUTH_BASE_URL: developmentTarget.authBaseUrl,
    NEON_AUTH_COOKIE_SECRET: "synthetic-at-least-thirty-two-characters",
    NEON_ADMISSION_SECRET: "synthetic-at-least-thirty-two-characters",
    NEON_AUTH_ADMISSION_READY: "true",
    NEON_NEXT_INVITATION_CODE: "do-not-export",
    DATABASE_URL: "do-not-export",
    DATABASE_URL_UNPOOLED: "do-not-export",
  };
  const host = developmentTarget.endpointHost.replace(".", "-pooler.");
  env.DATABASE_RUNTIME_URL = `postgres://finanzas_runtime:fixture-only@${host}/neondb`;
  env.DATABASE_ADMISSION_URL = `postgres://finanzas_admission:fixture-only@${host}/neondb`;
  const exported = deploymentEnvironment(
    env,
    "https://f0-04.example.vercel.app",
  );
  assert.equal(exported.NEON_AUTH_ADMISSION_READY, "false");
  assert.equal(exported.DATABASE_URL, undefined);
  assert.equal(exported.DATABASE_URL_UNPOOLED, undefined);
  assert.equal(exported.NEON_NEXT_INVITATION_CODE, undefined);
  assert.throws(() =>
    deploymentEnvironment(
      {
        ...env,
        DATABASE_RUNTIME_URL: env.DATABASE_RUNTIME_URL.replace(
          "finanzas_runtime",
          "neondb_owner",
        ),
      },
      "https://f0-04.example.vercel.app",
    ),
  );
  assert.throws(() => deploymentEnvironment(env, "https://evil.invalid"));
});
