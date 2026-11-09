const paths = {
  finance: "M3 9h18L12 3 3 9Zm2 3v6m5-6v6m4-6v6m5-6v6M3 21h18",
  summary: "m3 10 9-7 9 7v10H3V10Zm6 10v-6h6v6",
  account:
    "M15.5 8a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0ZM5 21v-2a5 5 0 0 1 5-5h4a5 5 0 0 1 5 5v2",
  menu: "M4 6h16M4 12h16M4 18h16",
  close: "m6 6 12 12M6 18 18 6",
  chevron: "m9 6 6 6-6 6",
  wallet: "M19 8V5H6a3 3 0 0 0 0 6h15v9H6a3 3 0 0 1-3-3V8m18 6h-5v3h5",
  income: "M12 4v12m-4-4 4 4 4-4M4 17v3h16v-3",
  expense: "M12 16V4m-4 4 4-4 4 4M4 17v3h16v-3",
  calendar: "M4 7h16v13H4V7Zm0 4h16M8 4v5m8-5v5",
  savings: "M4 7h16v13H4V7Zm-1 0h18V4H3v3Zm6 5h6",
} as const;

export function FinanceIcon({
  name,
  className = "",
}: {
  name: keyof typeof paths;
  className?: string;
}) {
  return (
    <svg
      aria-hidden="true"
      className={`size-5 shrink-0 ${className}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={paths[name]} />
    </svg>
  );
}
