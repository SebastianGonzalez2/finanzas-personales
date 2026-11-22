/* global document, localStorage, performance, window */
import { createHash } from "node:crypto";
import console from "node:console";
import process from "node:process";
import { test } from "@playwright/test";
import { tutorialStorageKey } from "../../src/domain/tutorial.ts";
import { financeBrowserFixtures } from "../support/finance-browser.mjs";

// PERF-01: diagnóstico del fondo Glaciar dentro del shell autenticado.
test("PERF-01: ondas en el shell y entre navegaciones", async ({
  page,
  context,
}, testInfo) => {
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
  const out = {};
  await page.goto("/resumen", { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);
  out.render = await page.evaluate(() =>
    [...document.querySelectorAll("[data-ambient]")].map((e) => [
      e.dataset.render,
      e.querySelector("canvas")?.dataset.ready,
    ]),
  );
  // Movimiento real de píxeles en la franja superior durante 20 s.
  const hashes = [];
  const clip = { x: 0, y: 0, width: 1000, height: 300 };
  const shots = [];
  for (let i = 0; i < 5; i++) {
    const buffer = await page.screenshot({ clip });
    shots.push(buffer);
    hashes.push(createHash("md5").update(buffer).digest("hex").slice(0, 6));
    await page.waitForTimeout(4000);
  }
  out.hashes = hashes;
  // ¿Se recrea el lienzo en cada navegación del lado del cliente?
  await page.evaluate(() => {
    document.querySelector(".ambient__canvas").dataset.mark = "viejo";
    window.__mismoDocumento = true;
  });
  const link = page
    .locator('.finance-nav__item[href^="/historial#"]:visible')
    .first();
  await link.click();
  await page.waitForURL("**/historial*");
  await page.waitForLoadState("networkidle");
  out.canvasSobrevive = await page.evaluate(
    () => document.querySelector(".ambient__canvas")?.dataset.mark === "viejo",
  );
  out.mismoDocumento = await page.evaluate(
    () => window.__mismoDocumento === true,
  );
  out.foco = await page.evaluate(
    () => document.activeElement?.id || document.activeElement?.tagName,
  );
  out.dom = await page.evaluate(() =>
    [...document.querySelectorAll("[data-ambient]")].map((e) => [
      e.dataset.ambient,
      e.dataset.render,
      e.children.length,
      e.firstElementChild?.dataset.mark ?? null,
      e.firstElementChild?.dataset.ready ?? null,
    ]),
  );
  out.canvases = await page.evaluate(
    () => document.querySelectorAll(".ambient__canvas").length,
  );
  out.timeAfterNav = await page.evaluate(() => performance.now());
  await page.screenshot({
    path: `${process.env.PERF_SHOTS ?? "."}/shell-${testInfo.project.name}.png`,
  });
  await page.goto("/estadisticas#titulo-pagina", { waitUntil: "networkidle" });
  out.focoCarga = await page.evaluate(
    () => document.activeElement?.id || document.activeElement?.tagName,
  );
  console.log("AMBIENT", JSON.stringify(out));
});
