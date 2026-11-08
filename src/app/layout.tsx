import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Finanzas personales",
  description: "Tu espacio personal para organizar tus finanzas.",
  robots: { index: false, follow: false },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body>
        <a
          href="#contenido"
          className="sr-only rounded-md bg-primary text-primary-foreground focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:min-h-11 focus:px-4 focus:py-3 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
        >
          Saltar al contenido
        </a>
        {children}
      </body>
    </html>
  );
}
