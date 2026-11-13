/* global document, window */
import { randomUUID } from "node:crypto";
import { expect, test as base } from "@playwright/test";
import { bankReferenceToday } from "../../src/domain/bank-balances.ts";
import {
  financeBrowserFixtures,
  financeTestOrigin,
} from "../support/finance-browser.mjs";

// F6-03 (RF-051/052, CA-065/066): shell, pantallas principales y formulario
// sin conexión con una sesión sintética. Solo datos de prueba.
const test = base.extend({
  fixtures: async ({ context }, run) => {
    const fixtures = await financeBrowserFixtures();
    await context.addCookies([fixtures.cookies.a1]);
    await run(fixtures);
  },
});

const screens = [
  "/resumen",
  "/historial",
  "/estadisticas",
  "/recurrentes",
  "/presupuestos",
  "/categorias",
  "/tarjetas",
  "/catalogo",
  "/fondos",
  "/avisos",
  "/deudas",
  "/beneficios",
  "/informes",
  "/account",
];

test("CA-066: menú móvil por teclado, Escape, clic en el fondo y foco devuelto", async ({
  page,
  fixtures,
}) => {
  void fixtures;
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/resumen");
  const open = page.getByRole("button", { name: "Abrir navegación" });
  const drawer = page.getByRole("dialog", { name: "Navegación" });
  await expect(open).toHaveAttribute("aria-expanded", "false");
  await expect(drawer).toBeHidden();

  await open.focus();
  await open.press("Enter");
  await expect(drawer).toBeVisible();
  await expect(open).toHaveAttribute("aria-expanded", "true");
  await expect(drawer.getByRole("link", { name: "Resumen" })).toHaveAttribute(
    "aria-current",
    "page",
  );

  // El diálogo modal vuelve inerte el resto: el foco nunca llega a la página
  // de fondo (queda en el diálogo o, al salir del último control, en el navegador).
  for (let step = 0; step < 20; step += 1) {
    await page.keyboard.press("Tab");
    expect(
      await page.evaluate(
        () =>
          document.activeElement === document.body ||
          Boolean(document.activeElement?.closest("dialog")),
      ),
    ).toBe(true);
  }
  await open.focus();
  await expect(open).not.toBeFocused();
  await page.keyboard.press("Escape");
  await expect(drawer).toBeHidden();
  await expect(open).toHaveAttribute("aria-expanded", "false");
  await expect(open).toBeFocused();

  await open.click();
  await expect(drawer).toBeVisible();
  await page.mouse.click(380, 400); // fondo (fuera del panel de 19,25 rem)
  await expect(drawer).toBeHidden();
  await expect(open).toBeFocused();

  // Al pasar a escritorio el diálogo se cierra y la navegación fija sigue accesible.
  await open.click();
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(drawer).toBeHidden();
  await expect(
    page
      .getByRole("navigation", { name: "Navegación principal" })
      .getByRole("link", { name: "Resumen" }),
  ).toBeVisible();
});

for (const width of [360, 768, 1440]) {
  test(`CA-066: pantallas principales en ${width}px sin desborde, con h1, nombres accesibles y controles táctiles`, async ({
    page,
    fixtures,
  }) => {
    void fixtures;
    await page.setViewportSize({ width, height: 900 });
    // Datos sintéticos con texto largo sin espacios para provocar desbordes.
    const today = bankReferenceToday();
    const send = (path, data) =>
      page.request.fetch(path, {
        method: "POST",
        headers: { origin: financeTestOrigin },
        data,
      });
    expect(
      (
        await send("/api/bank-balances", {
          currency: "UYU",
          amount: "1234567.89",
          asOfDate: today,
        })
      ).status(),
    ).toBe(201);
    expect(
      (
        await send("/api/movements", {
          kind: "expense",
          currency: "UYU",
          method: "debit",
          amount: "987654.32",
          effectiveOn: today,
          concept: "ConceptoSinteticoMuyLargoSinEspacios".repeat(2),
          idempotencyKey: randomUUID(),
        })
      ).status(),
    ).toBe(201);
    const problems = [];
    for (const path of screens) {
      await page.goto(path);
      await expect(page.locator("main#contenido")).toBeVisible();
      const report = await page.evaluate(() => {
        const visible = (el) => {
          const box = el.getBoundingClientRect();
          return (
            el.checkVisibility?.() !== false &&
            box.width > 0 &&
            box.height > 0 &&
            !el.closest("dialog:not([open])")
          );
        };
        const name = (el) =>
          el.getAttribute("aria-label")?.trim() ||
          el.getAttribute("aria-labelledby") ||
          el.getAttribute("title")?.trim() ||
          el.textContent?.trim() ||
          el.querySelector("[aria-label]")?.getAttribute("aria-label") ||
          "";
        const controls = [
          ...document.querySelectorAll("input, select, textarea"),
        ].filter(
          (el) => visible(el) && !["hidden", "submit"].includes(el.type),
        );
        const clickable = [
          ...document.querySelectorAll("a[href], button, summary"),
        ].filter(
          (el) =>
            visible(el) &&
            !el.classList.contains("sr-only") &&
            el.getAttribute("href") !== "#contenido",
        );
        return {
          overflow: document.documentElement.scrollWidth - window.innerWidth,
          headings: document.querySelectorAll("h1").length,
          unlabeled: controls
            .filter(
              (el) =>
                !el.labels?.length &&
                !el.getAttribute("aria-label") &&
                !el.getAttribute("aria-labelledby"),
            )
            .map((el) => el.name || el.id || el.tagName),
          unnamed: clickable
            .filter((el) => !name(el))
            .map((el) => el.outerHTML.slice(0, 80)),
          tiny: clickable
            .filter((el) => {
              const box = el.getBoundingClientRect();
              return box.height < 24 || box.width < 24;
            })
            .map((el) => `${el.textContent?.trim().slice(0, 30)}`),
        };
      });
      if (report.overflow > 0)
        problems.push(`${path}: desborde ${report.overflow}px`);
      if (report.headings !== 1)
        problems.push(`${path}: h1=${report.headings}`);
      for (const key of ["unlabeled", "unnamed", "tiny"])
        if (report[key].length) problems.push(`${path}: ${key} ${report[key]}`);
    }
    expect(problems).toEqual([]);
  });
}

test("CA-065/066: validación nativa marca el campo y, sin conexión, no se informa éxito ni se pierde el formulario", async ({
  page,
  fixtures,
}) => {
  void fixtures;
  const today = bankReferenceToday();
  const configured = await page.request.fetch("/api/bank-balances", {
    method: "POST",
    headers: { origin: financeTestOrigin },
    data: { currency: "UYU", amount: "10000", asOfDate: today },
  });
  expect(configured.status()).toBe(201);

  await page.goto("/resumen");
  const open = page.getByRole("button", { name: "+ Nueva transacción" });
  const form = page.getByRole("form", { name: "Nueva transacción" });
  await open.focus();
  await open.press("Enter");
  await expect(
    page.getByRole("heading", { name: "Nueva transacción" }),
  ).toBeFocused();

  // Importe vacío: el navegador rechaza el envío y el control queda marcado.
  const amount = form.getByLabel("Importe");
  await form.getByRole("button", { name: "Guardar movimiento" }).click();
  await expect(amount).toHaveAttribute("aria-invalid", "true");
  await amount.fill("500");
  await expect(amount).not.toHaveAttribute("aria-invalid", "true");

  const concept = `Gasto sintético ${randomUUID().slice(0, 8)}`;
  await form.getByLabel("Concepto", { exact: true }).fill(concept);

  const context = page.context();
  await context.setOffline(true);
  try {
    await form.getByRole("button", { name: "Guardar movimiento" }).click();
    const alert = form.getByRole("alert");
    await expect(alert).toContainText("Sin conexión");
    await expect(alert).toContainText("Tus datos siguen en el formulario");
    await expect(page.locator("[data-connection]")).toContainText(
      "Sin conexión",
    );
    await expect(page.getByText("Gasto registrado.")).toHaveCount(0);
    // El formulario sigue en memoria: no hubo recarga ni navegación.
    await expect(page).toHaveURL(/\/resumen$/);
    await expect(amount).toHaveValue("500");
    await expect(form.getByLabel("Concepto", { exact: true })).toHaveValue(
      concept,
    );
    await expect(
      form.getByRole("button", { name: "Reintentar guardado" }),
    ).toBeEnabled();
  } finally {
    await context.setOffline(false);
  }

  // Reintento explícito con el mismo envío: se informa éxito solo tras la respuesta.
  await expect(page.locator("[data-connection]")).toContainText(
    "Conexión restablecida",
  );
  const submitted = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/movements") &&
      response.request().method() === "POST",
  );
  await form.getByRole("button", { name: "Reintentar guardado" }).click();
  expect((await submitted).status()).toBe(201);
  await expect(page.getByText("Gasto registrado.")).toBeVisible();
  await expect(page.getByText("Saldo bancario 9.500,00 UYU")).toBeVisible();
});
