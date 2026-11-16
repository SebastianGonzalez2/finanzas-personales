import { NoticeCard, NoticeGroup, type NoticeLevel } from "./notices";
import type { IconName } from "./ui/icon";

// F4-05: interfaz y textos del centro de avisos por vencimientos ciertos
// (RF-037/038; CA-049; §11.1). Los avisos solo informan según registros de la
// app: nunca mueven dinero, nunca declaran mora ni inventan fechas.

/** Lista de avisos de vencimiento (deudas y recurrentes) con acción directa. */
export function DueNoticeList({
  headingId,
  title,
  icon,
  notices,
  emptyText,
}: {
  headingId: string;
  title: string;
  icon: IconName;
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
    <NoticeGroup
      id={headingId}
      title={title}
      icon={icon}
      count={notices.length}
    >
      {notices.length === 0 ? (
        <p className="lab-muted text-sm">{emptyText}</p>
      ) : (
        <ul className="b-notices">
          {notices.map((notice) => (
            <li key={notice.key}>
              <NoticeCard
                level={notice.level}
                href={notice.href}
                linkLabel={notice.linkLabel}
              >
                <p className="font-medium">{notice.title}</p>
                <p role="status" className="lab-muted">
                  {notice.timing}
                </p>
                {notice.amount && <p className="lab-muted">{notice.amount}</p>}
              </NoticeCard>
            </li>
          ))}
        </ul>
      )}
    </NoticeGroup>
  );
}
