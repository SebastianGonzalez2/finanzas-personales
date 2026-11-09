import { FinanceIcon } from "./finance-icon";
import { Card } from "./ui/card";

const indicators = [
  {
    title: "Dinero disponible",
    icon: "wallet",
    accent: "text-[#fb713f]",
    state: "Sin configurar",
    description: "Todavía no configuraste tus saldos.",
  },
  {
    title: "Ingresos del mes",
    icon: "income",
    accent: "text-[#8196ff]",
    state: "Sin datos",
    description: "Los ingresos registrados aparecerán acá.",
  },
  {
    title: "Gastos del mes",
    icon: "expense",
    accent: "text-[#4ade80]",
    state: "Sin datos",
    description: "Los gastos registrados aparecerán acá.",
  },
] as const;

const sections = [
  { title: "Recurrentes", icon: "calendar" },
  { title: "Gastos recientes", icon: "expense" },
  { title: "Fondos de ahorro", icon: "savings" },
  { title: "Ingresos recientes", icon: "income" },
] as const;

export function FinanceSummary() {
  const period = new Intl.DateTimeFormat("es-UY", {
    month: "long",
    year: "numeric",
    timeZone: "America/Montevideo",
  }).format(new Date());

  return (
    <>
      <h1
        id="titulo-pagina"
        tabIndex={-1}
        className="text-xl leading-7 font-semibold"
      >
        Resumen financiero
      </h1>
      <p className="mt-1 text-muted-foreground first-letter:uppercase">
        {period}
      </p>

      <section aria-label="Indicadores financieros" className="mt-6">
        <div className="finance-indicators">
          {indicators.map(({ title, icon, accent, state, description }) => (
            <Card
              key={title}
              className="min-h-[13.0625rem] min-w-0 gap-6 rounded-[1.125rem] p-6 shadow-none"
            >
              <h2 className="flex items-center gap-2 font-medium text-muted-foreground">
                <FinanceIcon name={icon} className={accent} />
                {title}
              </h2>
              <div>
                <p className="text-[1.625rem] leading-8 font-semibold">
                  {state}
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                  {description}
                </p>
              </div>
            </Card>
          ))}
        </div>
      </section>

      <section aria-labelledby="mis-finanzas" className="mt-5">
        <div className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-2 border-y py-3">
          <h2 id="mis-finanzas" className="text-lg font-semibold">
            Mis finanzas
          </h2>
          <nav aria-label="Secciones de Mis finanzas">
            <a
              href="/resumen#titulo-pagina"
              aria-current="page"
              className="finance-nav-link text-sm"
            >
              <FinanceIcon name="summary" />
              Resumen
            </a>
          </nav>
        </div>
        <div className="finance-board">
          {sections.map(({ title, icon }) => (
            <div
              key={title}
              className="min-w-0 rounded-2xl border bg-[var(--finance-well)] p-2"
            >
              <h3 className="flex items-center gap-2 px-2 py-2 text-sm font-semibold">
                <FinanceIcon name={icon} className="text-muted-foreground" />
                {title}
              </h3>
              <Card className="min-h-24 justify-center p-4 text-sm text-muted-foreground shadow-none">
                <p>Disponible en una próxima etapa.</p>
              </Card>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
