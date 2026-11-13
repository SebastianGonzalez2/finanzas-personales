"use client";

import { useEffect } from "react";

// F6-03 (CA-066): marca como inválido (aria-invalid) el control que rechaza la
// validación nativa del navegador y lo desmarca al corregirlo. El navegador ya
// anuncia el mensaje asociado; esto añade el estado programático y visual.
export function FormValidation() {
  useEffect(() => {
    const isControl = (
      target: EventTarget | null,
    ): target is HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement =>
      target instanceof HTMLInputElement ||
      target instanceof HTMLSelectElement ||
      target instanceof HTMLTextAreaElement;

    function markInvalid(event: Event) {
      if (isControl(event.target))
        event.target.setAttribute("aria-invalid", "true");
    }
    function clearIfValid(event: Event) {
      if (
        isControl(event.target) &&
        event.target.hasAttribute("aria-invalid") &&
        event.target.checkValidity()
      )
        event.target.removeAttribute("aria-invalid");
    }

    // `invalid` no burbujea: se escucha en la fase de captura.
    document.addEventListener("invalid", markInvalid, true);
    document.addEventListener("input", clearIfValid, true);
    document.addEventListener("change", clearIfValid, true);
    return () => {
      document.removeEventListener("invalid", markInvalid, true);
      document.removeEventListener("input", clearIfValid, true);
      document.removeEventListener("change", clearIfValid, true);
    };
  }, []);

  return null;
}
