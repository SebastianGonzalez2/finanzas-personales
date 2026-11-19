import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import {
  financeBrowserFixtures,
  financeTestOrigin,
} from "../support/finance-browser.mjs";

const headers = { origin: financeTestOrigin };

test("SIMP-02: registrar un gasto en cuotas sin saldo ni medio bancario", async ({
  page,
  context,
}) => {
  const { cookies } = await financeBrowserFixtures();
  await context.addCookies([cookies.b]);
  const concept = `Heladera SIMP-02 ${randomUUID().slice(0, 8)}`;

  await page.goto("/resumen");
  await page
    .getByRole("banner")
    .getByRole("link", { name: "Registrar movimiento" })
    .click();
  const form = page.getByRole("form", { name: "Nueva transacción" });
  await expect(form.getByLabel("Medio bancario")).toHaveCount(0);
  await expect(
    form
      .getByRole("combobox", { name: "Moneda", exact: true })
      .locator("option"),
  ).toHaveText(["UYU", "USD", "EUR"]);
  // Fuera del mes actual para no alterar los totales de otras pruebas.
  await form.getByLabel("Fecha").fill("10/03/2025");
  await form.getByLabel("En cuotas").check();
  await expect(form.getByLabel("Importe", { exact: true })).toHaveCount(0);
  await form.getByLabel("Importe de cada cuota").fill("5000");
  await form.getByLabel("Cantidad de cuotas").fill("6");
  await expect(
    form.getByText("Total financiado · 30.000,00 UYU"),
  ).toBeVisible();
  await form.getByLabel("Concepto").fill(concept);

  const saved = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/movements") &&
      response.request().method() === "POST",
  );
  await form.getByRole("button", { name: "Guardar movimiento" }).click();
  const response = await saved;
  expect(response.status()).toBe(201);
  const { id } = await response.json();

  await page.goto(`/historial/movimientos/${id}`);
  await expect(page.getByRole("heading", { name: concept })).toBeVisible();
  const schedule = page.getByRole("list", { name: "Calendario de cuotas" });
  await expect(schedule.getByRole("listitem")).toHaveCount(6);
  await expect(schedule.getByRole("listitem").first()).toContainText(
    "marzo de 2025",
  );
  await expect(schedule.getByRole("listitem").last()).toContainText(
    "agosto de 2025",
  );

  // Deja los datos compartidos como estaban: una anulación retira las cuotas.
  expect(
    (
      await context.request.patch("/api/movements", {
        headers,
        data: { action: "void", eventId: id, idempotencyKey: randomUUID() },
      })
    ).status(),
  ).toBe(200);
});
