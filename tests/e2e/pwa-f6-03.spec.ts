import { expect, test } from "@playwright/test";

// F6-03 (RF-051/052, CA-065/066): comprobaciones sin sesión ni base de datos.
// Las pantallas autenticadas se cubren en tests/e2e-finance/accessibility-f6-03.spec.mjs.

test("RF-051: manifest instalable, íconos PNG públicos y metadatos móviles", async ({
  page,
  request,
}) => {
  await page.goto("/auth/sign-in");
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
    "href",
    "/manifest.webmanifest",
  );
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute(
    "content",
    "#131313",
  );
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveCount(1);

  const response = await request.get("/manifest.webmanifest");
  expect(response.status()).toBe(200);
  expect(response.headers()["set-cookie"]).toBeUndefined();
  const manifest = await response.json();
  expect(manifest).toMatchObject({
    name: "Finanzas personales",
    short_name: "Finanzas",
    lang: "es",
    start_url: "/",
    display: "standalone",
    background_color: "#131313",
    theme_color: "#131313",
  });
  expect(manifest.description).toBeTruthy();
  type Icon = { src: string; sizes: string; type: string; purpose?: string };
  const icons: Icon[] = manifest.icons;
  expect(icons.some((i) => i.sizes === "192x192")).toBe(true);
  expect(icons.some((i) => i.sizes === "512x512" && i.purpose === "any")).toBe(
    true,
  );
  expect(icons.some((i) => i.purpose === "maskable")).toBe(true);
  for (const icon of icons) {
    const file = await request.get(icon.src);
    expect(file.status(), icon.src).toBe(200);
    expect(file.headers()["content-type"], icon.src).toContain(
      icon.type.replace("+xml", ""),
    );
    expect(file.headers()["set-cookie"], icon.src).toBeUndefined();
  }
  const png = await request.get("/pwa-icons/icon-512.png");
  const header = (await png.body()).subarray(0, 8);
  expect([...header]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  expect((await request.get("/pwa-icons/desconocido.png")).status()).toBe(404);
});

test("CA-065: sin conexión se informa, y al volver se avisa sin persistir nada", async ({
  page,
  context,
}) => {
  await page.goto("/auth/sign-in");
  const banner = page.locator("[data-connection]");
  await expect(banner).toHaveAttribute("data-connection", "online");
  await expect(banner).toHaveText("");

  await context.setOffline(true);
  await expect(banner).toHaveAttribute("data-connection", "offline");
  await expect(banner).toContainText("Sin conexión");
  await expect(banner).toContainText("no se guardan");
  await expect(banner).toHaveAttribute("aria-live", "polite");

  await context.setOffline(false);
  await expect(banner).toHaveAttribute("data-connection", "online");
  await expect(banner).toContainText("Conexión restablecida");

  // Sin almacenamiento financiero ni caché del navegador creados por la app.
  const storage = await page.evaluate(async () => ({
    local: localStorage.length,
    session: sessionStorage.length,
    caches: (await caches.keys()).length,
    databases: (await indexedDB.databases()).length,
    workers: (await navigator.serviceWorker.getRegistrations()).length,
  }));
  expect(storage).toEqual({
    local: 0,
    session: 0,
    caches: 0,
    databases: 0,
    workers: 0,
  });
});

test("CA-066: el control inválido se marca con aria-invalid y se limpia al corregirlo", async ({
  page,
}) => {
  await page.goto("/auth/sign-in");
  await page.evaluate(() => {
    document.body.insertAdjacentHTML(
      "beforeend",
      `<form id="prueba">
         <label>Importe<input id="importe" name="importe" required /></label>
         <button type="submit">Guardar</button>
       </form>`,
    );
    document.getElementById("prueba")?.addEventListener("submit", (e) => {
      e.preventDefault();
    });
  });
  const input = page.locator("#importe");
  await expect(input).not.toHaveAttribute("aria-invalid", /.*/);
  await page.getByRole("button", { name: "Guardar" }).click();
  await expect(input).toHaveAttribute("aria-invalid", "true");
  await input.fill("10");
  await expect(input).not.toHaveAttribute("aria-invalid", /.*/);
});

for (const width of [320, 390, 768, 1024, 1440]) {
  test(`CA-066: la entrada no desborda en ${width}px ni a 200 % de zoom de texto`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/auth/sign-in");
    await page.addStyleTag({ content: "html { font-size: 200% }" });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    const small = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>("a, button")]
        .filter(
          (el) =>
            el.offsetParent !== null &&
            el.getAttribute("href") !== "#contenido",
        )
        .map((el) => ({ el: el.textContent?.trim(), h: el.offsetHeight }))
        .filter(({ h }) => h < 44),
    );
    expect(small).toEqual([]);
  });
}

test("CA-066: el foco por teclado es visible", async ({ page }) => {
  await page.goto("/auth/sign-in");
  await page.keyboard.press("Tab");
  const outline = await page
    .getByRole("link", { name: "Saltar al contenido" })
    .evaluate((el) => getComputedStyle(el).outlineStyle);
  expect(outline).not.toBe("none");
});
