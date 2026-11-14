// UI-01 — Iconografía duotono: una forma de relleno suave (identidad) y un
// trazo fino (detalle). Mantiene el lenguaje de 24 px y 1,75 de trazo del
// producto actual, pero con más carácter que los iconos lineales grises.
const icons = {
  summary: {
    fill: "M4 10.5 12 4l8 6.5V20H4z",
    line: "M3 10.5 12 3l9 7.5M5 9v11h14V9M10 20v-5h4v5",
  },
  history: {
    fill: "M5 4h14v16H5z",
    line: "M5 4h14v16H5zM9 9h6M9 13h6M9 17h3",
  },
  stats: {
    fill: "M4 14h4v6H4zm6-8h4v14h-4zm6 4h4v10h-4z",
    line: "M4 14h4v6H4zm6-8h4v14h-4zm6 4h4v10h-4z",
  },
  reports: {
    fill: "M6 3h9l4 4v14H6z",
    line: "M6 3h9l4 4v14H6zM15 3v4h4M9 12h6M9 16h4",
  },
  budgets: {
    fill: "M12 3a9 9 0 1 0 9 9h-9z",
    line: "M12 3a9 9 0 1 0 9 9h-9zM15 3.5A9 9 0 0 1 20.5 9H15z",
  },
  recurring: {
    fill: "M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16",
    line: "M20 12a8 8 0 1 1-2.34-5.66M20 4v4h-4M12 8v4l2.5 2",
  },
  funds: {
    fill: "M5 9h14v11H5z",
    line: "M5 9h14v11H5zM3 9h18V5H3zM10 13h4",
  },
  cards: {
    fill: "M3 6h18v12H3z",
    line: "M3 6h18v12H3zM3 10h18M7 15h3",
  },
  debts: {
    fill: "M4 6h10v6H4zm6 6h10v6H10z",
    line: "M4 9h12m-3-3 3 3-3 3M20 15H8m3-3-3 3 3 3",
  },
  benefits: {
    fill: "M4 10h16v10H4z",
    line: "M4 10h16v10H4zM3 7h18v3H3zM12 7v13M12 7S10.5 3 8 4s1 3 4 3m0 0s1.5-4 4-3-1 3-4 3",
  },
  categories: {
    fill: "M4 4h7v7H4zm9 9h7v7h-7z",
    line: "M4 4h7v7H4zm9 0h7v7h-7zM4 13h7v7H4zm9 0h7v7h-7z",
  },
  merchants: {
    fill: "M5 10h14v10H5z",
    line: "M4 10 5.5 4h13L20 10M4 10h16M5 10v10h14V10M10 20v-5h4v5",
  },
  notices: {
    fill: "M6 9a6 6 0 0 1 12 0c0 6 2.5 7 2.5 8h-17C3.5 16 6 15 6 9",
    line: "M6 9a6 6 0 0 1 12 0c0 6 2.5 7 2.5 8h-17C3.5 16 6 15 6 9m4 11a2 2 0 0 0 4 0",
  },
  help: {
    fill: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18",
    line: "M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3m.1 4h.01",
  },
  account: {
    fill: "M12 4.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7M5 20a7 7 0 0 1 14 0z",
    line: "M15.5 8a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0M5 20a7 7 0 0 1 14 0",
  },
  wallet: {
    fill: "M3 7h18v13H3z",
    line: "M3 7h18v13H3zM3 7l13-3v3M16 13.5h2",
  },
  income: { fill: "", line: "M12 19V5m-6 6 6-6 6 6" },
  expense: { fill: "", line: "M12 5v14m-6-6 6 6 6-6" },
  swap: { fill: "", line: "M4 8h14m-3-3 3 3-3 3M20 16H6m3-3-3 3 3 3" },
  trendUp: { fill: "", line: "M4 16l5-5 4 4 7-7m0 0h-5m5 0v5" },
  trendDown: { fill: "", line: "M4 8l5 5 4-4 7 7m0 0h-5m5 0v-5" },
  search: { fill: "", line: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14m9 2-4-4" },
  plus: { fill: "", line: "M12 5v14M5 12h14" },
  filter: { fill: "", line: "M4 5h16l-6 8v6l-4-2v-4z" },
  chevronLeft: { fill: "", line: "m15 6-6 6 6 6" },
  chevronRight: { fill: "", line: "m9 6 6 6-6 6" },
  chevronDown: { fill: "", line: "m6 9 6 6 6-6" },
  close: { fill: "", line: "m6 6 12 12M6 18 18 6" },
  menu: { fill: "", line: "M4 7h16M4 12h16M4 17h10" },
  check: { fill: "", line: "m5 12.5 4.5 4.5L19 7.5" },
  alert: {
    fill: "M12 3 2 20h20z",
    line: "M12 3 2 20h20zM12 10v4m0 3h.01",
  },
  info: {
    fill: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18",
    line: "M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18m0-10v5m0-8h.01",
  },
  clock: {
    fill: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18",
    line: "M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18m0-14v5l3 2",
  },
  calendar: {
    fill: "M4 6h16v14H4z",
    line: "M4 6h16v14H4zm0 4h16M8 3v5m8-5v5",
  },
  sort: { fill: "", line: "M8 4v16m-4-4 4 4 4-4M16 20V4m-4 4 4-4 4 4" },
  dot: { fill: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8", line: "" },
  pause: { fill: "", line: "M9 6v12m6-12v12" },
  play: { fill: "M8 5v14l11-7z", line: "M8 5v14l11-7z" },
  sparkle: {
    fill: "M12 3c.6 4.8 2.2 6.4 7 7-4.8.6-6.4 2.2-7 7-.6-4.8-2.2-6.4-7-7 4.8-.6 6.4-2.2 7-7",
    line: "M12 3c.6 4.8 2.2 6.4 7 7-4.8.6-6.4 2.2-7 7-.6-4.8-2.2-6.4-7-7 4.8-.6 6.4-2.2 7-7M19 16v4m-2-2h4",
  },
  more: { fill: "", line: "M6 12h.01M12 12h.01M18 12h.01" },
} as const;

export type LabIconName = keyof typeof icons;

export function LabIcon({
  name,
  className = "",
  duotone = true,
}: {
  name: LabIconName;
  className?: string;
  duotone?: boolean;
}) {
  const { fill, line } = icons[name];
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={`size-5 shrink-0 ${className}`}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {fill && duotone && (
        <path d={fill} fill="currentColor" stroke="none" opacity={0.22} />
      )}
      {fill && !line && <path d={fill} fill="currentColor" stroke="none" />}
      {line && <path d={line} />}
    </svg>
  );
}
