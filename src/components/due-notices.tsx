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
