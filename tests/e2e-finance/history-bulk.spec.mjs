import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import pg from "pg";
import { bankReferenceToday } from "../../src/domain/bank-balances.ts";
import {
  financeBrowserFixtures,
  financeTestOrigin,
} from "../support/finance-browser.mjs";
import { testDatabaseConfig } from "../support/test-database.mjs";

test("F5-04: aplicar categoría, guardar el período y respetar el titular", async ({
  page,
  context,
  browser,
  request,
}, testInfo) => {
  const { owners, cookies } = await financeBrowserFixtures();
  await context.addCookies([cookies.a1]);
  const other = await browser.newContext({ baseURL: financeTestOrigin });
  await other.addCookies([cookies.b]);
  const today = bankReferenceToday();
  const [category, tag, foreignTag, first, second] = Array.from(
    { length: 5 },
    () => randomUUID(),
  );
  const admin = new pg.Client(testDatabaseConfig());
  await admin.connect();
  try {
    await admin.query(
      "INSERT INTO finance.categories (owner_id, id, kind, name) VALUES ($1, $2, 'expense', 'Alimentación sintética')",
      [owners.a, category],
    );
    await admin.query(
      "INSERT INTO finance.tags (owner_id, id, name) VALUES ($1, $2, 'Compras'), ($3, $4, 'Otra etiqueta')",
      [owners.a, tag, owners.b, foreignTag],
    );
    for (const id of [first, second]) {
      await admin.query(
        `INSERT INTO finance.financial_events (owner_id, id, kind, effective_on, concept, idempotency_key, command_hash)
          VALUES ($1, $2, 'expense', $3, 'Compra sintética', $2, repeat('a', 64))`,
        [owners.a, id, today],
      );
      await admin.query(
        "INSERT INTO finance.ordinary_movements (owner_id, event_id, method) VALUES ($1, $2, 'debit')",
        [owners.a, id],
      );
      await admin.query(
        "INSERT INTO finance.bank_effects (owner_id, id, event_id, currency, amount_signed, effective_on) VALUES ($1, $2, $2, 'UYU', -100.0001, $3)",
        [owners.a, id, today],
      );
    }
  } finally {
    await admin.end();
  }

  try {
    const endpoint = "/api/history/bulk-category";
    const data = {
      entries: [{ id: first, kind: "expense", version: 0 }],
      tagId: foreignTag,
      idempotencyKey: randomUUID(),
    };
    const headers = { origin: financeTestOrigin };
    expect((await request.post(endpoint, { headers, data })).status()).toBe(
      403,
    );
    expect(
      (await other.request.post(endpoint, { headers, data })).status(),
    ).toBe(403);
    expect(
      (
        await page.request.post(endpoint, {
          headers: { origin: "https://example.invalid" },
          data,
        })
      ).status(),
    ).toBe(403);

    await page.goto("/historial");
    const selectAll = page.getByRole("checkbox", {
      name: "Seleccionar todo en esta página",
    });
    await selectAll.check();
    await expect(
      page.getByText("2 registros seleccionados en esta página."),
    ).toBeVisible();
    await page
      .getByLabel("Categoría o etiqueta")
      .selectOption(`category:${category}`);
    await page.screenshot({
      path: testInfo.outputPath("clasificacion-masiva.png"),
      fullPage: true,
    });
    await page.getByRole("button", { name: "Aplicar categoría" }).click();
    await expect(page.getByText("2 registros actualizados.")).toBeVisible();

    // UI-04: los campos avanzados están en «Más filtros» (cerrado al entrar,
    // como en el diseño aprobado) y los desplegables aplican al cambiar.
    const more = page.getByRole("button", { name: /Más filtros/ });
    await expect(more).toHaveAttribute("aria-expanded", "false");
    await more.click();
    await expect(more).toHaveAttribute("aria-expanded", "true");
    await page.getByLabel("Desde", { exact: true }).fill(today);
    const period = page.getByRole("combobox", {
      name: "Período",
      exact: true,
    });
    await period.selectOption("mes-actual");
    await expect(page).toHaveURL(/period=mes-actual/);
    await expect(page).not.toHaveURL(/from=/);
    await expect(period).toBeFocused();
    await expect(page.getByLabel("Desde", { exact: true })).toBeDisabled();
    await expect(more).toHaveAttribute("aria-expanded", "true");
    await page
      .getByRole("combobox", { name: "Categoría", exact: true })
      .selectOption(category);
    await expect(page).toHaveURL(new RegExp(`category=${category}`));
    await page.getByRole("button", { name: "Aplicar filtros" }).click();
    await expect(page).toHaveURL(/period=mes-actual/);
    await expect(
      page.getByRole("list", { name: "Filtros activos" }),
    ).toContainText("Alimentación sintética");
    await expect(
      page.getByRole("link", { name: /Compra sintética/ }),
    ).toHaveCount(2);
    await page
      .getByLabel("Guardar la búsqueda actual como")
      .fill("Alimentación mes actual");
    await page.getByRole("button", { name: "Guardar filtro" }).click();
    await expect(
      page.getByRole("link", { name: "Alimentación mes actual" }),
    ).toHaveAttribute("href", /period=mes-actual/);

    await page.goto(`/historial?period=mes-anterior&category=${category}`);
    await expect(
      page.getByText("No hay movimientos con estos filtros"),
    ).toBeVisible();
    await page.getByRole("button", { name: "Usar búsqueda actual" }).click();
    await page.getByRole("button", { name: "Reemplazar criterios" }).click();
    await expect(
      page.getByRole("link", { name: "Alimentación mes actual" }),
    ).toHaveAttribute("href", /period=mes-anterior/);

    const otherPage = await other.newPage();
    await otherPage.goto("/historial");
    await expect(
      otherPage.getByRole("link", { name: "Alimentación mes actual" }),
    ).toHaveCount(0);
    await expect(
      otherPage.getByRole("link", { name: /Compra sintética/ }),
    ).toHaveCount(0);
  } finally {
    await other.close();
  }
});
