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

test("QA-F02: Estadísticas autoriza antes de validar filtros", async ({
  page,
  context,
}) => {
  const path = "/estadisticas";
  const invalid = path + "?from=no-es-fecha";
  for (const url of [path, path + "?display=original", invalid]) {
    const response = await page.request.get(url, { maxRedirects: 0 });
    expect(response.status()).toBe(307);
    expect(response.headers().location).toBe("/auth/sign-in");
    await page.goto(url);
    await expect(page).toHaveURL(/\/auth\/sign-in$/);
    await expect(
      page.getByRole("heading", { name: "Estadísticas" }),
    ).toHaveCount(0);
    await expect(page.getByText(/Revisá los filtros/)).toHaveCount(0);
    await expect(
      page.getByRole("navigation", {
        name: /Navegación principal|Accesos rápidos/,
      }),
    ).toHaveCount(0);
  }

  const { cookies } = await financeBrowserFixtures();
  await context.addCookies([cookies.a1]);
  await page.goto(invalid);
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "Revisá los filtros",
  );
  await page.getByRole("link", { name: "Volver a estadísticas" }).click();
  await expect(page).toHaveURL(/\/estadisticas$/);
  await expect(
    page.getByRole("heading", { name: "Estadísticas" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Aplicar filtros" }),
  ).toBeVisible();
});

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
    // SIMP-03: la aplicación es solo de gastos; sin saldos, tarjetas ni devoluciones.
    const { id: purchaseId } = await created("movements", {
      kind: "expense",
      currency: "UYU",
      amount: "100",
      effectiveOn: today,
      categoryId: child,
      concept,
      idempotencyKey: randomUUID(),
    });
    await created("movements", {
      kind: "expense",
      currency: "UYU",
      amount: "100",
      effectiveOn: `${previous}-02`,
      categoryId: child,
      concept: "Compra anterior",
      idempotencyKey: randomUUID(),
    });
    await created("movements", {
      kind: "expense",
      currency: "UYU",
      amount: "40",
      effectiveOn: `${previous}-02`,
      categoryId: child,
      concept: "Compra de otro mes",
      idempotencyKey: randomUUID(),
    });

    await page.goto(
      `/estadisticas?display=original&compareFrom=${previous}-01&compareTo=${previous}-02`,
    );
    const metrics = page.getByRole("table", { name: "Indicadores en UYU" });
    await expect(metrics.getByRole("row", { name: /^Gastos/ })).toContainText(
      "100,00 UYU",
    );
    await expect(metrics.getByRole("row", { name: /^Gastos/ })).toContainText(
      "140,00 UYU",
    );
    await expect(page.getByText(/Muestra insuficiente/)).toBeVisible();
    await expect(page.getByText(/Marcá con una estrella/)).toBeVisible();
    // Sin desborde horizontal; si falla, lista los elementos que se salen.
    expect(
      await page.evaluate(() => {
        const { document, innerWidth, getComputedStyle } = globalThis;
        if (document.documentElement.scrollWidth <= innerWidth) return [];
        // Solo elementos que ningún contenedor con desplazamiento recorta.
        const clipped = (element) => {
          for (let parent = element.parentElement; parent;) {
            if (getComputedStyle(parent).overflowX !== "visible") return true;
            parent = parent.parentElement;
          }
          return false;
        };
        return [...document.querySelectorAll("main *")]
          .filter(
            (element) =>
              element.getBoundingClientRect().right > innerWidth + 1 &&
              !clipped(element),
          )
          .slice(0, 15)
          .map(
            (element) =>
              `${element.tagName}.${String(element.className?.baseVal ?? element.className).slice(0, 60)} ${Math.round(element.getBoundingClientRect().right)}/${innerWidth}`,
          );
      }),
    ).toEqual([]);

    await page
      .getByRole("link", { name: "Compras sintéticas", exact: true })
      .click();
    await page
      .getByRole("link", { name: "Equipamiento sintético", exact: true })
      .click();
    // El detalle de la categoría padre ya lista este movimiento y el
    // formulario de filtros se remonta (key) con cada búsqueda: hay que
    // esperar a que la navegación a la subcategoría termine antes de elegir
    // la tarjeta, o la selección se pierde con el formulario anterior.
    await expect(page).toHaveURL(new RegExp(`category=${child}`));
    await expect(
      page.getByRole("heading", {
        name: "Detalle de movimientos · Equipamiento sintético",
      }),
    ).toBeVisible();
    const entry = page.getByRole("link", { name: new RegExp(concept) });
    await expect(entry).toContainText("100,00 UYU");
    await expect(entry).toHaveAttribute(
      "href",
      `/historial/movimientos/${purchaseId}#titulo-pagina`,
    );
    const unknownTag = randomUUID();
    await page.goto(`/estadisticas?tag=${unknownTag}`);
    await page.getByText(/Filtrar por etiquetas/).click();
    await expect(
      page.getByRole("checkbox", { name: "Etiqueta no disponible" }),
    ).toBeChecked();
    await expect(entry).toHaveCount(0);
    await page.getByRole("link", { name: "Limpiar filtros" }).click();
    await expect(page).not.toHaveURL(/tag=/);

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
      saved.getByRole("region", { name: "Gastos del mes" }),
    ).toContainText("100,00");
    await expect(
      saved.getByRole("link", { name: "Mis favoritos" }),
    ).toHaveCount(0);
    await saved.goto("/estadisticas");
    const isolated = await other.newPage();
    await isolated.goto(`/estadisticas?category=${child}&view=favoritos`);
    await expect(
      isolated.getByText(/Todavía no elegiste estadísticas favoritas/),
    ).toBeVisible();
    await isolated.goto(`/estadisticas?category=${child}`);
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
