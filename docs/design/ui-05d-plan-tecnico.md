# UI-05D — Plan técnico: Estadísticas e Informes

**Ticket:** UI-05D · **Rama:** `codex/UI-05D-estadisticas-informes` (desde `origin/main` en `fe4faa9`) · **Fecha:** 2026-11-15 · **Ejecuta:** Sonnet (esfuerzo medio-alto), según la issue #81. **No volver a planificar ni rediseñar:** este documento fija las decisiones; ante una duda puntual, escalar solo ese punto.

**Alcance:** trasladar el diseño Glaciar aprobado (prototipo `src/app/prototipos/ui-05/_proto/screens/analysis.tsx`) a las rutas reales `/estadisticas` y `/informes`, e implementar M-05 en producción. Solo presentación.

**Decisiones fijas (no reabrir):**

- **Sin cambios funcionales.** No se tocan `src/domain/**`, `src/server/**`, `src/app/api/**`, `src/lib/export/**`, esquema, consultas, cálculos, payloads, nombres de parámetros GET (`period`, `display`, `currency`, `kind`, `category`, `method`, `card`, `tag`, `tags`, `from`, `to`, `compareFrom`, `compareTo`, `view`, `detailPage`), API de favoritos ni exportaciones. Las correcciones de cotizaciones (M-04) y de exportación quedan fuera.
- **P-07 no aprobada:** «Moneda de visualización» **sigue visible** en la fila principal de filtros, con el mismo `name="display"`, las mismas opciones y el mismo valor por defecto (`display` calculado en `page.tsx`). No se mueve a «Más filtros».
- **Solo datos que la app ya calcula.** La variación de los indicadores usa `percentageChange` (ya es la columna «Variación» de la tabla). No se agregan conteos, porcentajes ni agrupaciones nuevas.
- **Gráficos SVG propios de Estadísticas se conservan y se reestilan** (no se reemplazan por `CashflowChart`): las e2e dependen de su contrato (región desplazable `Ingresos y gastos por mes en UYU` a 360 px, `g[aria-label*="gastos …"]`, rótulos ≥ 12 px) y su semántica (rango variable, meses «Sin datos», «Incompleto») no coincide con la de Resumen (`aria-label` fijo «últimos seis meses»).
- **«Gastos por categoría» sigue en barras horizontales, no en `CategoryDonut`:** cada barra es el enlace de profundización (e2e por nombre exacto) y el anillo exigiría agrupar en «Otros» (dato derivado nuevo) y tiene textos fijos «Gastos del mes».
- **«Gastos recurrentes» sigue dentro del panel «Medios de pago»** (hoy no es un `StatisticsChartId`; separarlo cambiaría el modelo de favoritos).
- **Movimientos del detalle siguen como lista de enlaces**, no tabla: la e2e exige que el enlace del concepto contenga el importe y apunte a `/historial/movimientos/<id>#titulo-pagina`.
- **Informes conserva CSV como formato por defecto** (el prototipo mostraba PDF) y los textos de botón «Exportar {Formato}» / «Generando informe…».
- Prototipos (`src/app/prototipos/ui-05/**`) **no se modifican**; se copia marcado y CSS de ahí con prefijo `gs-`.
- No se importan **valores** desde módulos `"use client"` en componentes de servidor (p. ej. `seriesColors` de `glaciar-summary/charts.tsx` llegaría como referencia de cliente). Colores de datos por tokens: `var(--data-income)`, `var(--data-expense)` o utilidades `fill-income`/`fill-expense`/`bg-income`/`bg-expense`. Importar **componentes** cliente (`ChartLegend`) sí es válido.

## 1. Piezas existentes a reutilizar

| Pieza | Archivo | Uso en D |
|---|---|---|
| `Screen`, `PageHead`, `Kpi`, `EmptyState`, `PageNotice`, `FormPanel`, `FormFoot`, `FormSection` | `src/components/glaciar/screen.tsx` | Estructura de ambas pantallas |
| `.gs-grid`, `.gs-span-5/7`, `.gs-stack`, `.gs-kpis`, **`.gs-lane-main` / `.gs-lane-side` (M-05, ya existen)**, `.gs-choice`, `.gs-accordion`, `.gs-rows`/`.gs-row__*`, `.gs-actions`, `.gs-form__grid` | `src/app/glaciar-screens.css` | Rejilla, carriles, formatos, acordeón, filas |
| `.lab-panel`, `.lab-panel__head/__title/__icon`, `.lab-panel--dense`, `.lab-delta.is-good/.is-bad`, `.lab-legend`, `.lab-key-rect`, `.lab-table-toggle`, `.lab-mini-table`, `.lab-muted`, `.lab-link`, `.b-notice--{info,critical}` | `glaciar-summary.css` | Paneles, variación, leyenda, «Ver datos» |
| `.lab-chips`, `.lab-chip` | `glaciar-history.css` | Chips de filtros activos |
| `.ui-segment`, `.ui-segment__option`, `.ui-icon-btn` (44 px) | `globals.css` | Pestañas de vista, estrella |
| `ChartLegend` | `src/components/glaciar-summary/charts.tsx` | Leyenda de los gráficos mensuales |
| `Field`, `Input` | `src/components/ui/field.tsx` | Desde/Hasta en Informes |
| `buttonClass`, `Icon` (`stats`, `trendUp`, `trendDown`, `expense`, `income`, `cards`, `calendar`, `sparkle`, `reports`, `filter`, `chevronRight`, `close`) | `components/ui` | Acciones e iconos (no hay icono de estrella: SVG en línea como el prototipo) |
| `favoriteLabel`, `statisticsChartIds`, `statisticsChartIdList`, `statisticsSearch`, `percentageChange` | `src/domain/statistics.ts` | Textos, orden y enlaces (solo lectura) |
| `TagFields`, `ExchangeRateDetails`, `HistoryField`/`historyControl` | existentes | Sin cambios internos |
| Prototipo | `_proto/screens/analysis.tsx` (`StatPanel` l. 81, `Delta` l. 134, `Filters` l. 155, `Charts` l. 280, `Drilldown` l. 543, `ReportsScreen` l. 745) y `_proto/proto.css` (`.ui05-filterbar*` l. 1157, `.ui05-viewtabs`, `.ui05-star`, `.ui05-crumbs`, `.ui05-hbars*` l. 761, `.ui05-split`) | Fuente para copiar |

## 2. Archivos

**Modificar:**

| Archivo | Cambio |
|---|---|
| `src/app/estadisticas/page.tsx` | `Screen` + `PageHead` (eyebrow «General», título «Estadísticas», `actions` = nav de vistas); estados de error/no disponible con kit; avisos de FX y favoritos como `PageNotice info`. Misma carga de datos, mismo orden de llamadas. |
| `src/components/statistics-dashboard.tsx` | Reparto M-05 en carriles (§4); `StatisticsMetrics` con `Kpi` + tabla; `StatisticsDrilldown` con migas y `gs-grid`. |
| `src/components/statistics-charts.tsx` | `StatisticsChartCard` → `section.lab-panel` con cabecera, icono, descripción y estrella; colores de datos por token; `ChartLegend`; «Ver datos» con `lab-table-toggle`/`lab-mini-table`; realce de foco/hover; `StatisticsBarList` → `gs-hbars` con tono por tipo. |
| `src/components/statistics-filters.tsx` | Barra densa `gs-filterbar` (4 visibles + «Más filtros») y chips de filtros activos. |
| `src/components/statistics-favorite-button.tsx` | Solo marcado: `ui-icon-btn gs-star` + estrella SVG. Misma lógica, `fetch`, `aria-label`, `aria-pressed`, `title`, `disabled` y alerta de error. |
| `src/components/statistics-tables.tsx` | Solo clases (tablas `gs-table`-like, barra de proporción con `bg-expense`). Mismos `caption`, `aria-label`, `details/summary` y `figcaption`. |
| `src/app/informes/page.tsx` | `Screen` + `PageHead` (eyebrow «General», mismo título y descripción). |
| `src/components/informes-panel.tsx` | `gs-grid`: `FormPanel` (span 7) + panel «Contenido del informe» con `gs-accordion` (span 5). Misma lógica de estado y descarga. |
| `src/app/glaciar-screens.css` | Portar con prefijo `gs-` y dentro de `@layer components`: `gs-filterbar`, `gs-filterbar__actions`, `gs-filterbar__chips`, `gs-filterbar__more`, `gs-viewtabs`, `gs-star`, `gs-crumbs`, `gs-hbars*` (con `prefers-reduced-motion` en el bloque existente), `gs-chart__*` (realce, ver §3.4). Sin `-webkit-backdrop-filter`. |
| `docs/design/ui-identidad-visual.md` | §4: nueva regla 13 «Estadísticas e Informes (UI-05D)» con lo aplicado y lo omitido. |
| `docs/design/ui-05-mejoras-pendientes.md` | M-05: estado «implementado en producción (UI-05D)». |

**No crear** componentes nuevos fuera de los archivos listados salvo que un archivo supere ~700 líneas; en ese caso, extraer `statistics-layout.tsx` (solo el reparto de carriles) junto a `statistics-dashboard.tsx`.

**No tocar:** `src/domain/**`, `src/server/**`, `src/app/api/**`, `src/lib/export/**`, `glaciar-summary/charts.tsx`, `exchange-rate-details.tsx`, `classification-fields.tsx`, prototipos.

## 3. Orden de implementación

Un commit por paso (`feat(UI-05D): …`), ejecutando `npm run lint` y `npm run typecheck` al final de cada uno.

1. **CSS** — portar las clases de §2 a `glaciar-screens.css`.
2. **Informes** (`page.tsx` + `informes-panel.tsx`), lo más aislado:
   - `FormPanel labelId="exportar" title="Exportar informe del período" description=…` (mismo texto) con el `<form onSubmit={submit}>` adentro.
   - Desde/Hasta con `Field`/`Input` en `gs-form__grid`, controlados igual (`value`, `onChange`, `required`). Verificar que `getByLabel("Desde", { exact: true })` siga resolviendo un único control.
   - «Formato»: `FormSection legend="Formato"` + `div.gs-choice` con un `<label>` por `EXPORT_FORMATS` (radio `name="formato"`, controlado por `format`; texto `{label} (.{extension})` + descripción en `gs-hint`). Por defecto `csv`.
   - `FormFoot` con el botón `submit` (`buttonClass("primary")`, icono `reports`), mismo `disabled` y mismos textos.
   - Mensajes: error → `div.b-notice.b-notice--critical role="alert"`; descarga → `div.b-notice.b-notice--info role="status"`; mismos textos.
   - Lateral: `section.lab-panel` «Contenido del informe» con el párrafo actual y `div.gs-accordion` (`<details>` por `REPORT_SECTIONS`, el primero abierto, descripción + columnas).
3. **Estadísticas · cabecera y estados** (`page.tsx`):
   - `PageHead` con `actions` = `<nav aria-label="Vistas de estadísticas" className="ui-segment gs-viewtabs">` y los dos `Link` actuales («Mis favoritos», «Todas las estadísticas») con `className="ui-segment__option"` y el mismo `aria-current`.
   - Error de parámetros: `PageHead` + `section.lab-panel` con `b-notice--critical role="alert"` ({parsed.error}) y enlace «Volver a estadísticas» (no usar `PageNotice`, que agrega «revisá tu conexión»).
   - Carga fallida: `PageNotice tone="critical" message="No pudimos cargar las estadísticas." retryHref="/estadisticas"`. Base no actualizada: `PageNotice tone="info"` con el texto actual.
   - «La conversión no está disponible…» y «Los favoritos estarán disponibles…» → `PageNotice tone="info"` (mismos textos). La pista «Marcá con una estrella…» de la vista Todas queda como `p.lab-muted` (la e2e la busca por texto).
   - Favoritos vacío: `EmptyState icon="stats" title="Todavía no elegiste estadísticas favoritas"` con el texto del prototipo y acción `Link` «Explorar estadísticas» (`buttonClass("primary")`).
   - `ExchangeRateDetails` se envuelve en `section.lab-panel lab-panel--dense` sin tocar su interior.
4. **Filtros** (`statistics-filters.tsx`): §3.1.
5. **Paneles y favoritos** (`statistics-charts.tsx`, `statistics-favorite-button.tsx`): §3.2.
6. **Indicadores, barras y gráficos**: §3.3 y §3.4.
7. **Carriles M-05 y detalle** (`statistics-dashboard.tsx`): §4 y §3.5.
8. **Tablas** (`statistics-tables.tsx`): solo clases.
9. **Documentación** (§2) y verificación (§6).

### 3.1 Barra de filtros

- `section.lab-panel.lab-panel--dense` con el mismo `<form action="/estadisticas" method="get">` (`role="search"`, `aria-label="Filtros de estadísticas"`). Sustituye el `h2` «Filtros de estadísticas» por el nombre accesible del formulario; el `input hidden name="view"` se conserva.
- **Fila visible** (`gs-filterbar`, 4 columnas desde 64rem): Período, **Moneda de visualización** (P-07: igual que hoy), Moneda original, Tipo de movimiento + `gs-filterbar__actions` con «Más filtros» y «Aplicar filtros» (`submit`, mismo nombre).
- **«Más filtros»** = `<details className="gs-filterbar__more">` cuyo `<summary>` dice «Más filtros» (icono `filter`). Contiene, en `gs-form__grid`: Categoría, Medio de pago, Tarjeta (si hay tarjetas), Desde/Hasta (con la nota «Las fechas ingresadas tienen prioridad…») y Comparar desde/hasta. Se abre de inicio (`open`) si hay `category`, `method`, `card`, `period === "personalizado"` o `compareFrom`. Los controles de un `<details>` cerrado igual se envían en el GET: el comportamiento no cambia.
- **Etiquetas** (`TagFields`, ya plegable «Filtrar por etiquetas») queda **fuera** de «Más filtros», debajo de la fila: así las e2e de `classification` y `statistics` no necesitan un clic extra ni hay `<details>` anidados.
- **Chips** (`gs-filterbar__chips`): un `Link.lab-chip` por filtro activo de `currency`, `kind`, `category`, `method`, `card` con texto `Categoría: {nombre}` + icono `close` y `aria-label="Quitar filtro Categoría: {nombre}"`, `href = /estadisticas${statisticsSearch(filters, { <campo>: undefined, detailPage: undefined })}`. Nombres desde las props ya disponibles (`categories`, `cards`, `movementDisplayMethods`; categoría desconocida → «Categoría no disponible»). A la derecha, el `Link` «Limpiar filtros» con **el mismo `href` que hoy** (`lab-link ml-auto`). Ningún chip debe contener el texto exacto de una categoría como nombre completo del enlace (las e2e usan `exact: true` en las barras).

### 3.2 Panel de estadística y favorito

- `StatisticsChartCard` → `<section id={`estadisticas-${chart}`} className="lab-panel min-w-0" aria-labelledby={`estadisticas-${chart}-titulo`}>` con `header.lab-panel__head`: `h2.lab-panel__title` (icono en `lab-panel__icon` + título de `statisticsChartIds`) y la estrella a la derecha; debajo, la descripción actual en `p.lab-muted text-sm`. **Conservar el `id` de la sección** (el resumen inteligente enlaza a `#estadisticas-metrics`).
- Iconos: `metrics` `stats` · `income-expense` `trendUp` · `expense-categories` `expense` · `income-categories` `income` · `methods` `cards` · `history` `calendar` · `summary` `sparkle`.
- Estrella: `button.ui-icon-btn.gs-star` con el SVG del prototipo (`fill` según `favorite`, `aria-hidden`), sin el `sr-only` redundante si `aria-label` ya lo nombra. `gs-star[aria-pressed="true"]` usa `--state-warning` (borde + color). Se mantiene `title`, `disabled={sending || refreshing}` y el `p role="alert"` de error.
- Si `favoritesReady` es falso no se dibuja la estrella (como hoy).

### 3.3 Indicadores del período

- Por moneda disponible (`available`): `h3` con la moneda solo si hay más de una; `div.gs-kpis` con cuatro `Kpi`: Ingresos, Gastos, **Resultado del período (`hero`)**, Devoluciones acreditadas, con `value = formatStatisticsAmount(actual)` o «Sin datos».
- `extra` = variación solo si hay período de comparación y ambos valores: `span.lab-delta` con icono `trendUp`/`trendDown` (según signo de `amountUnits(actual) - amountUnits(anterior)`) y texto `{percentageChange(...)} vs. {snapshot.previous.label}`; si `percentageChange` es `null`, texto «Base cero» sin tono. Tono: Ingresos y Resultado suben = `is-good`; Gastos bajan = `is-good`; Devoluciones sin tono. Nunca solo color: icono + texto.
- **La tabla `StatisticsComparisonTable` «Indicadores en {moneda}» se mantiene visible debajo** de los KPI (es la tabla equivalente con Diferencia/Variación y la usan cinco e2e). Avisos «La fecha de hoy todavía está en curso» y «Los períodos tienen distinta duración» en `p.lab-muted text-xs`.

### 3.4 Gráficos y barras

- **Mensual y histórico** (`StatisticsMonthlyChart`, `StatisticsHistoryChart`): mismo SVG, mismas dimensiones, mismo `ChartPlot` (región `tabIndex=0` con `overflow-x-auto` y `minWidth`), mismos `<g tabIndex=0 role="img" aria-label=…>`, `<title>`, `<desc>`, rótulos `text-[0.9375rem]`.
  - Colores: ingresos `fill-income`, gastos `fill-expense` (patrón rayado del mes en curso/gastos con `fill-expense`); balance positivo `fill-income`, negativo `fill-expense`. Eje y rótulos con `--glaciar-faint`/`--glaciar-muted`.
  - Leyenda: `ChartLegend` (`Ingresos` `var(--data-income)`, `Gastos` `var(--data-expense)`) en lugar del `div aria-label="Leyenda"`.
  - **Tooltip por teclado sin JS:** dentro de cada `<g>` y **después** del rótulo del mes (la e2e mide el primer `svg text`), un `<text className="gs-chart__value">` con los importes del grupo (dos `<tspan>`, mismo tamaño de fuente), oculto por defecto y visible con `g:hover`/`g:focus-visible`; más un `rect.gs-chart__band` de realce. El resto de grupos se atenúa con `svg:has(g:focus-visible) g:not(:focus-visible)` (como `lab-bar-group.is-muted`). El `aria-label` ya anuncia los valores; el texto visible es para quien navega con teclado sin lector. Respetar `prefers-reduced-motion` (sin transiciones).
  - «Ver datos» → `details.lab-table-toggle` y `table.lab-mini-table` (mismo `caption`, encabezados y filas; región con `aria-label` y `tabIndex=0` se conserva).
- **Barras horizontales** (`StatisticsBarList`): `ul.gs-hbars` con el mismo `aria-label`; cada `li` con `gs-hbars__head` (enlace `min-h-11` con **solo el nombre** como texto + importe), pista `gs-hbars__track` `aria-hidden` y `detail` en `lab-muted text-xs`. Nueva prop opcional `tone: "income" | "expense"` (por defecto `expense`) → color de relleno por token. Gastos/Ingresos por categoría y por medio pasan el tono de su `kind`; las subcategorías del detalle, el `kind` de la fila.
- Medios de pago: los dos bloques Gastos/Ingresos en `grid gap-4 sm:grid-cols-2` como hoy; recurrentes debajo con su barra de proporción en `bg-expense`.

### 3.5 Detalle (profundización)

- Va **a ancho completo antes de los paneles** (como hoy), como `div.gs-grid`:
  - `nav.gs-crumbs aria-label="Ruta del detalle"`: enlace «Estadísticas» (href = el actual de «Quitar filtros de detalle») › `span aria-current="page"` con `categoryName` / «Sin categorizar» / «Movimientos filtrados».
  - Si hay subcategorías: `section.lab-panel.gs-span-5` «Subcategorías» con `StatisticsBarList` y `section.lab-panel.gs-span-7` «Movimientos que explican la cifra»; si no, este último a ancho completo.
  - Movimientos: `ul.gs-rows` de `Link` (mismo `href`, concepto, fecha · tipo e importe con cotización dentro del enlace). Importes con tono M-06 por **tipo**: ingreso y devolución verde (`lab-amount`), gasto `lab-amount is-negative`, sin cambiar el texto.
  - Se conservan el `h2` «Detalle de movimientos · …», el enlace «Quitar filtros de detalle» (en `gs-actions` de la cabecera) y la paginación (`nav aria-label="Páginas de movimientos"`, mismos enlaces).

## 4. M-05 sin romper favoritos ni accesibilidad

Regla de producción de `ui-05-mejoras-pendientes.md` (M-05), implementada en `StatisticsDashboard` sin JS de layout:

```ts
const MAIN: StatisticsChartId[] = ["income-expense", "methods", "income-categories", "history"];
const SIDE: StatisticsChartId[] = ["expense-categories", "summary"];
const visible = view === "favoritos" ? favorites : statisticsChartIdList; // orden actual
const main = visible.filter((id) => MAIN.includes(id));   // conserva el orden de la vista
const side = visible.filter((id) => SIDE.includes(id));
const lanes = main.length > 0 && side.length > 0;
```

- **Con carriles** (`lanes`): `div.gs-grid` → detalle (si hay) → `metrics` (si es visible) a ancho completo → `div.gs-lane-main.gs-stack` (`main`) → `div.gs-lane-side.gs-stack` (`side`).
- **Sin carriles** (un carril vacío, p. ej. favoritos solo de un lado): `div.gs-grid` con todo `visible` **en su orden original** a ancho completo (evita huecos de 8 o 4 columnas).
- **Orden de favoritos:** el orden guardado (`created_at`) no cambia y se respeta **dentro de cada carril**. Cambio visible aceptado en este ticket: con carriles, `metrics` va primero y los paneles del carril lateral después de los del principal aunque se hayan marcado antes. Documentarlo en el PR como decisión a confirmar por el usuario; si no se acepta, el ajuste es solo el orden de concatenación.
- **Orden de lectura y foco:** el DOM es el orden visual (Indicadores → principal → lateral); no usar `order`, `grid-row` ni `columns` de CSS. En < 80rem, una columna en el mismo orden (en móvil «Gastos por categoría» queda después del carril principal).
- **Responsive:** carriles solo desde 80rem (ya definido en `.gs-lane-*`); entre 64 y 80rem cada carril ocupa 12 columnas. Comprobar sin desplazamiento horizontal a 1440, 1280, 1024, 768, 375 y 360 px.
- Quitar una estrella refresca con `router.refresh()`: el panel sale de la vista Favoritos y el foco puede perderse (comportamiento actual). No agregar gestión de foco nueva; solo verificar que no hay error y que el anuncio de estado sigue funcionando.

## 5. Riesgos principales y cómo evitarlos

| Riesgo | Mitigación |
|---|---|
| Romper selectores e2e (`table "Indicadores en …"`, `region /^Ingresos y gastos por mes en UYU/`, `g[aria-label*=…]`, enlaces de categoría con `exact`, «Ver evolución de saldos y patrimonio», `figcaption`, «Filtrar por etiquetas», combobox «Tarjeta», botón «Añadir/Quitar … a/de favoritos», «Mis favoritos»/«Todas las estadísticas» con `aria-current`, «Limpiar filtros», «Exportar CSV», `getByLabel("Desde")`) | Contratos listados en §3 se conservan tal cual. Si una e2e falla, corregir el marcado; ajustar una prueba solo si el cambio es de presentación aprobado y sin reducir lo que verifica. |
| Controles ocultos en «Más filtros» que una e2e necesita visibles | Apertura automática con filtros activos; Etiquetas fuera de «Más filtros». |
| Modo estricto de Playwright por textos duplicados (chips, migas, «Marcá con una estrella», «Todavía no elegiste…») | Chips con prefijo «Categoría:»/aria-label «Quitar filtro…»; no repetir textos de enlaces existentes; la pista y el estado vacío nunca coinciden en la misma vista. |
| Valores de módulos cliente en componentes de servidor | Colores por token CSS; solo se importan componentes (`ChartLegend`). |
| Huecos o tablas angostas con carriles | Carriles solo ≥ 80rem; fallback a una columna con un carril vacío; medir con `getBoundingClientRect` como en M-05. |
| Accesibilidad de gráficos (contraste, foco, solo color) | Colores de datos validados (§3 de la guía); foco visible de 2 px en los `g`; variación con icono + texto; tabla equivalente siempre. |
| Rendimiento del vidrio (pantalla larga con ~10 paneles) | `lab-panel--dense` en filtros, FX y tablas; no agregar `backdrop-filter` nuevos. |
| Tamaño de toque y `h1` único (e2e `accessibility-f6-03`) | Estrella 44 px (`ui-icon-btn`), enlaces de barras `min-h-11`, chips ≥ 32 px de alto y ≥ 24 px de ancho; un solo `h1` (el de `PageHead`) en todos los estados. |
| F6-02 (sesión, almacenamiento) | No tocar la guarda de sesión de las páginas; sin `localStorage`/`sessionStorage`; `<details>` no persisten estado. |
| Regresión en Informes (descarga) | No tocar `submit`, `saveDownload`, `parseReportPeriod` ni `/api/export`; solo envolver. |

## 6. Pruebas

- `npm run check` (formato, lint, `tsc`, build) y `npm run test:unit` (incluye `statistics.test.mjs`, `glaciar-glass-css.test.mjs` y F6-02).
- E2E financieras (PostgreSQL desechable; si no hay Docker local, en CI): `statistics`, `exports`, `exchange-rates`, `classification`, `regression`, `accessibility-f6-03`, `security-f6-02`; `summary-glaciar` y `history-glaciar` como regresión del CSS compartido.
- **Revisión manual con datos sintéticos** a 1440 y 375 px (y 1280/1024/768/360 para M-05): vistas Favoritos (0, 1, solo lateral, solo principal, mixtos) y Todas; detalle con y sin subcategorías; paginación; FX disponible/no disponible; parámetros inválidos; Informes en reposo, generando, error y descargado.
- **Teclado:** Tab recorre pestañas de vista → filtros → «Más filtros» → chips → paneles en orden Indicadores → principal → lateral; en cada gráfico el foco muestra el valor y el realce; flechas desplazan la región del gráfico a 360 px; Enter/Espacio en la estrella; Escape no requerido (no hay menús nuevos).
- `prefers-reduced-motion`: sin animación de barras ni transiciones del realce.
- Medición M-05: 0 huecos entre paneles a 1440 y 1280 en Todas; sin desborde horizontal en ningún ancho.

## 7. Criterios de aceptación

1. `/estadisticas` y `/informes` usan el kit Glaciar (`Screen`, `PageHead` con eyebrow «General», paneles `lab-panel`) y coinciden con el prototipo salvo las desviaciones fijadas arriba.
2. Mismas cifras, tablas, gráficos, enlaces de profundización, paginación, filtros y parámetros GET que antes; ninguna API, consulta, cálculo ni exportación modificada (`git diff --stat` sin `src/domain`, `src/server`, `src/app/api`, `src/lib/export`).
3. Favoritos: misma API y mismo orden guardado; vista Favoritos muestra solo los marcados, respetando su orden dentro de cada carril; estado vacío con acción «Explorar estadísticas».
4. M-05: carriles 8/4 desde 80rem según la regla; fallback de una columna con un carril vacío; DOM = orden visual = orden de foco; 0 huecos entre paneles en escritorio y sin desborde a 360–1440 px.
5. P-07 sin cambios: «Moneda de visualización» visible, mismo valor por defecto y mismas opciones.
6. Gráficos: foco visible y valor visible al enfocar cada mes, `aria-label` con importes, leyenda, tabla equivalente; colores de datos Glaciar; variación con icono + texto.
7. Informes: período, tres formatos (CSV por defecto), progreso «Generando informe…», error con `role="alert"`, descarga con `role="status"` y el mismo nombre de archivo.
8. Un `h1`, objetivos táctiles ≥ 24 px (≥ 40–44 px en acciones), sin almacenamiento del navegador; `npm run check`, unitarias y e2e listadas en verde.
9. Documentación actualizada (guía §4 regla 13, M-05) y PR con plantilla, capturas 1440/375, limitaciones y la decisión de orden entre carriles para confirmar. Sin merge ni despliegue.

**Siguiente ticket:** UI-05E — Recurrentes (Sonnet · alto).
