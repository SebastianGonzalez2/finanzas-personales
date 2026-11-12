import { FinanceShell } from "@/components/finance-shell";
import { AccountBackup } from "@/components/account-backup";
import { GoogleAccess } from "@/components/google-access";
import { Card } from "@/components/ui/card";
import { requireGoogleOwnerPage } from "@/server/require-google-owner-page";

export const metadata = { title: "Mi cuenta | Finanzas personales" };
export const dynamic = "force-dynamic";

export default async function Account() {
  await requireGoogleOwnerPage();

  return (
    <FinanceShell current="account">
      <h1
        id="titulo-pagina"
        tabIndex={-1}
        className="text-xl leading-7 font-semibold"
      >
        Mi cuenta
      </h1>
      <Card className="mt-6 max-w-lg gap-4 p-6 shadow-none">
        <h2 className="text-lg font-semibold">Tu cuenta está conectada</h2>
        <p className="text-muted-foreground">
          Tu acceso es privado y está vinculado a una cuenta Google autorizada.
        </p>
        <div className="self-start">
          <GoogleAccess signOut />
        </div>
      </Card>
      <AccountBackup />
    </FinanceShell>
  );
}
