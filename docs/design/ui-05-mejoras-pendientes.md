# UI-05 — Mejoras identificadas durante la revisión visual

**Estado:** M-01, M-02 y M-03 **implementadas en prototipo** (rama `codex/UI-05-M01-03-mejoras-visuales`); **implementación en producción pendiente** (las pantallas reales `/fondos`, `/presupuestos` y `/ayuda` conservan el diseño anterior hasta UI-05C/UI-05H). **M-06 implementada en pantallas reales** (Resumen e Historial, rama `codex/UI-05-M06-colores-movimientos`) y en el prototipo de Recurrentes; el resto de prototipos y pantallas aún no reales queda pendiente (ver «Estado de implementación» en M-06). M-04 y M-05 pendientes.
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
| M-05 | Optimizar grid y espacios vacíos | Chat 3 | Revisión de composición y responsive |
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

**Estado (2026-11-15): implementado en prototipo; producción pendiente.** `HelpPopover` (`_proto/help-popover.tsx`) + prop `help` de `Kpi`. Abre al pulsar, cierra al pulsar fuera, al repulsar o con Escape (devuelve el foco al botón); `aria-expanded`, `aria-controls`, `role="note"`. Verificado en 1440 y 375 px sin desbordes.
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

**Estado (2026-11-15): implementado en prototipo; producción pendiente.** Prop `tone` de `Kpi` con `--lab-good/warning/critical` (los mismos tokens que `.lab-tag` y `.lab-meter`): colorea icono y valor, borde con mezcla muy sutil (28–30 %), sin glow. «Sin calcular» queda neutro; recuentos y tamaños sin cambios (comprobado: color del valor idéntico al de las etiquetas).
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
