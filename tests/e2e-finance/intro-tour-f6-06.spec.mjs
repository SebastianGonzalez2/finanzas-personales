/* global document, localStorage, window */
import { expect, test as base } from "@playwright/test";
import { tutorialStorageKey } from "../../src/domain/tutorial.ts";
import { financeBrowserFixtures } from "../support/finance-browser.mjs";

// F6-06: tutorial introductorio. Sesión sintética; el tutorial arranca visible
// (el resto de pruebas lo ocultan con la preferencia «hidden»).
const test = base.extend({
  fixtures: async ({ context }, run) => {
    const fixtures = await financeBrowserFixtures();
    await context.addCookies([fixtures.cookies.a1]);
    await run(fixtures);
  },
});
test.use({ storageState: { cookies: [], origins: [] } });

const preference = (page) =>
  page.evaluate((key) => localStorage.getItem(key), tutorialStorageKey);

test("F6-06: primera entrada, avanzar, retroceder y completar", async ({
  page,
  fixtures,
}) => {
  void fixtures;
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/resumen");
  const tour = page.getByRole("dialog", { name: "Tutorial introductorio" });
  await expect(tour).toBeVisible();
  await expect(tour).toBeFocused();
  await expect(tour).toContainText("Paso 1 de 5");
  await expect(tour.getByRole("button", { name: "Anterior" })).toHaveAttribute(
    "aria-disabled",
    "true",
  );

  await tour.getByRole("button", { name: "Siguiente" }).click();
  await expect(tour).toContainText("Paso 2 de 5");
  await expect(page.getByTestId("tutorial-highlight")).toBeVisible();
  await tour.getByRole("button", { name: "Anterior" }).click();
  await expect(tour).toContainText("Paso 1 de 5");

  // La navegación sigue disponible mientras el tutorial está abierto.
  await expect(
    page
      .getByRole("navigation", { name: "Navegación principal" })
      .getByRole("link", { name: "Historial", exact: true }),
  ).toBeEnabled();

  for (let step = 0; step < 4; step += 1)
    await tour.getByRole("button", { name: /Siguiente/ }).click();
  await expect(tour).toContainText("Paso 5 de 5");
  await tour.getByRole("button", { name: "Finalizar" }).click();
  await expect(tour).toBeHidden();
  expect(await preference(page)).toBe("completed");

  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Resumen financiero" }),
  ).toBeVisible();
  await expect(
    page.getByRole("dialog", { name: "Tutorial introductorio" }),
  ).toHaveCount(0);
});

test("F6-06: Escape y Omitir cierran sin guardar la preferencia permanente", async ({
  page,
  fixtures,
}) => {
  void fixtures;
  await page.goto("/resumen");
  const tour = page.getByRole("dialog", { name: "Tutorial introductorio" });
  await expect(tour).toBeVisible();
  // El foco se asigna en el mismo efecto que registra el listener de Escape:
  // esperarlo evita pulsar la tecla antes de que el tutorial la escuche.
  await expect(tour).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(tour).toBeHidden();
  expect(await preference(page)).toBeNull();
  // Omitido en esta pestaña: no reaparece al volver a Resumen.
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Resumen financiero" }),
  ).toBeVisible();
  await expect(tour).toHaveCount(0);

  await page.goto("/ayuda");
  await page.getByRole("link", { name: "Volver a ver tutorial" }).click();
  await expect(page).toHaveURL(/\/resumen$/);
  await expect(
    page.getByRole("dialog", { name: "Tutorial introductorio" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Omitir" }).click();
  await expect(
    page.getByRole("dialog", { name: "Tutorial introductorio" }),
  ).toBeHidden();
});

test("F6-06: «No volver a mostrar» persiste y Ayuda permite reabrir", async ({
  page,
  fixtures,
}) => {
  void fixtures;
  await page.goto("/resumen");
  await page.getByRole("button", { name: "No volver a mostrar" }).click();
  expect(await preference(page)).toBe("hidden");
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Resumen financiero" }),
  ).toBeVisible();
  await expect(
    page.getByRole("dialog", { name: "Tutorial introductorio" }),
  ).toHaveCount(0);

  await page.goto("/ayuda");
  await expect(
    page.getByRole("dialog", { name: "Tutorial introductorio" }),
  ).toHaveCount(0);
  await page.getByRole("link", { name: "Volver a ver tutorial" }).click();
  await expect(
    page.getByRole("dialog", { name: "Tutorial introductorio" }),
  ).toBeVisible();
});

test("F6-06: móvil resalta el botón del menú y no hay desbordes", async ({
  page,
  fixtures,
}) => {
  void fixtures;
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/resumen");
  const tour = page.getByRole("dialog", { name: "Tutorial introductorio" });
  await tour.getByRole("button", { name: "Siguiente" }).click();
  await expect(tour).toContainText("Menú de secciones");
  const highlight = page.getByTestId("tutorial-highlight");
  await expect(highlight).toBeVisible();
  const menu = await page
    .getByRole("button", { name: "Abrir navegación" })
    .boundingBox();
  const box = await highlight.boundingBox();
  expect(box.x).toBeLessThanOrEqual(menu.x);
  expect(box.y).toBeLessThanOrEqual(menu.y);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    ),
  ).toBeLessThanOrEqual(0);

  // Teclado: Escape cierra el tutorial y devuelve el foco a la página.
  await page.keyboard.press("Escape");
  await expect(tour).toBeHidden();
  await expect(
    page.getByRole("heading", { name: "Resumen financiero" }),
  ).toBeFocused();
});
