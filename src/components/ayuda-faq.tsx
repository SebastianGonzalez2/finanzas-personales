// F6-06 / UI-05H (M-03): preguntas frecuentes en acordeones accesibles
// (<details>/<summary>), agrupadas por tema y repartidas en dos columnas
// equilibradas. Sin buscador ni filtros. Contenido estático sin servicios
// externos.

import type { AyudaGroup } from "@/domain/ayuda";

/** Reparte los grupos en dos columnas con un total de preguntas similar. */
function splitGroups(groups: readonly AyudaGroup[]) {
  const total = groups.reduce((sum, group) => sum + group.entries.length, 0);
  const left: AyudaGroup[] = [];
  const right: AyudaGroup[] = [];
  let acc = 0;
  for (const group of groups) {
    // El grupo va a la izquierda mientras su punto medio no pase la mitad.
    (acc + group.entries.length / 2 <= total / 2 ? left : right).push(group);
    acc += group.entries.length;
  }
  return [left, right] as const;
}

export function AyudaFaq({ groups }: { groups: readonly AyudaGroup[] }) {
  return (
    <div className="gs-grid">
      {splitGroups(groups).map((column, index) => (
        <div key={index} className="gs-stack gs-span-6">
          {column.map((group) => (
            <section
              key={group.id}
              aria-labelledby={`ayuda-${group.id}`}
              className="lab-panel"
            >
              <h2 id={`ayuda-${group.id}`} className="lab-panel__title">
                {group.title}
              </h2>
              <div className="gs-accordion">
                {group.entries.map((entry) => (
                  <details key={entry.question}>
                    <summary>{entry.question}</summary>
                    <div className="gs-accordion__body">
                      <p>{entry.answer}</p>
                      {entry.links && entry.links.length > 0 && (
                        <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
                          <span>Ir a:</span>
                          {entry.links.map((link) => (
                            <a
                              key={link.href}
                              href={`${link.href}#titulo-pagina`}
                              className="lab-link min-h-11"
                            >
                              {link.label}
                            </a>
                          ))}
                        </p>
                      )}
                    </div>
                  </details>
                ))}
              </div>
            </section>
          ))}
        </div>
      ))}
    </div>
  );
}
