import { googleAuth, googleAuthEnabled } from "@/server/google-auth.ts";
import { handleGoogleHttp } from "@/server/google-http.ts";
import process from "node:process";
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
    handler: async (r) => {
      const client = await googlePool("auth").connect();
      try {
        await assertGoogleRuntime(client, "auth");
      } finally {
        client.release();
      }
      return googleAuth().handler(r);
    },
  });
}
export { handle as GET, handle as POST };
