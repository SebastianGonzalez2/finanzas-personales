import { expect, test } from "@playwright/test";
test("auth cerrada por defecto, rutas privadas y webhook falso sin acceso", async ({
  page,
  request,
}) => {
  await page.goto("/auth/sign-up");
  await expect(
    page.getByRole("heading", { name: "Acceso en preparación" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.goto("/account");
  await expect(page).toHaveURL(/\/auth\/sign-in$/);
  const account = await request.get("/api/account");
  expect(account.status()).toBe(401);
  expect(account.headers()["cache-control"]).toContain("no-store");
  expect((await request.get("/api/account?owner_id=B")).status()).toBe(400);
  expect(
    (
      await request.post("/api/admission", {
        data: {
          code: "fixture",
          email: "test@example.invalid",
          provider: "credential",
        },
      })
    ).status(),
  ).toBe(503);
  expect(
    (
      await request.post("/api/auth/sign-up/email", {
        data: { email: "test@example.invalid", password: "fixture-only" },
      })
    ).status(),
  ).toBe(503);
  const webhook = await request.post("/api/webhooks/neon-auth", {
    data: { allowed: true },
  });
  expect(webhook.status()).toBe(503);
  expect((await webhook.json()).allowed).toBe(false);
});
