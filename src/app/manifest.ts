import type { MetadataRoute } from "next";

// F6-03 (RF-051): metadatos de instalación. La app funciona igual en un
// navegador normal; no hay modo sin conexión ni caché de datos financieros.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Finanzas personales",
    short_name: "Finanzas",
    description: "Tu espacio personal para organizar tus finanzas.",
    lang: "es",
    dir: "ltr",
    start_url: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#131313",
    theme_color: "#131313",
    categories: ["finance", "productivity"],
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      {
        src: "/pwa-icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/pwa-icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/pwa-icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
