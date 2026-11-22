import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import {
  financeBrowserFixtures,
  financeTestOrigin,
} from "../support/finance-browser.mjs";

const reset = "/api/account/reset";
const post = (context, path, data, origin = financeTestOrigin) =>
  context.request.post(path, { data, headers: { origin } });
const opening = (context, amount) =>
  post(context, "/api/movements", {
    kind: "expense",
    method: "debit",
    currency: "UYU",
    amount,
    concept: "Gasto de prueba del reinicio",
    effectiveOn: "2025-01-01",
    idempotencyKey: randomUUID(),
  });
const expense = (context, concept) =>
  post(context, "/api/movements", {
    kind: "expense",
    method: "debit",
    currency: "UYU",
    amount: "12.3456",
    concept,
    effectiveOn: "2025-01-02",
    idempotencyKey: randomUUID(),
  });

test("OPS-RESET: reinicia desde Mi cuenta sin pedir copia y permite volver a registrar datos", async ({
  page,
  context,
  browser,
}, testInfo) => {
  const { cookies, owners } = await financeBrowserFixtures();
  const other = await browser.newContext({ baseURL: financeTestOrigin });
  const second = await browser.newContext({ baseURL: financeTestOrigin });
  try {
    expect(
      (
        await post(context, reset, { action: "prepare", proof: "0".repeat(64) })
      ).status(),
    ).toBe(401);
    await context.addCookies([cookies.a1]);
    await other.addCookies([cookies.b]);
    await second.addCookies([cookies.a2]);
    expect((await opening(context, "1000.0100")).status()).toBe(201);
    expect((await opening(other, "2000.0200")).status()).toBe(201);
    expect(
      (await expense(context, "Gasto sintético para reiniciar")).status(),
    ).toBe(201);
    expect(
      (await expense(other, "Gasto sintético del otro titular")).status(),
    ).toBe(201);

    const backups = [];
    page.on("request", (request) => {
      if (request.url().endsWith("/api/account/backup")) backups.push(request);
    });
    await page.goto("/account");
    const section = page.getByRole("region", { name: "Reiniciar datos" });
    const open = section.getByRole("button", { name: "Reiniciar mis datos" });
    const confirm = section.getByLabel("Escribí REINICIAR para confirmar");
    const submit = section.getByRole("button", {
      name: "Borrar mis datos y empezar de cero",
    });
    const preparing = page.waitForRequest((request) =>
      request.url().endsWith(reset),
    );
    await open.click();
    const prepareBody = (await preparing).postDataJSON();
    expect((await post(other, reset, prepareBody)).status()).toBe(409);
    expect(
      (
        await post(context, reset, prepareBody, "https://example.invalid")
      ).status(),
    ).toBe(403);
    expect(
      (
        await post(context, reset, { ...prepareBody, ownerId: owners.b })
      ).status(),
    ).toBe(400);
    await expect(confirm).toBeFocused();
    await expect(submit).toBeDisabled();
    await confirm.fill("REINICIAR");
    await section.getByRole("button", { name: "Cancelar" }).click();
    await expect(open).toBeFocused();

    await open.click();
    await expect(confirm).toHaveValue("");
    await confirm.fill("REINICIAR");
    await section.screenshot({
      path: testInfo.outputPath("confirmar-reinicio.png"),
    });
    const sending = page.waitForRequest((request) =>
      request.url().endsWith(reset),
    );
    const completing = page.waitForResponse((response) =>
      response.url().endsWith(reset),
    );
    await submit.click();
    const confirmed = (await sending).postDataJSON();
    const response = await completing;
    expect(response.status()).toBe(200);
    expect(response.headers()["cache-control"]).toBe("private, no-store");
    expect(response.headers()["set-cookie"]).toBeUndefined();
    await expect(section.getByRole("status")).toHaveText(
      "Reiniciaste tus datos. Ya podés empezar de cero.",
    );
    expect(backups).toHaveLength(0);

    await section.getByRole("link", { name: "Ir a Resumen" }).click();
    await expect(page).toHaveURL(/resumen$/);
    await expect(
      page.getByText("Todavía no hay gastos registrados."),
    ).toBeVisible();
    const secondPage = await second.newPage();
    await secondPage.goto("/account");
    await expect(
      secondPage.getByRole("heading", { name: "Tu cuenta está conectada" }),
    ).toBeVisible();
    expect((await opening(second, "3000.0000")).status()).toBe(201);
    expect(
      (await expense(second, "Primer gasto después del reinicio")).status(),
    ).toBe(201);
    expect((await post(context, reset, confirmed)).status()).toBe(409);
    const otherPage = await other.newPage();
    await otherPage.goto("/historial");
    await expect(
      otherPage
        .getByText("Gasto sintético del otro titular", { exact: true })
        .first(),
    ).toBeVisible();
  } finally {
    await other.close();
    await second.close();
  }
});
