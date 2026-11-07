# Aplicación de finanzas personales — Registro de decisiones del producto

**Versión:** 1.3  
**Actualizado:** 2026-11-06  
**Estado:** Documento vivo de decisiones de producto.  
**Ubicación en el repositorio:** `docs/product/decisiones-producto.md`  
**Referencia visual:** `docs/fintrack-original.jpeg` y `docs/design/fintrack-visual-spec.md`

> **Objetivo de este documento:** que el desarrollo no dependa de la memoria de un chat. Distinguir entre **CONFIRMADO**, **PENDIENTE** y **DESCARTADO**. Una propuesta no es un requisito hasta que el usuario la confirme. Si se contradicen versiones, prevalece la decisión explícita más reciente.

---

## 1. Objetivo y criterios del producto — CONFIRMADO

- Desarrollar una aplicación **web privada de finanzas personales** que muestre información útil, organizada y fácil de revisar.
- Debe ser **completa, pero de muy bajo mantenimiento**: no obligar al usuario a registrar todas las transacciones de cada día ni a abrirla continuamente.
- La aplicación debe **calcular correctamente a partir de los datos efectivamente registrados** y señalar cuándo un saldo puede estar desactualizado. No simular integración bancaria ni inventar movimientos faltantes.
- El usuario quiere planificar funciones y experiencia de usuario **antes de empezar a generar código de la aplicación**; Codex será el agente principal de desarrollo.
- **El nombre definitivo no está elegido.** El texto «Fintrack» que aparece en la imagen es solamente la marca de la referencia; **NO** usarlo como nombre, logo o título de la nueva aplicación.

## 2. Diseño — CONFIRMADO

- Reproducir con la máxima fidelidad posible la estética de la captura de referencia `docs/fintrack-original.jpeg`: tema oscuro, sidebar, header, tres indicadores superiores, pestañas, tablero central de cuatro columnas, tarjetas, iconografía, jerarquía tipográfica, espaciados y colores.
- Mantener la composición original como **referencia visual**, pero modificar etiquetas, contenido, botones y destinos para que correspondan a las funciones realmente elegidas. No agregar un módulo solo porque aparece en la imagen de ejemplo.
- El marco gris que rodea el panel de la captura **no** pertenece a la app final.
- La especificación visual detallada fue elaborada por Codex y se informó que estaba guardada localmente como `docs/design/fintrack-visual-spec.md`. Al momento de crear la v1.2, **no figura aún en `main` en GitHub**; conservarla y subirla será una tarea pendiente independiente.
- Se configuró **Playwright MCP** en Codex para pruebas de navegación y comparación de capturas. Las imágenes se guardarán solo donde el entorno tenga permiso.
- No prometer coincidencia perfecta de píxeles a partir de un JPEG, porque tipografía exacta, reescalado y algunos detalles no pueden deducirse con certeza. No rediseñar o «mejorar» arbitrariamente el aspecto.

## 3. Alcance financiero — CONFIRMADO

### 3.1 Incluido

1. **Saldos bancarios consolidados por moneda** (detalles en §4).
2. **Ingresos y gastos** con movimientos clasificados por categoría y subcategoría (detalles en §5).
3. **Ajuste manual del saldo real** sin inventar ni clasificar automáticamente movimientos que faltan (detalles en §6).
4. **Transferencias / cambios de moneda** sin falsos ingresos o gastos (detalles en §7).
5. **Tarjetas de crédito:** seguimiento de saldos adeudados, vencimientos y pagos; el comportamiento detallado está pendiente (detalles en §8).
6. **Deudas y préstamos:** importes pendientes, cuotas, vencimientos e intereses cuando corresponda; el comportamiento detallado está pendiente (detalles en §8).
7. **Conversión de divisas** para visualizar saldos consolidados (detalles en §9).
8. **Dashboard y estadísticas** sustentados en los datos que existen (detalles en §11).
9. **Gastos recurrentes flexibles y opcionales** (detalles en §8.1).

### 3.2 Excluido explícitamente

- **Efectivo**: no registrar efectivo ni incluirlo en los totales.
- **Inversiones**: no registrar carteras, acciones, compras y ventas de títulos ni cotizaciones bursátiles; el usuario prefiere Google Finance para ello.
- En consecuencia, **NO desarrollar módulos de inversiones ni integrar APIs de acciones**. La discusión anterior de proveedores bursátiles quedó anulada.
- **NO conectar directamente cuentas bancarias de BROU, Itaú o Santander en la primera versión** ni pedir credenciales de acceso a esas entidades.
- **NO separar obligatoriamente bancos por institución**: el usuario descartó gestionar BROU / Itaú / Santander como subcuentas individuales.

## 4. Cuentas bancarias — CONFIRMADO

- Debe existir un **saldo bancario consolidado independiente para cada moneda**: inicialmente **Bancos UYU**, **Bancos USD** y, si se necesita, **Bancos EUR**.
- Ejemplo: el saldo «Bancos UYU» es la suma que el usuario tiene en todos sus bancos en pesos uruguayos, sin importar dónde esté depositada.
- No se necesitan cuentas individuales «BROU», «Itaú», «Santander» ni el desglose por institución.
- Registrar **saldo inicial** para cada moneda al comenzar a usar la aplicación. **Un saldo inicial NO constituye un ingreso del mes**.
- Un ingreso o gasto registrado debe impactar automáticamente en el saldo consolidado **de su moneda**.
- Debe mostrar la **fecha de última actualización o conciliación real** de cada saldo. La fecha de una transacción no implica necesariamente que todo el saldo haya sido contrastado con el banco.
- Permitir crear un saldo adicional para una nueva moneda en el futuro, sujeto al diseño que definamos.
- Los movimientos entre dos bancos propios **de la misma moneda** no afectan el saldo agregado y no hace falta registrarlos.
- Este criterio privilegia simplicidad sobre conocer cuánto dinero hay en cada banco.

## 5. Ingresos y gastos — CONFIRMADO

### 5.1 Registro manual de movimientos

- Incorporar una acción clara, como **«+ Nueva transacción»**, en el estilo visual de la captura.
- Tipos básicos: **Ingreso**, **Gasto** y **Transferencia / cambio de moneda** (las transferencias se detallan por separado).
- Al registrar un **ingreso** o **gasto** permitir introducir:
  - **Importe**.
  - **Moneda / saldo bancario agrupado** que recibirá el ingreso o del que se descontará el gasto.
  - **Categoría** y, cuando corresponda, **subcategoría opcional**.
  - **Fecha**.
  - **Descripción / nota opcional**.
- Al guardar un ingreso, **sumar** el importe al saldo agregado de esa moneda. Al guardar un gasto, **restarlo**.
- Incluir los movimientos en las estadísticas de ingresos/gastos por período y categoría.
- Permitir **consultar, editar y eliminar/corregir movimientos**; al corregir o revertir uno debe recalcularse el saldo sin duplicar efectos. Este detalle es un requisito técnico de consistencia derivado del registro de movimientos.
- **No se exige registrar todos los gastos cotidianos** para poder usar la aplicación. Los movimientos importantes que el usuario sí cargue deben producir estadísticas útiles.

### 5.2 Límite explícito de las estadísticas

- Los reportes de ingresos/gastos muestran **lo que está registrado en la aplicación**. No implican necesariamente el total real del banco si hubo movimientos omitidos.
- **Nunca inferir automáticamente** de una variación entre saldos que se produjo un gasto de una categoría específica: pudo haber ingresos, transferencias, comisiones, correcciones u otras operaciones.
- Diferenciar ingresos y gastos genuinos de **saldo inicial, ajustes de saldo, transferencias internas, cambios de moneda y pagos de obligaciones** que podrían provocar doble conteo.
- Los importes registrados en diferentes monedas requieren conversión apropiada para agregarse en un mismo gráfico o total.

## 6. Actualizar saldo real — CONFIRMADO

- Existirá una acción **«Actualizar saldo real»** separada de **«Registrar movimiento»**.
- El usuario **consulta sus bancos por su cuenta** y escribe el **nuevo saldo total real de la moneda elegida**.
- La aplicación compara el saldo calculado que tenía con el nuevo valor introducido y registra la diferencia como **ajuste de saldo sin clasificar**.
- **El ajuste NO cuenta como ingreso ni gasto** y no recibe automáticamente una categoría de consumo.
- El ajuste actualiza el saldo consolidado de forma inmediata, conserva la **fecha**, el **importe anterior**, el **nuevo importe**, la **diferencia** y opcionalmente una nota.
- Conservar un historial de ajustes para revisión y correcciones. No borrar silenciosamente el hecho de que el saldo se corrigió.
- La aplicación **no consulta ni adivina el saldo del banco**: esta función es manual y no implica conectividad bancaria.
- El saldo corregido se considera confirmado a la fecha del ajuste; operaciones posteriores pueden volver a generar diferencias si no se registran todas.

**Ejemplo de comportamiento:** saldo mostrado $197.500 UYU; el usuario consulta sus bancos e introduce $196.500 UYU; crear un ajuste de −$1.000 UYU y mostrar $196.500 UYU. **No** registrar un gasto ficticio de $1.000.

## 7. Transferencias y cambios entre monedas — CONFIRMADO A NIVEL FUNCIONAL

- Movimientos entre bancos propios en **una misma moneda**: ya están incluidos en el saldo agregado, por lo que no es necesario registrarlos.
- **Cambio real de UYU a USD, USD a EUR, etc.**: permitir una operación en la que se ingresen los **dos importes reales** (moneda/importe entregado y moneda/importe recibido). Restar uno y sumar el otro.
- Un cambio de moneda propio **no se cuenta como ingreso o gasto ordinario**. Si existen comisiones o diferencias de cambio, el tratamiento exacto se terminará de diseñar antes de implementarlo.
- Evitar duplicar entradas si se registra el movimiento desde uno u otro saldo.

## 8. Categorías y subcategorías — CONFIRMADO

- Incluir un **catálogo inicial de categorías predeterminadas** para que el usuario pueda usar la aplicación sin configurar nada desde cero.
- Dividir en categorías de **ingresos** y de **gastos**, con **subcategorías opcionales**.
- Permitir al usuario **crear, editar, ocultar/archivar y eliminar categorías propias**; personalizar **nombre, icono y color**.
- Las estadísticas deben agrupar por **categoría y subcategoría**, pudiendo ver el total de una categoría y su desglose.
- **Preservar el historial:** si una categoría ya tiene movimientos asociados, no se puede eliminar de manera que queden movimientos huérfanos. Ofrecer archivar/ocultar o reasignar los movimientos antes de eliminarla.
- No deshacer ni reclasificar automáticamente transacciones históricas solo porque se edite una categoría.

### Catálogo inicial propuesto — PENDIENTE DE REFINAR, NO EXHAUSTIVO

**Ingresos:** sueldo, negocios, alquileres cobrados, intereses, dividendos, ventas, reembolsos, otros ingresos.

**Gastos:** vivienda/hogar, alimentación, servicios (agua, luz, internet), auto (combustible, seguro, patente, reparaciones), transporte, salud, educación, entretenimiento, viajes, seguros, impuestos, otros gastos.

> **Nota:** Está confirmada la existencia de categorías y subcategorías predeterminadas y personalizables. La **lista final exacta** todavía puede ajustarse; los ejemplos previos no deben tratarse como un catálogo definitivo.

## 8.1 Gastos recurrentes flexibles — CONFIRMADO

**Objetivo:** seguimiento opcional de pagos repetidos (servicios, alquiler, suscripciones, seguros, etc.) sin exigir conocer de antemano fecha exacta de vencimiento ni importe fijo, y sin obligar a llevar un calendario estricto.

- Al registrar un gasto normal se podrá marcar como **recurrente** e indicar su periodicidad (mensual por defecto cuando corresponda). La recurrencia reutiliza la categoría/subcategoría, descripción y moneda del movimiento.
- También se podrá crear o gestionar una recurrencia desde la sección de gastos recurrentes.
- **Importe flexible:** no será obligatorio definir un monto exacto. Cuando haya historial suficiente, la aplicación podrá presentar una **estimación claramente etiquetada** a partir de pagos pasados (por ejemplo, media de los últimos tres); el importe real se ingresa o confirma al pagar. Un importe estimado no es una factura real.
- **Fecha flexible:** permitir vencimiento exacto, fecha aproximada o **sin fecha de vencimiento**. Cuando no se conozca la fecha, no inventar una ni informar que un pago está «vencido». Si se muestra un período estimado, debe aparecer como aproximado.
- **Sugerencias basadas en el historial:** cuando se registren repetidamente gastos similares, se podrá sugerir convertirlos en recurrentes; el sistema no debe asumir que todos los cargos de una categoría corresponden a la misma factura. La sugerencia requerirá validación del usuario.
- **Pago manual confirmado:** la recurrencia nunca debe restar automáticamente un importe estimado ni crear un gasto consumado por el mero paso del tiempo. Solo al registrar el pago real se crea/confirma el movimiento que impacta en **Bancos [moneda]** y las estadísticas.
- **Sin duplicados:** pagar desde la tarjeta de recurrencia o registrar el movimiento desde «Nueva transacción» debe dar lugar a un **único gasto** vinculado a ese período. Si el usuario ya registró el pago, no volver a descontarlo.
- **Seguimiento por período:** mostrar los recurrentes registrados del mes y cuáles están pagados; «pendiente» debe referirse al registro/confirmación del pago en la aplicación, **no** a una afirmación de deuda bancaria verificada.
- **No obligatorio:** poder ocultar, pausar o desactivar recurrencias. No forzar al usuario a confirmar todas las facturas para seguir usando la app.
- El módulo o tablero visual de recurrentes podrá adoptar la columna **Bills & Fixed** de la referencia, manteniendo la fidelidad del diseño general.
- **Límite de automatización:** sin integración bancaria ni facturas importadas, el sistema no conoce los importes reales del próximo período, el vencimiento verdadero ni si el servicio fue pagado fuera de la aplicación.
- **Detalles técnicos abiertos:** fórmula exacta de estimación y detección, tolerancia a duplicados y configuración de notificaciones; deben concretarse durante especificación sin alterar las reglas confirmadas.

## 9. Tarjetas de crédito, deudas y préstamos — INCLUIDOS, DETALLE PENDIENTE

- **Tarjetas:** permitir registrar obligaciones pendientes, vencimientos y pagos. No obligar de entrada a cargar cada consumo de tarjeta.
- **Préstamos/deudas:** permitir registrar el saldo que se adeuda y sus cuotas/vencimientos/intereses cuando corresponda.
- Evitar **doble contabilización**: un gasto registrado en el momento de comprar con tarjeta no debería volver a contarse como gasto cuando se paga la tarjeta. Tampoco descontar dos veces una obligación en el cálculo patrimonial.
- **Pendiente de diseñar:** si la tarjeta se registra como una obligación con saldo manual, si hay movimientos detallados y cómo se concilian pagos, límites, cuotas e intereses. No asumir una solución no acordada.

## 10. Monedas y conversión — CONFIRMADO

- Monedas iniciales: **UYU, USD y EUR**.
- Conservar cada saldo, movimiento y obligación en su **moneda original**.
- Para el dashboard, mostrar totales consolidados inicialmente en **USD**, con un selector sencillo para **USD / UYU / EUR**. La selección de visualización no altera los datos originales.
- Obtener cotizaciones de referencia automáticamente, preferentemente **una vez al día**.
- **Fuente principal elegida:** **datosUruguay**, para pares relevantes al peso uruguayo, tomando datos publicados de referencia del BCU cuando estén disponibles.
- **Respaldo elegido:** **Frankfurter Exchange Rates API**, cuando falten datos o falle la fuente principal.
- Si ambas fuentes fallan, mostrar la **última cotización válida almacenada** indicando fuente y fecha; no inventar tasas.
- Guardar cotizaciones y fechas históricas cuando se requiera reconstruir cálculos de períodos anteriores.
- Permitir una tasa manual si es necesario, marcándola como tal.
- Distinguir **tipo de cambio de referencia** de la tasa efectiva que aplicó un banco en una operación real.
- **Antes de implementar**, verificar cobertura y disponibilidad de UYU, USD y EUR, formatos/endpoints vigentes, frecuencia, restricciones y atribución de ambas APIs. Si falla la cobertura, plantear otra fuente al usuario antes de cambiar la decisión.

## 11. Dashboard, cifras y estadísticas — PARCIALMENTE CONFIRMADO

- Conservar las **tres tarjetas principales** de la referencia visual: **Balance Overview**, **Monthly Income** y **Spending**, ajustando sus textos al nombre final del producto y a los datos reales.
- **Balance:** reflejar solo el patrimonio **registrado en la aplicación**, esencialmente saldos de bancos menos pasivos registrados que correspondan, convertido a la moneda elegida.
- **Dinero disponible:** reflejar saldos bancarios sin mezclar inversiones o efectivo (ambos excluidos). No confundir dinero disponible con patrimonio neto.
- Al acceder al balance, permitir un **desglose** de bancos por moneda y pasivos registrados (tarjetas, préstamos y deudas).
- Dado que no se incluyen inversiones ni efectivo, el balance **no pretende representar todo el patrimonio real** de la persona. Su título/ayuda debe comunicar el alcance.
- Ingresos/gastos mensuales y gráficos deben usar **movimientos registrados**, excluyendo saldos iniciales, ajustes y transferencias que no corresponden a ingresos/gastos.
- Conservar como referencia la **composición de cuatro columnas** del tablero; **pendiente** decidir cómo se adaptan exactamente sus tarjetas a los módulos finales, especialmente tras excluir inversiones.
- El usuario prioriza **claridad, rapidez, mínimo mantenimiento y organización**.

## 12. Funcionalidades todavía PENDIENTES

1. **Gastos recurrentes:** funcionamiento general ya **CONFIRMADO** en §8.1; pendiente solo definir detalles secundarios de detección/estimación y notificaciones, sin descontar automáticamente.
2. **Funcionamiento preciso de tarjetas de crédito**: saldos, consumos, límites, vencimientos, pagos, cuotas, intereses.
3. **Funcionamiento preciso de deudas y préstamos**: cuotas, amortización, vencimientos, intereses, historial.
4. **Lista final de categorías/subcategorías** y opciones de configuración concreta.
5. **Presupuestos y límites de gasto**, objetivos de ahorro, alertas y estadísticas adicionales: qué conservar de la captura y qué adaptar.
6. **Importación opcional de extractos bancarios** (CSV, Excel, etc.): se discutió, pero no se aprobó como requisito de primera versión.
7. **Autenticación y seguridad**, titular/es de cuenta, copias de seguridad y exportación de datos.
8. **Stack y servicios**: se exploraron Next.js, TypeScript, Tailwind, shadcn/ui, Supabase y Vercel, pero todavía no se ha cerrado toda la arquitectura de implementación.
9. **Nombre final** e identidad textual (distinta de la marca de la captura).
10. **Política de conciliación y reportes históricos** cuando se editen movimientos anteriores a un ajuste de saldo, para conservar consistencia contable y trazabilidad.

## 13. Entorno técnico y repositorio — ESTADO INFORMADO

- Repositorio GitHub señalado por Codex: `SebastianGonzalez2/finanzas-personales`; proyecto local abierto en Codex en su carpeta raíz.
- Rama `main`; primer commit `834ef6f` con `docs/fintrack-original.jpeg`, según informe del usuario.
- Codex informó que el remoto `origin/main` y la rama local están sincronizados tras ese primer commit. Otros commits posteriores de documentación pueden existir; verificar localmente antes de trabajar.
- Playwright MCP probado: pudo navegar y realizar capturas; hubo una restricción de guardado fuera del directorio autorizado.
- El análisis visual fue elaborado y se informó como guardado localmente en `docs/design/fintrack-visual-spec.md`, pero **no se encontró en el repositorio remoto al revisar la rama `main`**. No darlo por versionado hasta comprobarlo.
- Este documento v1.2 se incorpora a `docs/product/decisiones-producto.md` en GitHub, rama `main`. Si Codex tiene una versión local distinta o sin seguimiento, primero debe traer los cambios de GitHub y comparar antes de sobrescribir nada.
- **No iniciar programación del producto hasta cerrar la planificación funcional suficiente**.

## 14. Reglas de mantenimiento del registro

1. Cada decisión nueva se incorpora a su apartado; actualizar, eliminar o marcar como obsoletas las contradicciones previas.
2. Marcar siempre el estado: **CONFIRMADO**, **PENDIENTE**, **DESCARTADO**.
3. No convertir recomendaciones o ejemplos del asistente en requisitos sin confirmación del usuario.
4. No introducir datos bancarios reales, números de cuentas, contraseñas ni claves API en el documento o en Git.
5. Mantener GitHub como respaldo de documentación y código, **no de datos financieros privados reales**.
6. Al guardar una revisión, crear un commit que solo incluya los archivos de documentación correspondientes.

### Historial de cambios

- **2026-11-06 — v1.0:** primer documento de alcance: diseño de referencia, bancos por moneda, tarjetas/deudas, exclusión de efectivo e inversiones, conversión de divisas y decisiones pendientes.
- **2026-11-06 — v1.1:** confirmados registro individual de ingresos/gastos, efecto automático sobre saldos, ajuste manual del saldo real como evento no clasificable en ingresos/gastos, transferencias y cambios de moneda, y categorías/subcategorías predeterminadas y personalizables con historial protegido.
- **2026-11-06 — v1.2:** consolidación y publicación directa en GitHub; se confirma qué documentación está efectivamente versionada en `main` y qué documentación visual sigue pendiente de subir. Sin cambios nuevos de funcionalidad. Se actualizaron los apartados pendientes para no contradecir esos acuerdos.
- **2026-11-06 — v1.3:** gastos recurrentes aprobados: opcionales, importes variables estimables a partir de historial, vencimientos opcionales/aproximados, sugerencias de recurrencia, confirmación de pagos reales, conciliación sin duplicados y sin descuentos automáticos.