import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import {
  financeBrowserFixtures,
  financeTestOrigin,
} from "../support/finance-browser.mjs";

// UI-05A · P-04 — Menú «Más acciones»: Escape, clic afuera y selección.
// Usa una tarjeta sintética en la base de pruebas desechable de la suite.
test("UI-05A: menú Más acciones cierra con Escape, clic afuera y selección y gestiona el foco", async ({
  page,
  context,
}) => {
  const { cookies } = await financeBrowserFixtures();
  await context.addCookies([cookies.a1]);
  const created = await context.request.post("/api/cards", {
    headers: { origin: financeTestOrigin },
    data: {
      action: "create",
      kind: "credit",
      name: "Menú UI-05A",
      currencies: [{ currency: "UYU" }],
      idempotencyKey: randomUUID(),
    },
  });
  expect(created.status()).toBe(201);

  await page.goto("/tarjetas");
  const trigger = page.getByLabel("Más acciones de Menú UI-05A");
  const menu = page.locator("details.gs-menu");
  const expectOpen = (open) => expect(menu).toHaveJSProperty("open", open);

  // Escape: cierra y devuelve el foco al disparador.
  await trigger.click();
  await expectOpen(true);
  await page.keyboard.press("Escape");
  await expectOpen(false);
  await expect(trigger).toBeFocused();

  // Clic afuera en una zona sin control: cierra y restaura el foco.
  await trigger.click();
  await expectOpen(true);
  await page
    .getByRole("heading", { name: "Tarjetas", exact: true })
    .click({ position: { x: 2, y: 2 } });
  await expectOpen(false);
  await expect(trigger).toBeFocused();

  // Clic en otro control: cierra sin quitarle el foco a ese control.
  await trigger.click();
  await expectOpen(true);
  const other = page.getByRole("button", { name: "Agregar tarjeta" });
  await other.click();
  await expectOpen(false);
  await expect(trigger).not.toBeFocused();
  await expect(
    page.getByRole("heading", { name: "Agregar tarjeta" }),
  ).toBeFocused();
  await page.getByRole("button", { name: "Cancelar" }).click();

  // Selección: cierra el menú y ejecuta la acción elegida.
  await trigger.click();
  await expectOpen(true);
  await page.getByRole("button", { name: "Editar Menú UI-05A" }).click();
  await expectOpen(false);
  await expect(
    page.getByRole("button", { name: "Guardar tarjeta" }),
  ).toBeVisible();
});
