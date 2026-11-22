/* global document, localStorage, performance, requestAnimationFrame, window */
import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import process from "node:process";
import { test } from "@playwright/test";
import { bankReferenceToday } from "../../src/domain/bank-balances.ts";
import { tutorialStorageKey } from "../../src/domain/tutorial.ts";
import {
  financeBrowserFixtures,
  financeTestOrigin,
} from "../support/finance-browser.mjs";

// PERF-01: medición de rendimiento (build de producción, base desechable,
// datos sintéticos). Escribe PERF_OUT con las métricas por pantalla.
const pages = [
  "/resumen",
  "/historial",
  "/estadisticas",
  "/presupuestos",
  "/recurrentes",
  "/catalogo",
  "/categorias",
  "/informes",
  "/ayuda",
  "/account",
];

const headers = { origin: financeTestOrigin };

function shiftMonths(iso, back) {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1 - back, Math.min(d, 28)));
  return date.toISOString().slice(0, 10);
}

async function seed(context) {
  const today = bankReferenceToday();
  const categories = [];
  for (const name of [
    "Comida",
    "Transporte",
    "Hogar",
    "Salud",
    "Ocio",
    "Servicios",
    "Ropa",
    "Educación",
  ]) {
    const response = await context.request.post("/api/categories", {
      data: { kind: "expense", name, parentId: null },
      headers,
    });
    if (response.status() === 201) categories.push((await response.json()).id);
  }
  const jobs = [];
  for (let i = 0; i < 360; i++) {
    jobs.push(
      context.request.post("/api/movements", {
        data: {
          idempotencyKey: randomUUID(),
          kind: "expense",
          currency: "UYU",
          amount: String(100 + ((i * 37) % 4000)),
          effectiveOn: shiftMonths(today, i % 7),
          concept: `Gasto sintético ${i}`,
          categoryId: categories[i % Math.max(1, categories.length)] ?? null,
        },
        headers,
      }),
    );
    if (jobs.length === 12) await Promise.all(jobs.splice(0));
  }
  await Promise.all(jobs);
}

const observers = `
  window.__perf = { lcp: 0, cls: 0, long: [] };
  new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__perf.lcp = e.startTime; }).observe({ type: "largest-contentful-paint", buffered: true });
  new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__perf.cls += e.value; }).observe({ type: "layout-shift", buffered: true });
  new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__perf.long.push(e.duration); }).observe({ type: "longtask", buffered: true });
`;

async function metrics(cdp) {
  const { metrics: list } = await cdp.send("Performance.getMetrics");
  return Object.fromEntries(list.map((m) => [m.name, m.value]));
}

test("PERF-01: mediciones", async ({ page, context }, testInfo) => {
  const mobile = testInfo.project.name === "mobile";
  const { cookies } = await financeBrowserFixtures();
  await context.addCookies([cookies.a1]);
  await context.addInitScript(
    ([key]) => {
      try {
        localStorage.setItem(key, "done");
      } catch {
        // sin almacenamiento: no afecta la medición
      }
    },
    [tutorialStorageKey],
  );
  await context.addInitScript(observers);
  if (process.env.PERF_SEED !== "0") await seed(context);

  const cdp = await context.newCDPSession(page);
  await cdp.send("Performance.enable");
  await cdp.send("Network.enable");

  const out = {
    project: testInfo.project.name,
    pages: {},
    windows: {},
    client: {},
    idle: {},
    gl: null,
  };
  await page.goto("/resumen", { waitUntil: "load" });
  out.gl = await page.evaluate(() => {
    const c = document.createElement("canvas");
    const gl = c.getContext("webgl");
    const ext = gl?.getExtension("WEBGL_debug_renderer_info");
    return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : null;
  });
  if (mobile) await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });

  for (const path of pages) {
    await page.goto(path, { waitUntil: "load" }); // calentamiento
    const runs = [];
    for (let i = 0; i < 3; i++) {
      await cdp.send("Network.clearBrowserCache");
      const from = Date.now();
      await page.goto(path, { waitUntil: "networkidle" });
      out.windows[path] = [from, Date.now()];
      await page.waitForTimeout(400);
      runs.push(
        await page.evaluate(() => {
          const nav = performance.getEntriesByType("navigation")[0];
          const fcp =
            performance.getEntriesByName("first-contentful-paint")[0]
              ?.startTime ?? 0;
          const js = performance
            .getEntriesByType("resource")
            .filter(
              (e) => e.initiatorType === "script" || e.name.endsWith(".js"),
            );
          return {
            ttfb: nav.responseStart,
            server: nav.responseStart - nav.requestStart,
            dcl: nav.domContentLoadedEventEnd,
            load: nav.loadEventEnd,
            fcp,
            lcp: window.__perf.lcp,
            cls: window.__perf.cls,
            tbt: window.__perf.long.reduce(
              (s, d) => s + Math.max(0, d - 50),
              0,
            ),
            longTasks: window.__perf.long.length,
            jsKB: Math.round(
              js.reduce((s, e) => s + e.encodedBodySize, 0) / 1024,
            ),
            jsReq: js.length,
            htmlKB: Math.round(nav.encodedBodySize / 1024),
            dom: document.getElementsByTagName("*").length,
          };
        }),
      );
    }
    out.pages[path] = Object.fromEntries(
      Object.keys(runs[0]).map((k) => [
        k,
        +runs
          .map((r) => r[k])
          .sort((a, b) => a - b)[1]
          .toFixed(1),
      ]),
    );
  }

  // Navegación del lado del cliente (enlaces del shell) desde /resumen.
  for (const path of pages.filter((p) => p !== "/resumen")) {
    const times = [];
    for (let i = 0; i < 2; i++) {
      await page.goto("/resumen", { waitUntil: "networkidle" });
      const link = page
        .locator(`body .finance-nav__item[href^="${path}#"]:visible`)
        .first();
      if ((await link.count()) === 0) break;
      const t0 = Date.now();
      await link.click();
      await page.waitForURL(`**${path}*`, { timeout: 30000 });
      await page.waitForLoadState("networkidle");
      times.push(Date.now() - t0);
    }
    if (times.length) out.client[path] = Math.min(...times);
  }

  // Costo ocioso del fondo (animación + vidrio) en /resumen: 6 s sin tocar nada.
  for (const motion of ["no-preference", "reduce"]) {
    await page.emulateMedia({ reducedMotion: motion });
    await page.goto("/resumen", { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);
    const before = await metrics(cdp);
    const frames = await page.evaluate(
      () =>
        new Promise((resolve) => {
          let n = 0;
          const t0 = performance.now();
          const tick = () => {
            n++;
            if (performance.now() - t0 < 6000) requestAnimationFrame(tick);
            else resolve({ n, ms: performance.now() - t0 });
          };
          requestAnimationFrame(tick);
        }),
    );
    const after = await metrics(cdp);
    const d = (k) =>
      +(
        (((after[k] ?? 0) - (before[k] ?? 0)) * 1000) /
        (frames.ms / 1000)
      ).toFixed(1);
    out.idle[motion] = {
      fps: +(frames.n / (frames.ms / 1000)).toFixed(1),
      taskMsPerSec: d("TaskDuration"),
      scriptMsPerSec: d("ScriptDuration"),
      layoutMsPerSec: d("LayoutDuration"),
      styleMsPerSec: d("RecalcStyleDuration"),
      waves: await page.evaluate(() =>
        [...document.querySelectorAll("[data-ambient]")].map(
          (e) => e.dataset.render,
        ),
      ),
    };
  }
  writeFileSync(
    process.env.PERF_OUT ?? `perf-${testInfo.project.name}.json`,
    JSON.stringify(out, null, 2),
  );
});
