import process from "node:process";
import { defineConfig } from "@playwright/test";
import financeConfig from "./playwright.finance.config.mjs";

// PERF-01: mediciones de rendimiento sobre el build de producción y la base
// desechable local (mismo arnés que las e2e financieras).
export default defineConfig({
  ...financeConfig,
  testDir: "./tests/perf",
  testMatch: /.*\.spec\.mjs/,
  timeout: 600_000,
  projects: [
    {
      name: "desktop",
      use: {
        browserName: "chromium",
        channel: "chrome",
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      name: "mobile",
      use: {
        browserName: "chromium",
        channel: "chrome",
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
  webServer: {
    ...financeConfig.webServer,
    command: financeConfig.webServer.command.replace(
      "tests/support/finance-browser-pg.mjs",
      "tests/perf/perf-preload.mjs",
    ),
    env: {
      ...financeConfig.webServer.env,
      PERF_QUERY_LOG: process.env.PERF_QUERY_LOG ?? "",
    },
  },
});
