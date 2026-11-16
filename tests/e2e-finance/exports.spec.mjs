import { formatBankReference } from "../../src/domain/bank-balances.ts";
import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { BACKUP_MAX_BYTES } from "../../src/lib/export/backup-format.ts";
import {
  financeBrowserFixtures,
  financeTestOrigin,
} from "../support/finance-browser.mjs";
import {
  cardCommand,
  creditPayment,
  creditPurchase,
} from "../support/f2-10-fixtures.mjs";

const report = "/api/export";
const backup = "/api/account/backup";
const period = { from: "2025-03-01", to: "2025-03-31" };
const post = (context, path, data, origin = financeTestOrigin) =>
  context.request.post(path, { data, headers: { origin } });

async function opening(context) {
  const response = await post(context, "/api/bank-balances", {
    currency: "UYU",
    amount: "10000.0001",
    asOfDate: "2025-01-01",
  });
  expect(response.status()).toBe(201);
}

async function expense(context, concept, effectiveOn = "2025-03-11") {
  const response = await post(context, "/api/movements", {
    kind: "expense",
    method: "debit",
    currency: "UYU",
    amount: "12.3456",
    concept,
    effectiveOn,
    idempotencyKey: randomUUID(),
  });
  expect(response.status()).toBe(201);
}

test("F5-07 CA-061: descarga tres formatos privados y conserva las reglas contables", async ({
  page,
  context,
  browser,
}, testInfo) => {
  const { cookies } = await financeBrowserFixtures();
  const other = await browser.newContext({ baseURL: financeTestOrigin });
  try {
    await page.goto("/informes");
    await expect(page).toHaveURL(/auth\/sign-in/);
    expect(
      (await post(context, report, { ...period, format: "csv" })).status(),
    ).toBe(401);
    await context.addCookies([cookies.a1]);
    await other.addCookies([cookies.b]);
    await opening(context);
    await opening(other);
    await expense(context, '=1+2; "Compra A"');
    await expense(context, "Fuera del rango A", "2025-04-01");
    await expense(other, "Exclusiva del titular B");

    const card = await post(context, "/api/cards", cardCommand());
    expect(card.status()).toBe(201);
    const { id: cardId } = await card.json();
    const purchase = await post(
      context,
      "/api/cards/operations",
      creditPurchase({
        cardId,
        effectiveOn: "2025-03-12",
        amount: "200",
        concept: "Crédito de prueba A",
      }),
    );
    expect(purchase.status()).toBe(201);
    const payment = await post(
      context,
      "/api/cards/operations",
      creditPayment({
        cardId,
        effectiveOn: "2025-03-13",
        amount: "100",
      }),
    );
    expect(payment.status()).toBe(201);
    expect(
      (
        await post(
          context,
          report,
          { ...period, format: "csv" },
          "https://example.invalid",
        )
      ).status(),
    ).toBe(403);

    await page.goto("/informes");
    await page
      .getByRole("textbox", { name: "Desde", exact: true })
      .fill(formatBankReference(period.from));
    await page
      .getByRole("textbox", { name: "Hasta", exact: true })
      .fill(formatBankReference(period.to));
    const downloadEvent = page.waitForEvent("download");
    const exportResponse = page.waitForResponse((response) =>
      response.url().endsWith(report),
    );
    await page.getByRole("button", { name: "Exportar CSV" }).click();
    expect((await exportResponse).status()).toBe(200);
    const download = await downloadEvent;
    expect(download.suggestedFilename()).toBe(
      "finanzas-2025-03-01_2025-03-31.csv",
    );
    const csv = await readFile(await download.path(), "utf8");
    expect(csv).toContain(`"'=1+2; ""Compra A"""`);
    expect(csv).toContain('"Gasto";"UYU";"212.3456"');
    expect(csv).toContain("Pago de tarjeta");
    expect(csv).toContain("Crédito de prueba A");
    expect(csv).not.toMatch(
      /Exclusiva del titular B|Fuera del rango A|command_hash|session/,
    );
    await page.screenshot({
      path: testInfo.outputPath("informes.png"),
      fullPage: true,
    });

    for (const [format, extension, magic] of [
      ["excel", "xlsx", "PK"],
      ["pdf", "pdf", "%PDF"],
    ]) {
      const response = await post(context, report, { ...period, format });
      expect(response.status()).toBe(200);
      expect(response.headers()["cache-control"]).toBe("private, no-store");
      expect(response.headers()["content-disposition"]).toContain(
        `.${extension}"`,
      );
      const bytes = await response.body();
      expect(bytes.subarray(0, magic.length).toString()).toBe(magic);
      const path = testInfo.outputPath(`informe.${extension}`);
      await writeFile(path, bytes);
      await testInfo.attach(`informe.${extension}`, {
        path,
        contentType: response.headers()["content-type"],
      });
    }
  } finally {
    await other.close();
  }
});

test("F5-07 CA-062/063: contraseña, reemplazo explícito, cambios concurrentes y aislamiento", async ({
  page,
  context,
  browser,
}, testInfo) => {
  const { cookies } = await financeBrowserFixtures();
  const other = await browser.newContext({ baseURL: financeTestOrigin });
  const second = await browser.newContext({ baseURL: financeTestOrigin });
  try {
    await context.addCookies([cookies.a1]);
    await second.addCookies([cookies.a2]);
    await other.addCookies([cookies.b]);
    await opening(context);
    await opening(other);
    await expense(context, "Movimiento anterior A");
    await expense(other, "Movimiento privado B");
    await page.goto("/account");
    await page.getByLabel("Proteger esta copia con contraseña").check();
    const password = "copia-sintetica-f507";
    await page.getByLabel("Contraseña nueva para esta copia").fill(password);
    const downloadEvent = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Descargar copia", exact: true })
      .click();
    const download = await downloadEvent;
    const archiveText = await readFile(await download.path(), "utf8");
    expect(archiveText).not.toContain("Movimiento anterior A");
    expect(archiveText).not.toContain(password);
    const archive = JSON.parse(archiveText);
    const file = {
      name: "copia.json",
      mimeType: "application/json",
      buffer: Buffer.from(archiveText),
    };
    const preview = { action: "preview", backup: archive, password };
    const before = await post(context, backup, preview);
    expect(before.status()).toBe(200);
    const stale = await before.json();
    expect((await post(other, backup, preview)).status()).toBe(400);
    expect(
      (
        await post(context, backup, {
          ...preview,
          backup: { ...archive, tag: "AAAAAAAAAAAAAAAAAAAAAA" },
        })
      ).status(),
    ).toBe(400);

    expect(
      (
        await post(context, backup, {
          ...preview,
          backup: { ...archive, padding: "x".repeat(BACKUP_MAX_BYTES + 4097) },
        })
      ).status(),
    ).toBe(400);

    await expense(second, "Movimiento posterior A");
    const staleRestore = {
      ...preview,
      action: "restore",
      confirmation: stale.confirmation,
    };
    expect((await post(context, backup, staleRestore)).status()).toBe(409);
    const text = async (actor) =>
      (await post(actor, report, { ...period, format: "csv" })).text();
    expect(await text(context)).toContain("Movimiento posterior A");

    await page.getByLabel("Archivo de copia").setInputFiles(file);
    await page
      .getByLabel("Contraseña de la copia", { exact: true })
      .fill("contraseña-incorrecta");
    await page.getByRole("button", { name: "Verificar copia" }).click();
    await expect(
      page.getByRole("alert").filter({ hasText: "Contraseña incorrecta" }),
    ).toBeVisible();
    expect(await text(context)).toContain("Movimiento posterior A");
    await page
      .getByLabel("Contraseña de la copia", { exact: true })
      .fill(password);
    await page.getByRole("button", { name: "Verificar copia" }).click();
    await expect(
      page.getByText(/Perderás los cambios posteriores/),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Descargar una copia del estado actual" }),
    ).toBeVisible();
    const restoreButton = page.getByRole("button", {
      name: "Restaurar y reemplazar datos",
    });
    await expect(restoreButton).toBeDisabled();
    await page
      .getByLabel("Confirmo que quiero reemplazar mis datos financieros.")
      .check();
    await page.screenshot({
      path: testInfo.outputPath("confirmacion-copia.png"),
      fullPage: true,
    });
    const restoreRequest = page.waitForRequest(
      (request) =>
        request.url().endsWith(backup) &&
        request.postDataJSON().action === "restore",
    );
    await restoreButton.click();
    const body = (await restoreRequest).postDataJSON();
    await expect(
      page.getByText("Se restauró la copia de seguridad."),
    ).toBeVisible();
    expect((await post(context, backup, body)).status()).toBe(200);
    expect((await post(second, backup, body)).status()).toBe(409);
    expect(await text(second)).toContain("Movimiento anterior A");
    expect(await text(second)).not.toContain("Movimiento posterior A");
    expect(await text(other)).toContain("Movimiento privado B");
    expect(await text(other)).not.toContain("Movimiento anterior A");
  } finally {
    await other.close();
    await second.close();
  }
});
