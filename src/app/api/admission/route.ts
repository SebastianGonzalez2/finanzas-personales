import { authEnabled, appOrigin } from "@/server/auth.ts";
import { issueAdmission } from "@/server/admission.ts";
import { readLimitedBody, requireSameOrigin } from "@/server/auth-policy.ts";
import { authFailure, privateHeaders } from "@/server/auth-http.ts";
export const runtime = "nodejs";
export async function POST(request: Request) {
  if (!authEnabled()) return authFailure(503);
  try {
    requireSameOrigin(request, appOrigin());
    const input = JSON.parse(await readLimitedBody(request, 2048));
    const admissionId = await issueAdmission(input);
    return admissionId
      ? Response.json({ admissionId }, { headers: privateHeaders })
      : authFailure();
  } catch {
    return authFailure();
  }
}
