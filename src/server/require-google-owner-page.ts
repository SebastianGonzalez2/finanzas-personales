import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { withGoogleOwner } from "./google-auth.ts";

export async function requireGoogleOwnerPage() {
  const authorized = await withGoogleOwner(
    new Request("https://internal.invalid", { headers: await headers() }),
    async () => true,
  ).catch(() => false);

  if (!authorized) redirect("/auth/sign-in");
}
