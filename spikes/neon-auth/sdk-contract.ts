// Contrato compilado, no ejecutado: sin red, contraseñas ni cuentas reales.
import { createNeonAuth } from "@neon/auth/next/server";
import { createAuthClient } from "@neon/auth/next";

export async function checkSdkContract(baseUrl: string, cookieSecret: string) {
  const auth = createNeonAuth({
    baseUrl,
    cookies: { secret: cookieSecret, sameSite: "lax" },
    logLevel: "silent",
  });
  const client = createAuthClient();
  const { GET, POST } = auth.handler();
  const { data, error } = await auth.getSession();
  const ownerId = error ? null : data?.user?.id;
  await client.signUp.email({
    name: "Prueba",
    email: "test@example.invalid",
    password: "fixture-only",
  });
  await client.signIn.email({
    email: "test@example.invalid",
    password: "fixture-only",
  });
  await client.signIn.social({
    provider: "google",
    callbackURL: "/auth/callback",
    additionalData: { admissionId: "fixture" },
  });
  await client.emailOtp.sendVerificationOtp({
    email: "test@example.invalid",
    type: "email-verification",
  });
  await client.emailOtp.verifyEmail({
    email: "test@example.invalid",
    otp: "000000",
  });
  await client.requestPasswordReset({
    email: "test@example.invalid",
    redirectTo: "/auth/reset-password",
  });
  await client.resetPassword({
    newPassword: "fixture-only-new",
    token: "fixture",
  });
  await auth.listSessions();
  await auth.revokeOtherSessions();
  await auth.signOut();
  return { GET, POST, ownerId };
}
