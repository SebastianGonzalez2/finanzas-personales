import { expect, test, type Page } from "@playwright/test";

// HOTFIX — Fondo ambiental Glaciar. Las capturas visuales usan movimiento
// reducido; esta prueba verifica el movimiento por separado:
// - con GPU y movimiento permitido las ondas y la luz del medio se animan;
// - con GPU y movimiento reducido queda un fotograma fijo de las mismas ondas;
// - con WebGL por software (así corre CI) o sin WebGL queda la capa CSS, sin
//   dibujar el shader.
// En CI (Chromium sin GPU, SwiftShader) la GPU se simula quitando la marca
// de software. Con una GPU real (`--project` local con `channel: chromium`)
// la prueba usa la detección real.

type Graphics = "real" | "gpu" | "software" | "none";

function stubGraphics(graphics: Graphics) {
  const scope = globalThis as unknown as { __draws: number };
  scope.__draws = 0;
  const draw = WebGLRenderingContext.prototype.drawArrays;
  WebGLRenderingContext.prototype.drawArrays = function (...args) {
    scope.__draws += 1;
    return draw.apply(this, args);
  };
  if (graphics === "real") return;
  const getContext = HTMLCanvasElement.prototype.getContext;
  // @ts-expect-error -- sobrecargas de getContext.
  HTMLCanvasElement.prototype.getContext = function (type, options) {
    if (graphics === "none" && /webgl/.test(String(type))) return null;
    const rest = { ...(options ?? {}) };
    if (graphics === "gpu") delete rest.failIfMajorPerformanceCaveat;
    return getContext.call(this, type, rest);
  };
  const getParameter = WebGLRenderingContext.prototype.getParameter;
  WebGLRenderingContext.prototype.getParameter = function (name) {
    // UNMASKED_RENDERER_WEBGL (WEBGL_debug_renderer_info).
    if (name === 0x9246)
      return graphics === "gpu"
        ? "ANGLE (Simulated GPU Direct3D11)"
        : "ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)";
    return getParameter.call(this, name);
  };
}

async function open(page: Page, graphics: Graphics) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.addInitScript(stubGraphics, graphics);
  await page.goto("/auth/sign-in");
  await expect(
    page.getByRole("heading", { name: "Tu espacio personal" }),
  ).toBeVisible();
  return errors;
}

const waves = (page: Page) => page.locator("[data-ambient]");
const draws = (page: Page) =>
  page.evaluate(() => (globalThis as unknown as { __draws: number }).__draws);
const glow = (page: Page) =>
  page
    .locator(".ambient-glow span")
    .first()
    .evaluate((span) => getComputedStyle(span).animationName);
const ready = (page: Page) =>
  page
    .locator(".ambient__canvas")
    .evaluateAll((canvases) =>
      canvases.map((canvas) => (canvas as HTMLElement).dataset.ready ?? null),
    );

async function frames(page: Page) {
  const clip = { x: 0, y: 0, width: 360, height: 360 };
  const before = await draws(page);
  const first = await page.screenshot({ clip });
  await page.waitForTimeout(1500);
  const second = await page.screenshot({ clip });
  return {
    draws: (await draws(page)) - before,
    changed: !first.equals(second),
  };
}

test("HOTFIX: con GPU y movimiento permitido la aurora se anima", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const errors = await open(page, "real");
  const detected = await waves(page).first().getAttribute("data-render");
  if (detected !== "animated") {
    // Sin GPU real (CI): misma prueba con aceleración simulada.
    test.info().annotations.push({
      type: "graphics",
      description: `GPU simulada (detección real: ${detected})`,
    });
    await page.close();
    page = await page.context().newPage();
    errors.push(...(await open(page, "gpu")));
  }
  await expect(waves(page)).toHaveCount(2);
  for (const layer of await waves(page).all())
    await expect(layer).toHaveAttribute("data-render", "animated");
  await expect.poll(() => ready(page)).toContain("true");
  await page.waitForTimeout(1500);
  const motion = await frames(page);
  // 30 fps como máximo por lienzo: en 1,5 s hay decenas de cuadros.
  expect(motion.draws).toBeGreaterThan(10);
  expect(motion.changed).toBe(true);
  expect(await glow(page)).toBe("ambient-drift");
  expect(errors).toEqual([]);
});

test("HOTFIX: con movimiento reducido queda un fotograma fijo de las ondas", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const errors = await open(page, "gpu");
  for (const layer of await waves(page).all())
    await expect(layer).toHaveAttribute("data-render", "still");
  await expect.poll(() => ready(page)).toEqual(["true", "true"]);
  await page.waitForTimeout(1500);
  const motion = await frames(page);
  expect(motion.draws).toBe(0);
  expect(motion.changed).toBe(false);
  expect(await glow(page)).toBe("none");
  expect(errors).toEqual([]);
});

test("HOTFIX: con WebGL por software no se dibuja el shader", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const errors = await open(page, "software");
  for (const layer of await waves(page).all())
    await expect(layer).toHaveAttribute("data-render", "css");
  await expect(page.locator(".ambient-glow")).toHaveAttribute(
    "data-motion",
    "static",
  );
  await page.waitForTimeout(1500);
  const motion = await frames(page);
  // Ni un cuadro: en CPU, crear el contexto y compilar ya bloquea la página.
  expect(await draws(page)).toBe(0);
  expect(await ready(page)).toEqual([null, null]);
  expect(motion.changed).toBe(false);
  expect(await glow(page)).toBe("none");
  expect(errors).toEqual([]);
});

test("HOTFIX: sin WebGL queda la alternativa CSS", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const errors = await open(page, "none");
  for (const layer of await waves(page).all())
    await expect(layer).toHaveAttribute("data-render", "css");
  expect(await ready(page)).toEqual([null, null]);
  await expect(page.locator(".ambient__canvas").first()).toHaveCSS(
    "opacity",
    "0",
  );
  expect(
    await waves(page)
      .first()
      .evaluate((layer) => getComputedStyle(layer).backgroundImage),
  ).toContain("radial-gradient");
  expect(errors).toEqual([]);
});
