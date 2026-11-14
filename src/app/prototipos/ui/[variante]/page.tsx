import { notFound } from "next/navigation";
import { requireGoogleOwnerPage } from "@/server/require-google-owner-page";
import { VariantA } from "../_lab/variant-a";
import { VariantB } from "../_lab/variant-b";
import { VariantC } from "../_lab/variant-c";

const titles = {
  a: "A · Ambient Minimal",
  b: "B · Ambient Dynamic",
  c: "C · Ambient Premium",
} as const;

export async function generateMetadata({
  params,
}: PageProps<"/prototipos/ui/[variante]">) {
  const { variante } = await params;
  const title = titles[variante as keyof typeof titles];
  return { title: `${title ?? "Variante"} | Laboratorio UI` };
}

export default async function VariantPage(
  props: PageProps<"/prototipos/ui/[variante]">,
) {
  // Solo datos ficticios, pero se mantiene la regla F6-02: toda página exige
  // sesión y titular en servidor. La URL solo elige variante y vista.
  await requireGoogleOwnerPage();
  const { variante } = await props.params;
  const { vista } = await props.searchParams;
  const view = vista === "movimientos" ? "movimientos" : "resumen";

  if (variante === "a") return <VariantA view={view} />;
  if (variante === "b") return <VariantB view={view} />;
  if (variante === "c") return <VariantC view={view} />;
  notFound();
}
