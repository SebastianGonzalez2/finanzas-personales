import { NextResponse } from "next/server";
import { authEnabled, neonAuth } from "@/server/auth.ts";

// The official middleware handles Neon's OAuth verifier exchange. It is only a
// navigation guard; every account read independently checks a fresh session.
const proxy = authEnabled()
  ? neonAuth().middleware({
      publicRoutes: [
        "/",
        "/api/account",
        "/api/admission",
        "/api/webhooks/neon-auth",
      ],
    })
  : () => NextResponse.next();
export default proxy;
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg).*)"],
};
