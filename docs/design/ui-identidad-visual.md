# Identidad visual definitiva — «Ambient Glow + Glassmorphism» (Glaciar)

**Ticket de origen:** UI-01 · **Fecha:** 2026-11-14 · **Estado:** diseño **aprobado por el usuario**; aplicación al producto pendiente por etapas UI-02…UI-06 ([plan](../planning/05-plan-de-implementacion.md#ui--identidad-visual-ambient-glow--glassmorphism)).

## 1. Autoridad y alcance

- Esta guía **reemplaza la parte visual** de [fintrack-visual-spec.md](fintrack-visual-spec.md): colores, tipografía, superficies, navegación, gráficos y fondo. Siguen vigentes los **límites funcionales del producto** de esa guía y de [decisiones-producto.md](../product/decisiones-producto.md): dashboard fijo sin arrastrar ni ocultar widgets, sin botón de ojo/ocultar importes, favoritos solo en Estadísticas, nada offline, ningún control que prometa una función no implementada.
- Es un cambio **solo de presentación**: no cambia reglas contables, cálculos, APIs, autenticación, permisos, esquema ni datos. Si una pieza del diseño necesita un dato que la app real no tiene, **no se inventa**: se consulta al usuario o se omite.
- **Implementación de referencia:** prototipo con datos ficticios en `src/app/prototipos/ui/` (rama `codex/UI-01-exploracion-ambient-glow`). Ruta `/prototipos/ui/final`; requiere sesión (`npm run dev:google -- --test-login`, abrir `http://localhost:3000/auth/sign-in`). No se publica en el entorno de producción de Vercel.

| Archivo de referencia (`src/app/prototipos/ui/_lab/`) | Contenido que se reutiliza o adapta |
|---|---|
| `lab.css` | Tokens, vidrio, navegación, gráficos, tabla, tutorial, paletas (`[data-palette="glaciar"]`). Todo dentro de `@layer components`. |
| `variant-final.tsx` | Composición de Resumen e Historial. |
| `pieces.tsx` | Disponible libre (pestañas por moneda + aviso), ingresos/gastos, tarjetas como objetos, avisos, barra flotante móvil. |
| `ambient.tsx` · `palettes.ts` | Shader de ondas (arriba y abajo) y colores Glaciar. |
| `charts.tsx` | Flujo espejado, anillo de categorías, sparkline, anillo de progreso; tooltip con teclado y tabla equivalente. |
| `movements.tsx` | Historial: filtros, chips, filtros guardados, tabla ordenable, versión móvil en filas. |
| `widgets.tsx` | Panel, variación, presupuestos, próximos pagos, fondos, movimientos recientes. |
| `shell.tsx` · `nav.ts` · `icons.tsx` | Menú lateral agrupado, cajón móvil, selector de moneda, selector de mes, iconos duotono. |
| `tour.tsx` | Tutorial con foco y flecha (8 pasos). |
| `motion.ts` | Respeto de `prefers-reduced-motion` y pausa. |

**Solo del laboratorio, no van al producto:** la barra superior «Prototipo UI-01 · Datos ficticios», el selector de paletas y el botón «Pausar fondo». En el producto la paleta es **Glaciar fija**.

## 2. Decisiones aprobadas

| Pieza | Decisión | Origen en la exploración |
|---|---|---|
| Paleta | **Glaciar**: grafito con acento plata/azul hielo | Elegida entre 4 paletas |
| Tipografía | **Plus Jakarta Sans** con `next/font/google` (OFL; se sirve desde el propio dominio, compatible con la CSP) | Variante B |
| Vidrio | Perceptible, 3 niveles (ver §3); tablas y formularios casi opacos | Variante B |
| Fondo | Ondas de luz WebGL **arriba** y **al final de la página**; en el medio, luz difusa tenue con deriva lenta | Variante C + pedido del usuario |
| Menú escritorio | Riel flotante de iconos que se expande al pasar el mouse o con foco; grupos General / Planificación / Crédito / Catálogos; Avisos, Ayuda y Mi cuenta abajo | Variante C |
| Menú móvil | Barra flotante inferior: Resumen, Historial, botón + (Registrar), Estadísticas, Menú (cajón) | Variante C |
| Barra superior | Ayuda/tutorial (?), selector de **moneda de visualización** UYU/USD/EUR, botón primario «Registrar movimiento» (único; no se repite en la tarjeta de saldo) | Final |
| Disponible libre | Tarjeta destacada con pestañas UYU/USD/EUR (**muestran el saldo real de cada moneda, no convierten**), aviso breve «Cambiá entre tu cuenta en pesos, dólares o euros», saldo confirmado, «Ya descuenta fondos reservados y deuda de tarjetas», acciones «Cambio de moneda» y «Confirmar saldo» | Variante B + ajustes |
| Ingresos y gastos del mes | Dos tarjetas con variación vs. mes anterior (texto + icono, no solo color) y sparkline de 6 meses | Variante B |
| Gráfica de flujo | Espejada: ingresos hacia arriba, gastos hacia abajo, resultado por mes, mes en curso rayado | Variante C |
| Gastos por categoría | Anillo con total al centro y leyenda con importes | Variante B |
| Tarjetas de crédito | Tarjetas dibujadas con deuda por moneda, avance del ciclo, cierre y vencimiento | Variante B |
| Próximos pagos | Lista con fecha en bloque y medio de pago | Variante B |
| Fondos de ahorro | Anillos de progreso hacia la meta | Variante B |
| Avisos | Panel con icono por tipo + texto | Variante B |
| Presupuestos | Barra por categoría con estado «En rango / Cerca / Excedido» (icono + texto) | Recomendación (sin elección explícita) |
| Historial | Buscador, Período, Tipo, Moneda, «Más filtros» (Estado, Medio, Categoría), filtros guardados, chips quitables, tabla con Fecha/Importe ordenables; en móvil, filas apiladas | Común |
| Tutorial | No modal, foco recortado + flecha animada; se repite desde «?» | Pedido del usuario (§5) |

## 3. Tokens Glaciar

| Token | Valor | Uso |
|---|---|---|
| `--lab-bg` | `#070a0d` | Fondo base |
| `--lab-text` / `--lab-muted` / `--lab-faint` | `#eef2f6` / `#a3aeba` / `#68737f` | Texto principal / secundario / ejes y rótulos |
| `--lab-accent` / `--lab-accent-ink` | `#d3e3f2` / `#0b1620` | Botón primario, enlaces, foco, estado activo / texto sobre acento |
| `--lab-focus` | `#e6f0fa` | Anillo de foco (2 px) |
| `--lab-border` / `--lab-border-strong` | `rgb(220 235 250 / 10%)` / `20%` | Bordes finos |
| `--lab-glass-1` / `-2` / `-3` | `rgb(60 80 100 / 22%)` / `rgb(18 24 30 / 46%)` / `rgb(9 12 16 / 84%)` | Saldo destacado / paneles / tablas y formularios |
| Desenfoque | 28 / 20 / 14 px con `saturate(140–160%)` | Por nivel de vidrio |
| Brillo y sombra | borde superior interno 8 % blanco; sombra `0 24px 60px -30px` | Profundidad |
| Radios | 20 px paneles · 12 px controles · 999 px pastillas | |
| Luces | `--lab-glow-1/2/3`: `rgb(140 175 210 / 22%)`, `rgb(80 110 140 / 12%)`, `rgb(100 160 180 / 10%)` | Orbe del saldo, luz del medio, alternativa CSS |
| Shader | base `(0.027, 0.035, 0.047)`; bandas `(0.55,0.68,0.82)`, `(0.30,0.40,0.54)`, `(0.42,0.66,0.74)`, `(0.20,0.26,0.36)`; ganancia 0,72; abajo: invertido, fase +7,3 y desplazamiento 0,17 | `palettes.ts`, `ambient.tsx` |
| Espaciado | múltiplos de 4/8 px | |

**Colores de datos (fijos, no dependen de la paleta; validados para contraste ≥ 3:1 y daltonismo sobre superficie oscura):** ingresos `#199e70`, gastos `#9085e9`; categorías en orden fijo `#3987e5`, `#199e70`, `#c98500`, `#9085e9`, `#d55181` y «Otros» `#5d6b82` (neutro, siempre con etiqueta). Estados: bien `#5fd3a0`, cerca `#f0b35a`, excedido `#f47b7b`, importe positivo `#6fdcb8`. Nunca usar el color como única señal.

## 4. Reglas técnicas aprendidas en el prototipo

1. **CSS en `@layer components`.** CSS sin capa le gana a las utilidades de Tailwind (`hidden`, `ml-auto`…) y rompe el responsive.
2. **Sin almacenamiento del navegador** (prueba F6-02): solo existe la excepción ya inventariada del tutorial (`intro-tour.tsx`, `domain/tutorial.ts`). Las preferencias del diseño van en memoria o en el servidor (la moneda de visualización ya se guarda en la cuenta, v9.46).
3. **Toda página** llama a `requireGoogleOwnerPage()` o `withGoogleOwner()` y es dinámica (prueba F6-02). Evitar que `searchParams` y la palabra «owner» queden en la misma sentencia (la prueba lo detecta).
4. **Fondo animado:** dibujar a 35–50 % de resolución y ≤ 30 fps; detener con pestaña oculta, fuera de vista (`IntersectionObserver`) y con `prefers-reduced-motion`; capa CSS estática si no hay WebGL o se pierde el contexto. La luz del medio usa solo `transform`. Decisión en el navegador, al cargar (`src/components/ambient-render.ts`; nunca según dónde se compiló): con **WebGL acelerado** las ondas y la luz se animan como en el prototipo, y con **movimiento reducido** queda **un fotograma fijo de las mismas ondas**; con **WebGL por software** (SwiftShader en CI o sin GPU, llvmpipe, WARP: lo delatan `failIfMajorPerformanceCaveat` o el nombre del renderizador) o **sin WebGL**, la capa CSS y la luz quieta. Ni un fotograma por software es viable: crear el contexto y compilar el shader bloquean ~300 ms el hilo principal en cada carga (medido en Chromium sin GPU; la e2e financiera pasó de ~5,7 a 7,9 min en CI). Verificación: `tests/e2e/ambient-background.spec.ts` (movimiento permitido con GPU real o simulada, reducido, software y sin WebGL).
5. **Rendimiento:** el vidrio (`backdrop-filter`) sobre fondo en movimiento se recalcula en cada cuadro; limitar superficies con desenfoque y medir en un móvil de gama baja. Escribir **solo `backdrop-filter`** (sin repetir `-webkit-backdrop-filter`): el compilador agrega el prefijo de Safari, y con ambas declaraciones la minificación de producción conservaba solo la prefijada y Chrome/Edge perdían el vidrio (HOTFIX de fidelidad; `tests/unit/glaciar-glass-css.test.mjs`).
6. **Accesibilidad:** objetivos ≥ 40–44 px, foco visible, gráficos con tooltip por teclado y tabla equivalente, estados con icono + texto, encabezados ordenables con `aria-sort`, `<dialog>` para el cajón móvil.
7. **CSP:** no cargar fuentes ni scripts externos en tiempo de uso; `next/font` es válido.
8. **Dos servidores de desarrollo** sobre la misma carpeta `.next` la corrompen (síntoma: «Compiling…» sin fin y `Unexpected end of JSON input`). Uno a la vez; si pasa, detener y borrar `.next`.
9. **Historial (UI-04)** — `src/app/glaciar-history.css` (todo bajo `.glaciar-history`) y `components/history-*.tsx`. El prototipo filtraba datos ficticios en el cliente; el producto conserva el formulario GET a `/historial` y sus consultas: los desplegables aplican al cambiar (como en el prototipo) dentro de una transición que mantiene el foco; texto, fechas, importes y etiquetas se aplican con Enter, la lupa o «Aplicar filtros» (en «Más filtros», que además incluye Desde/Hasta, importes, comercio y etiquetas existentes). Un período relativo descarta Desde/Hasta. El orden por Fecha/Importe reordena **solo la página cargada** (la paginación del servidor es por fecha) y se avisa si hay más páginas; el importe se compara en decimal exacto y por su valor nominal. Signo: `+` ingresos, devoluciones, reintegros, beneficios y lo recibido en un cambio de moneda («por …» lo entregado); `−` gastos, compras y pagos de tarjeta; sin signo saldos, deuda inicial/ajuste de tarjeta y préstamos (el dato no indica un sentido único). Fecha `dd/mm`, con año fuera del año en curso. Agregados respecto del prototipo: casilla de selección masiva (en móvil, bajo el icono de tipo), barra de clasificación masiva, paginación, panel de filtros guardados (guardar, renombrar, reemplazar, eliminar) y, en móvil, una barra visible «Fecha / Importe» (el prototipo dejaba esos botones enfocables pero invisibles). Los chips usan `--glaciar-selected` (el prototipo heredaba un tinte turquesa de la variante C). Placeholder del buscador: «concepto, nota o comercio» (la búsqueda real no busca por categoría).
10. **Kit de pantalla (UI-05A)** — `src/components/glaciar/` (`Screen`, `PageHead`, `Kpi`, `EmptyState`, `PageNotice`, `RowIcon`, `FormPanel`/`FormFoot`/`FormSection`, `HelpPopover`, `ActionMenu`) y `src/app/glaciar-screens.css` (clases `gs-*` bajo `.glaciar-screen`, todo en `@layer components`, sin `-webkit-backdrop-filter`). El menú «Más acciones» (P-04) es un `<details>` controlado: Escape y clic afuera lo cierran y el foco vuelve al `summary`; el ítem elegido recibe el `summary` como disparador. Botón destructivo P-10: `buttonClass("outline", "gs-btn-danger")`. Controles interactivos de las tarjetas: 40 px. El catálogo de `/tarjetas` omite la barra de avance y «Cierra/Vence» del prototipo (el catálogo no los calcula); el resumen de ciclo es de UI-05B.
11. **Resumen de ciclo (UI-05B)** — `/tarjetas/[cardId]/resumen` reutiliza el kit y agrega `StateTag` (`components/glaciar/screen.tsx`) y las clases `gs-review` (lista de cifras), `gs-figure` (remanente grande), `gs-accordion` (`<details>` con chevron CSS, sin cambiar el marcado `details/summary` que leen las e2e), `gs-purchase`, `gs-nav` y `gs-kpis--fill`. Un panel `.lab-panel.c-feature` por moneda; el remanente aparece una sola vez (cifra grande) y no en la lista. Se omite «Avance del ciclo» del prototipo porque la app no calcula el inicio del ciclo. La revisión de compras es una lista apilada (no tabla) porque cada fila contiene el formulario «Cambiar resumen». El pago sigue siendo el formulario real de un paso (`CreditOperationForm`), con la nota de efectos «reduce deuda y Bancos, no es un gasto nuevo».
12. **Fondos y Presupuestos (UI-05C)** — `/fondos` y `/presupuestos` reutilizan el kit; las clases nuevas (`gs-fund*`, `gs-contrib*`, `gs-budget*`, `gs-tone--*`, `gs-effects`, `gs-confirm`) viven en `glaciar-screens.css`. El encabezado con el botón de alta se dibuja dentro del catálogo cliente (como Tarjetas) y los indicadores de Fondos llegan por el slot `kpis` desde el servidor. **M-01:** los cuatro indicadores tienen `HelpPopover`; la ayuda de la equivalencia nombra la moneda de visualización elegida (no UYU fija) y habla de fondos «vigentes (activos o pausados)». **M-02:** estado por presupuesto con `StateTag`, `lab-meter--*` y `gs-tone--*` (valor y avisos) con los umbrales vigentes (rojo ≥ 100 %, ámbar 80 % a < 100 %, verde por debajo, neutro sin cálculo); no hay fila de contadores (P-05 no aprobada). Las acciones siguen visibles (Reservar/Liberar/Traspasar/Editar/Cerrar fondo; Editar/Solo un mes/Quitar) porque las e2e las localizan por nombre accesible; los estados vacíos no repiten el botón de alta del encabezado.

## 5. Textos aprobados

**Tutorial (8 pasos):**
1. *Bienvenido a Finanzas personales* — Un recorrido corto por el resumen. Solo orienta: no registra ni cambia nada.
2. *Moneda de toda la app* (selector superior) — Elegí en qué moneda ver los totales de toda la aplicación. Solo cambia cómo se muestran los números: tu dinero no se convierte.
3. *Tus cuentas por moneda* (pestañas de Disponible libre) — Pasá de tu cuenta en pesos a la de dólares o euros. Muestra lo que tenés en cada una; no convierte una en otra.
4. *Cambio de moneda* — Registrá cuando pasás plata entre tus cuentas del banco, por ejemplo de pesos a dólares. Baja una, sube la otra y no cuenta como gasto ni ingreso.
5. *Confirmar saldo* — Anotá el saldo exacto que te muestra tu banco. Queda como punto de control y la app toma esa cifra como referencia.
6. *Registrar un movimiento* — Desde acá cargás gastos, ingresos y el resto de las operaciones.
7. *Menú de secciones* — Historial, Tarjetas, Fondos, Presupuestos, Estadísticas y más. En computadora se abre al pasar el mouse.
8. *Ayuda cuando la necesites* — En Ayuda tenés las preguntas frecuentes con más detalle y podés repetir este recorrido.

**Ayuda — pregunta nueva (falta en `domain/ayuda.ts`):** «¿Para qué sirve el selector UYU / USD / EUR de arriba?» — Elige la moneda en la que se muestran los totales y estadísticas de toda la aplicación, usando cotizaciones de referencia. No convierte ni mueve tu dinero, y los movimientos conservan su moneda original. Tu elección se recuerda en tu cuenta. (Las respuestas sobre «Cambio de moneda» y «Confirmar saldo» ya existen.)

## 6. Limitaciones conocidas de la exploración

- El agente no pudo ver la versión final en pantalla (requiere sesión Google); la aprobación se basó en capturas del usuario. A, B y C sí se revisaron a 1440 px y 375 px.
- Sin medición de fps en dispositivos reales ni medición de contraste sobre las zonas más luminosas del fondo.
- Sin prueba con lector de pantalla; reducción de movimiento y falta de WebGL implementadas pero no emuladas.

## 7. Cómo arrancar cada etapa en un chat nuevo

```text
[UI-0X] Ejecutá el ticket UI-0X de docs/planning/05-plan-de-implementacion.md.
Seguí AGENTS.md y docs/design/ui-identidad-visual.md (diseño aprobado; la
implementación de referencia está en src/app/prototipos/ui/). Solo cambios
de presentación: no tocar cálculos, APIs, auth, esquema ni datos. Rama
codex/UI-0X-..., pruebas pertinentes (unitarias, e2e y revisión visual en
móvil y escritorio), commit y PR. No hacer merge sin mi autorización.
```
