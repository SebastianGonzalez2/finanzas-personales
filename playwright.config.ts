import { defineConfig } from "@playwright/test";

// Opcional: usar un navegador instalado (p. ej. "chrome" o "msedge") cuando
// el binario de Playwright no está descargado. Sin la variable no cambia nada.
const channel = process.env.PLAYWRIGHT_CHANNEL || undefined;

export default defineConfig({
  testDir: "./tests/e2e",
  forbidOnly: true,
  retries: 0,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:3106",
    trace: "off",
    screenshot: "off",
    video: "off",
  },
  projects: [
    {
      name: "chromium-desktop",
      use: {
        browserName: "chromium",
        channel,
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      name: "chromium-mobile",
      use: {
        browserName: "chromium",
        channel,
        viewport: { width: 390, height: 844 },
      },
    },
  ],
  webServer: {
    command: "npm start -- --port 3106",
    env: {
      GOOGLE_AUTH_READY: "false",
      GOOGLE_AUTH_ORIGIN: "http://localhost:3106",
    },
    url: "http://127.0.0.1:3106",
    reuseExistingServer: false,
    timeout: 60000,
  },
});
