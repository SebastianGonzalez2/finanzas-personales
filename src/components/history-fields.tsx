import type { ReactNode } from "react";

export const historyControl =
  "block min-h-11 w-full min-w-0 rounded-lg border bg-background px-3 py-2 text-base";
export const historyButton =
  "inline-flex min-h-11 items-center justify-center rounded-lg border px-3 py-2 text-sm font-semibold hover:bg-muted disabled:opacity-60";
export const historyPrimary = `${historyButton} border-primary bg-primary text-primary-foreground hover:bg-primary/85`;

export function HistoryField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="grid min-w-0 gap-1 text-sm font-medium">
      {label}
      {children}
    </label>
  );
}
