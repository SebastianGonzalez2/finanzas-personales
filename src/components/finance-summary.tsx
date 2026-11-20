import { MonthField } from "./ui/date-fields";
import { formatBankAmount, formatBankReference } from "@/domain/bank-balances";
import {
  type MovementTotal,
  type SummaryRecentMovement,
} from "@/domain/movements";
import type { CatalogCategory } from "@/domain/categories";
import {
  installmentPeriodAt,
  isInstallmentPeriod,
  type MonthlyInstallment,
} from "@/domain/installments";
import Link from "next/link";
import { Icon } from "./ui/icon";
import { MovementForm } from "./movement-form";
import type { MovementTag } from "@/domain/classification";
import { historyButton } from "./history-fields";
import { Card } from "./ui/card";

import type { summaryPeriods } from "@/domain/summary-period";
import type { Currency } from "@/domain/money";
import { SummaryRecent } from "./glaciar-summary/summary-recent";
import {
  SummaryExpenses,
  SummaryPlanning,
  type SummaryFx,
  type SummaryWidgets,
} from "./glaciar-summary/summary-panels";

// SIMP-03 — Resumen de gastos: total del mes con comparación, categorías,
// evolución, últimos gastos, presupuestos y próximos pagos recurrentes.
const weekday = new Intl.DateTimeFormat("es-UY", {
  weekday: "long",
  timeZone: "UTC",
});
const monthParts = new Intl.DateTimeFormat("es-UY", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

function part(parts: Intl.DateTimeFormatPart[], type: string) {
  return parts.find((item) => item.type === type)?.value ?? "";
}

function capitalize(text: string) {
  return text.charAt(0).toLocaleUpperCase("es") + text.slice(1);
}

function headerDate(iso: string) {
  const day = weekday.format(new Date(`${iso}T12:00:00Z`));
  return `${capitalize(day)} ${formatBankReference(iso)}`;
}

function headerMonth(period: string) {
  const parts = monthParts.formatToParts(new Date(`${period}-01T12:00:00Z`));
  return capitalize(`${part(parts, "month")} ${part(parts, "year")}`);
}

export function FinanceSummary({
  today,
  period,
  categories,
  tags,
  monthlyInstallments,
  totals,
  recent,
  movementRegistrationReady,
  currency,
  periods,
  fx,
  panels,
  movementReadable,
}: {
  today: string;
  period: string;
  categories: CatalogCategory[];
  tags?: MovementTag[] | null;
  monthlyInstallments: MonthlyInstallment[];
  totals: MovementTotal[];
  recent: SummaryRecentMovement[];
  movementRegistrationReady: boolean;
  currency: Currency;
  periods: ReturnType<typeof summaryPeriods>;
  fx: SummaryFx;
  panels: SummaryWidgets | null;
  movementReadable: boolean;
}) {
  const stepper = (offset: number) => {
    const target = installmentPeriodAt(period, offset);
    const label = offset < 0 ? "Mes anterior" : "Mes siguiente";
    const arrow = (
      <Icon
        name={offset < 0 ? "chevronLeft" : "chevronRight"}
        duotone={false}
        className="size-4"
      />
    );
    return isInstallmentPeriod(target) ? (
      <Link
        href={`/resumen?month=${target}`}
        className="lab-stepper__btn"
        aria-label={label}
      >
        {arrow}
      </Link>
    ) : (
      <button
        className="lab-stepper__btn"
        type="button"
        aria-label={label}
        disabled
      >
        {arrow}
      </button>
    );
  };

  return (
    <div className="glaciar-summary">
      <div className="f-pagehead">
        <div>
          <p className="c-eyebrow">
            <span className="c-eyebrow__line" aria-hidden="true" />
            <time dateTime={today}>{headerDate(today)}</time>
          </p>
          <h1 id="titulo-pagina" tabIndex={-1} className="f-title">
            Resumen de gastos
          </h1>
        </div>
        <div className="lab-stepper" role="group" aria-label="Mes del reporte">
          {stepper(-1)}
          <details className="relative">
            <summary className="lab-stepper__label cursor-pointer list-none">
              <Icon name="calendar" className="size-4" />
              <span>{headerMonth(period)}</span>
              <span className="sr-only"> · Elegir otro mes</span>
            </summary>
            <form
              action="/resumen"
              method="get"
              className="mt-2 grid gap-2 pb-2"
            >
              <MonthField
                label="Elegir mes"
                variant="history"
                name="month"
                required
                min="0001-01"
                max="9999-12"
                defaultValue={period}
              />
              <button type="submit" className={historyButton}>
                Ver mes
              </button>
            </form>
          </details>
          {stepper(1)}
        </div>
      </div>
      {movementRegistrationReady ? (
        <MovementForm today={today} categories={categories} tags={tags} />
      ) : (
        <p className="mt-4 text-sm text-muted-foreground">
          El registro de gastos todavía no está disponible.
        </p>
      )}

      <section aria-label="Indicadores de gastos" className="b-grid">
        <SummaryExpenses
          currency={currency}
          fx={fx}
          periods={periods}
          totals={totals}
          today={today}
        />
        <SummaryPlanning panels={panels} today={today} period={period} />
        <SummaryRecent
          recent={recent}
          available={movementReadable}
          canCorrect={movementRegistrationReady}
        />
      </section>
      {monthlyInstallments.length > 0 && (
        <section aria-label="Detalle de gastos">
          <Card className="mt-4 min-w-0 gap-3 rounded-2xl p-4 text-sm shadow-none">
            <h3 className="font-semibold">
              Cuotas incluidas en los gastos del mes
            </h3>
            <p className="text-muted-foreground">
              {period > today.slice(0, 7)
                ? "Proyección según el calendario vigente."
                : "Importes imputados al mes según el calendario vigente."}
            </p>
            <ul aria-label="Cuotas del mes" className="divide-y">
              {monthlyInstallments.map((item) => (
                <li
                  key={item.id}
                  className="flex flex-wrap justify-between gap-x-3 py-2 wrap-anywhere"
                >
                  <span>
                    <a
                      href={`/historial/movimientos/${item.id}`}
                      className="underline"
                    >
                      {item.concept}
                    </a>{" "}
                    · Cuota {item.ordinal} ·{" "}
                    {item.category ?? "Sin categorizar"}
                  </span>
                  <span className="font-semibold">
                    {formatBankAmount(item)}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </section>
      )}
    </div>
  );
}
