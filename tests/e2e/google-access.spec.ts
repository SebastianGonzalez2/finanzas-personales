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

test("Resumen no entrega el tablero ante una visita directa con sesión inválida", async ({
  page,
  request,
}) => {
  const response = await request.get("/resumen?owner_id=B", {
    headers: { cookie: "better-auth.session_token=invalid" },
    maxRedirects: 0,
  });
  expect(response.status()).toBe(307);
  expect(response.headers().location).toBe("/auth/sign-in");
  expect(response.headers()["cache-control"]).toContain("no-store");
  expect(await response.text()).not.toContain("Dinero disponible");

  await page.goto("/resumen");
  await expect(page).toHaveURL(/\/auth\/sign-in$/);
  await expect(page.getByRole("navigation")).toHaveCount(0);
  await expect(page.getByText("Resumen financiero")).toHaveCount(0);
});

test("F1-02: la ruta de saldos rechaza POST anónimo y de otro origen", async ({
  request,
}) => {
  const data = { currency: "USD", amount: "100.00", asOfDate: "2024-02-29" };
  for (const [origin, status] of [
    ["https://other.example", 403],
    ["http://localhost:3106", 401],
  ] as const) {
    const response = await request.post("/api/bank-balances", {
      data,
      headers: { origin, cookie: "better-auth.session_token=invalid" },
    });
    expect(response.status()).toBe(status);
    expect(response.headers()["cache-control"]).toBe("private, no-store");
    expect(await response.json()).toHaveProperty("error");
  }
});

test("F1-03: un movimiento requiere sesión, mismo origen y datos sin titular externo", async ({
  request,
}) => {
  const data = {
    kind: "expense",
    currency: "UYU",
    amount: "1500.0000",
    effectiveOn: "2024-02-29",
    concept: "Compra de prueba",
    method: "debit",
    idempotencyKey: "8c9c069f-679a-4d1e-b7f4-7e0408b0fadd",
  };
  for (const [origin, payload, status] of [
    ["https://other.example", data, 403],
    ["http://localhost:3106", data, 401],
    ["http://localhost:3106", { ...data, ownerId: "B" }, 400],
  ] as const) {
    const response = await request.post("/api/movements", {
      data: payload,
      headers: { origin, cookie: "better-auth.session_token=invalid" },
    });
    expect(response.status()).toBe(status);
    expect(response.headers()["cache-control"]).toBe("private, no-store");
    expect(await response.json()).toHaveProperty("error");
  }
});

test("F1-04: la revisión exige sesión y origen propios", async ({
  request,
}) => {
  const data = {
    action: "void",
    eventId: "11075139-c46d-4cb4-9a2c-92ae733e6e57",
    idempotencyKey: "e8ec105e-847e-4650-8267-3423bf72ac27",
  };
  for (const [origin, payload, status] of [
    ["https://other.example", data, 403],
    ["http://localhost:3106", data, 401],
    ["http://localhost:3106", { ...data, ownerId: "B" }, 400],
  ] as const) {
    const response = await request.patch("/api/movements", {
      data: payload,
      headers: { origin },
    });
    expect(response.status()).toBe(status);
    expect(response.headers()["cache-control"]).toBe("private, no-store");
  }
});

test("F1-05: confirmar saldo requiere sesión, mismo origen y datos sin titular externo", async ({
  request,
}) => {
  const data = {
    currency: "UYU",
    amount: "8700.0000",
    asOfDate: "2026-03-01",
    note: "Estado de cuenta de prueba",
    idempotencyKey: "8c9c069f-679a-4d1e-b7f4-7e0408b0fadd",
  };
  for (const [origin, payload, status] of [
    ["https://other.example", data, 403],
    ["http://localhost:3106", data, 401],
    ["http://localhost:3106", { ...data, ownerId: "B" }, 400],
  ] as const) {
    const response = await request.post("/api/bank-balances/adjustments", {
      data: payload,
      headers: { origin },
    });
    expect(response.status()).toBe(status);
    expect(response.headers()["cache-control"]).toBe("private, no-store");
    expect(await response.json()).toHaveProperty("error");
  }
});
