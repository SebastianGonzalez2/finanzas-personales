import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { FinanceShell } from "@/components/finance-shell";
import { AccountDeletion } from "@/components/account-deletion";
import { AccountBackup } from "@/components/account-backup";
import { FinancialReset } from "@/components/financial-reset";
import { GoogleAccess } from "@/components/google-access";
import { PageHead, Screen } from "@/components/glaciar/screen";
import { Icon } from "@/components/ui/icon";
import { accountDeletionProof } from "@/server/account-deletion";
import { financialResetProof } from "@/server/financial-reset";
import { withGoogleOwner } from "@/server/google-auth";

export const metadata = { title: "Mi cuenta | Finanzas personales" };
export const dynamic = "force-dynamic";

export default async function Account() {
  const proofs = await withGoogleOwner(
    new Request("https://internal.invalid", { headers: await headers() }),
    async (_client, _ownerId, sessionToken) => ({
      deletion: accountDeletionProof(sessionToken),
      reset: financialResetProof(sessionToken),
    }),
  ).catch(() => null);
  if (!proofs) redirect("/auth/sign-in");

  return (
    <FinanceShell current="account">
      <Screen>
        <PageHead eyebrow="Tu cuenta" title="Mi cuenta" />
        <div className="gs-stack max-w-3xl">
          <section
            className="lab-panel c-feature"
            aria-labelledby="cuenta-conectada"
          >
            <header className="lab-panel__head">
              <h2 id="cuenta-conectada" className="lab-panel__title">
                <span className="lab-panel__icon">
                  <Icon name="account" className="size-4.5" />
                </span>
                Tu cuenta está conectada
              </h2>
              <span className="lab-tag lab-tag--good">
                <Icon name="check" duotone={false} className="size-3" />
                Google
              </span>
            </header>
            <p className="lab-muted text-sm">
              Tu acceso es privado y está vinculado a una cuenta Google
              autorizada.
            </p>
            <div className="self-start">
              <GoogleAccess signOut />
            </div>
          </section>
          <FinancialReset proof={proofs.reset} />
          <AccountBackup />
          <AccountDeletion proof={proofs.deletion} />
        </div>
      </Screen>
    </FinanceShell>
  );
}
