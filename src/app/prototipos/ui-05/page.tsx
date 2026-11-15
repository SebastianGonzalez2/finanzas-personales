import { requireGoogleOwnerPage } from "@/server/require-google-owner-page";
import { Icon } from "@/components/ui/icon";
import { PageHead, Screen } from "./_proto/kit";
import { ProtoShell } from "./_proto/shell";
import {
  protoHref,
  protoScreens,
  stateLabel,
  tickets,
  type Ticket,
} from "./_proto/screens";

export const metadata = { title: "Índice | Prototipos UI-05" };

// UI-05-DESIGN — Índice local para recorrer todas las propuestas.
export default async function PrototypesIndex() {
  await requireGoogleOwnerPage();
  const groups = Object.entries(tickets) as [Ticket, string][];
  return (
    <ProtoShell current="resumen">
      <Screen>
        <PageHead
          eyebrow="UI-05 · Pendiente de aprobación"
          title="Prototipos de las pantallas restantes"
          description="Extensión del diseño Glaciar a las pantallas que faltan. Datos ficticios, sin conexión a tus datos ni efectos: los botones no guardan nada. Cada pantalla tiene estados recorribles desde la barra superior."
        />
        {groups.map(([ticket, title]) => (
          <section
            key={ticket}
            className="ui05-stack"
            aria-labelledby={`t-${ticket}`}
          >
            <h2 id={`t-${ticket}`} className="lab-panel__title">
              {title}
            </h2>
            <ul className="ui05-index">
              {protoScreens
                .filter((screen) => screen.ticket === ticket)
                .map((screen) => (
                  <li key={screen.key} className="lab-panel ui05-index__card">
                    <div className="flex items-start justify-between gap-2">
                      <a
                        href={protoHref(screen.key)}
                        className="text-[15px] font-semibold hover:underline"
                      >
                        {screen.title}
                      </a>
                      <code className="lab-muted text-xs">{screen.route}</code>
                    </div>
                    <p className="lab-muted text-sm">{screen.summary}</p>
                    <p className="ui05-pills">
                      {screen.states.map((state) => (
                        <a key={state} href={protoHref(screen.key, state)}>
                          {stateLabel[state]}
                        </a>
                      ))}
                    </p>
                  </li>
                ))}
            </ul>
          </section>
        ))}
        <p className="lab-muted flex items-center gap-2 text-xs">
          <Icon name="info" className="size-4" />
          Resumen e Historial ya implementados: prototipo UI-01 en
          /prototipos/ui/final.
        </p>
      </Screen>
    </ProtoShell>
  );
}
