# UI-05A — Plan técnico: kit Glaciar y Tarjetas

**Ticket:** UI-05A · **Rama:** `codex/UI-05A-kit-tarjetas` · **Fecha:** 2026-11-15 · **Ejecuta:** Sonnet (esfuerzo medio), según la issue #81.

**Alcance:** kit de pantalla P-01 (solo las piezas que usa A y las que la issue pide para B–H: encabezado, KPI, estados, formulario, menú) y la pantalla real `/tarjetas`. Fuera de alcance: `/tarjetas/[cardId]/resumen` (UI-05B), revisión «Antes/Después», línea de tiempo, acordeón, tablas, barras y filtros (cada ticket mueve lo que necesite).

**Decisiones fijas (no reabrir):**

- P-01, P-04 y P-10 se aplican **solo como presentación**. No se modifican APIs, `src/server/**`, `src/domain/**`, esquema, cálculos, payloads, nombres de campos (`name`, `issuer`, `limit-XXX`, `debt-XXX`, `openingOn`), textos de efectos ni mensajes de éxito/error.
- Solo se muestran datos que ya trae `CatalogCard`/`InstallmentSummary`/alertas. **Se omiten** la barra de avance del ciclo y «Cierra/Vence» del prototipo: el catálogo no los calcula.
- «Registrar pago» de cada tarjeta sigue abriendo el `CreditOperationForm` **en la página** (como hoy), no navega al resumen del ciclo.
- El tipo de tarjeta sigue siendo `<select>` y las monedas siguen siendo **casillas**; no se usa el segmentado del prototipo (mismo comportamiento y mismos selectores e2e).
- `credit-operation-form.tsx` **no se toca** (lo usan otras 4 pantallas): solo cambia su contenedor.
- Prototipos (`src/app/prototipos/ui-05/**`) **no se modifican**; el kit copia de ahí.
- Clases nuevas con prefijo `gs-` (Glaciar screens) y contenedor `.glaciar-screen`, equivalentes 1:1 a `ui05-*`/`.ui05`.

## 1. Piezas existentes a reutilizar

| Pieza | Archivo | Uso en A |
|---|---|---|
| `Button`, `IconButton`, `buttonClass` | `src/components/ui/button.tsx` | Todas las acciones |
| `Field`, `Input`, `Select` | `src/components/ui/field.tsx` | Alta/edición |
| `Icon` (`cards`, `plus`, `more`, `notices`, `calendar`, `chevronRight`, `alert`, `info`, `recurring`) | `src/components/ui/icon.tsx` | Iconos |
| `Panel` (`.lab-panel`, acepta `id`) | `src/components/glaciar-summary/panel.tsx` | Avisos, cuotas |
| `.f-pagehead`, `.c-eyebrow`, `.f-title`, `.lab-panel`, `.lab-tag`, `.lab-link`, `.lab-muted`, `.b-cards`, `.b-card`, `.b-card--teal`, `.b-card__chip`, `.b-card__debt`, `.b-notices`, `.b-notice--{info,warning,critical}` | `src/app/glaciar-summary.css` | Sin cambios |
| `useFinancialCommand`, `CreditOperationForm`, `creditActionLabels`, helpers de `@/domain/installments` | existentes | Sin cambios de lógica |
| Prototipo | `src/app/prototipos/ui-05/_proto/kit.tsx`, `proto.css`, `screens/cards.tsx` (l. 75–415), `help-popover.tsx` | Fuente para copiar marcado y CSS |

## 2. Archivos

**Crear**

1. `src/app/glaciar-screens.css` — todo dentro de `@layer components { … }`. Copiar de `proto.css` y renombrar `.ui05-` → `.gs-` y `.ui05 ` → `.glaciar-screen `:
   - `.ui05` (l. 76–92: contenedor, `details.lab-panel`, `.f-pagehead`), `-desc`, `-back`, `-actions`, rejilla `-grid`/`-span-*`/`-lane-*` y `-stack` (l. 94–181).
   - KPI `-kpis`, `-kpi*` y ayuda `-help*` (l. 183–370).
   - Filas `-rows`, `-row__*` (l. 372–453).
   - Formulario `-form*`, `-hint`, `-choice`, `-check` (l. 455–585).
   - Botón destructivo `.ui-btn.ui05-btn-danger` (l. 665–673) → `.ui-btn.gs-btn-danger`.
   - Vacío `-empty*` (l. 675–711).
   - Tarjetas dibujadas, acciones y menú (l. 800–980) → `.glaciar-screen .b-cards`, `.glaciar-screen .b-card`, `.gs-card__*`, `.gs-card--debit`, `.gs-menu*`. **Cambio único respecto del prototipo:** `min-height`/`min-width` de `.gs-card__actions a, button` y `.gs-menu > summary` = **40px** (guía §4.6).
   - Agregar al final: `@media (prefers-reduced-motion: reduce) { .gs-form { animation: none !important; } }`.
   - Prohibido `-webkit-backdrop-filter` (prueba HOTFIX).
2. `src/components/glaciar/screen.tsx` (sin `"use client"`, sin hooks):
   - `Screen({ children })` → `<div className="glaciar-screen">`.
   - `PageHead({ eyebrow, title, description?, actions? })` → marcado de `kit.tsx` l. 20–54 sin `back` (no lo usa A; lo agrega B). Único `h1#titulo-pagina tabIndex={-1}`.
   - `Kpi` (kit l. 56–92, clases `gs-`) e importa `HelpPopover` del kit.
   - `EmptyState({ icon, title, children, actions? })` (kit l. 111–134); el `id` del título por prop `labelId` (default `"estado-vacio"`).
   - `PageNotice({ tone: "info" | "critical", message, retryHref? })`: `.lab-panel` con `.b-notice--{tone}`; `critical` → `role="alert"` + texto «Tus datos no se modificaron…» + enlace `retryHref` con `buttonClass("outline")` «Reintentar»; `info` → `role="status"`. Reemplaza `ErrorState` del prototipo (el botón sin acción no se copia).
   - `RowIcon` (kit l. 224–239).
   - `FormPanel({ labelId, title, description?, headingRef?, children })` → `<section className="gs-form" aria-labelledby>` + cabecera con `<h2 id={labelId} ref={headingRef} tabIndex={-1} className="gs-form__title">`. Sin botón «Cerrar» (ya existe «Cancelar»). El pie va dentro del `<form>` con `FormFoot({ children })` → `div.gs-form__foot`. `FormSection({ legend, children })` → `fieldset.gs-form__section` + `legend.gs-form__section-title`.
3. `src/components/glaciar/help-popover.tsx` — copia literal de `_proto/help-popover.tsx` con clases `gs-help*`.
4. `src/components/glaciar/action-menu.tsx` (`"use client"`) — P-04:
   ```ts
   type ActionMenuItem = { label: string; ariaLabel?: string; disabled?: boolean;
     onSelect: (trigger: HTMLElement) => void };
   export function ActionMenu(props: { label: string; items: ActionMenuItem[];
     variant?: "card" | "panel" }): JSX.Element
   ```
   `<details className="gs-menu [gs-menu--panel]">` + `<summary aria-label={label}>` con `Icon more` + `div.gs-menu__list` de `<button type="button">`. Comportamiento: al elegir un ítem, cerrar (`open = false`) y llamar `onSelect(summary)`; con el menú abierto, **Escape** lo cierra y devuelve el foco al `summary`; `pointerdown` fuera lo cierra (listeners solo mientras está abierto, patrón de `HelpPopover`).

**Modificar**

5. `src/app/globals.css` — `@import "./glaciar-screens.css";` después de `glaciar-history.css`.
6. `src/app/tarjetas/page.tsx` — consultas intactas. Render:
   - Con `result.cards`: `<FinanceShell><Screen><CardCatalog {...result} cards today aside={result.cyclesReady ? <CardCycleAlerts …/> : null} /></Screen></FinanceShell>` (el `PageHead` lo dibuja `CardCatalog`, porque el botón «Agregar tarjeta» es del cliente).
   - Sin `result.cards`: `PageHead` (eyebrow «Crédito», título «Tarjetas», descripción actual, sin acciones) + `PageNotice` — `tone="critical"` y `retryHref="/tarjetas"` para «No pudimos cargar tus tarjetas…»; `tone="info"` para «…cuando se actualice la base de datos.» (distinguir por una propiedad `kind: "error" | "pending"` en el objeto devuelto, no por el texto).
   - Quitar el import de `Card`.
7. `src/components/card-catalog.tsx` — ver §3.
8. `src/components/card-cycle-alerts.tsx` — mismo dato y textos; marcado Glaciar: `Panel id="avisos-tarjetas" title="Avisos de tarjetas" icon="notices"` (sigue siendo la región «Avisos de tarjetas»); lista `ul.b-notices`; cada aviso `li.b-notice b-notice--warning` (pendiente) o `--info` (`alert === "informative"`) con `Icon` `alert`/`info`, `p.font-medium` «{tarjeta} · {período} · {moneda}», las dos líneas actuales en `p.lab-muted` y acciones `div.gs-actions`: «Registrar pago» `buttonClass("outline")` y «Ver resumen» `lab-link` (ambos siguen siendo **enlaces** con los mismos `href`). Vacío: `p.lab-muted` con el texto actual. También lo usa `/avisos`: aceptar el cambio y revisarlo visualmente.
9. `tests/unit/glaciar-glass-css.test.mjs` — agregar `"src/app/glaciar-screens.css"` a la lista del primer test.
10. e2e (solo selectores, sin quitar aserciones) — ver §5.
11. `docs/design/ui-identidad-visual.md` §4 — una regla nueva (10) de 3–5 líneas: kit en `src/components/glaciar/` + `src/app/glaciar-screens.css` (`gs-*`), menú P-04, botón P-10, ciclo omitido en el catálogo. `docs/design/ui-05-plan-visual.md` §5: marcar P-01/P-04/P-10 como aplicadas en UI-05A.

## 3. `card-catalog.tsx` — especificación

Props nuevas: `aside?: ReactNode`. `trigger` pasa a `useRef<HTMLElement>(null)`; `open(card, from: HTMLElement)`. `close()` sin cambios (éxito → foco en «Agregar tarjeta»; cancelar → foco en el disparador, que para ítems del menú es el `summary`). Eliminar las constantes `button`, `primary`, `control` y el uso de `Card`.

**Estructura**

```
<PageHead eyebrow="Crédito" title="Tarjetas"
  description="Gestioná tus tarjetas de débito y crédito por moneda."
  actions={<Button ref={add} variant="primary" disabled={editor !== null}
    onClick=…><Icon plus/>Agregar tarjeta</Button>} />
<p role="status" …>{message}</p>                       // igual que hoy
{editor && (operación
   ? <div className="gs-form"><CreditOperationForm …props actuales… /></div>
   : <CardEditor …/>)}
<div className="gs-grid">
  <div className="gs-span-8 gs-stack">
    <section aria-labelledby="tarjetas-activas" className="gs-stack">
      <h2 id="tarjetas-activas" className="lab-panel__title">Activas
        <span className="lab-tag lab-tag--neutral">{active.length}</span></h2>
      {active.length === 0
        ? <EmptyState icon="cards" title="Todavía no tenés tarjetas activas">
            Agregá tus tarjetas de crédito para seguir deuda, cierres y
            vencimientos, y las de débito para registrar gastos desde Bancos.
          </EmptyState>                                   // SIN botón: duplicaría «Agregar tarjeta»
        : <ul className="b-cards">{active.map(CardTile)}</ul>}
    </section>
    {plans.length > 0 && <InstallmentsPanel …/>}
  </div>
  <div className="gs-span-4 gs-stack">
    {aside}
    {archived.length > 0 && <ArchivedPanel …/>}
  </div>
</div>
```

**`CardTile`** (reemplaza `CardEntry` para activas; base: prototipo l. 75–167):

- `li.b-card` + `b-card--teal` en índices impares de crédito + `gs-card--debit` si es débito.
- Cabecera: `h3` nombre (`text-[15px] font-semibold wrap-anywhere`), `p.gs-card__issuer` emisor (si hay), `span.gs-card__kind` `cardKinds[kind]`, `b-card__chip`.
- Crédito con `debt !== null && creditBalance !== null`: un `<dl>` y, por moneda, un `div` con `dt.sr-only` «Deuda registrada {moneda}» + `dd.b-card__debt` importe; luego `dt`/`dd` en `gs-card__limit`: «Saldo a favor registrado» (siempre, como hoy) y «Límite informado» (solo si `limit`). Los rótulos «Saldo a favor registrado» y «Límite informado» quedan visibles y en su propio `dt`.
- Débito: `p` «Vinculada a Bancos por moneda.» (texto exacto) + `p.gs-card__issuer` con las monedas «UYU · USD».
- Acciones `div.gs-card__actions`:
  - Crédito con `operate`: enlace «Resúmenes y ciclos» (`/tarjetas/{id}/resumen`, si `cyclesReady`, con `chevronRight`); botón «Registrar pago» (`operate("payment", el)`); `ActionMenu label="Más acciones de {nombre}"` con ítems «Registrar compra», «Actualizar deuda» (`operate`) y «Editar tarjeta» (`ariaLabel="Editar {nombre}"`, `edit`). Todos `disabled={editDisabled}`.
  - Débito, o crédito sin `operate`: botón «Editar» con `aria-label="Editar {nombre}"`.

**`InstallmentsPanel`**: `Panel id="compras-en-cuotas" title={`Compras en cuotas (${plans.length})`} icon="calendar"` con `ul.gs-rows`; incluye planes de activas **y archivadas**. Cada fila: `RowIcon name="cards"`, `div.gs-row__main` con enlace `gs-row__title` (mismo `href`), `p.gs-row__sub` nombre de la tarjeta y **las mismas líneas `<p>` y textos actuales** (l. 300–323; en especial «{n} futuras · Compromiso futuro {importe}» en un único `<p>`).

**`ArchivedPanel`**: `<details className="lab-panel" open={message === "Tarjeta archivada." || undefined}>` + `<summary className="lab-panel__title cursor-pointer">Archivadas ({n})</summary>` (texto literal con paréntesis). `ul.gs-rows`; por tarjeta: `RowIcon cards`, nombre, `p.gs-row__sub` «{tipo} · {emisor}», el mismo `<dl>` de importes por moneda (con rótulos visibles: «Deuda registrada», «Saldo a favor registrado», «Límite informado») y, si es crédito con `operate`: «Resúmenes y ciclos» (`lab-link`, si `cyclesReady`), «Registrar pago» y «Actualizar deuda» con `buttonClass("outline")`. Sin compra ni edición (igual que hoy).

**`CardEditor`** — lógica, estados y `submit` sin cambios. Marcado:

- `FormPanel labelId="titulo-editor-tarjeta" headingRef={heading}` con los mismos títulos; `description` solo en alta: «Las tarjetas de crédito registran deuda por moneda; las de débito quedan vinculadas a Bancos.»
- `<form method="post" action="/api/cards" aria-labelledby="titulo-editor-tarjeta" className="grid gap-4">`.
- Archivo: `p` actual. Si no, `<fieldset disabled={pending || uncertain} className="grid min-w-0 gap-4">`:
  - `div.gs-form__grid`: `Field "Nombre"` + `Input` (mismos atributos); `Field "Emisor (opcional)"`; en alta `Field "Tipo de tarjeta"` + `Select` (Débito/Crédito), en edición `p` «Tipo de tarjeta · {tipo}».
  - `fieldset` con `legend.ui-field__label` «Monedas» y `div.gs-choice` de `label` + `input type="checkbox"` (nombre accesible = código de moneda).
  - Si crédito: por moneda elegida, `FormSection legend={moneda}` con `div.gs-form__grid` que contiene `Field "Límite {moneda} (opcional)"` (mismo `name`, `inputMode`, `maxLength`, `defaultValue`) y, si `creditReady && !card`, `Field "Deuda inicial {moneda}"`.
  - Si `creditReady && !card && credit && selected.length > 0`: `Field "Fecha de deuda inicial"` (mismos atributos) dentro de `div.gs-form__grid`.
  - `p.gs-hint` con los dos textos de ayuda actuales (límite con cuatro decimales; deuda vacía si no hay).
- `p role="alert"` igual.
- `FormFoot`: «Cancelar» (`ghost`); «Archivar tarjeta» (`buttonClass("outline", "gs-btn-danger")`, solo en edición); submit `primary` o, en archivo, `outline gs-btn-danger`. Mismos textos y `disabled`.

## 4. Orden de implementación

1. CSS: crear `glaciar-screens.css`, importarlo y actualizar la prueba HOTFIX → `npm run test:unit`.
2. Kit: `screen.tsx`, `help-popover.tsx`, `action-menu.tsx` → `npm run typecheck && npm run lint`.
3. `card-cycle-alerts.tsx`.
4. `card-catalog.tsx` (§3) y `tarjetas/page.tsx`.
5. Ajustar e2e (§5) y correr las suites.
6. Revisión visual y de teclado (§5) y corrección de lo que aparezca.
7. Documentación (punto 11), commits `feat(UI-05A): …`, `test(UI-05A): …`, `docs(UI-05A): …`; push y PR `[UI-05A] Kit Glaciar y Tarjetas` con la plantilla. Sin merge.

## 5. Pruebas

**Selectores e2e a ajustar** (abrir el menú antes del ítem; ninguna aserción se elimina):

- `tests/e2e-finance/cards.spec.mjs`: texto vacío → `getByRole("heading", { name: "Todavía no tenés tarjetas activas" })`; las dos ediciones de «Editar Nombre actualizado» → antes `page.getByLabel("Más acciones de Nombre actualizado").click()`.
- `credit-operations.spec.mjs`: tras `goto("/tarjetas")`, antes del primer `open("Actualizar deuda")` y antes de `open("Registrar compra")`, abrir «Más acciones de Visa F2-02» (el segundo `open("Actualizar deuda")` es el envío del formulario y no cambia).
- `fund-coverage.spec.mjs` (l. ~113) y `regression.spec.mjs` (l. ~289): abrir el menú de la tarjeta antes de «Registrar compra».
- `credit-installments.spec.mjs` (l. 147): reemplazar el clic por `expect(page.getByRole("heading", { name: "Compras en cuotas (1)" })).toBeVisible()`.
- Buscar el resto con `grep -rn "Registrar compra\|Actualizar deuda\|Editar \|Compras en cuotas\|tarjetas activas" tests/`.

**Ejecutar** (PostgreSQL desechable de `docs/testing.md#postgresql-desechable`; nunca Neon):

- `npm run check` (formato, lint, tipos, build) y `npm run test:unit`.
- `npm run test:e2e:finance -- cards credit-operations credit-installments mixed-purchases card-cycles fund-coverage regression accessibility-f6-03 notices security-f6-02`.

**Revisión manual** (`next dev` con sesión sintética del arnés e2e, datos sintéticos), 1440 y 375 px: vacío; débito + 2 crédito (una con saldo a favor y límite) + archivada + cuotas; alta crédito con 3 monedas; edición y confirmación de archivo; compra/pago/actualizar deuda abiertos; menú abierto (no recortado por la tarjeta); error de carga; `/avisos` con avisos de tarjeta. Comprobar: sin desbordamiento horizontal a 375 px; Tab llega a todo; Enter/Espacio abre el menú; Escape lo cierra y devuelve el foco; tras cancelar, foco en el disparador; tras guardar, en «Agregar tarjeta»; foco visible; `prefers-reduced-motion` sin animación del formulario.

## 6. Riesgos

| Riesgo | Cómo evitarlo |
|---|---|
| Acciones ocultas en `<details>` rompen e2e o el foco | Ítems del menú solo se renderizan visibles con el menú abierto; ajustar e2e como en §5; `onSelect` recibe el `summary` como disparador |
| Duplicar nombres accesibles (modo estricto de Playwright) | Ningún «Agregar tarjeta» extra (vacío sin botón); «Registrar pago» directo una vez por tarjeta |
| Cambiar importes o rótulos que las pruebas leen | Mantener textos exactos: «Vinculada a Bancos por moneda.», «Límite informado», «Saldo a favor registrado», «Archivadas (N)», «{n} futuras · Compromiso futuro …» |
| Romper formularios de crédito | No editar `credit-operation-form.tsx`; solo cambia su contenedor |
| Dos `h1` | `PageHead` solo en `CardCatalog` o en la rama de error de la página |
| Vidrio roto en Chrome/Edge | Sin `-webkit-backdrop-filter`; prueba HOTFIX ampliada |
| Contraste en tarjetas | No usar la opacidad/grises de `ui05-card--archived` (las archivadas van en filas) |
| `/avisos` cambia con `CardCycleAlerts` | Revisión visual + e2e `notices` |

## 7. Criterios de finalización

- `/tarjetas` reproduce el prototipo aprobado (encabezado, tarjetas dibujadas en 2 columnas, menú «Más acciones», lateral con avisos y archivadas, panel de cuotas, formulario Glaciar) salvo las omisiones de este plan.
- Mismas cifras, rótulos de importes, acciones, `href`, payloads y mensajes que en `main`; sin cambios en `src/server`, `src/domain`, `src/app/api`, esquema ni `credit-operation-form.tsx`.
- Kit en `src/components/glaciar/` + `src/app/glaciar-screens.css`, sin prefijo `-webkit-backdrop-filter`.
- `npm run check`, unitarias y las e2e listadas en verde; ninguna aserción eliminada.
- Revisión 1440/375 y teclado realizadas y descritas en el PR (con limitaciones observadas).
- PR abierto con la plantilla; issue #81 actualizada solo tras comprobar el resultado; sin merge.
