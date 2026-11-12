import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { FinanceShell } from "@/components/finance-shell";
import { TagFields } from "@/components/classification-fields";
import {
  HistoryField,
  historyButton,
  historyControl,
  historyPrimary,
} from "@/components/history-fields";
import { Card } from "@/components/ui/card";
import {
  bankCurrencies,
  bankReferenceToday,
  formatBankAmount,
} from "@/domain/bank-balances";
import { parseHistoryParams } from "@/domain/history";
import { isInstallmentPeriod } from "@/domain/installments";
import { categoryTotals } from "@/server/category-totals";
import { classificationReady, listTags } from "@/server/classification";
import { withGoogleOwner } from "@/server/google-auth";

export const metadata = { title: "Estadísticas | Finanzas personales" };
export const dynamic = "force-dynamic";

export default async function StatisticsPage({
  searchParams,
}: PageProps<"/estadisticas">) {
  const { month, tags } = await searchParams;
  const period = isInstallmentPeriod(month)
    ? month
    : bankReferenceToday().slice(0, 7);
  const query = parseHistoryParams({ tags });
  const tagIds = "error" in query ? [] : (query.filters.tags?.split(",") ?? []);
  const data = await withGoogleOwner(
    new Request("https://internal.invalid", { headers: await headers() }),
    async (client, ownerId) => {
      if (!(await classificationReady(client))) return null;
      return {
        tags: await listTags(client, ownerId),
        rows:
          "error" in query
            ? []
            : await categoryTotals(client, ownerId, `${period}-01`, tagIds),
      };
    },
  ).catch((error: unknown) => {
    if (error instanceof Error && error.message === "Acceso denegado")
      redirect("/auth/sign-in");
    return null;
  });
  return (
    <FinanceShell current="estadisticas">
      <div className="grid gap-4">
        <h1 id="titulo-pagina" tabIndex={-1} className="text-2xl font-semibold">
          Estadísticas
        </h1>
        {data ? (
          <>
            <Card className="gap-3 p-4">
              <form action="/estadisticas" method="get" className="grid gap-3">
                <div className="w-fit">
                  <HistoryField label="Mes">
                    <input
                      name="month"
                      type="month"
                      defaultValue={period}
                      required
                      className={historyControl}
                    />
                  </HistoryField>
                </div>
                {data.tags.length > 0 && (
                  <TagFields tags={data.tags} filter initial={tagIds} />
                )}
                <div className="flex flex-wrap gap-2">
                  <button type="submit" className={historyPrimary}>
                    Aplicar filtros
                  </button>
                  <Link href="/etiquetas" className={historyButton}>
                    Gestionar etiquetas
                  </Link>
                </div>
              </form>
            </Card>
            {"error" in query ? (
              <p role="alert">{query.error}</p>
            ) : data.rows.length === 0 ? (
              <p role="status">No hay ingresos ni gastos que coincidan.</p>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {(["income", "expense"] as const).map((kind) => (
                  <Card key={kind} className="gap-3 p-4">
                    <h2 className="font-semibold">
                      {kind === "income" ? "Ingresos" : "Gastos"}
                    </h2>
                    {bankCurrencies.map((currency) => {
                      const rows = data.rows.filter(
                        (row) => row.kind === kind && row.currency === currency,
                      );
                      if (!rows.length) return null;
                      return (
                        <dl key={currency} className="grid gap-2 text-sm">
                          {rows.map((row) => (
                            <div
                              key={
                                row.total ? "total" : (row.categoryId ?? "none")
                              }
                              className={`flex flex-wrap justify-between gap-x-3 ${row.total ? "border-b pb-1 font-semibold" : ""}`}
                            >
                              <dt>
                                {row.total
                                  ? `Total ${currency}`
                                  : (row.category ?? "Sin categorizar")}
                              </dt>
                              <dd>{formatBankAmount(row)}</dd>
                            </div>
                          ))}
                        </dl>
                      );
                    })}
                    {!data.rows.some((row) => row.kind === kind) && (
                      <p className="text-sm text-muted-foreground">
                        Sin movimientos en el período.
                      </p>
                    )}
                  </Card>
                ))}
              </div>
            )}
          </>
        ) : (
          <p role="status">
            Las estadísticas por categoría no están disponibles en este momento.
          </p>
        )}
      </div>
    </FinanceShell>
  );
}
