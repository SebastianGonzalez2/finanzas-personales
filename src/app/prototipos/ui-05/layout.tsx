import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { uiPrototypesEnabled } from "./_proto/access";
import "./_proto/proto.css";

// UI-05-DESIGN — Prototipos visuales aislados con datos ficticios. No
// consultan datos financieros, no envían formularios y no se publican: fuera
// de `next dev` local la ruta responde 404. Cada página además exige sesión y
// titular en servidor (regla F6-02).
export const metadata: Metadata = {
  title: "Prototipos UI-05 | Finanzas personales",
  robots: { index: false, follow: false },
};

export default function PrototypesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!uiPrototypesEnabled()) notFound();
  return children;
}
