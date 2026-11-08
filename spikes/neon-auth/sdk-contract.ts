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
  // HTTP query avoids the boolean/string cache mismatch in SDK 0.8.2.
  // Compile-only: not mounted in the application and not an admission guard.
  const readFreshSession = (request: Request) => {
    const url = new URL(request.url);
    url.search = "?disableCookieCache=true";
    return GET(
      new Request(url, {
        method: "GET",
        headers: { cookie: request.headers.get("cookie") ?? "" },
        signal: AbortSignal.timeout(10_000),
      }),
      { params: Promise.resolve({ path: ["get-session"] }) },
    );
  };
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
  return { GET, POST, ownerId, readFreshSession };
}
