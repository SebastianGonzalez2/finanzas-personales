import { NoticeCard, type NoticeLevel } from "./notices";

// F4-05: interfaz y textos del centro de avisos por vencimientos ciertos
// (RF-037/038; CA-049; §11.1). Los avisos solo informan según registros de la
// app: nunca mueven dinero, nunca declaran mora ni inventan fechas.

/** Lista de avisos de vencimiento (deudas y recurrentes) con acción directa. */
export function DueNoticeList({
  headingId,
  title,
  notices,
  emptyText,
}: {
  headingId: string;
  title: string;
  notices: {
    key: string;
    title: string;
    timing: string;
    amount: string | null;
    level: NoticeLevel;
    href: string;
    linkLabel: string;
  }[];
  emptyText: string;
}) {
  return (
    <section aria-labelledby={headingId} className="grid gap-2">
      <h2 id={headingId} className="font-semibold">
        {title}
      </h2>
      {notices.length === 0 ? (
        <p className="text-sm text-muted-foreground">{emptyText}</p>
      ) : (
        <ul className="grid gap-2">
          {notices.map((notice) => (
            <li key={notice.key}>
              <NoticeCard
                level={notice.level}
                href={notice.href}
                linkLabel={notice.linkLabel}
              >
                <p className="font-medium">{notice.title}</p>
                <p role="status">{notice.timing}</p>
                {notice.amount && <p>{notice.amount}</p>}
              </NoticeCard>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * Preferencia de avisos push al celular: opcional, solo para vencimientos de
 * tarjetas (v9.10). Nunca es obligatoria: si el dispositivo o el navegador no
 * la permiten, los avisos siguen disponibles dentro de la app. La activación
 * pide permiso solo por acción explícita del usuario.
 */
export function PushPreference() {
  return (
    <section aria-labelledby="preferencia-push" className="grid gap-2">
      <h2 id="preferencia-push" className="font-semibold">
        Avisos al celular (opcional)
      </h2>
      <div className="grid gap-2 rounded-lg border p-4 text-sm">
        <p>
          Podés activar avisos push al celular para los vencimientos de tus
          tarjetas de crédito. Es opcional: la app y todos tus avisos internos
          funcionan igual sin esta opción.
        </p>
        <p className="text-muted-foreground">
          Estado en este dispositivo: <strong>no activado</strong>. Para
          activarlos vas a necesitar un navegador compatible y dar permiso
          expresamente desde acá, cuando se solicite. Podés desactivarlos en
          cualquier momento.
        </p>
        <p className="text-muted-foreground">
          Los vencimientos de deudas, préstamos, recurrentes, presupuestos y
          fondos solo generan avisos dentro de la app, sin push ni correos.
        </p>
      </div>
    </section>
  );
}
