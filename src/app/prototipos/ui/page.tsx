import { redirect } from "next/navigation";
import { requireGoogleOwnerPage } from "@/server/require-google-owner-page";

// UI-01 — Las variantes A, B y C se descartaron; queda solo el diseño final.
export default async function LabIndex() {
  await requireGoogleOwnerPage();
  redirect("/prototipos/ui/final");
}
