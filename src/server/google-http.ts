import { isIP } from "node:net";
import { authOrigin, limitedJson } from "./google-policy.ts";

export const googleClientIpHeader = "x-vercel-forwarded-for";
export const googlePrivateHeaders = {
  "Cache-Control": "private, no-store",
  Pragma: "no-cache",
};
const failure = (status: number) =>
  Response.json(
    { error: "No se pudo completar el acceso." },
    { status, headers: googlePrivateHeaders },
  );
export async function handleGoogleHttp(
  request: Request,
  path: string[],
  dependencies: {
    enabled: boolean;
    origin: string;
    trustVercelClientIp?: boolean;
    handler: (r: Request) => Promise<Response>;
  },
) {
  const joined = path.join("/");
  if (!(
    (request.method === "GET" && joined === "callback/google") ||
    (request.method === "POST" &&
      ["sign-in/social", "sign-out"].includes(joined))
  ))
    return failure(404);
  if (!dependencies.enabled) return failure(503);
  try {
    const origin = authOrigin(dependencies.origin);
    const clientIp = dependencies.trustVercelClientIp
      ? request.headers.get(googleClientIpHeader)
      : null;
    const headers = new Headers(request.headers);
    headers.delete(googleClientIpHeader);
    if (clientIp && isIP(clientIp)) headers.set(googleClientIpHeader, clientIp);
    let forward: Request;
    if (request.method === "POST") {
      if (
        request.headers.get("origin") !== origin ||
        request.headers.get("sec-fetch-site") === "cross-site"
      )
        return failure(403);
      const input = await limitedJson(request);
      if (!input || typeof input !== "object" || Array.isArray(input))
        return failure(400);
      if (
        joined === "sign-in/social" &&
        (input.provider !== "google" ||
          Object.keys(input).some((k) => k !== "provider"))
      )
        return failure(400);
      if (joined === "sign-out" && Object.keys(input).length)
        return failure(400);
      const body =
        joined === "sign-in/social"
          ? {
              provider: "google",
              callbackURL: `${origin}/resumen`,
              newUserCallbackURL: `${origin}/resumen`,
              errorCallbackURL: `${origin}/auth/sign-in`,
            }
          : {};
      const url = new URL(request.url);
      url.search = "";
      const postHeaders = new Headers({
        "content-type": "application/json",
        origin,
        cookie: request.headers.get("cookie") ?? "",
      });
      const trustedIp = headers.get(googleClientIpHeader);
      if (trustedIp) postHeaders.set(googleClientIpHeader, trustedIp);
      forward = new Request(url, {
        method: "POST",
        headers: postHeaders,
        body: JSON.stringify(body),
      });
    } else {
      forward = new Request(request, { headers });
    }
    const response = await dependencies.handler(forward);
    const responseHeaders = new Headers(response.headers);
    for (const [k, v] of Object.entries(googlePrivateHeaders))
      responseHeaders.set(k, v);
    return new Response(response.body, {
      status: response.status,
      headers: responseHeaders,
    });
  } catch {
    return failure(503);
  }
}
