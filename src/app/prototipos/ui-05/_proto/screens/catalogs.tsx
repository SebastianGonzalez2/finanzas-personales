import { buttonClass } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { Icon } from "@/components/ui/icon";
import { Segmented, SegmentedOption } from "@/components/ui/segmented";
import {
  EmptyState,
  ErrorState,
  FormPanel,
  PageHead,
  Review,
  RowIcon,
  Screen,
  StateTag,
  m,
} from "../kit";
import { protoHref, type ProtoState } from "../screens";

/* =============================== Categorías =============================== */

const tree = [
  {
    name: "Alimentación",
    color: "#3987e5",
    children: ["Supermercado", "Restaurantes", "Delivery"],
  },
  {
    name: "Hogar",
    color: "#199e70",
    children: ["Alquiler", "Servicios", "Mantenimiento"],
  },
  {
    name: "Transporte",
    color: "#c98500",
    children: ["Combustible", "Transporte público"],
  },
  { name: "Salud", color: "#9085e9", children: [] },
  { name: "Ocio", color: "#d55181", children: ["Salidas", "Suscripciones"] },
];

function CategoryActions({
  name,
  archived,
}: {
  name: string;
  archived?: boolean;
}) {
  return (
    <button
      type="button"
      className={buttonClass("ghost", "ml-auto")}
      aria-label={`${archived ? "Restaurar" : "Archivar"} ${name}`}
    >
      {archived ? "Restaurar" : "Archivar"}
    </button>
  );
}

export function CategoriesScreen({ state }: { state: ProtoState }) {
  const head = (
    <PageHead
      eyebrow="Catálogos"
      title="Categorías"
      description="Al archivar una categoría, se oculta junto con sus subcategorías de los formularios. Los movimientos existentes conservan su categoría."
      actions={
        state !== "error" && (
          <a
            href={protoHref("categorias", "formulario")}
            className={buttonClass("primary")}
          >
            <Icon name="plus" duotone={false} className="size-4" />
            Crear categoría
          </a>
        )
      }
    />
  );
  if (state === "error")
    return (
      <Screen>
        {head}
        <ErrorState message="No pudimos cargar tu catálogo. Volvé a intentarlo." />
      </Screen>
    );
  return (
    <Screen>
      {head}
      {state === "formulario" && (
        <FormPanel
          labelId="form-categoria"
          title="Crear categoría o subcategoría"
          onCloseHref={protoHref("categorias")}
          foot={
            <>
              <a
                href={protoHref("categorias")}
                className={buttonClass("ghost")}
              >
                Cancelar
              </a>
              <button type="button" className={buttonClass("primary")}>
                Crear categoría
              </button>
            </>
          }
        >
          <div className="ui05-form__grid ui05-form__grid--3">
            <div className="ui-field">
              <span className="ui-field__label">Tipo</span>
              <Segmented label="Tipo" className="self-start">
                <SegmentedOption pressed>Gasto</SegmentedOption>
                <SegmentedOption pressed={false}>Ingreso</SegmentedOption>
              </Segmented>
            </div>
            <Field label="Nombre">
              <Input defaultValue="Mascotas" />
            </Field>
            <Field label="Subcategoría de (opcional)">
              <Select defaultValue="">
                <option value="">Sin subcategoría</option>
                <option>Hogar</option>
              </Select>
            </Field>
          </div>
        </FormPanel>
      )}
      <div className="ui05-grid">
        <section className="lab-panel ui05-span-8" aria-labelledby="cat-gastos">
          <header className="lab-panel__head">
            <h2 id="cat-gastos" className="lab-panel__title">
              <span className="lab-kind lab-kind--expense" aria-hidden="true">
                <Icon name="expense" duotone={false} className="size-4" />
              </span>
              Gastos
            </h2>
            <span className="lab-tag lab-tag--neutral">
              5 categorías · 13 subcategorías
            </span>
          </header>
          <ul className="ui05-tree">
            {tree.map((node) => (
              <li key={node.name}>
                <div className="ui05-tree__node">
                  <span
                    className="ui05-swatch"
                    style={{ background: node.color }}
                    aria-hidden="true"
                  />
                  <span className="font-semibold">{node.name}</span>
                  {node.children.length > 0 && (
                    <span className="lab-muted text-xs">
                      {node.children.length} subcategorías
                    </span>
                  )}
                  <CategoryActions name={node.name} />
                </div>
                {node.children.length > 0 && (
                  <ul className="ui05-tree__children">
                    {node.children.map((child) => (
                      <li key={child} className="ui05-tree__node">
                        <span className="text-sm">{child}</span>
                        <CategoryActions name={child} />
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </section>
        <div className="ui05-span-4 ui05-stack">
          <section className="lab-panel" aria-labelledby="cat-ingresos">
            <header className="lab-panel__head">
              <h2 id="cat-ingresos" className="lab-panel__title">
                <span className="lab-kind lab-kind--income" aria-hidden="true">
                  <Icon name="income" duotone={false} className="size-4" />
                </span>
                Ingresos
              </h2>
            </header>
            <ul className="ui05-tree">
              {["Sueldo", "Freelance", "Reintegros"].map((name) => (
                <li key={name} className="ui05-tree__node">
                  <span className="font-semibold">{name}</span>
                  <CategoryActions name={name} />
                </li>
              ))}
            </ul>
          </section>
          <details className="lab-panel">
            <summary className="lab-panel__title cursor-pointer list-none">
              Archivadas
              <span className="lab-tag lab-tag--neutral">2</span>
            </summary>
            <ul className="ui05-tree mt-2">
              {["Gimnasio", "Cursos"].map((name) => (
                <li key={name} className="ui05-tree__node is-archived">
                  <span>{name}</span>
                  <CategoryActions name={name} archived />
                </li>
              ))}
            </ul>
          </details>
        </div>
      </div>
    </Screen>
  );
}

/* ========================== Comercios y contactos ========================== */

export function MerchantsScreen({ state }: { state: ProtoState }) {
  const head = (
    <PageHead
      eyebrow="Catálogos"
      title="Comercios y contactos"
      description="Catálogo privado para autocompletar gastos y deudas."
    />
  );
  if (state === "error")
    return (
      <Screen>
        {head}
        <ErrorState message="No pudimos cargar tu catálogo. Volvé a intentarlo." />
      </Screen>
    );
  if (state === "vacio")
    return (
      <Screen>
        {head}
        <EmptyState
          icon="merchants"
          title="Todavía no hay comercios ni contactos en tu catálogo"
        >
          Los nombres que ingresás al guardar gastos o deudas también se agregan
          al catálogo.
        </EmptyState>
      </Screen>
    );
  return (
    <Screen>
      {head}
      {state === "unificar" && (
        <FormPanel
          labelId="form-unificar"
          title="Unificar comercios"
          description="El duplicado queda como alias del que se conserva. Los movimientos existentes no cambian de importe."
          onCloseHref={protoHref("comercios")}
          foot={
            <>
              <a href={protoHref("comercios")} className={buttonClass("ghost")}>
                Cancelar
              </a>
              <button type="button" className={buttonClass("primary")}>
                Confirmar unificación
              </button>
            </>
          }
        >
          <div className="ui05-form__grid">
            <Field label="Comercio duplicado">
              <Select defaultValue="Super Central">
                <option>Super Central</option>
              </Select>
            </Field>
            <Field label="Comercio que se conserva">
              <Select defaultValue="Supermercado Central">
                <option>Supermercado Central</option>
              </Select>
            </Field>
          </div>
          <Review
            rows={[["Vista previa", "«Super Central» quedará como alias."]]}
          />
        </FormPanel>
      )}
      <div className="ui05-grid">
        <section
          className="lab-panel ui05-span-7"
          aria-labelledby="catalogo-lista"
        >
          <header className="lab-panel__head">
            <h2 id="catalogo-lista" className="lab-panel__title">
              <span className="lab-panel__icon">
                <Icon name="merchants" className="size-4.5" />
              </span>
              Catálogo
            </h2>
            <a href={protoHref("comercios", "unificar")} className="lab-link">
              Unificar comercios
              <Icon name="chevronRight" duotone={false} className="size-3.5" />
            </a>
          </header>
          <form className="grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
            <Field label="Nombre">
              <Input placeholder="Agregar comercio o contacto" />
            </Field>
            <Field label="Tipo">
              <Select defaultValue="Comercio">
                <option>Comercio</option>
                <option>Contacto</option>
              </Select>
            </Field>
            <button type="button" className={buttonClass("outline")}>
              Agregar
            </button>
          </form>
          <ul className="ui05-rows">
            {[
              [
                "Supermercado Central",
                "Comercio · 1 alias",
                "merchants",
                false,
              ],
              ["Parrilla del Puerto", "Comercio", "merchants", false],
              ["Lucía", "Contacto · deuda activa", "account", false],
              ["Martín", "Contacto", "account", false],
              ["Kiosco La Esquina", "Comercio · archivado", "merchants", true],
            ].map(([name, sub, icon, archived]) => (
              <li key={name as string}>
                <RowIcon name={icon as "merchants" | "account"} />
                <div className="ui05-row__main">
                  <p
                    className={`ui05-row__title ${archived ? "text-[var(--glaciar-faint)]" : ""}`}
                  >
                    {name}
                  </p>
                  <p className="ui05-row__sub">{sub}</p>
                </div>
                <button type="button" className={buttonClass("ghost")}>
                  {archived ? "Restaurar" : "Archivar"}
                </button>
              </li>
            ))}
          </ul>
        </section>
        <section
          className="lab-panel ui05-span-5"
          aria-labelledby="gastos-comercio"
        >
          <header className="lab-panel__head">
            <h2 id="gastos-comercio" className="lab-panel__title">
              <span className="lab-panel__icon">
                <Icon name="stats" className="size-4.5" />
              </span>
              Gastos por comercio
            </h2>
          </header>
          <form className="flex items-end gap-2">
            <Field label="Mes" className="flex-1">
              <Input type="month" defaultValue="2026-11" />
            </Field>
            <button type="button" className={buttonClass("outline")}>
              Consultar
            </button>
          </form>
          <table className="ui05-table">
            <thead>
              <tr>
                <th>Comercio</th>
                <th className="is-num">Gastos</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["Supermercado Central", m("11930.00")],
                ["Parrilla del Puerto", m("4520.00")],
                ["Estación Norte", m("3100.00")],
                ["Farmacia del Centro", m("1200.00")],
              ].map(([name, amount]) => (
                <tr key={name}>
                  <td>{name}</td>
                  <td className="is-num font-semibold">{amount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </Screen>
  );
}

/* ================================ Etiquetas ================================ */

export function TagsScreen({ state }: { state: ProtoState }) {
  return (
    <Screen>
      <PageHead
        back={{
          href: "/prototipos/ui/final?vista=movimientos",
          label: "Volver al historial",
        }}
        eyebrow="Catálogos"
        title="Etiquetas"
        description="Creá, renombrá y archivá las etiquetas que usás para clasificar movimientos."
      />
      <div className="ui05-grid">
        <section
          className="lab-panel ui05-span-8"
          aria-labelledby="mis-etiquetas"
        >
          <h2 id="mis-etiquetas" className="lab-panel__title">
            <span className="lab-panel__icon">
              <Icon name="categories" className="size-4.5" />
            </span>
            Mis etiquetas
          </h2>
          <form className="flex items-end gap-2">
            <Field label="Nueva etiqueta" className="flex-1">
              <Input placeholder="Ej.: vacaciones" />
            </Field>
            <button type="button" className={buttonClass("primary")}>
              Crear etiqueta
            </button>
          </form>
          {state === "vacio" ? (
            <p className="lab-muted py-6 text-center text-sm">
              Todavía no creaste etiquetas. También podés crearlas al clasificar
              un movimiento.
            </p>
          ) : (
            <ul className="ui05-rows">
              {[
                ["vacaciones", false],
                ["trabajo", false],
                ["regalos", false],
                ["mudanza-2025", true],
              ].map(([name, archived]) => (
                <li key={name as string}>
                  <span className="lab-chip pointer-events-none">#{name}</span>
                  <span className="ml-auto flex gap-1">
                    {!archived && (
                      <button type="button" className={buttonClass("ghost")}>
                        Renombrar
                      </button>
                    )}
                    {archived && <StateTag tone="neutral">Archivada</StateTag>}
                    <button type="button" className={buttonClass("ghost")}>
                      {archived ? "Restaurar" : "Archivar"}
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </Screen>
  );
}
