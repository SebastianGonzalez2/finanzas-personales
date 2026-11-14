"use client";

import { useSyncExternalStore } from "react";

// UI-01 — Paletas para comparar en vivo. Cada una define los colores de la
// interfaz (en lab.css, por `data-palette`) y los de las ondas del shader.
// Los colores de datos (ingresos, gastos, categorías, estados) no cambian:
// están validados para contraste y daltonismo y deben ser estables.

type Rgb = readonly [number, number, number];

export type Palette = {
  name: string;
  description: string;
  /** Muestras para el selector: fondo, acento y dos luces. */
  swatch: readonly [string, string, string, string];
  base: Rgb;
  bands: readonly [Rgb, Rgb, Rgb, Rgb];
  /** Intensidad de las ondas: las paletas claras necesitan menos. */
  gain: number;
};

export const palettes = {
  turquesa: {
    name: "Turquesa petróleo",
    description: "La actual: fresca y moderna.",
    swatch: ["#03080c", "#73e0c9", "#2e66eb", "#704ce1"],
    base: [0.016, 0.035, 0.055],
    bands: [
      [0.05, 0.62, 0.58],
      [0.18, 0.4, 0.92],
      [0.44, 0.3, 0.88],
      [0.1, 0.25, 0.55],
    ],
    gain: 1,
  },
  indigo: {
    name: "Índigo nocturno",
    description: "Azules profundos: transmite confianza, clásico de banca.",
    swatch: ["#05060f", "#93a8ff", "#3b55e0", "#7a52ea"],
    base: [0.02, 0.024, 0.06],
    bands: [
      [0.3, 0.4, 0.98],
      [0.48, 0.32, 0.92],
      [0.14, 0.42, 0.9],
      [0.14, 0.16, 0.5],
    ],
    gain: 0.95,
  },
  glaciar: {
    name: "Glaciar",
    description: "Definitiva: plata y azul hielo, sobria y casi monocroma.",
    swatch: ["#070a0d", "#d3e3f2", "#7f9db8", "#4a6a80"],
    base: [0.027, 0.035, 0.047],
    bands: [
      [0.55, 0.68, 0.82],
      [0.3, 0.4, 0.54],
      [0.42, 0.66, 0.74],
      [0.2, 0.26, 0.36],
    ],
    gain: 0.72,
  },
  champan: {
    name: "Champán",
    description: "Dorado cálido sobre grafito: lujosa y distinta.",
    swatch: ["#090706", "#e8c98f", "#c4862f", "#9a4a5c"],
    base: [0.035, 0.028, 0.022],
    bands: [
      [0.78, 0.56, 0.26],
      [0.68, 0.36, 0.22],
      [0.54, 0.27, 0.37],
      [0.3, 0.2, 0.12],
    ],
    gain: 0.8,
  },
} as const satisfies Record<string, Palette>;

export type PaletteKey = keyof typeof palettes;
export const paletteKeys = Object.keys(palettes) as PaletteKey[];

// Solo en memoria (sin almacenamiento del navegador, regla F6-02).
let current: PaletteKey = "glaciar";
const listeners = new Set<() => void>();

export function setPalette(key: PaletteKey) {
  current = key;
  listeners.forEach((listener) => listener());
}

export function usePalette() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => current,
    () => "glaciar" as PaletteKey,
  );
}
