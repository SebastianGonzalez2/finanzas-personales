import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import pg from "pg";
import { bankReferenceToday } from "../../src/domain/bank-balances.ts";
import { installmentPeriodAt } from "../../src/domain/installments.ts";
import {
  financeBrowserFixtures,
  financeTestOrigin,
} from "../support/finance-browser.mjs";
import { testDatabaseConfig } from "../support/test-database.mjs";

test.use({ actionTimeout: 5000 });

test("F5-05: partidas exactas, histórico y favoritos privados entre sesiones", async ({
  page,
  context,
  browser,
  request,
}) => {
  const { cookies, owners } = await financeBrowserFixtures();
  await context.addCookies([cookies.a1]);
  const second = await browser.newContext({ baseURL: financeTestOrigin });
  const other = await browser.newContext({ baseURL: financeTestOrigin });
  await second.addCookies([cookies.a2]);
  await other.addCookies([cookies.b]);
  const admin = new pg.Client(testDatabaseConfig());
  const today = bankReferenceToday();
  const month = today.slice(0, 7);
  const previous = installmentPeriodAt(month, -1);
  const root = randomUUID();
  const child = randomUUID();
  const concept = "Compra financiada sintética";
  const favorite = { chartId: "metrics", favorite: true };
  const post = (actor, path, data, origin = financeTestOrigin) =>
    actor.post(`/api/${path}`, { data, headers: { origin } });
  const send = (path, data) => post(context.request, path, data);
  const created = async (path, data) => {
    const response = await send(path, data);
    expect(response.status(), await response.text()).toBe(201);
    return response.json();
  };
  await admin.connect();
  try {
    await admin.query(
      `INSERT INTO finance.categories(owner_id,id,parent_id,kind,name)
      VALUES ($1,$2,NULL,'expense','Compras sintéticas'), ($1,$3,$2,'expense','Equipamiento sintético')`,
      [owners.a, root, child],
    );
    await created("bank-balances", {
      currency: "UYU",
      amount: "1000",
      asOfDate: `${previous}-01`,
    });
    const { id: cardId } = await created("cards", {
      action: "create",
      kind: "credit",
      name: "Crédito sintético",
      currencies: [{ currency: "UYU", limit: null }],
      idempotencyKey: randomUUID(),
    });
    const { id: purchaseId } = await created("cards/operations", {
      action: "purchase",
      cardId,
      currency: "UYU",
      amount: "200.0002",
      categoryId: child,
      concept,
      covered: false,
      effectiveOn: `${previous}-02`,
      idempotencyKey: randomUUID(),
      plan: { installmentAmount: "100.0001", count: 2, firstPeriod: previous },
    });
    await created("cards/operations", {
      action: "payment",
      cardId,
      effectiveOn: today,
      idempotencyKey: randomUUID(),
      lines: [
        {
          currency: "UYU",
          amount: "60",
          bankCurrency: "UYU",
          bankAmount: "60",
        },
      ],
    });
    const { id: debitPurchaseId } = await created("movements", {
      kind: "expense",
      method: "debit",
      currency: "UYU",
      amount: "40",
      effectiveOn: `${previous}-02`,
      categoryId: child,
      concept: "Compra de otro mes",
      idempotencyKey: randomUUID(),
    });
    await created("refunds", {
      action: "credit",
      purchaseId: debitPurchaseId,
      effectiveOn: today,
      idempotencyKey: randomUUID(),
      parts: [{ method: "debit", categoryId: child, amount: "15" }],
    });

    await page.goto(
      `/estadisticas?compareFrom=${previous}-01&compareTo=${previous}-02`,
    );
    const metrics = page.getByRole("table", { name: "Indicadores en UYU" });
    await expect(metrics.getByRole("row", { name: /^Gastos/ })).toContainText(
      "100,0001 UYU",
    );
    await expect(metrics.getByRole("row", { name: /^Gastos/ })).toContainText(
      "140,0001 UYU",
    );
    await expect(
      metrics.getByRole("row", { name: /^Devoluciones/ }),
    ).toContainText("15,00 UYU");
    await expect(page.getByText(/Muestra insuficiente/)).toBeVisible();
    const positions = page.getByRole("table", {
      name: "Saldos y patrimonio por fecha",
    });
    const current = positions.getByRole("row", { name: /Período elegido/ });
    await expect(current).toContainText("915,00 UYU");
    await expect(current).toContainText("140,0002 UYU");
    await expect(current).toContainText("774,9998 UYU");
    await expect(
      positions.getByRole("row", { name: /Comparación/ }),
    ).toContainText("759,9998 UYU");
    await page
      .getByText("Ver evolución de saldos y patrimonio", { exact: true })
      .click();
    await expect(
      page
        .locator("figcaption")
        .filter({ hasText: "Patrimonio registrado · UYU" }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () =>
          globalThis.document.documentElement.scrollWidth <=
          globalThis.innerWidth,
      ),
    ).toBe(true);

    await page
      .getByRole("link", { name: "Compras sintéticas", exact: true })
      .click();
    await page
      .getByRole("link", { name: "Equipamiento sintético", exact: true })
      .click();
    const entry = page.getByRole("link", { name: new RegExp(concept) });
    await expect(entry).toContainText("100,0001 UYU");
    await expect(entry).toHaveAttribute(
      "href",
      `/historial/movimientos/${purchaseId}#titulo-pagina`,
    );
    await page
      .getByRole("combobox", { name: "Tarjeta", exact: true })
      .selectOption({ label: "Crédito sintético" });
    await page.getByRole("button", { name: "Aplicar filtros" }).click();
    await expect(page).toHaveURL(new RegExp(`card=${cardId}`));
    await expect(entry).toBeVisible();

    expect(
      (await post(request, "statistics-favorites", favorite)).status(),
    ).toBe(401);
    expect(
      (
        await post(
          context.request,
          "statistics-favorites",
          favorite,
          "https://otro.invalid",
        )
      ).status(),
    ).toBe(403);
    expect(
      (
        await send("statistics-favorites", { ...favorite, ownerId: owners.b })
      ).status(),
    ).toBe(400);
    const responses = await Promise.all([
      send("statistics-favorites", favorite),
      post(second.request, "statistics-favorites", favorite),
    ]);
    for (const response of responses) {
      expect(response.status()).toBe(200);
      expect(response.headers()["cache-control"]).toBe("private, no-store");
      expect((await response.json()).favorites).toEqual(["metrics"]);
    }
    await admin.query("BEGIN");
    try {
      await admin.query("SET LOCAL ROLE finanzas_app");
      await admin.query("SELECT set_config('finance.owner_id', $1, true)", [
        owners.b,
      ]);
      expect(
        (await admin.query("SELECT chart_id FROM finance.statistics_favorites"))
          .rows,
      ).toEqual([]);
      expect(
        (
          await admin.query(
            "DELETE FROM finance.statistics_favorites WHERE owner_id = $1",
            [owners.a],
          )
        ).rowCount,
      ).toBe(0);
      await expect(
        admin.query(
          "INSERT INTO finance.statistics_favorites (owner_id, chart_id) VALUES ($1, 'history')",
          [owners.a],
        ),
      ).rejects.toMatchObject({ code: "42501" });
    } finally {
      await admin.query("ROLLBACK");
    }
    const saved = await second.newPage();
    await saved.goto("/estadisticas");
    await expect(
      saved.getByRole("link", { name: "Mis favoritos" }),
    ).toHaveAttribute("aria-current", "page");
    await expect(
      saved.getByRole("heading", { name: "Resumen inteligente" }),
    ).toHaveCount(0);
    await saved.goto("/resumen");
    await expect(
      saved.getByRole("list", { name: "Gastos del mes" }),
    ).toHaveText("100,0001 UYU");
    await expect(
      saved.getByRole("link", { name: "Mis favoritos" }),
    ).toHaveCount(0);
    await saved.goto("/estadisticas");
    const isolated = await other.newPage();
    await isolated.goto(
      `/estadisticas?category=${child}&card=${cardId}&view=favoritos`,
    );
    await expect(
      isolated.getByText(/Todavía no elegiste estadísticas favoritas/),
    ).toBeVisible();
    await isolated.goto(`/estadisticas?category=${child}&card=${cardId}`);
    await expect(isolated.getByText(concept, { exact: true })).toHaveCount(0);
    await expect(
      isolated.getByRole("link", { name: "Todas las estadísticas" }),
    ).toHaveAttribute("aria-current", "page");
    await saved
      .getByRole("button", {
        name: "Quitar Indicadores del período de favoritos",
      })
      .click();
    await expect(
      saved.getByRole("button", {
        name: "Añadir Indicadores del período a favoritos",
      }),
    ).toBeVisible();
  } finally {
    await admin.end();
    await second.close();
    await other.close();
  }
});
