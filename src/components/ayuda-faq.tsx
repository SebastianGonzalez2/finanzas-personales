"use client";

// F6-06: buscador local y acordeones accesibles (<details>/<summary>) para la
// sección Ayuda. Contenido estático sin servicios externos.

import { useId, useMemo, useState } from "react";
import {
  countAyudaEntries,
  filterAyudaGroups,
  type AyudaGroup,
} from "@/domain/ayuda";

const searchControl =
  "min-h-11 w-full rounded-lg border bg-background px-3 text-base";

export function AyudaFaq({ groups }: { groups: readonly AyudaGroup[] }) {
  const total = useMemo(() => countAyudaEntries(groups), [groups]);
  const [query, setQuery] = useState("");
  const filtered = useMemo(
    () => filterAyudaGroups(query, groups),
    [query, groups],
  );
  const matches = countAyudaEntries(filtered);
  const searching = query.trim().length > 0;
  const statusId = useId();

  return (
    <div className="grid gap-5">
      <form
        role="search"
        className="grid gap-1"
        onSubmit={(event) => event.preventDefault()}
      >
        <label htmlFor="buscar-ayuda" className="text-sm font-medium">
          Buscar en la ayuda
        </label>
        <input
          id="buscar-ayuda"
          type="search"
          autoComplete="off"
          placeholder="Ej.: cuotas, devolución, copia de seguridad"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className={searchControl}
          aria-describedby={statusId}
        />
        <p
          id={statusId}
          role="status"
          className="text-sm text-muted-foreground"
        >
          {searching
            ? matches === 1
              ? "1 respuesta coincide con la búsqueda."
              : `${matches} respuestas coinciden con la búsqueda.`
            : `${total} respuestas ordenadas por tema.`}
        </p>
      </form>
      {searching && matches === 0 ? (
        <p className="text-sm">
          No encontramos respuestas para «{query.trim()}». Probá con otra
          palabra, por ejemplo «cuotas», «saldo» o «devolución».
        </p>
      ) : (
        filtered.map((group) => (
          <section
            key={group.id}
            aria-labelledby={`ayuda-${group.id}`}
            className="grid gap-2"
          >
            <h2 id={`ayuda-${group.id}`} className="text-lg font-semibold">
              {group.title}
            </h2>
            <div className="grid gap-2">
              {group.entries.map((entry) => (
                <details
                  key={entry.question}
                  className="rounded-lg border p-3 text-sm"
                >
                  <summary className="font-medium">{entry.question}</summary>
                  <p className="mt-2">{entry.answer}</p>
                  {entry.links && entry.links.length > 0 && (
                    <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="text-muted-foreground">Ir a:</span>
                      {entry.links.map((link) => (
                        <a
                          key={link.href}
                          href={`${link.href}#titulo-pagina`}
                          className="w-fit py-2 text-sm underline underline-offset-2"
                        >
                          {link.label}
                        </a>
                      ))}
                    </p>
                  )}
                </details>
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
