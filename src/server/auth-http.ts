import "server-only";
import { authEnabled, appOrigin, neonAuth } from "./auth.ts";
import {
  authInput,
  readLimitedBody,
  requireSameOrigin,
} from "./auth-policy.ts";

export const privateHeaders = {
  "Cache-Control": "private, no-store",
  Pragma: "no-cache",
};
export function authFailure(status = 403) {
  return Response.json(
    { error: "No se pudo completar la solicitud." },
    { status, headers: privateHeaders },
  );
}
const postPaths = new Set([
  "sign-up/email",
  "sign-in/email",
  "sign-in/social",
  "sign-out",
  "email-otp/send-verification-otp",
  "email-otp/verify-email",
  "request-password-reset",
  "reset-password",
  "revoke-session",
  "revoke-other-sessions",
]);
export async function handleAuth(request: Request, path: string[]) {
  if (!authEnabled()) return authFailure(503);
  const joined = path.join("/");
  if (
    !(request.method === "GET" && joined === "get-session") &&
    !(request.method === "POST" && postPaths.has(joined))
  )
    return authFailure(404);
  try {
    const url = new URL(request.url);
    let body: string | undefined;
    if (request.method === "POST") {
      requireSameOrigin(request, appOrigin());
      if (!request.headers.get("content-type")?.startsWith("application/json"))
        return authFailure(415);
      const input = authInput(
        joined,
        JSON.parse(await readLimitedBody(request)),
        appOrigin(),
      );
      body = JSON.stringify(input);
    }
    if (joined === "get-session") url.search = "?disableCookieCache=true";
    else url.search = "";
    const headers = new Headers({
      cookie: request.headers.get("cookie") ?? "",
    });
    if (body) {
      headers.set("content-type", "application/json");
      headers.set("origin", appOrigin());
    }
    const forwarded = new Request(url, {
      method: request.method,
      headers,
      body,
      signal: AbortSignal.timeout(8000),
    });
    const handlers = neonAuth().handler();
    const response = await (
      request.method === "GET" ? handlers.GET : handlers.POST
    )(forwarded, { params: Promise.resolve({ path }) });
    const output = new Headers(response.headers);
    for (const [key, value] of Object.entries(privateHeaders))
      output.set(key, value);
    // Match responses for existing/unknown recovery addresses, including provider errors.
    if (joined === "request-password-reset")
      return Response.json({ status: true }, { headers: privateHeaders });
    return new Response(response.body, {
      status: response.status,
      headers: output,
    });
  } catch {
    if (joined === "request-password-reset")
      return Response.json({ status: true }, { headers: privateHeaders });
    return authFailure(503);
  }
}
