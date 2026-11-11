import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { FinanceShell } from "@/components/finance-shell";
import { RecurrenceForm } from "@/components/recurrence-form";
import { Card } from "@/components/ui/card";
import {
  bankReferenceToday,
  formatBankAmount,
  formatBankReference,
} from "@/domain/bank-balances";
import { withGoogleOwner } from "@/server/google-auth";
import { listMovementCategories } from "@/server/movements";
import { listRecurrences, recurrencesReady } from "@/server/recurrences";

export const metadata = { title: "Recurrentes | Finanzas personales" };
export const dynamic = "force-dynamic";

const frequencies = {
  weekly: "Semanal",
  monthly: "Mensual",
  quarterly: "Trimestral",
  yearly: "Anual",
};
const statuses = {
  active: "Activa",
  paused: "Pausada",
  finished: "Finalizada",
};

export default async function RecurrencesPage() {
  const today = bankReferenceToday();
  const result = await withGoogleOwner(
    new Request("https://internal.invalid", { headers: await headers() }),
    async (client, ownerId) => {
      if (!(await recurrencesReady(client)))
        return {
          message:
            "Las recurrencias estarán disponibles cuando se actualice la base de datos.",
        };
      return {
        recurrences: await listRecurrences(client, ownerId, today),
        categories: await listMovementCategories(client, ownerId),
      };
    },
  ).catch((error: unknown) => {
    if (error instanceof Error && error.message === "Acceso denegado")
      redirect("/auth/sign-in");
    return {
      message: "No pudimos cargar tus recurrencias. Volvé a intentarlo.",
    };
  });

  return (
    <FinanceShell current="recurrentes">
      <div className="grid gap-4">
        <h1 id="titulo-pagina" tabIndex={-1} className="text-2xl font-semibold">
          Recurrentes
        </h1>
        {"recurrences" in result && result.recurrences ? (
          <>
            <RecurrenceForm
              today={today}
              categories={result.categories}
              frequencies={frequencies}
            />
            {result.recurrences.length ? (
              <ul aria-label="Recurrencias guardadas" className="grid gap-3">
                {result.recurrences.map((series) => (
                  <li key={series.id}>
                    <Card className="gap-2 p-4 break-words">
                      <h2 className="text-lg font-semibold">
                        {series.concept}
                      </h2>
                      <p className="text-sm text-muted-foreground">
                        {series.kind === "income" ? "Ingreso" : "Gasto"} ·{" "}
                        {frequencies[series.frequency]} ·{" "}
                        {statuses[series.status]}
                      </p>
                      <dl className="grid gap-2 text-sm sm:grid-cols-2">
                        <div>
                          <dt>Primer período</dt>
                          <dd>
                            {series.first.key} · Comienza el{" "}
                            {formatBankReference(series.firstPeriod)}
                          </dd>
                        </div>
                        {series.endDate && (
                          <div>
                            <dt>Fecha final</dt>
                            <dd>{formatBankReference(series.endDate)}</dd>
                          </div>
                        )}
                        <div>
                          <dt>Importe de referencia</dt>
                          <dd>
                            {series.referenceAmount
                              ? formatBankAmount({
                                  amount: series.referenceAmount,
                                  currency: series.currency,
                                })
                              : `Sin importe · ${series.currency}`}
                          </dd>
                        </div>
                        <div>
                          <dt>Vencimiento habitual</dt>
                          <dd>
                            {series.dateMode === "none"
                              ? "Sin fecha"
                              : series.dateMode === "approximate"
                                ? "Fecha aproximada"
                                : series.dueDay === null
                                  ? "Cada siete días desde el inicio"
                                  : `Día ${series.dueDay}`}
                          </dd>
                        </div>
                        {series.category && (
                          <div>
                            <dt>Categoría</dt>
                            <dd>{series.category}</dd>
                          </div>
                        )}
                        {series.latest && (
                          <div>
                            <dt>Último período previsto</dt>
                            <dd>
                              {series.latest.key} ·{" "}
                              {series.kind === "income"
                                ? "Sin cobro confirmado"
                                : "Sin pago confirmado"}
                              {series.latest.dueOn &&
                                ` · Vence el ${formatBankReference(series.latest.dueOn)}`}
                            </dd>
                          </div>
                        )}
                      </dl>
                      {series.note && (
                        <p className="text-sm whitespace-pre-wrap">
                          {series.note}
                        </p>
                      )}
                    </Card>
                  </li>
                ))}
              </ul>
            ) : (
              <p role="status">Todavía no tenés recurrencias.</p>
            )}
          </>
        ) : (
          <Card className="p-4">
            <p role="status">{result.message}</p>
          </Card>
        )}
      </div>
    </FinanceShell>
  );
}
