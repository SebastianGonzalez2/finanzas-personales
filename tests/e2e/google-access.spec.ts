import { expect, test } from "@playwright/test";
test("Google-only cerrado: sin contraseñas ni rutas heredadas; API financiera anónima denegada", async ({
  page,
  request,
}) => {
  await page.goto("/auth/sign-in");
  await expect(
    page.getByRole("heading", { name: "Tu espacio personal" }),
  ).toBeVisible();
  await expect(page.getByRole("status")).toHaveText(
    "Estamos preparando el acceso con Google.",
  );
  await expect(page.locator("input")).toHaveCount(0);
  await expect(page.getByText(/contraseña|OTP|invitación/i)).toHaveCount(0);
  expect((await request.get("/api/account")).status()).toBe(401);
  expect((await request.get("/api/account?owner_id=B")).status()).toBe(400);
  for (const path of [
    "sign-up/email",
    "sign-in/email",
    "reset-password",
    "email-otp/verify-email",
    "link-social",
  ])
    expect(
      (await request.post(`/api/auth/${path}`, { data: {} })).status(),
    ).toBe(404);
  expect(
    (
      await request.post("/api/auth/sign-in/social", {
        data: { provider: "google" },
      })
    ).status(),
  ).toBe(503);
  await page.goto("/account");
  await expect(page).toHaveURL(/\/auth\/sign-in$/);
});
