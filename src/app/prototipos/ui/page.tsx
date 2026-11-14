import Link from "next/link";
import { requireGoogleOwnerPage } from "@/server/require-google-owner-page";
import { AmbientCss } from "./_lab/ambient";

const options = [
  {
    key: "a",
    name: "Ambient Minimal",
    tagline: "Sobria y precisa",
    points: [
      "Luz ambiental CSS muy tenue, sin WebGL",
      "Vidrio casi imperceptible e iconos monocromos",
      "Barras agrupadas y barras horizontales por categoría",
    ],
  },
  {
    key: "b",
    name: "Ambient Dynamic",
    tagline: "Luz en movimiento",
    points: [
      "Shader de auroras animado (30 fps, baja resolución)",
      "Vidrio perceptible e iconos con color por destino",
      "Saldo por moneda, tarjetas como objetos y anillo de categorías",
    ],
  },
  {
    key: "c",
    name: "Ambient Premium",
    tagline: "Editorial y distintiva",
    points: [
      "Ondas de luz WebGL concentradas en la cabecera",
      "Cifra principal en serif y navegación flotante expandible",
      "Flujo espejado, agenda de 30 días y barra segmentada",
    ],
  },
] as const;

export default async function LabIndex() {
  // Regla F6-02: toda página exige sesión y titular en servidor.
  await requireGoogleOwnerPage();
  return (
    <div className="lab-root lab-a lab-index">
      <AmbientCss />
      <main id="contenido" className="lab-index__main">
        <p className="lab-index__tag">
          UI-01 · Exploración visual · Datos ficticios
        </p>
        <h1 className="lab-index__title">
          Ambient Glow + Subtle Glassmorphism
        </h1>
        <p className="lab-muted max-w-2xl">
          Tres interpretaciones del mismo resumen financiero y del mismo
          historial con filtros. Ninguna cambia la aplicación real: son
          prototipos aislados para elegir una identidad visual.
        </p>
        <ul className="lab-index__grid">
          {options.map((option) => (
            <li key={option.key}>
              <Link
                href={`/prototipos/ui/${option.key}`}
                className={`lab-panel lab-index__card is-${option.key}`}
              >
                <span className="lab-index__preview" aria-hidden="true" />
                <span className="lab-index__letter">
                  {option.key.toUpperCase()}
                </span>
                <span className="block text-lg font-semibold">
                  {option.name}
                </span>
                <span className="lab-muted block text-sm">
                  {option.tagline}
                </span>
                <ul className="lab-index__points">
                  {option.points.map((point) => (
                    <li key={point}>{point}</li>
                  ))}
                </ul>
                <span className="lab-link mt-auto">
                  Abrir variante {option.key.toUpperCase()} →
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
