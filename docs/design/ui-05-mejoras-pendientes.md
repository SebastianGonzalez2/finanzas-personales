# UI-05 — Mejoras identificadas durante la revisión visual

**Estado:** M-01, M-02 y M-03 **implementadas en prototipo** (rama `codex/UI-05-M01-03-mejoras-visuales`); **implementación en producción pendiente** (las pantallas reales `/fondos`, `/presupuestos` y `/ayuda` conservan el diseño anterior hasta UI-05C/UI-05H). **M-06 implementada en pantallas reales** (Resumen e Historial, rama `codex/UI-05-M06-colores-movimientos`) y en el prototipo de Recurrentes; el resto de prototipos y pantallas aún no reales queda pendiente (ver «Estado de implementación» en M-06). **M-05 implementada en prototipo** (Estadísticas, Mi cuenta y Fondos; rama `codex/UI-05-M05-layout`); **M-05 implementada en producción en Estadísticas (UI-05D)**: carriles en «Todas»; en «Mis favoritos» solo si respetan el orden guardado, si no una columna. M-04 pendiente.
**Origen:** revisión visual del usuario, 15 de noviembre de 2026.
**Diseño de referencia:** Glaciar.
**PR de planificación:** #77 (UI-05-DESIGN). Este documento registra decisiones solicitadas por el usuario; no autoriza cambiar lógica financiera ni ampliar el alcance de la PR de planificación.

## Organización para implementar sin mezclar alcances

| ID | Mejora | Grupo recomendado | Alcance |
| --- | --- | --- | --- |
| M-01 | Tooltips explicativos en Fondos de ahorro | Chat 1 | UI; verificar semántica de indicadores · **prototipo ✔ / producción pendiente** |
| M-02 | Colores de estados de Presupuestos | Chat 1 | UI; conservar reglas de clasificación · **prototipo ✔ / producción pendiente** |
| M-03 | Simplificar Ayuda | Chat 1 | UI; eliminar búsqueda y filtros · **prototipo ✔ / producción pendiente** |
| M-04 | Ocultar cotización manual permanente en Presupuestos | Posterior (lógica financiera) | UI + manejo de errores y cotizaciones automáticas |
| M-05 | Optimizar grid y espacios vacíos | Chat 3 | Revisión de composición y responsive · **prototipo ✔ / producción ✔ (UI-05D)** |
| M-06 | Diferenciar ingresos y egresos por colores | Chat 2 | UI transversal; mantener semántica contable · **real ✔ (Resumen, Historial) / prototipo ✔ (Recurrentes) / resto pendiente** |

**Regla general:** aplicar solo cambios aprobados y pertinentes a la rama de implementación. Revisar `AGENTS.md`, la documentación de Glaciar y los componentes existentes. Reutilizar tokens y patrones, mantener accesibilidad y contraste, sin rehacer pantallas, alterar cálculos, migraciones, APIs, saldos o permisos. Las capturas y rutas de UI-05-DESIGN pueden ser prototipos: comprobar qué está implementado en las pantallas reales antes de actuar. La PR #77 solo contiene planificación/prototipos y no debería recibir cambios funcionales.

---

## M-01 — Tooltips informativos en Fondos de ahorro

**Objetivo:** facilitar la comprensión de los indicadores financieros sin agregar texto permanente ni complejidad visual.

**Propuesta:** incorporar un ícono pequeño de interrogación `(?)` junto al título de cada una de las cuatro tarjetas superiores. Al pulsarlo, abrir un popover compacto con una explicación breve.

**Copys propuestos:**

1. **Equivalencia del total reservado:** «Es el valor aproximado en pesos uruguayos de todo el dinero reservado en tus fondos de ahorro, incluyendo pesos, dólares y euros. Se calcula utilizando las cotizaciones de referencia».
2. **Disponible libre — UYU:** «Es el dinero en pesos uruguayos que tenés disponible en tus cuentas bancarias y que no está reservado en ningún fondo de ahorro».
3. **Disponible libre — USD:** «Es el dinero en dólares que tenés disponible en tus cuentas bancarias y que no está reservado en ningún fondo de ahorro».
4. **Disponible libre — EUR:** «Es el dinero en euros que tenés disponible en tus cuentas bancarias y que no está reservado en ningún fondo de ahorro».

**Comportamiento:** el popover abre al pulsar, cierra al pulsar fuera, al volver a pulsar o con Escape; funciona con teclado y en móvil; tiene foco y atributos accesibles. Se integra con la tipografía, transparencias y espaciado Glaciar sin alterar layout ni cálculos.

**Verificación obligatoria:** antes de fijar el copy, contrastar cada definición con los cálculos realmente implementados. No suponer que «disponible libre» contempla obligaciones pendientes o que una equivalencia realiza una conversión bancaria real. Ajustar solo el texto si la semántica difiere y señalar la discrepancia, sin tocar la lógica.

**Criterio de aceptación:** las cuatro tarjetas tienen ayuda consultable y comprensible, sin texto constante ni cambio en sus importes.

**Estado (2026-11-15): implementado en prototipo y en producción (`/fondos`, UI-05C; la moneda de la equivalencia ya es dinámica).** `HelpPopover` (`_proto/help-popover.tsx`) + prop `help` de `Kpi`. Abre al pulsar, cierra al pulsar fuera, al repulsar o con Escape (devuelve el foco al botón); `aria-expanded`, `aria-controls`, `role="note"`. Verificado en 1440 y 375 px sin desbordes.
**Contraste con el código real** (`listBankAvailability` en `src/server/bank-balances.ts`; `/fondos` en `src/app/fondos/page.tsx`):
- *Disponible libre* = saldo bancario calculado − suma de `reserved_amount` de los fondos, por moneda. **No descuenta obligaciones pendientes** (el copy no lo afirma) → texto confirmado, con «en tus cuentas bancarias» en lugar de «que tenés disponible».
- *Equivalencia*: suma lo reservado de fondos **no cerrados**, convertido con cotizaciones de referencia; es referencia, no conversión. Discrepancias de copy corregidas solo en el texto: se añadió «activos» y «no convierte tu dinero». **Discrepancia señalada:** en la pantalla real la moneda de la equivalencia es la *moneda de visualización* elegida (por defecto, la preferida del titular), no siempre UYU; el prototipo muestra UYU. Al implementar en producción, hacer dinámico «en pesos uruguayos» según esa moneda.

## M-02 — Colores de estado en tarjetas de Presupuestos

**Objetivo:** identificar rápidamente el estado de los presupuestos con el mismo lenguaje visual usado en «Consumo del mes».

**Propuesta:**
- **En rango:** verde.
- **Cerca del límite:** amarillo/naranja.
- **Excedidos:** rojo.
- **Sin calcular:** mantiene apariencia neutra.

**Diseño:** reutilizar exactamente los tokens y estilos semánticos existentes. Colorear ícono y número principal; si se usa un acento en fondo o borde, que sea muy sutil, legible y coherente con Glaciar. No convertir toda la tarjeta en una superficie saturada ni introducir glow exterior. Conservar tamaño, disposición y cantidad de tarjetas.

**Verificación obligatoria:** el texto original sugería los intervalos «en rango: menos del 80 %», «cerca: entre 80 % y 100 %» y «excedidos: 100 % o más». Esos umbrales deben contrastarse con el código; **no cambiar las reglas ni decidir por cuenta propia qué ocurre exactamente al 100 %**. Esta tarea es visual.

**Criterio de aceptación:** estados superiores y etiquetas de «Consumo del mes» utilizan los mismos colores semánticos, sin modificar recuentos.

**Estado (2026-11-15): implementado en prototipo y en producción (`/presupuestos`, UI-05C: el estado se muestra en cada presupuesto; no hay fila de contadores porque P-05 no está aprobada).** Prop `tone` de `Kpi` con `--lab-good/warning/critical` (los mismos tokens que `.lab-tag` y `.lab-meter`): colorea icono y valor, borde con mezcla muy sutil (28–30 %), sin glow. «Sin calcular» queda neutro; recuentos y tamaños sin cambios (comprobado: color del valor idéntico al de las etiquetas).
**Umbrales verificados** (`src/components/budget-catalog.tsx`): rojo desde 100 % (inclusive), ámbar desde 80 % hasta menos de 100 %, normal por debajo; no se modificaron. Nota: en el prototipo el texto «80 % o más» de «Cerca del límite» es correcto solo junto con «Excedidos»; no se tocó.

## M-03 — Simplificar la sección Ayuda

**Objetivo:** dejar solo las preguntas frecuentes, reduciendo espacios vacíos y elementos que no aportan valor.

**Propuesta:**
- Eliminar completamente la barra de búsqueda y su contenedor de gran altura.
- Eliminar también **todos** los chips/botones/filtros de categorías (Primeros pasos, Bancos y saldos, Movimientos, Tarjetas, etc.). No sustituirlos por otro sistema de filtrado.
- Mantener las tarjetas de preguntas frecuentes, agrupadas por temática, con respuestas desplegables (acordeones).
- Mantener el encabezado «Ayuda» y el botón «Volver a ver tutorial».
- Situar las tarjetas de preguntas frecuentes directamente debajo del encabezado, con espaciado compacto y responsive.

**Criterio de aceptación:** no hay buscador, filtros ni contenedores vacíos; todas las preguntas siguen accesibles y funcionan los acordeones y el tutorial.

**Estado (2026-11-15): implementado en prototipo; producción pendiente.** Eliminados buscador, contenedor, píldoras «Ir a», resaltado y el estado `busqueda` del prototipo. El prototipo ahora muestra las 16 secciones (57 preguntas) en dos columnas independientes y equilibradas (3047 px / 3414 px) para evitar huecos; una columna en móvil. Acordeones y «Volver a ver tutorial» verificados. Las capturas de `docs/design/ui-05/capturas` (incluida `15-ayuda-busqueda`) son anteriores a este cambio y no se regeneraron.

## M-04 — Cotización manual en Presupuestos (posponer respecto de Chat 1)

**Objetivo:** retirar opciones técnicas permanentes de la vista principal y ofrecer un flujo de recuperación solo cuando realmente falte una cotización.

**Propuesta:**
- Eliminar el formulario siempre visible de «Cotización manual para presupuestos».
- Si falta una cotización, mostrar aviso contextual únicamente en el presupuesto afectado.
- Explicar qué gasto, fecha y par de monedas ocasionan el problema.
- Ofrecer «Reintentar automáticamente» y «Introducir cotización manual».
- La carga manual debe ser último recurso cuando fallen las fuentes automáticas Frankfurter y Datos Uruguay.
- Conservar referencias ya calculadas de acuerdo con la lógica de tipos de cambio del producto.

**Dependencia:** verificar y corregir por separado el uso de APIs automáticas, el momento en que se fija la cotización histórica y la coherencia entre presupuestos, cuotas y estadísticas. No implementar ni prometer funcionalidad de recuperación si el backend todavía no la soporta. Esta mejora excede el Chat 1 y debe planificarse junto con las correcciones funcionales.

**Criterio de aceptación futuro:** los usuarios no ven el formulario técnico en estado normal y pueden resolver cotizaciones faltantes sin alterar movimientos ni históricos.

## M-05 — Optimización del grid y espacios vacíos

**Objetivo:** aprovechar mejor el espacio en Estadísticas y otras secciones con tarjetas de distintas alturas.

**Propuesta:**
- Auditar huecos innecesarios y saltos visuales, prioritariamente en Estadísticas.
- Evaluar un layout adaptable tipo Masonry **solo donde sea apropiado**; no imponer Masonry globalmente.
- Mantener separación uniforme y tokens de espaciado Glaciar.
- Respetar responsive, navegación por teclado, orden lógico de lectura y relaciones visuales entre tarjetas.
- No estirar artificialmente tarjetas ni agregar contenido de relleno.
- No alterar jerarquía ni diseño ya aprobado de otras páginas sin justificación.

**Criterio de aceptación:** menos huecos perceptibles, buen orden de lectura y distribución estable en móvil y escritorio.

**Estado (2026-11-15): implementado en prototipo; producción pendiente (UI-05D).**

**Técnica elegida: carriles independientes con CSS Grid**, el mismo patrón que ya usan Tarjetas, Fondos, Presupuestos, Avisos y Catálogos (`ui05-span-8 ui05-stack` + `ui05-span-4 ui05-stack`). Se descartaron: Masonry nativo de CSS (sin soporte estable en todos los navegadores), multicolumna `columns` (ordena por columna, reubica tarjetas al cambiar alturas y no admite anchos 8/4) y Masonry con JS (dependencia, saltos de layout e hidratación). Los carriles no usan JS y el orden del DOM coincide con el visual y con el foco de teclado.

**Cambios (solo prototipos):**
- `_proto/proto.css`: clases `ui05-lane-main` (8 columnas) y `ui05-lane-side` (4) desde 80rem (1280 px); por debajo se apilan en una columna para que la tabla del Histórico conserve ancho.
- **Estadísticas** (`analysis.tsx`, `Charts`): «Indicadores» a ancho completo; carril principal = Ingresos y gastos por mes → Medios de pago → Ingresos por categoría → Histórico por fecha; carril lateral = Gastos por categoría → Resumen inteligente → Gastos recurrentes. Contenido de los paneles sin cambios; «Detalle» sin cambios.
- **Mi cuenta** (`support.tsx`): una columna (cuenta → copias → eliminar).
- **Fondos** (`planning.tsx`): la fila de acciones de cada ficha queda al pie (`mt-auto`, como `.ui05-card__actions` en Tarjetas); las fichas de una fila alinean sus botones.

**Verificación en vivo** (`next dev`, sesión real; medición de la posición de cada panel con `getBoundingClientRect`; se descarta la separación de 20 px entre filtros e indicadores, que es el espaciado propio de la pantalla):

| Pantalla | Antes (capturas 1440) | Después |
| --- | --- | --- |
| Estadísticas · Con datos | hueco de ~137 px bajo «Ingresos y gastos por mes» | 0 huecos entre paneles a 1440, 1280, 1024, 768 y 375 px |
| Estadísticas · Todas | ~137 px + ~80 px bajo «Gastos recurrentes» | 0 huecos a 1440 y 1280; la diferencia entre carriles queda solo al pie de la página |
| Mi cuenta | ~150 px antes de «Eliminar cuenta» | 0 huecos a 1440 y 375 (también con «Restaurar copia» desplegado) |
| Fondos | ~110 px vacíos bajo los botones de «Fondo de emergencia» | acciones alineadas en la fila (misma altura de inicio en ambas fichas) |

Sin desplazamiento horizontal en ningún ancho. La tabla del Histórico entra a 1280 px (693 px en 737 px de panel). Tab recorre los paneles en este orden: Indicadores → carril principal → carril lateral. **Resumen** (real) medido a 1440: sin huecos entre paneles; no se tocó. Las capturas de `docs/design/ui-05/capturas` no se regeneraron porque el script requiere el PostgreSQL desechable en Docker, que no está disponible en este equipo.

**Pantallas revisadas sin cambios:** Tarjetas, Avisos, Informes, Ayuda (resuelta en M-03), Deudas, Recurrentes, Catálogos, Beneficios y Ciclo de tarjeta ya usan carriles o pares de dos elementos; solo sobra espacio al final de la página.

**Regla para producción (UI-05D, Estadísticas real con favoritos dinámicos):**
- Ancho completo: `metrics` y el panel de detalle (`StatisticsDrilldown`). Carril principal: `income-expense`, `methods`, `income-categories`, `history`. Carril lateral: `expense-categories`, `summary`.
- Dentro de cada carril se conserva el orden de la vista (en favoritos, `created_at`); entre carriles el orden es el de la regla. Confirmar en UI-05D que ese cambio de orden es aceptable.
- **Si un carril queda vacío**, no usar carriles: el resto va a ancho completo en una columna (si no, quedaría un hueco de 8 o 4 columnas).
- Carriles solo desde 80rem; por debajo, una columna en orden de DOM (carril principal y después lateral). En móvil, «Gastos por categoría» aparece después de los paneles del carril principal.

**Nota para M-04 (Presupuestos):** al quitar el formulario permanente de cotización manual, el carril lateral queda solo con la nota «El seguimiento se reinicia cada mes…». Revisar ahí el reparto 8/4 (por ejemplo, llevar la nota al encabezado).

## M-06 — Colores semánticos para ingresos y egresos

**Objetivo:** distinguir visualmente entradas y salidas de dinero en las listas, comenzando por «Movimientos recientes» de Resumen y extendiendo el criterio a las secciones aplicables.

**Propuesta:**
- **Entradas de dinero, ingresos y devoluciones positivas:** importe en verde legible.
- **Gastos y salidas de dinero:** importe en rojo legible, en vez de blanco.
- **Transferencias y cambios de moneda:** tratamiento neutro o diferenciado según el efecto real del movimiento; no etiquetarlos automáticamente como ingreso o gasto.
- Aplicar el color principalmente al importe y mantener nombres/descripciones con su estilo habitual.
- Mantener los signos `+` y `−`, y reutilizar tokens semánticos accesibles de Glaciar; no usar exclusivamente color para comunicar significado.
- Revisar todas las vistas relevantes sin cambiar cálculos ni la clasificación contable.

**Precaución:** un pago de tarjeta puede ser salida bancaria y mostrarse como importe negativo, pero **no debe duplicarse como gasto contable** en Presupuestos o Estadísticas. Diferenciar presentación de flujo bancario y clasificación financiera.

**Criterio de aceptación:** importes claramente distinguibles y contrastados, sin cambiar saldos, estadísticas ni cálculos.

**Estado de implementación (M-06):**
- **Pantallas reales (Glaciar):** «Movimientos recientes» de Resumen, tabla de Historial y su detalle (`/historial/[source]/[id]`). Solo presentación: token `--amount-negative` (= `--state-critical`), clase `.lab-amount.is-negative` y mapa único `historyAmountTones` en `src/components/history-entry.tsx`, que decide el tono por **tipo de movimiento**, no por el signo.
- **Tonos:** verde = ingreso, devolución de compra, reintegro de saldo a favor, beneficio bancario. Rojo = gasto, compra con tarjeta, pago de tarjeta (salida bancaria; sigue sin contarse como gasto). Neutro = cambio de moneda/transferencia, operaciones de préstamo/deuda y ajustes. Se mantienen los signos `+`/`−`; el cambio de moneda conserva su `+` pero ya no es verde.
- **Prototipos:** lista de Recurrentes (`.ui05-row__amount.is-negative`, con `−` en gastos). Los demás prototipos no muestran movimientos con signo, salvo la línea de tiempo de Obligaciones, que se deja neutra a propósito (capital de préstamo e intereses no son ingreso/gasto ordinario).
- **Pendiente de trasladar:** Recurrentes y Obligaciones/préstamos al implementarse en producción (UI-05) deben reutilizar `--amount-negative` y el criterio de tonos anterior; Deudas y Presupuestos reales no se tocaron.

---

## Secuencia acordada

1. **Chat 1 — Sonnet:** implementar solo M-01, M-02 y M-03 en la rama de implementación adecuada, tras confirmar alcance, pantallas reales/prototipos y estado Git. No tocar M-04, M-05 o M-06.
2. **Chat 2 — Sonnet:** implementar M-06 de forma transversal y probar vistas afectadas.
3. **Chat 3 — Opus para evaluar y Sonnet para ejecutar:** revisar M-05 antes de elegir una técnica de layout.
4. **Tarea posterior:** M-04 con las correcciones de cotizaciones, históricos y cuotas; separar UI de lógica según dependencias.

**Estado inicial:** todos pendientes. Actualizar este documento con PR, commits, evidencias y estado real después de cada implementación, sin marcar una mejora como realizada sin verificarla.
