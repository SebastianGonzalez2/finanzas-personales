import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { requireGoogleOwnerPage } from "@/server/require-google-owner-page";
import { CardCycleScreen, CardsScreen } from "../_proto/screens/cards";
import { BudgetsScreen, FundsScreen } from "../_proto/screens/planning";
import { ReportsScreen, StatisticsScreen } from "../_proto/screens/analysis";
import { RecurringScreen } from "../_proto/screens/recurring";
import {
  BenefitsScreen,
  DebtDetailScreen,
  DebtsScreen,
} from "../_proto/screens/obligations";
import {
  CategoriesScreen,
  MerchantsScreen,
  TagsScreen,
} from "../_proto/screens/catalogs";
import {
  AccountScreen,
  HelpScreen,
  NoticesScreen,
} from "../_proto/screens/support";
import { ProtoShell } from "../_proto/shell";
import { protoScreens, type ProtoState } from "../_proto/screens";

const views: Record<string, (props: { state: ProtoState }) => ReactNode> = {
  tarjetas: CardsScreen,
  "tarjeta-ciclo": CardCycleScreen,
  fondos: FundsScreen,
  presupuestos: BudgetsScreen,
  estadisticas: StatisticsScreen,
  informes: ReportsScreen,
  recurrentes: RecurringScreen,
  deudas: DebtsScreen,
  "deuda-detalle": DebtDetailScreen,
  beneficios: BenefitsScreen,
  categorias: CategoriesScreen,
  comercios: MerchantsScreen,
  etiquetas: TagsScreen,
  avisos: NoticesScreen,
  ayuda: HelpScreen,
  cuenta: AccountScreen,
};

export async function generateMetadata(
  props: PageProps<"/prototipos/ui-05/[pantalla]">,
) {
  const { pantalla } = await props.params;
  const screen = protoScreens.find(({ key }) => key === pantalla);
  return { title: `${screen?.title ?? "Prototipo"} | Prototipos UI-05` };
}

export default async function PrototypeScreen(
  props: PageProps<"/prototipos/ui-05/[pantalla]">,
) {
  // Solo datos ficticios, pero se mantiene la regla F6-02: toda página exige
  // sesión y titular en servidor. La URL solo elige la pantalla y el estado.
  await requireGoogleOwnerPage();
  const { pantalla } = await props.params;
  const { estado } = await props.searchParams;
  const screen = protoScreens.find(({ key }) => key === pantalla);
  const View = views[pantalla];
  if (!screen || !View) notFound();
  const state = screen.states.find((item) => item === estado) ?? "normal";
  return (
    <ProtoShell current={screen.destination} screen={screen} state={state}>
      <View state={state} />
    </ProtoShell>
  );
}
