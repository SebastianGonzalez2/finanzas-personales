import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { listNameCatalog, nameCatalogReady } from "@/server/catalog";
import { NameCatalog } from "@/components/name-catalog";
import { FinanceShell } from "@/components/finance-shell";
import { Card } from "@/components/ui/card";
import { withGoogleOwner } from "@/server/google-auth";
import { listMerchantTotals } from "@/server/movements";
import { bankReferenceToday, formatBankAmount } from "@/domain/bank-balances";
import { isInstallmentPeriod } from "@/domain/installments";
import {
  HistoryField,
  historyControl,
  historyPrimary,
} from "@/components/history-fields";

export const metadata = {
  title: "Comercios y contactos | Finanzas personales",
};
export const dynamic = "force-dynamic";

export default async function CatalogPage({
  searchParams,
}: PageProps<"/catalogo">) {
  const { month: requestedMonth, contact } = await searchParams;
  const currentMonth = bankReferenceToday().slice(0, 7);
  const month =
    isInstallmentPeriod(requestedMonth) && requestedMonth <= currentMonth
      ? requestedMonth
      : currentMonth;
  const result = await withGoogleOwner(
    new Request("https://internal.invalid", { headers: await headers() }),
    async (client, ownerId) => {
      if (!(await nameCatalogReady(client)))
        return {
          entries: undefined,
          message:
            "El catálogo estará disponible cuando se actualice la base de datos.",
        };
      return {
        entries: await listNameCatalog(client, ownerId),
        totals: await listMerchantTotals(client, ownerId, `${month}-01`),
      };
    },
  ).catch((error: unknown) => {
    if (error instanceof Error && error.message === "Acceso denegado")
      redirect("/auth/sign-in");
    return {
      entries: undefined,
      message: "No pudimos cargar tu catálogo. Volvé a intentarlo.",
    };
  });

  const totals = new Map<string, string[]>();
  for (const total of result.entries ? result.totals : []) {
    const amounts = totals.get(total.merchantId) ?? [];
    amounts.push(formatBankAmount(total));
    totals.set(total.merchantId, amounts);
  }

  return (
    <FinanceShell current="catalogo">
      <div className="grid gap-4">
        <header>
          <h1
            id="titulo-pagina"
            tabIndex={-1}
            className="text-2xl font-semibold"
          >
            Comercios y contactos
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Catálogo privado para autocompletar gastos y deudas.
          </p>
        </header>
        {result.entries ? (
          <>
            <NameCatalog
              entries={result.entries}
              contactId={typeof contact === "string" ? contact : undefined}
            />
            <Card className="gap-3 p-4">
              <h2 id="gastos-por-comercio" className="font-semibold">
                Gastos por comercio
              </h2>
              <form
                action="/catalogo#gastos-por-comercio"
                method="get"
                className="flex flex-wrap items-end gap-2"
              >
                <HistoryField label="Mes">
                  <input
                    type="month"
                    name="month"
                    className={historyControl}
                    defaultValue={month}
                    max={currentMonth}
                    required
                  />
                </HistoryField>
                <button type="submit" className={historyPrimary}>
                  Consultar
                </button>
              </form>
              {totals.size > 0 ? (
                <ul className="grid gap-2">
                  {result.entries
                    .filter(
                      ({ id, kind }) => kind === "merchant" && totals.has(id),
                    )
                    .map(({ id, name }) => (
                      <li
                        key={id}
                        className="flex flex-wrap justify-between gap-2"
                      >
                        <Link
                          className="underline"
                          href={`/historial?merchant=${id}`}
                        >
                          {name}
                        </Link>
                        <span className="tabular-nums">
                          {totals.get(id)?.join(" · ")}
                        </span>
                      </li>
                    ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No hay gastos asociados a comercios en ese mes.
                </p>
              )}
            </Card>
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
