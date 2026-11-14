import type { ReactNode } from "react";

// UI-02: controles compartidos con el estilo Glaciar (`.ui-control`, `.ui-btn`
// en globals.css). Mantienen 44 px de alto y permiten texto en varias líneas
// para no desbordar en 360 px.
export const historyControl = "ui-control";
const historyButtonBase =
  "ui-btn min-h-11 px-3 py-2 text-center whitespace-normal";
export const historyButton = `${historyButtonBase} ui-btn--outline`;
export const historyPrimary = `${historyButtonBase} ui-btn--primary`;

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

export function AmountInput(
  props: Pick<
    React.ComponentProps<"input">,
    "name" | "required" | "value" | "onChange"
  > & { defaultValue?: string },
) {
  const { defaultValue, ...fields } = props;
  return (
    <input
      className={historyControl}
      {...fields}
      maxLength={22}
      inputMode="decimal"
      autoComplete="off"
      placeholder="0,00"
      defaultValue={defaultValue?.replace(".", ",")}
    />
  );
}
