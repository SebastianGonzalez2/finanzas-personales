import { isIP } from "node:net";
import { authOrigin, limitedJson } from "./google-policy.ts";
import { googleStageOf, type GoogleStage } from "./google-diagnostics.ts";

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
    // Diagnóstico privado: recibe solo un código de etapa predefinido.
    onFailure?: (stage: GoogleStage) => void;
  },
) {
  const joined = path.join("/");
  if (!(
    (request.method === "GET" && joined === "callback/google") ||
    (request.method === "POST" &&
      ["sign-in/social", "sign-out"].includes(joined))
  ))
    return failure(404);
  const report = (stage: GoogleStage) => {
    try {
      dependencies.onFailure?.(stage);
    } catch {
      // El diagnóstico nunca debe alterar la respuesta.
    }
  };
  if (!dependencies.enabled) {
    report("request.disabled");
    return failure(503);
  }
  let step: GoogleStage = "request.origin";
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
      step = "request.body";
      let input: Awaited<ReturnType<typeof limitedJson>>;
      try {
        input = await limitedJson(request);
      } catch (error) {
        // Cierre de sesión: un cuerpo ausente, no JSON o excesivo es un error
        // del cliente (400), no un fallo de runtime (QA-FIX-02 M-02).
        if (joined === "sign-out") return failure(400);
        throw error;
      }
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
      step = "request.forward";
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
      step = "request.forward";
      // No se copia el objeto Request recibido: en Next.js llega como un
      // NextRequest enlazado y el constructor nativo (undici) lo rechaza con
      // "Cannot read private member #state". Se arma un GET nuevo solo con la
      // URL (code, state e iss intactos) y los encabezados (cookies incluidas).
      forward = new Request(request.url, { method: "GET", headers });
    }
    // El manejador etiqueta sus propias etapas; "request.unexpected" cubre un
    // fallo no etiquetado.
    step = "request.unexpected";
    const response = await dependencies.handler(forward);
    step = "request.response";
    const responseHeaders = new Headers(response.headers);
    for (const [k, v] of Object.entries(googlePrivateHeaders))
      responseHeaders.set(k, v);
    return new Response(response.body, {
      status: response.status,
      headers: responseHeaders,
    });
  } catch (error) {
    report(googleStageOf(error, step));
    return failure(503);
  }
}
