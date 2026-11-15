import type { ReactNode } from "react";
import { ayudaGroups } from "@/domain/ayuda";
import { buttonClass } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Icon, type IconName } from "@/components/ui/icon";
import { EmptyState, ErrorState, PageHead, Screen, m } from "../kit";
import { protoHref, type ProtoState } from "../screens";

/* ================================= Avisos ================================= */

type Notice = {
  tone: "info" | "warning" | "critical";
  title: string;
  detail: ReactNode;
  action?: { label: string; href: string };
};

function NoticeGroup({
  id,
  title,
  icon,
  notices,
  empty,
}: {
  id: string;
  title: string;
  icon: IconName;
  notices: Notice[];
  empty?: string;
}) {
  return (
    <section className="lab-panel" aria-labelledby={id}>
      <header className="lab-panel__head">
        <h2 id={id} className="lab-panel__title">
          <span className="lab-panel__icon">
            <Icon name={icon} className="size-4.5" />
          </span>
          {title}
        </h2>
        {notices.length > 0 && (
          <span className="lab-tag lab-tag--neutral">{notices.length}</span>
        )}
      </header>
      {notices.length === 0 ? (
        <p className="lab-muted text-sm">{empty}</p>
      ) : (
        <ul className="b-notices">
          {notices.map((notice) => (
            <li
              key={notice.title}
              className={`b-notice b-notice--${notice.tone}`}
            >
              <Icon
                name={notice.tone === "info" ? "info" : "alert"}
                className="size-4.5 shrink-0"
              />
              <div className="min-w-0 flex-1 wrap-anywhere">
                <p className="font-medium">{notice.title}</p>
                <p className="lab-muted">{notice.detail}</p>
                {notice.action && (
                  <a href={notice.action.href} className="lab-link mt-1">
                    {notice.action.label}
                    <Icon
                      name="chevronRight"
                      duotone={false}
                      className="size-3.5"
                    />
                  </a>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function PushPanel() {
  return (
    <section className="lab-panel" aria-labelledby="preferencia-push">
      <h2 id="preferencia-push" className="lab-panel__title">
        <span className="lab-panel__icon">
          <Icon name="notices" className="size-4.5" />
        </span>
        Avisos al celular (opcional)
      </h2>
      <p className="lab-muted text-sm">
        Recibí avisos de vencimiento de tarjetas de crédito en este dispositivo.
      </p>
      <p className="flex items-center gap-2 text-sm" role="status">
        <span className="lab-tag lab-tag--neutral">
          <Icon name="dot" duotone={false} className="size-3" />
          Desactivados en este dispositivo
        </span>
      </p>
      <button type="button" className={buttonClass("outline", "self-start")}>
        Activar avisos push
      </button>
    </section>
  );
}

export function NoticesScreen({ state }: { state: ProtoState }) {
  const head = (
    <PageHead
      eyebrow="Tu cuenta"
      title="Avisos"
      description="Vencimientos, presupuestos y metas según tus registros."
    />
  );
  if (state === "error")
    return (
      <Screen>
        {head}
        <ErrorState message="No pudimos cargar tus avisos. Volvé a intentarlo." />
      </Screen>
    );
  if (state === "vacio")
    return (
      <Screen>
        {head}
        <div className="ui05-grid">
          <div className="ui05-span-8">
            <EmptyState icon="check" title="No tenés avisos nuevos">
              Te avisamos acá cuando se acerque un vencimiento, un presupuesto
              llegue al 80 % o una aportación quede pendiente.
            </EmptyState>
          </div>
          <div className="ui05-span-4">
            <PushPanel />
          </div>
        </div>
      </Screen>
    );
  return (
    <Screen>
      {head}
      <div className="ui05-grid">
        <div className="ui05-span-8 ui05-stack">
          <NoticeGroup
            id="avisos-tarjetas"
            title="Avisos de tarjetas"
            icon="cards"
            notices={[
              {
                tone: "warning",
                title: "Visa Oro · Vence el 05/12",
                detail: (
                  <>
                    Pago del resumen pendiente según tus registros ·{" "}
                    {m("18450.30")}
                  </>
                ),
                action: {
                  label: "Registrar pago",
                  href: protoHref("tarjeta-ciclo", "pago"),
                },
              },
            ]}
          />
          <NoticeGroup
            id="avisos-presupuestos"
            title="Presupuestos"
            icon="budgets"
            notices={[
              {
                tone: "critical",
                title: "Restaurantes · UYU",
                detail: "Superaste el límite: 117 % del presupuesto del mes.",
                action: {
                  label: "Ver presupuestos",
                  href: protoHref("presupuestos"),
                },
              },
              {
                tone: "warning",
                title: "Alimentación · UYU",
                detail: "Llegaste al 86 % del presupuesto del mes.",
                action: {
                  label: "Ver presupuestos",
                  href: protoHref("presupuestos"),
                },
              },
            ]}
          />
          <NoticeGroup
            id="avisos-aportaciones"
            title="Aportaciones"
            icon="funds"
            notices={[
              {
                tone: "warning",
                title: "Fondo de emergencia · noviembre",
                detail: (
                  <>
                    No había suficiente dinero disponible para reservar{" "}
                    {m("6000.00")}.
                  </>
                ),
                action: {
                  label: "Ver aportación de Fondo de emergencia",
                  href: protoHref("fondos"),
                },
              },
            ]}
          />
          <NoticeGroup
            id="avisos-metas"
            title="Metas de fondos"
            icon="funds"
            notices={[
              {
                tone: "info",
                title: "Service del auto · UYU",
                detail:
                  "Meta alcanzada. Las aportaciones automáticas quedaron en pausa.",
                action: { label: "Aumentar meta", href: protoHref("fondos") },
              },
            ]}
          />
        </div>
        <div className="ui05-span-4 ui05-stack">
          <NoticeGroup
            id="avisos-deudas"
            title="Deudas y préstamos"
            icon="debts"
            notices={[]}
            empty="No hay vencimientos de deudas dentro de los próximos días según tus registros."
          />
          <NoticeGroup
            id="avisos-recurrentes"
            title="Recurrentes"
            icon="recurring"
            notices={[
              {
                tone: "info",
                title: "Luz y agua · vence el 18/11",
                detail: <>Referencia {m("3400.00")} · sin pago confirmado.</>,
                action: {
                  label: "Ver recurrente",
                  href: protoHref("recurrentes"),
                },
              },
            ]}
          />
          <PushPanel />
          <details className="lab-panel">
            <summary className="lab-panel__title cursor-pointer list-none">
              Avisos resueltos
              <span className="lab-tag lab-tag--neutral">3</span>
            </summary>
            <ul className="ui05-rows mt-2 text-sm">
              <li className="lab-muted">
                Viaje a Japón · octubre · aportación completada
              </li>
              <li className="lab-muted">
                Fondo de emergencia · septiembre · descartada
              </li>
            </ul>
          </details>
        </div>
      </div>
    </Screen>
  );
}

/* ================================== Ayuda ================================== */

/** Reparte los grupos en dos columnas con un total de preguntas similar. */
function splitGroups<T extends { entries: readonly unknown[] }>(groups: T[]) {
  const total = groups.reduce((sum, group) => sum + group.entries.length, 0);
  const left: T[] = [];
  const right: T[] = [];
  let acc = 0;
  for (const group of groups) {
    // El grupo va a la izquierda mientras su punto medio no pase la mitad.
    (acc + group.entries.length / 2 <= total / 2 ? left : right).push(group);
    acc += group.entries.length;
  }
  return [left, right] as const;
}

export function HelpScreen() {
  const columns = splitGroups([...ayudaGroups]);
  return (
    <Screen>
      <PageHead
        eyebrow="Tu cuenta"
        title="Ayuda"
        description="Preguntas frecuentes sobre las funciones de la aplicación."
        actions={
          <a href="/prototipos/ui/final" className={buttonClass("outline")}>
            <Icon name="sparkle" duotone={false} className="size-4" />
            Volver a ver tutorial
          </a>
        }
      />
      <div className="ui05-grid">
        {columns.map((groups, column) => (
          <div key={column} className="ui05-span-6 ui05-stack">
            {groups.map((group) => (
              <section
                key={group.id}
                id={group.id}
                className="lab-panel"
                aria-labelledby={`g-${group.id}`}
              >
                <h2 id={`g-${group.id}`} className="lab-panel__title">
                  {group.title}
                </h2>
                <div className="ui05-accordion">
                  {group.entries.map((entry, index) => (
                    <details key={entry.question} open={index === 0}>
                      <summary>
                        {entry.question}
                        <Icon
                          name="chevronDown"
                          duotone={false}
                          className="size-4"
                        />
                      </summary>
                      <div className="ui05-accordion__body">
                        <p>{entry.answer}</p>
                        {entry.links && (
                          <p className="ui05-pills">
                            {entry.links.map((link) => (
                              <a key={link.href} href="#">
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
    </Screen>
  );
}

/* ================================ Mi cuenta ================================ */

export function AccountScreen({ state }: { state: ProtoState }) {
  return (
    <Screen>
      <PageHead eyebrow="Tu cuenta" title="Mi cuenta" />
      <div className="ui05-grid">
        <section
          className="lab-panel c-feature ui05-span-5"
          aria-labelledby="cuenta-conectada"
        >
          <header className="lab-panel__head">
            <h2 id="cuenta-conectada" className="lab-panel__title">
              <span className="lab-panel__icon">
                <Icon name="account" className="size-4.5" />
              </span>
              Tu cuenta está conectada
            </h2>
            <span className="lab-tag lab-tag--good">
              <Icon name="check" duotone={false} className="size-3" />
              Google
            </span>
          </header>
          <p className="lab-muted text-sm">
            Tu acceso es privado y está vinculado a una cuenta Google
            autorizada.
          </p>
          <button
            type="button"
            className={buttonClass("outline", "self-start")}
          >
            Cerrar sesión
          </button>
        </section>
        <section className="lab-panel ui05-span-7" aria-labelledby="copias">
          <h2 id="copias" className="lab-panel__title">
            <span className="lab-panel__icon">
              <Icon name="reports" className="size-4.5" />
            </span>
            Copias de seguridad
          </h2>
          <div className="ui05-accordion">
            <details open={state !== "restaurar"}>
              <summary>
                Descargar copia de seguridad
                <Icon name="chevronDown" duotone={false} className="size-4" />
              </summary>
              <div className="ui05-accordion__body">
                <p>
                  El archivo contiene tus datos financieros. Guardalo en un
                  lugar privado y seguro.
                </p>
                <label className="ui05-check text-[var(--glaciar-text)]">
                  <input type="checkbox" />
                  Proteger esta copia con contraseña
                </label>
                <button
                  type="button"
                  className={buttonClass("primary", "justify-self-start")}
                >
                  Descargar copia
                </button>
              </div>
            </details>
            <details open={state === "restaurar"}>
              <summary>
                Restaurar copia de seguridad
                <Icon name="chevronDown" duotone={false} className="size-4" />
              </summary>
              <div className="ui05-accordion__body">
                <div className="b-notice b-notice--warning">
                  <Icon name="alert" className="size-4.5 shrink-0" />
                  <p className="min-w-0 text-sm text-[var(--glaciar-text)]">
                    Se reemplazarán todos tus datos financieros. Perderás los
                    cambios posteriores a esta copia.
                  </p>
                </div>
                <Field label="Archivo de copia">
                  <Input type="file" />
                </Field>
                {state === "restaurar" && (
                  <>
                    <p className="text-sm text-[var(--glaciar-text)]">
                      Copia verificada. Revisá la advertencia antes de
                      continuar.
                    </p>
                    <label className="ui05-check text-[var(--glaciar-text)]">
                      <input type="checkbox" />
                      Confirmo que quiero reemplazar mis datos financieros.
                    </label>
                  </>
                )}
                <div className="ui05-actions">
                  <button type="button" className={buttonClass("outline")}>
                    Verificar copia
                  </button>
                  {state === "restaurar" && (
                    <button
                      type="button"
                      className={buttonClass("outline", "ui05-btn-danger")}
                    >
                      Restaurar y reemplazar datos
                    </button>
                  )}
                </div>
              </div>
            </details>
          </div>
        </section>
        <section
          className="ui05-danger ui05-span-12"
          aria-labelledby="eliminar"
        >
          <h2 id="eliminar" className="ui05-danger__title">
            <Icon name="alert" className="size-4.5" />
            Eliminar cuenta
          </h2>
          <p className="lab-muted max-w-[70ch] text-sm">
            El borrado es irreversible en la aplicación. Vas a perder tus datos
            financieros y preferencias, se cerrarán todas tus sesiones y tu
            acceso quedará revocado en la lista privada.
          </p>
          {state === "eliminar" ? (
            <div className="grid gap-3">
              <p className="text-sm">
                Para confirmar necesitás haber entrado con Google en los últimos
                10 minutos. Si pasó más tiempo, cerrá sesión y volvé a entrar.
              </p>
              <div className="ui05-actions">
                <button type="button" className={buttonClass("outline")}>
                  Descargar copia de seguridad
                </button>
                <a href={protoHref("cuenta")} className={buttonClass("ghost")}>
                  Cancelar
                </a>
                <button
                  type="button"
                  className={buttonClass("outline", "ui05-btn-danger")}
                >
                  Eliminar definitivamente
                </button>
              </div>
            </div>
          ) : (
            <a
              href={protoHref("cuenta", "eliminar")}
              className={buttonClass("outline", "ui05-btn-danger self-start")}
            >
              Eliminar mi cuenta y mis datos
            </a>
          )}
        </section>
      </div>
    </Screen>
  );
}
