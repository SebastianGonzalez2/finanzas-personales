import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { FinanceShell } from "@/components/finance-shell";
import {
  BudgetThresholdNotice,
  NoticeCard,
  NoticeGroup,
} from "@/components/notices";
import {
  EmptyState,
  PageHead,
  PageNotice,
  Screen,
} from "@/components/glaciar/screen";
import { DueNoticeList } from "@/components/due-notices";
import { bankReferenceToday } from "@/domain/bank-balances";
import { withGoogleOwner } from "@/server/google-auth";
import { refreshOwnerReferences } from "@/server/exchange-rate-http";
import { budgetReferenceDates, listBudgetNotices } from "@/server/budgets";
import { listRecurrenceDueNotices } from "@/server/due-notices";

export const metadata = { title: "Avisos | Finanzas personales" };
export const dynamic = "force-dynamic";

// SIMP-03 — Avisos de presupuestos y de gastos recurrentes.
export default async function NoticesPage() {
  const today = bankReferenceToday();
  const month = today.slice(0, 7);
  const request = new Request("https://internal.invalid", {
    headers: await headers(),
  });
  const dates = await withGoogleOwner(request, (client, ownerId) =>
    budgetReferenceDates(client, ownerId, month, today),
  ).catch(() => []);
  await refreshOwnerReferences(request, dates, today).catch(() => undefined);

  const result = await withGoogleOwner(request, async (client, ownerId) => ({
    budgetNotices: await listBudgetNotices(client, ownerId, month),
    recurrenceNotices: (
      await listRecurrenceDueNotices(client, ownerId, today)
    ).filter(({ isPayment }) => isPayment),
  })).catch((error: unknown) => {
    if (error instanceof Error && error.message === "Acceso denegado")
      redirect("/auth/sign-in");
    return null;
  });

  const thresholdAlerts = result?.budgetNotices ?? [];
  const recurrenceNotices = result?.recurrenceNotices ?? [];
  const quiet = thresholdAlerts.length === 0 && recurrenceNotices.length === 0;

  return (
    <FinanceShell current="avisos">
      <Screen>
        <PageHead
          eyebrow="Tu cuenta"
          title="Avisos"
          description="Presupuestos y vencimientos de gastos recurrentes según tus registros."
        />
        {!result && (
          <PageNotice
            tone="critical"
            message="No pudimos cargar tus avisos. Volvé a intentarlo."
            retryHref="/avisos"
          />
        )}
        {result && (
          <div className="gs-grid">
            <div className="gs-stack gs-lane-main">
              {quiet && (
                <EmptyState icon="check" title="Todo al día">
                  No tenés avisos nuevos. Te avisamos acá cuando se acerque el
                  vencimiento de un gasto recurrente o un presupuesto llegue al
                  80 %.
                </EmptyState>
              )}
              {thresholdAlerts.length > 0 && (
                <NoticeGroup
                  id="avisos-presupuestos"
                  title="Presupuestos"
                  icon="budgets"
                  count={thresholdAlerts.length}
                >
                  <ul className="b-notices">
                    {thresholdAlerts.map(
                      ({
                        budgetId,
                        categoryName,
                        currency,
                        threshold,
                        percent,
                      }) => (
                        <li key={`${budgetId}-${threshold}`}>
                          <NoticeCard
                            level={threshold === 100 ? "danger" : "warning"}
                            href="/presupuestos"
                            linkLabel="Ver presupuestos"
                          >
                            <p className="font-medium">
                              {categoryName} · {currency}
                            </p>
                            <BudgetThresholdNotice
                              categoryName={categoryName}
                              percent={percent}
                              state={threshold === 100 ? "danger" : "warning"}
                            />
                          </NoticeCard>
                        </li>
                      ),
                    )}
                  </ul>
                </NoticeGroup>
              )}
            </div>
            <div className="gs-stack gs-lane-side">
              <DueNoticeList
                headingId="avisos-recurrentes"
                title="Recurrentes"
                icon="recurring"
                notices={recurrenceNotices}
                emptyText="No hay vencimientos de recurrentes dentro de los próximos días según tu configuración."
              />
            </div>
          </div>
        )}
      </Screen>
    </FinanceShell>
  );
}
