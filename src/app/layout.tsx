import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { ConnectionStatus } from "@/components/connection-status";
import { FormValidation } from "@/components/form-validation";
import "./globals.css";

// UI-02: tipografía definitiva (guía §2). `next/font` la descarga al compilar y
// la sirve desde el propio dominio: compatible con la CSP (font-src 'self').
const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-jakarta",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Finanzas personales",
  description: "Tu espacio personal para organizar tus finanzas.",
  robots: { index: false, follow: false },
  applicationName: "Finanzas personales",
  appleWebApp: { capable: true, title: "Finanzas", statusBarStyle: "black" },
};

export const viewport: Viewport = {
  themeColor: "#070a0d",
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es-UY" className={jakarta.variable}>
      <body>
        <a
          href="#contenido"
          className="sr-only rounded-md bg-primary text-primary-foreground focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:min-h-11 focus:px-4 focus:py-3 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
        >
          Saltar al contenido
        </a>
        <ConnectionStatus />
        {children}
        <FormValidation />
      </body>
    </html>
  );
}
