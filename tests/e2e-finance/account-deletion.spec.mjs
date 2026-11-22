import { randomUUID } from "node:crypto";
import { Buffer } from "node:buffer";
import { gunzipSync } from "node:zlib";
import { expect, test } from "@playwright/test";
import {
  financeBrowserFixtures,
  financeTestOrigin,
} from "../support/finance-browser.mjs";

const deletion = "/api/account/delete";
const backup = "/api/account/backup";
const post = (context, path, data, origin = financeTestOrigin) =>
  context.request.post(path, { data, headers: { origin } });

test("F5-08 RF-049: confirmación, copia opcional y revocación A/B", async ({
  page,
  context,
  browser,
}, testInfo) => {
  const { cookies, owners } = await financeBrowserFixtures();
  const other = await browser.newContext({ baseURL: financeTestOrigin });
  const second = await browser.newContext({ baseURL: financeTestOrigin });
  try {
    const body = { confirmation: "ELIMINAR", proof: "0".repeat(64) };
    expect((await post(context, deletion, body)).status()).toBe(401);
    await context.addCookies([cookies.a1]);
    await second.addCookies([cookies.a2]);
    await other.addCookies([cookies.b]);
    for (const [browserContext, amount] of [
      [context, "1000.0123"],
      [other, "2000.0456"],
    ]) {
      const response = await post(browserContext, "/api/movements", {
        kind: "expense",
        method: "debit",
        currency: "UYU",
        amount,
        concept: "Gasto sintético con importe exacto",
        effectiveOn: "2025-01-01",
        idempotencyKey: randomUUID(),
      });
      expect(response.status()).toBe(201);
    }
    expect(
      (await post(context, deletion, body, "https://example.invalid")).status(),
    ).toBe(403);
    expect(
      (await post(context, deletion, { ...body, ownerId: owners.b })).status(),
    ).toBe(400);

    await page.goto("/account");
    const section = page.getByRole("region", { name: "Eliminar cuenta" });
    await section
      .getByRole("link", { name: "Descargar copia de seguridad" })
      .click();
    await expect(page).toHaveURL(/#descargar-copia$/);
    const open = section.getByRole("button", {
      name: "Eliminar mi cuenta y mis datos",
    });
    const confirm = section.getByLabel("Escribí ELIMINAR para confirmar");
    const remove = section.getByRole("button", {
      name: "Eliminar definitivamente",
    });
    await open.click();
    await expect(confirm).toBeFocused();
    await expect(remove).toBeDisabled();
    await confirm.fill("ELIMINAR");
    await section.getByRole("button", { name: "Cancelar" }).click();
    await expect(open).toBeFocused();
    await open.click();
    await expect(confirm).toHaveValue("");
    await confirm.fill("ELIMINAR");
    await section.screenshot({
      path: testInfo.outputPath("eliminar-cuenta.png"),
    });

    // Intercept before sending to verify that a stale tab cannot delete the
    // currently logged-in account on a shared browser.
    let responseForOther;
    await page.route(
      `**${deletion}`,
      async (route) => {
        responseForOther = await post(
          other,
          deletion,
          route.request().postDataJSON(),
        );
        await route.fulfill({ response: responseForOther });
      },
      { times: 1 },
    );
    await remove.click();
    await expect(section.getByRole("alert")).toContainText("La sesión cambió");
    expect(responseForOther.status()).toBe(409);
    const result = page.waitForResponse((response) =>
      response.url().endsWith(deletion),
    );
    await remove.click();
    const response = await result;
    expect(response.status()).toBe(200);
    expect(response.headers()["cache-control"]).toBe("private, no-store");
    await expect(page).toHaveURL(/auth\/sign-in\?cuenta=eliminada/);
    await expect(
      page.getByRole("status").filter({ hasText: "Eliminaste tu cuenta" }),
    ).toBeVisible();
    expect(
      (await context.cookies()).some(({ name }) => name === cookies.a1.name),
    ).toBe(false);
    expect((await post(second, backup, { action: "download" })).status()).toBe(
      401,
    );
    const secondPage = await second.newPage();
    await secondPage.goto("/account");
    await expect(secondPage).toHaveURL(/auth\/sign-in/);
    const otherCopy = await post(other, backup, { action: "download" });
    expect(otherCopy.status()).toBe(200);
    const { signed } = await otherCopy.json();
    const payload = gunzipSync(
      Buffer.from(JSON.parse(signed).data, "base64url"),
    ).toString();
    expect(payload).toContain("2000.0456");
    expect(payload).not.toContain("1000.0123");
  } finally {
    await other.close();
    await second.close();
  }
});
