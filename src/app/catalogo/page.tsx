import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { listNameCatalog, nameCatalogReady } from "@/server/catalog";
import { NameCatalog } from "@/components/name-catalog";
import { FinanceShell } from "@/components/finance-shell";
import { PageHead, PageNotice, Screen } from "@/components/glaciar/screen";
import { buttonClass } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Icon } from "@/components/ui/icon";
import { withGoogleOwner } from "@/server/google-auth";
import { listMerchantTotals } from "@/server/movements";
import { bankReferenceToday, formatBankAmount } from "@/domain/bank-balances";
import { isInstallmentPeriod } from "@/domain/installments";

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
      <Screen>
        <PageHead
          eyebrow="Catálogos"
          title="Comercios y contactos"
          description="Catálogo privado para autocompletar gastos y deudas."
        />
        {result.entries ? (
          <NameCatalog
            entries={result.entries}
            contactId={typeof contact === "string" ? contact : undefined}
          >
            <section
              className="lab-panel"
              aria-labelledby="gastos-por-comercio"
            >
              <header className="lab-panel__head">
                <h2 id="gastos-por-comercio" className="lab-panel__title">
                  <span className="lab-panel__icon">
                    <Icon name="stats" className="size-4.5" />
                  </span>
                  Gastos por comercio
                </h2>
              </header>
              <form
                action="/catalogo#gastos-por-comercio"
                method="get"
                className="flex items-end gap-2"
              >
                <Field label="Mes" className="flex-1">
                  <Input
                    type="month"
                    name="month"
                    defaultValue={month}
                    max={currentMonth}
                    required
                  />
                </Field>
                <button type="submit" className={buttonClass("outline")}>
                  Consultar
                </button>
              </form>
              {totals.size > 0 ? (
                <table className="gs-table">
                  <thead>
                    <tr>
                      <th scope="col">Comercio</th>
                      <th scope="col" className="is-num">
                        Gastos
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.entries
                      .filter(
                        ({ id, kind }) => kind === "merchant" && totals.has(id),
                      )
                      .map(({ id, name }) => (
                        <tr key={id}>
                          <td>
                            <Link
                              className="lab-link"
                              href={`/historial?merchant=${id}`}
                            >
                              {name}
                            </Link>
                          </td>
                          <td className="is-num font-semibold">
                            {totals.get(id)?.join(" · ")}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              ) : (
                <p className="lab-muted text-sm">
                  No hay gastos asociados a comercios en ese mes.
                </p>
              )}
            </section>
          </NameCatalog>
        ) : (
          <PageNotice
            tone={
              result.message?.startsWith("El catálogo") ? "info" : "critical"
            }
            message={result.message ?? ""}
            retryHref="/catalogo"
          />
        )}
      </Screen>
    </FinanceShell>
  );
}
