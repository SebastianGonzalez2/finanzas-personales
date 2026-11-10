import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { bankReferenceToday } from "../../src/domain/bank-balances.ts";
import {
  financeBrowserFixtures,
  financeTestOrigin,
} from "../support/finance-browser.mjs";

test("F3-01: confirma reservas, traspasos y liberaciones sin afectar Bancos ni gastos", async ({
  page,
  context,
  browser,
}) => {
  const { cookies } = await financeBrowserFixtures();
  await context.addCookies([cookies.a1]);
  const post = (route, data, client = context.request) =>
    client.post(`/api/${route}`, {
      data,
      headers: { origin: financeTestOrigin },
    });
  expect(
    (
      await post("bank-balances", {
        currency: "UYU",
        amount: "10000",
        asOfDate: bankReferenceToday(),
      })
    ).status(),
  ).toBe(201);

  await page.goto("/fondos");
  await page.getByRole("button", { name: "Agregar fondo" }).click();
  await page.getByLabel("Nombre").fill("Vacaciones F3-01");
  await page.getByRole("button", { name: "Crear fondo" }).click();
  await expect(
    page.getByRole("heading", { name: "Vacaciones F3-01" }),
  ).toBeVisible();
  expect(
    (
      await post("funds", {
        action: "create",
        name: "Emergencia F3-01",
        currency: "UYU",
        idempotencyKey: randomUUID(),
      })
    ).status(),
  ).toBe(201);
  await page.reload();

  async function move(button, amount, preview, destination) {
    await page.getByRole("button", { name: button }).click();
    await page.getByLabel("Importe (UYU)").fill(amount);
    if (destination)
      await page
        .getByLabel("Fondo de destino")
        .selectOption({ label: destination });
    await page.getByRole("button", { name: "Revisar operación" }).click();
    await expect(page.getByText(preview)).toBeVisible();
    const response = page.waitForResponse((item) =>
      item.url().endsWith("/api/funds"),
    );
    await page.getByRole("button", { name: "Confirmar operación" }).click();
    const saved = await response;
    expect(saved.status()).toBe(200);
    expect(saved.headers()["cache-control"]).toBe("private, no-store");
    return saved.request().postDataJSON();
  }

  const command = await move(
    "Reservar en Vacaciones F3-01",
    "3000",
    "Reservar 3.000,00 UYU en Vacaciones F3-01.",
  );
  await expect(page.getByText("7.000,00 UYU", { exact: true })).toBeVisible();
  await expect(page.getByText("3.000,00 UYU", { exact: true })).toBeVisible();
  await move(
    "Traspasar desde Vacaciones F3-01",
    "1000,0001",
    "Traspasar 1.000,0001 UYU desde Vacaciones F3-01 hacia Emergencia F3-01.",
    "Emergencia F3-01",
  );
  await expect(page.getByText("1.000,0001 UYU", { exact: true })).toBeVisible();
  await expect(page.getByText("7.000,00 UYU", { exact: true })).toBeVisible();
  await move(
    "Liberar de Vacaciones F3-01",
    "500,0002",
    "Liberar 500,0002 UYU de Vacaciones F3-01.",
  );
  await expect(page.getByText("7.500,0002 UYU", { exact: true })).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        globalThis.document.documentElement.scrollWidth <=
        globalThis.innerWidth,
    ),
  ).toBe(true);

  await page.goto("/resumen");
  await expect(
    page.getByRole("list", { name: "Saldos bancarios por moneda" }),
  ).toContainText("10.000,00 UYU");
  await expect(
    page.getByText("Los gastos registrados aparecerán acá."),
  ).toBeVisible();

  const other = await browser.newContext({ baseURL: financeTestOrigin });
  try {
    expect((await post("funds", command, other.request)).status()).toBe(401);
    await other.addCookies([cookies.b]);
    expect((await post("funds", command, other.request)).status()).toBe(404);
    const otherPage = await other.newPage();
    await otherPage.goto("/fondos");
    await expect(
      otherPage.getByText("Todavía no tenés fondos de ahorro."),
    ).toBeVisible();
    await expect(otherPage.getByText("Vacaciones F3-01")).toHaveCount(0);
  } finally {
    await other.close();
  }
});
