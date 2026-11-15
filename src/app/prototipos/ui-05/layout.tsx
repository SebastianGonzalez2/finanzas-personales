import type { Metadata } from "next";
import "./_proto/proto.css";

// UI-05-DESIGN — Prototipos visuales aislados con datos ficticios. No
// consultan datos financieros, no envían formularios y no se publican. Cada
// página exige primero sesión y titular (F6-02: sin sesión, 307 al acceso
// como cualquier página) y después responde 404 fuera de `next dev` local
// (`uiPrototypesEnabled`). El layout no decide el 404: Next lo resolvería
// antes que la verificación de sesión de la página.
export const metadata: Metadata = {
  title: "Prototipos UI-05 | Finanzas personales",
  robots: { index: false, follow: false },
};

export default function PrototypesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
