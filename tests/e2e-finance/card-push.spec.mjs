import { createECDH, randomBytes, randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import {
  financeBrowserFixtures,
  financeTestOrigin,
} from "../support/finance-browser.mjs";

test("F4-05: activar y desactivar push en Avisos requiere gesto, sesión y titular", async ({
  page,
  context,
  browser,
}, testInfo) => {
  const { cookies } = await financeBrowserFixtures();
  const other = await browser.newContext({ baseURL: financeTestOrigin });
  const key = createECDH("prime256v1");
  const subscription = {
    endpoint: `https://fcm.googleapis.com/fcm/send/${randomUUID()}`,
    expirationTime: null,
    keys: {
      p256dh: key.generateKeys("base64url"),
      auth: randomBytes(16).toString("base64url"),
    },
  };
  const status = { action: "status", endpoint: subscription.endpoint };
  const post = (actor, data, origin = financeTestOrigin) =>
    actor.request.post("/api/avisos/push", { data, headers: { origin } });

  try {
    expect((await post(other, status)).status()).toBe(401);
    expect((await other.request.get("/api/cron/card-push")).status()).toBe(401);
    await other.addCookies([cookies.b]);
    await context.addCookies([cookies.a1]);
    expect(
      (await post(context, status, "https://cross-site.example")).status(),
    ).toBe(403);

    await page.addInitScript((fixture) => {
      const subscription = { ...fixture, toJSON: () => fixture };
      Object.defineProperty(globalThis.Notification, "permission", {
        get: () =>
          globalThis.sessionStorage.getItem("fixture-subscribed")
            ? "granted"
            : "default",
      });
      globalThis.PushManager.prototype.getSubscription = async () =>
        globalThis.sessionStorage.getItem("fixture-subscribed")
          ? subscription
          : null;
      globalThis.PushManager.prototype.subscribe = async () => {
        globalThis.sessionStorage.setItem("fixture-subscribed", "yes");
        return subscription;
      };
    }, subscription);
    await page.goto("/avisos");
    const panel = page.getByRole("region", {
      name: "Avisos al celular (opcional)",
    });
    const enable = panel.getByRole("button", {
      name: "Activar avisos push",
      exact: true,
    });
    await expect(enable).toBeVisible();
    expect(
      await page.evaluate(() =>
        globalThis.sessionStorage.getItem("fixture-subscribed"),
      ),
    ).toBeNull();
    await enable.click();
    await expect(panel.getByRole("status")).toHaveText(
      "Activados en este dispositivo.",
    );
    await page.screenshot({
      path: testInfo.outputPath("F4-05-avisos.png"),
      fullPage: true,
    });

    const foreign = await post(other, status);
    expect(foreign.status()).toBe(200);
    expect(await foreign.json()).toEqual({ enabled: false });
    expect(
      (await post(other, { action: "enable", subscription })).status(),
    ).toBe(409);
    expect((await post(other, { ...status, action: "disable" })).status()).toBe(
      200,
    );
    expect(await (await post(context, status)).json()).toEqual({
      enabled: true,
    });

    await page.reload();
    const disable = panel.getByRole("button", {
      name: "Desactivar avisos push",
    });
    await expect(disable).toBeVisible();
    await disable.click();
    await expect(panel.getByRole("status")).toHaveText(
      "Desactivados en este dispositivo.",
    );
    expect(await (await post(context, status)).json()).toEqual({
      enabled: false,
    });
    await expect(
      page.getByRole("heading", { name: "Deudas y préstamos" }),
    ).toBeVisible();
  } finally {
    await other.close();
  }
});
