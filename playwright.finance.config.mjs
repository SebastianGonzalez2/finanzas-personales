import { createECDH } from "node:crypto";
import { defineConfig } from "@playwright/test";
import baseModule from "./playwright.config.ts";
import { developmentTarget } from "./src/server/neon-development-config.ts";
import {
  financeTestOrigin,
  financeTestSecret,
  runtimePassword,
} from "./tests/support/finance-browser.mjs";
import { testDatabaseConfig } from "./tests/support/test-database.mjs";

testDatabaseConfig();
// Playwright transpiles the root TypeScript config as CommonJS.
const base = baseModule.default ?? baseModule;
const host = developmentTarget.endpointHost.replace(".", "-pooler.");
const url = (role) =>
  `postgresql://finanzas_google_${role}:${runtimePassword}@${host}/${developmentTarget.database}`;
const pushKey = createECDH("prime256v1");
const pushPublicKey = pushKey.generateKeys("base64url");

export default defineConfig({
  ...base,
  testDir: "./tests/e2e-finance",
  globalSetup: "./tests/support/finance-browser.mjs",
  use: { ...base.use, baseURL: financeTestOrigin },
  webServer: {
    ...base.webServer,
    command:
      "node --import ./tests/support/finance-browser-pg.mjs node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3108",
    url: `${financeTestOrigin}/auth/sign-in`,
    env: {
      GOOGLE_AUTH_READY: "true",
      GOOGLE_AUTH_ORIGIN: financeTestOrigin,
      GOOGLE_AUTH_SECRET: financeTestSecret,
      GOOGLE_CLIENT_ID: "finance-fixture-client",
      GOOGLE_CLIENT_SECRET: "finance-fixture-secret",
      GOOGLE_AUTH_DATABASE_URL: url("auth"),
      GOOGLE_FINANCE_DATABASE_URL: url("finance"),
      NEON_BRANCH_ID: developmentTarget.branchId,
      NEON_PROJECT_ID: developmentTarget.projectId,
      NEXT_TELEMETRY_DISABLED: "1",
      CRON_SECRET: "synthetic-finance-cron-secret",
      CARD_PUSH_VAPID_SUBJECT: "mailto:fixture@example.invalid",
      CARD_PUSH_PUBLIC_KEY: pushPublicKey,
      CARD_PUSH_PRIVATE_KEY: pushKey.getPrivateKey("base64url"),
    },
  },
});
