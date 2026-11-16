import { defineConfig } from "@playwright/test";
import base from "./playwright.finance.config.mjs";
const sizes = [
  { name: "escritorio", viewport: { width: 1440, height: 900 } },
  { name: "movil", viewport: { width: 390, height: 844 } },
];
const engines = [
  ["chrome", "chromium", "chrome"],
  ["edge", "chromium", "msedge"],
  ["firefox", "firefox", undefined],
  ["webkit", "webkit", undefined],
];
export default defineConfig({
  ...base,
  testMatch: "localized-dates.spec.mjs",
  projects: engines.flatMap(([label, browserName, channel]) =>
    sizes.map(({ name, viewport }) => ({
      name: `${label}-${name}`,
      use: {
        browserName,
        channel,
        viewport,
        ...(name === "movil"
          ? {
              hasTouch: true,
              ...(browserName === "firefox" ? {} : { isMobile: true }),
            }
          : {}),
      },
    })),
  ),
});
