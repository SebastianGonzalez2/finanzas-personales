import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Geist, Instrument_Serif, Plus_Jakarta_Sans } from "next/font/google";
import "./_lab/lab.css";

// UI-01 — Laboratorio visual aislado. Solo datos ficticios: no consulta la base
// de datos ni la sesión. No se publica en el entorno de producción de Vercel.
export const metadata: Metadata = {
  title: "Laboratorio UI | Finanzas personales",
  robots: { index: false, follow: false },
};

const geist = Geist({ subsets: ["latin"], variable: "--font-lab-geist" });
const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-lab-jakarta",
});
const serif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-lab-serif",
});

export default function LabLayout({ children }: { children: React.ReactNode }) {
  if (process.env.VERCEL_ENV === "production") notFound();
  return (
    <div className={`${geist.variable} ${jakarta.variable} ${serif.variable}`}>
      {children}
    </div>
  );
}
