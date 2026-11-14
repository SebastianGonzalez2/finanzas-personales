import { requireGoogleOwnerPage } from "@/server/require-google-owner-page";
import { VariantFinal } from "../_lab/variant-final";

export const metadata = { title: "Diseño final | Laboratorio UI" };

export default async function FinalPage(
  props: PageProps<"/prototipos/ui/final">,
) {
  // Solo datos ficticios, pero se mantiene la regla F6-02: toda página exige
  // sesión y titular en servidor. La URL solo elige la vista.
  await requireGoogleOwnerPage();
  const { vista } = await props.searchParams;
  return (
    <VariantFinal view={vista === "movimientos" ? "movimientos" : "resumen"} />
  );
}
