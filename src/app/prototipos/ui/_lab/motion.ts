"use client";

import { useSyncExternalStore } from "react";

// Preferencia de movimiento: respeta `prefers-reduced-motion` y, además, una
// pausa manual del prototipo (útil para medir consumo y comparar en estático).
// La pausa vive solo en memoria: el producto no usa almacenamiento del
// navegador (F6-02), y el laboratorio respeta la misma regla.
const listeners = new Set<() => void>();
let manualPause = false;

function reducedQuery() {
  return window.matchMedia("(prefers-reduced-motion: reduce)");
}

function snapshot() {
  return `${reducedQuery().matches ? 1 : 0}${manualPause ? 1 : 0}`;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const query = reducedQuery();
  query.addEventListener("change", listener);
  return () => {
    listeners.delete(listener);
    query.removeEventListener("change", listener);
  };
}

export function setLabPaused(paused: boolean) {
  manualPause = paused;
  document.documentElement.dataset.labMotion = paused ? "off" : "on";
  listeners.forEach((listener) => listener());
}

export function useLabMotion() {
  const value = useSyncExternalStore(subscribe, snapshot, () => "00");
  const reduced = value[0] === "1";
  const paused = value[1] === "1";
  return { reduced, paused, animate: !reduced && !paused };
}
