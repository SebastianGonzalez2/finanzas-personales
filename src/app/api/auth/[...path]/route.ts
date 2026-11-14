import { googleAuth, googleAuthEnabled } from "@/server/google-auth.ts";
import { googleAuthRoute } from "@/server/google-auth-route.ts";
import { logGoogleStage } from "@/server/google-diagnostics.ts";
import { handleGoogleHttp } from "@/server/google-http.ts";
import process from "node:process";
import type { PoolClient } from "pg";
import { googlePool, assertGoogleRuntime } from "@/server/google-database.ts";
export const runtime = "nodejs";
async function handle(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  return handleGoogleHttp(request, (await context.params).path, {
    enabled: googleAuthEnabled(),
    // Trust only the header written by Vercel's edge in a hosted runtime.
    trustVercelClientIp:
      process.env.VERCEL === "1" && Boolean(process.env.VERCEL_DEPLOYMENT_ID),
    origin: process.env.GOOGLE_AUTH_ORIGIN ?? "",
    // Only a predefined stage code is logged; the browser gets a generic 503.
    onFailure: (stage) => logGoogleStage(stage),
    handler: (r) =>
      googleAuthRoute<PoolClient>(r, {
        pool: () => googlePool("auth"),
        assertRuntime: (client) => assertGoogleRuntime(client, "auth"),
        auth: googleAuth,
      }),
  });
}
export { handle as GET, handle as POST };
