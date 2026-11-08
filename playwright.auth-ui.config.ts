import { defineConfig } from "@playwright/test";
import base from "./playwright.config";
export default defineConfig({
  ...base,
  testDir: "./tests/auth-ui",
  webServer: {
    command: "npm start -- --port 3106",
    url: "http://127.0.0.1:3106",
    reuseExistingServer: false,
    timeout: 60000,
    env: {
      NEON_AUTH_ADMISSION_READY: "true",
      NEON_PROJECT_ID: "dry-voice-45959315",
      NEON_BRANCH_ID: "br-late-feather-b6czfkx0",
      NEON_AUTH_BASE_URL:
        "https://ep-falling-queen-b63xbfuk.neonauth.c-2.sa-east-1.aws.neon.tech/neondb/auth",
      NEON_AUTH_COOKIE_SECRET:
        "synthetic-ui-only-secret-at-least-thirty-two-characters",
      AUTH_APP_ORIGIN: "http://127.0.0.1:3106",
      DATABASE_URL: "",
      DATABASE_URL_UNPOOLED: "",
      DATABASE_RUNTIME_URL: "",
      DATABASE_ADMISSION_URL: "",
      NEON_ADMISSION_SECRET: "",
    },
  },
});
