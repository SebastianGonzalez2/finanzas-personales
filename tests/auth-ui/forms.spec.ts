import { expect, test } from "@playwright/test";
test("formularios accesibles sin enviar datos al proveedor", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const mutations: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST") mutations.push(request.url());
  });
  await page.goto("/auth/sign-up");
  await expect(
    page.getByRole("heading", { name: "Crear cuenta" }),
  ).toBeVisible();
  await page.getByLabel("Correo electrónico").fill("synthetic@example.invalid");
  await page.getByRole("button", { name: "Continuar con Google" }).click();
  await expect(page.getByLabel("Código de invitación")).toBeFocused();
  expect(mutations).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.goto("/auth/verify-email");
  await expect(page.getByLabel("Código de verificación")).toHaveAttribute(
    "autocomplete",
    "one-time-code",
  );
  await expect(
    page.getByRole("button", { name: "Reenviar código" }),
  ).toBeVisible();
  await page.goto("/auth/forgot-password");
  await expect(
    page.getByRole("heading", { name: "Recuperar contraseña" }),
  ).toBeVisible();
  await page.goto("/auth/reset-password");
  await expect(page.getByLabel("Contraseña")).toHaveAttribute(
    "autocomplete",
    "new-password",
  );
  expect(errors).toEqual([]);
  expect(mutations).toEqual([]);
});
