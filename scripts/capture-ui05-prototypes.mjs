import process from "node:process";
import console from "node:console";
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "@playwright/test";
import prepareFinanceBrowserDatabase, {
  financeBrowserFixtures,
  financeTestOrigin,
  financeTestSecret,
  runtimePassword,
} from "../tests/support/finance-browser.mjs";
import { developmentTarget } from "../src/server/neon-development-config.ts";
import { protoScreens } from "../src/app/prototipos/ui-05/_proto/screens.ts";

// UI-05-DESIGN — Capturas de los prototipos a 1440 px y 375 px.
// Solo contra el PostgreSQL local desechable documentado en docs/testing.md
// (la guarda `testDatabaseConfig` rechaza cualquier otro destino) y con las
// sesiones sintéticas del arnés e2e financiero. Levanta `next dev` (los
// prototipos responden 404 fuera de desarrollo): ejecutar desde una copia
// del repositorio si ya hay otro `next dev` sobre esta carpeta (.next).
//
//   TEST_DATABASE_CONFIRM=isolated-local-test \
//   TEST_DATABASE_URL=postgresql://f0_test:f0_test@127.0.0.1:55432/neondb \
//   node scripts/capture-ui05-prototypes.mjs [carpeta] [--todos]

const outDir = process.argv[2]?.startsWith("--")
  ? "docs/design/ui-05/capturas"
  : (process.argv[2] ?? "docs/design/ui-05/capturas");
const allStates = process.argv.includes("--todos");
const viewports = [
  { name: "1440", width: 1440, height: 900, isMobile: false },
  { name: "375", width: 375, height: 812, isMobile: true },
];

const host = developmentTarget.endpointHost.replace(".", "-pooler.");
const url = (role) =>
  `postgresql://finanzas_google_${role}:${runtimePassword}@${host}/${developmentTarget.database}`;

async function waitForServer() {
  for (let attempt = 0; attempt < 180; attempt += 1) {
    try {
      const response = await fetch(`${financeTestOrigin}/auth/sign-in`);
      if (response.ok) return;
    } catch {
      // Todavía compilando.
    }
    await delay(1000);
  }
  throw new Error("El servidor de desarrollo no respondió");
}

const cleanup = await prepareFinanceBrowserDatabase();
const port = new URL(financeTestOrigin).port;
const server = spawn(
  process.execPath,
  [
    "node_modules/next/dist/bin/next",
    "dev",
    "--webpack",
    "--hostname",
    "localhost",
    "--port",
    port,
  ],
  {
    stdio: ["ignore", "ignore", "inherit"],
    env: {
      ...process.env,
      NODE_OPTIONS: "--import ./tests/support/finance-browser-pg.mjs",
      NEXT_TELEMETRY_DISABLED: "1",
      DATABASE_URL: "",
      DATABASE_URL_UNPOOLED: "",
      GOOGLE_AUTH_READY: "true",
      GOOGLE_AUTH_ORIGIN: financeTestOrigin,
      GOOGLE_AUTH_SECRET: financeTestSecret,
      GOOGLE_CLIENT_ID: "finance-fixture-client",
      GOOGLE_CLIENT_SECRET: "finance-fixture-secret",
      GOOGLE_AUTH_DATABASE_URL: url("auth"),
      GOOGLE_FINANCE_DATABASE_URL: url("finance"),
      NEON_BRANCH_ID: developmentTarget.branchId,
      NEON_PROJECT_ID: developmentTarget.projectId,
    },
  },
);

let failed = 0;
try {
  const { cookies } = await financeBrowserFixtures();
  await waitForServer();
  await mkdir(outDir, { recursive: true });
  const browser = await chromium.launch({
    channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
  });
  try {
    for (const viewport of viewports) {
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        isMobile: viewport.isMobile,
        hasTouch: viewport.isMobile,
        deviceScaleFactor: 1,
        reducedMotion: "reduce",
      });
      await context.addCookies([cookies.a1]);
      const page = await context.newPage();
      const targets = [
        { file: "00-indice", path: "/prototipos/ui-05" },
        ...protoScreens.flatMap((screen, index) =>
          (allStates ? screen.states : screen.states.slice(0, 2)).map(
            (state) => ({
              file: `${String(index + 1).padStart(2, "0")}-${screen.key}-${state}`,
              path:
                state === "normal"
                  ? `/prototipos/ui-05/${screen.key}`
                  : `/prototipos/ui-05/${screen.key}?estado=${state}`,
            }),
          ),
        ),
      ];
      for (const target of targets) {
        const response = await page.goto(`${financeTestOrigin}${target.path}`, {
          waitUntil: "networkidle",
          timeout: 180000,
        });
        if (!response?.ok() || page.url().includes("/auth/sign-in")) {
          console.error(`Fallo ${target.path}: ${response?.status()}`);
          failed += 1;
          continue;
        }
        await page.evaluate(() => document.fonts.ready);
        await delay(700);
        await page.screenshot({
          path: join(outDir, `${target.file}-${viewport.name}.jpg`),
          fullPage: true,
          type: "jpeg",
          quality: 70,
        });
        console.log(`${target.file}-${viewport.name}`);
      }
      await context.close();
    }
  } finally {
    await browser.close();
  }
} finally {
  server.kill();
  await cleanup();
}
process.exitCode = failed ? 1 : 0;
