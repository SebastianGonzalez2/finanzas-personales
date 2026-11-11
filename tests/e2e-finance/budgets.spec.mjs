import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import pg from "pg";
import { bankReferenceToday } from "../../src/domain/bank-balances.ts";
import {
  financeBrowserFixtures,
  financeTestOrigin,
} from "../support/finance-browser.mjs";
import { testDatabaseConfig } from "../support/test-database.mjs";

test.use({ locale: "es-UY" });

test("F3-06: editor, progreso exacto, excepción, cotización y autorización A/B", async ({
  page,
  context,
  browser,
  request,
}, testInfo) => {
  const { cookies, owners } = await financeBrowserFixtures();
  await context.addCookies([cookies.a1]);
  const other = await browser.newContext({ baseURL: financeTestOrigin });
  await other.addCookies([cookies.b]);
  const admin = new pg.Client(testDatabaseConfig());
  await admin.connect();
  const today = bankReferenceToday(),
    month = today.slice(0, 7),
    category = randomUUID();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const send = (actor, data, origin = financeTestOrigin) =>
    actor.post("/api/budgets", { data, headers: { origin } });
  try {
    await admin.query(
      "INSERT INTO finance.categories(owner_id,id,kind,name) VALUES ($1,$2,'expense','Alimentación sintética')",
      [owners.a, category],
    );
    await page.goto("/presupuestos");
    await page
      .getByRole("button", { name: "Crear presupuesto", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Crear presupuesto", exact: true }),
    ).toBeFocused();
    await page.getByLabel("Categoría de gasto").selectOption(category);
    await page.getByLabel("Límite mensual", { exact: true }).fill("10000");
    const created = page.waitForResponse((r) =>
      r.url().endsWith("/api/budgets"),
    );
    await page.getByRole("button", { name: "Guardar", exact: true }).click();
    const response = await created;
    expect(response.status()).toBe(201);
    const { id } = await response.json();
    const entry = page.getByRole("listitem").filter({
      has: page.getByRole("heading", { name: "Alimentación sintética" }),
    });
    await expect(entry).toContainText("0,00 UYU");
    const edit = {
      action: "edit",
      budgetId: id,
      version: 1,
      currency: "UYU",
      amount: "12000",
      idempotencyKey: randomUUID(),
    };
    expect((await send(request, edit)).status()).toBe(401);
    expect((await send(other.request, edit)).status()).toBe(404);
    expect(
      (await send(context.request, edit, "https://untrusted.invalid")).status(),
    ).toBe(403);
    expect(
      (await send(context.request, { ...edit, ownerId: owners.b })).status(),
    ).toBe(400);
    expect((await send(context.request, edit)).status()).toBe(200);
    expect((await send(context.request, edit)).status()).toBe(200);
    expect(
      (
        await send(context.request, { ...edit, idempotencyKey: randomUUID() })
      ).status(),
    ).toBe(409);

    await page.reload();
    // The server commits but the response is lost. Retry the identical body,
    // with fields locked, and keep only one configuration revision.
    const lostBodies = [];
    const loseFirst = async (route) => {
      lostBodies.push(route.request().postData());
      if (lostBodies.length === 1) {
        await route.fetch();
        await route.abort("failed");
      } else await route.continue();
    };
    await entry.getByRole("button", { name: /Editar el presupuesto/ }).click();
    await page.getByLabel("Límite mensual", { exact: true }).fill("12000");
    await page.route("**/api/budgets", loseFirst);
    await page.getByRole("button", { name: "Guardar", exact: true }).click();
    await expect(
      page.getByLabel("Límite mensual", { exact: true }),
    ).toBeDisabled();
    await page
      .getByRole("button", { name: "Reintentar guardado", exact: true })
      .click();
    await expect(
      page.getByText("Presupuesto guardado.", { exact: true }),
    ).toBeVisible();
    expect(lostBodies).toHaveLength(2);
    expect(lostBodies[0]).toBe(lostBodies[1]);
    await page.unroute("**/api/budgets", loseFirst);
    await entry.getByRole("button", { name: /Cambiar el límite/ }).click();
    await page.getByLabel("Mes de la excepción").selectOption(month);
    await page.getByLabel(/Límite solo para ese mes/).fill("15000");
    await page.getByRole("button", { name: "Guardar", exact: true }).click();
    await expect(entry).toContainText("15.000,00 UYU");
    await expect(entry).toContainText("12.000,00 UYU");

    // Synthetic DB event exercises the actual authenticated page calculation.
    const event = randomUUID();
    await admin.query(
      "INSERT INTO finance.financial_events(owner_id,id,kind,concept,effective_on,idempotency_key,command_hash) VALUES ($1,$2,'expense','Sintético USD',$3,$4,$5)",
      [owners.a, event, today, randomUUID(), "a".repeat(64)],
    );
    await admin.query(
      "INSERT INTO finance.ordinary_movements(owner_id,event_id,category_id,method) VALUES ($1,$2,$3,'debit')",
      [owners.a, event, category],
    );
    await admin.query(
      "INSERT INTO finance.bank_effects(owner_id,id,event_id,currency,amount_signed,effective_on) VALUES ($1,$2,$2,'USD',-20,$3)",
      [owners.a, event, today],
    );
    await page.reload();
    await expect(entry).toContainText("Falta cotización: consumo sin calcular");
    await page
      .getByText("Cotización manual para presupuestos", { exact: true })
      .click();
    await page.getByLabel("Tasa de referencia").fill("40");
    lostBodies.length = 0;
    await page.route("**/api/budgets", loseFirst);
    await page
      .getByRole("button", { name: "Guardar cotización manual", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Reintentar cotización", exact: true })
      .click();
    expect(lostBodies).toHaveLength(2);
    expect(lostBodies[0]).toBe(lostBodies[1]);
    await page.unroute("**/api/budgets", loseFirst);
    await expect(entry).toContainText("800,00 UYU");
    await expect(entry).toContainText("Referencia manual");
    await entry.getByRole("button", { name: /Editar el presupuesto/ }).click();
    await page.getByLabel("Moneda del límite").selectOption("EUR");
    await page.getByLabel("Límite mensual", { exact: true }).fill("220");
    await expect(page.getByText(/Vista previa: este mes/)).toContainText(
      "220,00 EUR",
    );
    await expect(page.getByText(/Vista previa: este mes/)).toContainText(
      "excepciones actuales y futuras",
    );
    await page.screenshot({
      path: testInfo.outputPath("F3-06-editor.png"),
      fullPage: true,
    });
    await page.getByRole("button", { name: "Cancelar", exact: true }).click();
    await expect(
      entry.getByRole("button", { name: /Editar el presupuesto/ }),
    ).toBeFocused();
    const next = new Date(`${month}-01T00:00:00Z`);
    next.setUTCMonth(next.getUTCMonth() + 1);
    await page.goto(`/presupuestos?month=${next.toISOString().slice(0, 7)}`);
    await expect(entry).toContainText("12.000,00 UYU");
    await expect(entry).not.toContainText("15.000,00 UYU");
    await expect(
      page.getByRole("button", { name: "Crear presupuesto", exact: true }),
    ).toBeDisabled();
    await page.goto("/presupuestos");
    await entry.getByRole("button", { name: /Quitar el presupuesto/ }).click();
    await page.getByRole("button", { name: "Confirmar", exact: true }).click();
    await expect(entry).toHaveCount(0);
    expect(
      await page.evaluate(
        () =>
          globalThis.document.documentElement.scrollWidth <=
          globalThis.innerWidth,
      ),
    ).toBe(true);
    const foreign = await other.newPage();
    await foreign.goto("/presupuestos");
    await expect(
      foreign.getByRole("heading", { name: "Alimentación sintética" }),
    ).toHaveCount(0);
    expect(errors).toEqual([]);
  } finally {
    await admin.end();
    await other.close();
  }
});
