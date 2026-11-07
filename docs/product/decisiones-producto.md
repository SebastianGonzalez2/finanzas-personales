# Aplicación de finanzas personales — Registro de decisiones del producto

**Versión:** 3.7  
**Actualizado:** 2026-11-06  
**Estado:** Documento vivo de decisiones de producto.  
**Ubicación en el repositorio:** `docs/product/decisiones-producto.md`  
**Referencia visual:** `docs/fintrack-original.jpeg` y `docs/design/fintrack-visual-spec.md`

> **Objetivo de este documento:** que el desarrollo no dependa de la memoria de un chat. Distinguir entre **CONFIRMADO**, **PENDIENTE** y **DESCARTADO**. Una propuesta no es un requisito hasta que el usuario la confirme. Si se contradicen versiones, prevalece la decisión explícita más reciente.

---

## 1. Objetivo y criterios del producto — CONFIRMADO

- Desarrollar una aplicación **web privada de finanzas personales** que muestre información útil, organizada y fácil de revisar. **Condición prioritaria: operar sin costos obligatorios de infraestructura para el usuario dentro de los límites de uso gratuitos vigentes; no asumir que gratis significa disponibilidad, cuotas o condiciones garantizadas para siempre.**
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
5. **Tarjetas de débito y crédito:** métodos de pago configurables; las tarjetas de crédito mantienen deuda propia y las de débito utilizan el saldo bancario agrupado. Quedan detalles de cierre y cuotas por definir (detalles en §9).
6. **Deudas y préstamos por pagar Y dinero por cobrar:** módulos diferenciados, con saldos y movimientos propios; el comportamiento detallado está pendiente (detalles en §9.4).
7. **Conversión de divisas** para visualizar saldos consolidados (detalles en §9).
8. **Dashboard y estadísticas** sustentados en los datos que existen (detalles en §11).
9. **Gastos recurrentes flexibles y opcionales** (detalles en §8.1).

### 3.2 Excluido explícitamente

- **Efectivo**: no registrar efectivo ni incluirlo en los totales.
- **Inversiones**: no registrar carteras, acciones, compras y ventas de títulos ni cotizaciones bursátiles; el usuario prefiere Google Finance para ello.
- En consecuencia, **NO desarrollar módulos de inversiones ni integrar APIs de acciones**. La discusión anterior de proveedores bursátiles quedó anulada.
- **NO conectar directamente cuentas bancarias de BROU, Itaú o Santander en la primera versión** ni pedir credenciales de acceso a esas entidades.
- **NO separar obligatoriamente bancos por institución**: el usuario descartó gestionar BROU / Itaú / Santander como subcuentas individuales.
- **DESCARTADO para la primera versión:** importar extractos o movimientos bancarios desde archivos **CSV/Excel**. No desarrollar interfaz de carga de extractos, lectura de archivos, mapeo de columnas ni conciliación por importación ahora. No comprometer una segunda versión; solo reconsiderarlo si el usuario lo pide expresamente.

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
  - **Moneda / saldo bancario agrupado** que recibirá el ingreso o del que se descontará el gasto, cuando corresponda.
  - Para los gastos, **método de pago**: saldo bancario/transferencia, tarjeta de débito registrada o tarjeta de crédito registrada. La tarjeta elegida determina si el movimiento reduce bancos o incrementa deuda de crédito.
  - **Categoría** y, cuando corresponda, **subcategoría opcional**.
  - **Fecha**.
  - **Descripción / nota opcional**.
- Al guardar un ingreso recibido en bancos, **sumar** el importe al saldo agregado de esa moneda. Un gasto pagado por **transferencia bancaria o débito** resta del saldo bancario agrupado de la moneda; un gasto pagado con **crédito** aumenta la deuda de esa tarjeta y **no reduce el banco** al momento de la compra. En ambos casos el gasto se clasifica una sola vez en las estadísticas.
- Incluir los movimientos en las estadísticas de ingresos/gastos por período y categoría. **Excepción confirmada:** las compras a crédito en cuotas se reparten entre los meses del plan, en lugar de cargar toda la compra al primer mes (ver §9.5). Evitar contar como gastos simultáneamente la compra completa y sus cuotas.
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

## 9. Tarjetas de débito, crédito, deudas y préstamos

### 9.1 Catálogo y métodos de pago — CONFIRMADO

- Existirá una sección para **agregar y gestionar tarjetas**, registrando como mínimo **nombre identificable, tipo (débito o crédito) y moneda**. El banco emisor puede indicarse para reconocer la tarjeta (p. ej., Visa Itaú o débito BROU), **sin dividir por banco** los saldos consolidados.
- Los gastos permitirán seleccionar el **método de pago**: transferencia/saldo bancario de una moneda, una tarjeta de débito registrada o una tarjeta de crédito registrada. No obligar a registrar cada compra.
- **Tarjeta de débito:** solo identifica el medio de pago; **NO tiene un saldo financiero independiente**. Un gasto con débito se descuenta del saldo **Bancos [moneda]** correspondiente, exactamente como un gasto pagado desde el banco.
- **Tarjeta de crédito:** cada tarjeta tiene **su propia deuda pendiente**. Una compra ordinaria categorizada y pagada con ella aumenta su deuda y cuenta como gasto en las estadísticas, pero **NO descuenta de bancos** hasta que se pague la tarjeta. **Las compras en cuotas son un caso especial**: su gasto se distribuye por mes (§9.5), y se distinguen las cuotas futuras de la deuda efectivamente reflejada en el estado de cuenta.
- El mismo formulario de ingreso/gasto debe funcionar independientemente del método de pago, para evitar complejidad innecesaria.

### 9.2 Deuda, pago y actualización manual — CONFIRMADO

- Al crear una tarjeta de crédito se puede introducir **deuda inicial**; no se registra como un ingreso ni como un gasto nuevo. Se conserva la fecha de referencia.
- La sección de crédito mostrará por tarjeta **deuda actual registrada** y las acciones prioritarias **«Actualizar deuda»** y **«Registrar pago»**. Se podrá **registrar compra** desde la sección o desde «Nueva transacción» sin crear registros duplicados.
- **Registrar pago de tarjeta:** introducir importe, fecha, tarjeta y saldo bancario agrupado de origen; **reducir simultáneamente Bancos [moneda] y la deuda de esa tarjeta**. El pago es cancelación de un pasivo, **NO un segundo gasto** en estadísticas.
- **Actualizar deuda real:** el usuario consulta el saldo adeudado en su entidad financiera e introduce manualmente ese total. La diferencia con el importe registrado queda como **ajuste de deuda no clasificado**, con fecha e historial. No inventar compras, categorías, intereses ni gastos a partir del ajuste.
- Si se registran compras opcionales y se actualiza manualmente la deuda, **evitar doble contabilización** al añadir movimientos o conciliar importes. Todo ajuste/corrección debe conservar trazabilidad y permitir reconstruir saldos sin duplicar efectos.
- Los créditos son **pasivos**, no dinero disponible. Su deuda reduce el patrimonio registrado, pero un pago hecho desde bancos reduce a la vez activo y pasivo, sin cambiar por sí mismo el patrimonio neto.

### 9.3 Próximo estado de cuenta, vencimiento y recordatorio — CONFIRMADO

- **No exigir datos de cierre ni vencimiento al crear una tarjeta.** El usuario puede empezar solo con deuda total y acciones «Actualizar deuda» / «Registrar pago».
- Cada tarjeta de crédito permite registrar **opcionalmente** el **importe del próximo estado de cuenta a pagar** y su **fecha de vencimiento**, consultados por el usuario en el resumen/banco. No inventar ni inferir esos datos a partir de la deuda total.
- Mostrar claramente dos conceptos **distintos**: (1) **deuda total actual de la tarjeta**, que puede incluir compras no facturadas o futuros períodos; y (2) **importe del estado de cuenta que vence en el período**, cuando esté informado. No presentar el segundo como idéntico al primero.
- Cuando haya **importe y vencimiento registrados**, habilitar recordatorio en la sección de notificaciones de la app antes del vencimiento si el importe de ese período aún figura pendiente. No afirmar «pago atrasado» sin fecha válida ni comprobar pagos externos que no se registraron.
- Al usar «Registrar pago» deben disminuir el saldo agrupado de bancos correspondiente y la deuda de la tarjeta, **sin registrar un gasto adicional**. También se debe reflejar lo pagado respecto al estado de cuenta, sin confundir una amortización parcial con pago completo; no duplicar pagos.
- La visualización de límite de crédito es **opcional**, si el usuario decide registrarlo.
- **No descontar automáticamente el importe del resumen** ni marcarlo como pagado por una mera estimación o por llegar a la fecha. No asumir conexión con la entidad financiera.

### 9.3.1 Detalles que siguen abiertos — PENDIENTE

- Definir cierres de período, reglas operativas adicionales de cuotas (§9.5), intereses, pagos mínimos, compras en otra moneda y reconciliación de estados de cuenta/pagos parciales más allá de las reglas generales anteriores.
- Está previsto que los pagos y consumos se identifiquen por tarjeta, no por banco: **métodos de débito independientes, cuentas bancarias agrupadas por moneda**.

### 9.5 Compras con tarjeta de crédito en cuotas — CONFIRMADO (detalles operativos pendientes)

**Principio confirmado:** una compra en cuotas se introduce una sola vez; las cuotas se reflejan automáticamente en los gastos de cada mes, mientras que **Bancos [moneda] solo baja cuando el usuario registra el pago real de la tarjeta**.

- Al registrar una compra con tarjeta de crédito, permitir elegir **pago en cuotas**. El formulario simplificado debe pedir: **importe de cada cuota, cantidad de cuotas, tarjeta de crédito, categoría/subcategoría, moneda y mes/año de la primera cuota**, además de una descripción opcional. Es el mismo flujo para compras con y sin intereses. **No exigir precio original de contado, precio total ni tasa de interés**.
- Calcular automáticamente el **total financiado** como valor de cuota × número de cuotas (para cuotas iguales). Ejemplo: 6 cuotas de $2.200 UYU producen un total financiado de $13.200 y un gasto de $2.200 en cada uno de los seis meses. El importe de cuota que proporciona el usuario ya incluye los intereses/cargos financiados conocidos.
- **Descartado del formulario principal:** campo «Agregar precio original» o «Precio al contado» y cálculo de cuánto costó la financiación frente al contado. No pedir porcentaje de interés ni derivarlo automáticamente.
- **Estadísticas mensuales:** contabilizar el importe **de la cuota correspondiente a cada mes** en la categoría elegida; **no** cargar simultáneamente los $12.000 como gasto en el primer mes ni repetir el gasto cuando se paga el estado de cuenta.
- Al cargar una compra en cuotas, el usuario **selecciona el mes y año de la primera cuota** (no necesita conocer la fecha de cierre del emisor). El sistema distribuye automáticamente las cuotas desde ese período, una por mes, y permite **modificar posteriormente el mes inicial**, actualizando el calendario y la asignación de gastos mensuales. Las correcciones deben conservar trazabilidad y no alterar ni duplicar pagos reales previamente registrados.
- El calendario y la asignación mensual de cuotas se **generan automáticamente** desde la compra inicial, sin obligar a registrar cada cuota a mano. La creación del registro mensual no implica que el usuario haya pagado la tarjeta.
- Mostrar una sección **«Compras en cuotas»** por tarjeta, con descripción, **total financiado calculado**, número de cuotas, importe de cada cuota, meses/períodos asignados, progreso, cuotas futuras y compromiso restante.
- **Diferenciar expresamente:** cuota incluida en los gastos/plan mensual, cuota facturada en un estado de cuenta, cuota efectivamente pagada, **deuda actual registrada de la tarjeta** y **cuotas futuras comprometidas**. «Cuota del mes» no equivale a «pagada». El progreso nunca debe declarar pagos confirmados solo porque haya transcurrido un mes.
- **Pago de la tarjeta:** al registrar el pago efectivo, descontar del saldo bancario agrupado y reducir la deuda correspondiente **sin generar otro gasto**. No descontar automáticamente saldo bancario cuando se genera la cuota mensual.
- **Evitar doble cómputo de deuda:** según el emisor, el saldo que informa el banco puede reflejar solamente cuotas facturadas o también obligaciones de cuotas futuras. La aplicación debe mantener separado el **saldo real/manual del emisor** y el **calendario de compromisos futuros**, sin sumar a ciegas ambos importes al patrimonio o a la deuda total. La política técnica exacta de reconocimiento/reconciliación queda pendiente.
- Permitir corregir el plan cuando cambie un importe o se produzca una cancelación anticipada; la **conciliación con el ciclo real del emisor, cuotas de importes diferentes, cargos posteriores al registro y compras multimoneda** requieren aún reglas detalladas. Para las cuotas iguales, **el usuario registra directamente su importe final** sin ingresar tasa ni precio original. No inventar intereses o comisiones adicionales.
- **Ejemplo confirmado:** $12.000 en 6 cuotas de $2.000 → cada mes se muestran $2.000 en estadísticas de gastos; Bancos UYU no disminuye hasta el registro de pago real de la tarjeta.

### 9.4 Deudas y préstamos / dinero por cobrar — AMBOS MÓDULOS CONFIRMADOS, DETALLE PENDIENTE

- Se confirma que existirán **ambos módulos separados**: (1) **Deudas y préstamos por pagar** — dinero que el usuario debe a entidades o personas; (2) **Dinero por cobrar** — dinero que terceros deben al usuario.
- No confundir los efectos de signo: una deuda por pagar es un **pasivo**, mientras que dinero por cobrar es un **derecho de cobro** registrado, no efectivo bancario disponible.
- Deben poder existir tanto préstamos con cuotas, vencimientos e intereses como **deudas simples sin plan de pagos**. El flujo de los préstamos con cuotas está confirmado (§9.4.1) y también el de deudas simples y dinero por cobrar (§9.4.2).
- **Evitar doble contabilización:** entregar o recibir capital de un préstamo y amortizar principal no equivalen por sí solos a ingreso o gasto ordinario; intereses y cargos sí requieren tratamiento diferenciado. Definir posteriormente cómo mostrarlos en estadísticas y flujo de caja, y cómo se concilian con los saldos bancarios.
- El módulo no debe inventar fechas, amortización de capital ni intereses cuando el usuario no dispone de ellos. Quedan pendientes detalles técnicos de conciliación y la forma de registrar el momento en que se origina una deuda nueva (si se presta o recibe dinero).

#### 9.4.1 Préstamos con cuotas — CONFIRMADO

- Registrar un préstamo mediante un nombre o descripción identificable, **saldo de deuda pendiente actual** y moneda. Si el usuario los conoce, permitir añadir **importe habitual de cuota, frecuencia y fecha de vencimiento**, sin exigirlos como datos imprescindibles de seguimiento del saldo. No confundir capital inicial del préstamo con saldo pendiente actual.
- Mostrar deuda registrada, cuota habitual cuando exista, siguiente vencimiento si se conoce e historial de pagos. No crear automáticamente salidas del banco ni marcar cuotas pagadas por transcurrir el tiempo.
- Acciones principales: **«Registrar pago»** y **«Actualizar deuda pendiente»**.
- **Registrar pago:** el usuario anota cuánto pagó efectivamente; la aplicación **reduce el saldo consolidado de Bancos [moneda]** una sola vez y conserva la operación en el historial.
- Una cuota puede contener amortización de principal, intereses, seguros y/o comisiones. **No restar necesariamente de la deuda el importe íntegro pagado**. Si el usuario conoce el desglose, el componente de capital disminuye la deuda y los intereses/gastos financieros registrados cuentan en la estadística correspondiente, sin duplicaciones.
- **Si desconoce el desglose**, puede registrar el pago sin clasificarlo entre capital e intereses; el monto pagado sale de bancos, pero la deuda no debe reducirse arbitrariamente por ese mismo total. El usuario puede consultar el saldo real del préstamo e introducirlo mediante «Actualizar deuda pendiente». Conservar el ajuste y la fecha, sin deducir automáticamente qué parte fueron intereses, seguros u otros cargos. La interfaz debe hacer visible cuando la deuda aguarda conciliación.
- El pago de **capital de un préstamo** no es un gasto ordinario nuevo y la recepción del capital prestado tampoco es un ingreso ordinario. **Los intereses y cargos** sí pueden clasificarse como gastos si el usuario conoce los importes.
- Se mantienen las alertas sobre vencimientos **solo cuando la fecha esté registrada** (§11.1).
- **Pendiente:** cómo conciliar pagos con ajustes posteriores sin doble conteo, cuotas variables, pagos adelantados, moneda distinta y desglose automático por contrato; no implementar reglas inferidas sin acuerdo.

#### 9.4.2 Deudas simples y dinero por cobrar — CONFIRMADO

- Disponer de **deudas simples por pagar** y **dinero por cobrar** sin necesidad de crear un plan de cuotas; la interfaz prioriza las acciones **Registrar pago/cobro** y conserva **Actualizar importe pendiente** como acción secundaria.
- **Datos iniciales mínimos:** persona o entidad / descripción, **importe pendiente actual** y **moneda**. La **fecha de devolución prevista es opcional**; no exigir frecuencia, cuotas, tasa o intereses para una deuda simple.
- **Alta de saldo pendiente ya existente:** registrar una deuda o un importe por cobrar que el usuario ya tiene **no altera el saldo consolidado de bancos** ni se contabiliza automáticamente como ingreso o gasto. El registro describe una obligación o derecho de cobro existente.
- **Registrar pago parcial o total de deuda por pagar:** introducir importe y fecha; disminuir simultáneamente **Bancos [moneda]** y el importe pendiente de esa deuda, una sola vez. Mantener historial. La devolución de principal **no es gasto nuevo**.
- **Registrar cobro parcial o total de dinero por cobrar:** introducir importe y fecha; aumentar **Bancos [moneda]** y disminuir simultáneamente el importe que el tercero debe, una sola vez. Mantener historial. La recuperación del principal **no es ingreso nuevo**.
- **Actualizar importe pendiente:** introducir manualmente un nuevo saldo de deuda o de dinero por cobrar, con fecha y diferencia registrada; **no mover dinero del banco**, ni generar automáticamente ingresos o gastos. Sirve para rectificaciones, condonaciones o acuerdos que modifiquen el saldo sin pago real.
- Mantener **historial de pagos/cobros y ajustes**; permitir identificar cuando una obligación llegó a **cero/saldada**, sin borrar el historial.
- Cuando el usuario configure una **fecha prevista de devolución**, se podrá utilizar el centro de alertas ya confirmado; sin fecha no se inventan vencimientos.
- Separar correctamente **deudas por pagar (pasivos)** y **dinero por cobrar (activos por cobrar, NO efectivo disponible)** en los totales patrimoniales. No confundir derechos de cobro con saldos de bancos.
- **Caso pendiente de especificar:** alta de una deuda *nueva* al mismo tiempo que se recibe dinero del prestamista o se presta dinero a otra persona, para evitar dobles movimientos de banco; también el tratamiento de deudas originadas por compras/consumos y no por dinero prestado, y de intereses en acuerdos simples. No inferir estas reglas sin aprobarlas.

## 10. Monedas y conversión — CONFIRMADO

- Monedas iniciales: **UYU, USD y EUR**.
- Conservar cada saldo, movimiento y obligación en su **moneda original**.
- Para el dashboard, mostrar totales consolidados inicialmente en **USD**, con un selector sencillo para **USD / UYU / EUR**. La selección de visualización no altera los datos originales. El **conversor de fondos de ahorro** utiliza este mismo criterio: equivalencia de consulta, sin transacción ni conversión efectiva (§11.3).
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
- **Dinero disponible (valor principal del dashboard):** suma de los saldos bancarios consolidados **menos el dinero reservado en objetivos de ahorro**. Es el dinero libre para administrar gastos sin tocar los fondos (§11.3). No mezclar inversiones o efectivo (ambos excluidos) ni confundir con patrimonio neto.
- **Dinero total / saldo bancario real (visible por separado):** suma real de los saldos de los bancos registrados, **incluido lo asignado a fondos virtuales**, sin duplicar los fondos como si fueran otra cuenta bancaria. No reducir este saldo por una mera reserva virtual. Mantener también el desglose patrimonial de activos y pasivos según las reglas del Balance.
- **Ejemplo:** bancos $30.000, fondo de emergencia $20.000 y vacaciones $2.000 → **dinero disponible $8.000** y **dinero total bancario $30.000**. El disponible es la cifra destacada, el total bancario sigue consultable claramente.
- Al acceder al balance, permitir un **desglose** de bancos por moneda y pasivos registrados (tarjetas, préstamos y deudas).
- Dado que no se incluyen inversiones ni efectivo, el balance **no pretende representar todo el patrimonio real** de la persona. Su título/ayuda debe comunicar el alcance.
- Ingresos/gastos mensuales y gráficos deben usar **movimientos registrados**, excluyendo saldos iniciales, ajustes y transferencias que no corresponden a ingresos/gastos.
- Conservar como referencia la **composición de cuatro columnas** del tablero; **pendiente** decidir cómo se adaptan exactamente sus tarjetas a los módulos finales, especialmente tras excluir inversiones.
- El usuario prioriza **claridad, rapidez, mínimo mantenimiento y organización**.

## 11.1 Alertas y recordatorios — CONFIRMADO (canales externos pendientes)

**Principio:** avisar únicamente sobre situaciones útiles o revisiones opcionales, sin crear trabajo administrativo innecesario ni presentar datos inferidos como si fueran hechos confirmados.

- Incluir un **centro de notificaciones dentro de la aplicación** (por ejemplo, campana visible en el dashboard). Los avisos deben tener un texto entendible, un estado de atención y, cuando proceda, una acción directa para resolverlos.
- **Vencimiento de tarjeta de crédito:** alerta de alta prioridad **solo cuando el usuario haya registrado el importe del próximo estado de cuenta y la fecha de vencimiento** (§9.3), mientras el pago del período esté pendiente de confirmación. Se propuso **3 días antes** como valor inicial ajustable; el plazo final exacto se puede configurar. Si faltan datos, no inventarlos ni afirmar que existe un atraso.
- **Cuotas de préstamos/deudas:** alerta de alta prioridad con antelación a un vencimiento registrado, mientras la cuota correspondiente esté pendiente. No inventar fechas ni importes.
- **Gastos recurrentes:** recordatorio de prioridad media o informativa si llegó el período habitual y el pago todavía no se registró. Con fecha desconocida, indicar **«pago de este período sin confirmar»**, **NO «vencido»**; no realizar descuentos automáticos.
- **Revisión de movimientos:** recordatorio de baja prioridad para revisar si hubo ingresos/gastos olvidados, orientativamente semanal; puede desactivarse o posponerse. No afirmar que existieron movimientos no registrados.
- **Saldo bancario bajo:** aviso cuando el saldo registrado de una moneda caiga por debajo de un **umbral que establezca el usuario**. Reconocer que ese saldo puede no coincidir con el real si no se concilió.
- **Presupuesto por categoría excedido:** aviso dentro de la app cuando el gasto registrado del mes se acerque al límite o lo supere, siempre que el usuario haya habilitado un presupuesto y definido su importe (§11.2). Sin presupuesto configurado no hay alerta. Umbrales exactos y preferencias siguen pendientes.
- **Revisión del saldo bancario real:** **NO generar una alerta obligatoria ni automática cada 14 días**. Mantener «Actualizar saldo real» disponible en todo momento, mostrando la fecha de **última comprobación manual**. Ofrecer únicamente un **recordatorio de revisión opcional, desactivado por defecto**, cuyo intervalo configure quien lo active.
- **Antirruido:** como regla general, un aviso por situación, no repetirlo todos los días; permitir marcar revisado, posponer o desactivar tipos de alertas. Resolver la situación (registrar el pago, actualizar lo requerido, etc.) debe cerrar o actualizar el aviso correspondiente.
- Separar avisos de **vencimientos confirmados** de sugerencias o recordatorios basados en el historial. No convertir predicciones, importes estimados ni desconocimiento del banco en obligaciones ciertas.
- **Canales de envío:** queda confirmada la presencia de avisos **dentro de la app**. **NO quedó elegido todavía** si habrá correos electrónicos (p. ej., resumen semanal) o notificaciones push al dispositivo. Ambos canales externos son opciones pendientes y no deben implementarse por inferencia.
- **Detalles técnicos abiertos:** preferencias y tiempos concretos por tipo de alerta, modo de persistencia, política de deduplicación/posposición y configuración de permisos para los eventuales canales externos.

## 11.2 Presupuestos y límites de gasto por categoría — CONFIRMADO

- **Funcionalidad opcional:** el usuario puede crear presupuestos o límites de gasto mensuales para categorías y subcategorías seleccionadas. **No se crean límites por defecto** y no se exige configurar presupuestos para usar la aplicación.
- **Definición manual y editable:** el usuario indica el importe máximo que desea gastar en el mes para cada categoría o subcategoría elegida; puede modificarlo, deshabilitarlo o dejar categorías sin límite.
- **Seguimiento automático:** cada gasto efectivamente registrado en la categoría/subcategoría correspondiente incrementa el gasto acumulado del mes. Incluir en el mes correspondiente **las cuotas mensuales de compras con crédito** (§9.5). Evitar contabilizar dos veces un movimiento si existen límites en una categoría padre y en una subcategoría; el detalle del desglose visual sigue pendiente.
- **Vista sencilla:** importe gastado, límite establecido, importe restante, porcentaje consumido y barra de progreso, con período mensual claramente identificado. Si supera el límite, mostrar el excedente con claridad.
- **Alertas no intrusivas:** avisar cuando se acerque al límite o lo sobrepase, integrándose al centro de notificaciones ya definido (§11.1); evitar duplicados. **No bloquear la incorporación de gastos** aunque se supere el presupuesto.
- **Límite de exactitud:** se usa la información registrada por el usuario; no afirmar que representa gastos omitidos o movimientos bancarios desconocidos. Ajustes manuales de saldos, transferencias propias y pagos de tarjeta que ya corresponden a gastos registrados no deben duplicar el gasto presupuestario.
- **No confirmado:** cálculo o sugerencia automática de límites basándose en historial, umbral porcentual exacto para alertar, arrastre de remanentes entre meses, conversión/criterio de moneda para presupuestos con movimientos de distintas monedas y detalle de presupuestos padre/subcategoría. Los principios de objetivos de ahorro ya se aprobaron por separado (§11.3), pero faltan sus detalles operativos.

## 11.3 Objetivos de ahorro y fondos reservados — PRINCIPIO CONFIRMADO

- Permitir crear **objetivos/fondos de ahorro virtuales**, tales como emergencia o vacaciones, asignándoles dinero periódicamente o cuando el usuario quiera. **Cada fondo tendrá exactamente una moneda fija, seleccionada al crearlo (UYU, USD o EUR); no mezclar varias monedas dentro de un mismo fondo.** Las aportaciones y retiros se registran como **reasignaciones internas del dinero**, no como gastos o ingresos de consumo.
- Cada objetivo tendrá un **importe reservado identificable** y su historial de aportaciones y retiros. Podrá **añadirse dinero**, **retirarse parcial o totalmente** y **cerrarse un objetivo**, recuperando el importe reservado para el dinero libre. Se confirman **dos modalidades de aportación**, manual y automática programada (§11.3.1). **El importe objetivo es opcional y completamente editable** (§11.3.2); la fecha objetivo sigue sin definirse.
- **Cifra protagonista del dashboard: DINERO DISPONIBLE = saldo bancario total real registrado − suma reservada en los fondos virtuales** (con conversión pertinente por moneda). Este dinero disponible representa lo que se puede gastar **sin tocar las metas**. La necesidad de excluir reservas de la cifra principal fue expresamente aprobada.
- Mostrar **DINERO TOTAL (bancario real) separado y accesible** junto con dinero disponible; no ocultar ni confundir las reservas con un débito bancario real. El dinero sigue en el banco mientras no haya habido una transferencia externa. Evitar tratar las reservas virtuales como una segunda cuenta bancaria o sumarlas otra vez al patrimonio.
- **Aportación:** al asignar, p. ej., $2.000 a vacaciones, **el disponible disminuye $2.000** y el fondo aumenta $2.000, pero el saldo bancario real y el patrimonio no cambian por la mera reasignación; no se crea gasto.
- **Retiro/devolución al disponible:** al liberar, p. ej., $2.000 desde vacaciones, el fondo disminuye $2.000 y el disponible aumenta $2.000; el total bancario real permanece constante; no se crea ingreso.
- **Transferir entre fondos — CONFIRMADO:** permitir mover directamente una cantidad de un fondo de ahorro a otro **si ambos tienen la misma moneda**. En una sola operación, descontar el importe del fondo origen y sumarlo al destino, sin pasar por el dinero disponible, sin modificar saldos bancarios, sin crear ingreso/gasto y sin alterar el dinero disponible total. Mostrar ambos fondos y el importe antes de confirmar; guardar un único movimiento relacionado en los historiales correspondientes.
- **Ejemplo confirmado:** Emergencia US$2.000 y Vacaciones US$500. Transferir US$500 de Emergencia a Vacaciones → Emergencia US$1.500, Vacaciones US$1.000, bancos y dinero disponible sin cambios. No permitir mover más del saldo del fondo origen **libre de importes comprometidos**, como reservas asociadas a compras con crédito todavía no pagadas. No permitir transferencias entre fondos de distinta moneda ni conversión implícita.
- **Gasto real desde un fondo — CONFIRMADO:** al registrar un gasto, permitir elegir de forma opcional **«Pagar usando fondo de ahorro»** y seleccionar el fondo correspondiente. Para un gasto efectivamente pagado con dinero bancario (débito o transferencia), en una sola operación: (1) registrar **un único gasto** con categoría y fecha; (2) **reducir el saldo consolidado del banco en la moneda del pago**; y (3) **reducir el saldo reservado del fondo seleccionado en exactamente el mismo importe**, sin doble contabilizar.
- El fondo debe estar denominado en la **misma moneda del gasto** para este uso directo; no convertir divisas automáticamente, de acuerdo con la regla de una moneda por fondo.
- **Efecto en el disponible:** al gastar un importe que ya estaba totalmente reservado, bajan por igual el banco y la reserva, así que **el dinero disponible para gastos no reservados permanece igual**. Ejemplo: banco US$5.000, vacaciones US$2.000, disponible US$3.000; compra de pasaje US$500 con fondo → banco US$4.500, vacaciones US$1.500, disponible US$3.000; estadísticas de Viajes +US$500.
- La operación debe conservar vínculo entre **gasto y fondo** para mostrarla en el historial y para editar/anular correctamente los efectos sin duplicaciones. No crear por separado un retiro artificial al disponible y otro gasto bancario que cause doble débito.
- **Gasto mayor que el fondo — CONFIRMADO:** si se registra un gasto bancario de importe superior al saldo reservado del fondo elegido, **usar primero lo reservado en ese fondo hasta agotarlo y completar la diferencia con el dinero disponible no reservado de la misma moneda**, dentro de **una única transacción de gasto**. El fondo queda en cero y el disponible disminuye **únicamente por la diferencia no cubierta**; el saldo bancario disminuye por **el importe total efectivamente pagado**.
- **Ejemplo aprobado:** pasaje de US$2.000, fondo Vacaciones de US$1.500 y disponible suficiente para US$500 → fondo −US$1.500 (saldo final cero), disponible libre −US$500, bancos −US$2.000, estadísticas de Viajes **un solo gasto de US$2.000**. No crear dos gastos, ni transferencias artificiales o movimientos que dupliquen saldo.
- **Límites de la regla:** no permitir que el fondo quede negativo. Si el saldo bancario o disponible no reservado es insuficiente para completar el gasto, el manejo del aviso/registro queda pendiente de especificación y no debe confundirse con la norma ya aprobada para aportaciones automáticas insuficientes.
- **Compras con tarjeta de crédito asociadas a fondos — CONFIRMADO:** permitir al registrar una compra con **tarjeta de crédito** seleccionar opcionalmente un fondo de ahorro como fuente reservada para ese gasto. **Al momento de la compra no se descuenta dinero del banco ni se libera o consume la reserva del fondo**, porque el pago de la tarjeta todavía no ocurrió. El importe comprometido para esa compra debe permanecer identificado/reservado dentro del fondo y no poder utilizarse nuevamente como si fuera libre.
- **Cuando se registra el pago de la tarjeta que corresponde a la compra asociada**, descontar del saldo bancario consolidado el pago real de la tarjeta, reducir su deuda según las reglas existentes y **consumir del fondo el importe efectivamente aplicado a esa compra**. No registrar un segundo gasto: la compra ya se reconoció en la categoría (o en los meses de cuotas, según §9.5).
- **Ejemplo aprobado:** fondo Vacaciones US$800; compra de pasaje US$500 con crédito y asociada al fondo → fondo sigue en US$800, de los cuales US$500 están comprometidos; banco no cambia en la compra. Al registrar el pago correspondiente de US$500 → bancos −US$500, fondo −US$500 (queda US$300), evitando alterar el disponible libre por el importe ya reservado.
- **Control de duplicaciones:** guardar vínculo entre compra, fondo y pago efectivo; no consumir la reserva al comprar y otra vez al pagar. Los pagos de tarjeta no deben contarse como nuevos gastos en las estadísticas.
- **Detalles operativos PENDIENTES:** cómo identificar qué compras cubre cada pago de estado de cuenta, pagos parciales, varias compras asociadas a uno o distintos fondos, compras en cuotas y casos en que el saldo disponible del fondo es menor que lo comprometido. No inferir asignaciones arbitrarias ni adelantar débitos reales.
- **Ejemplo confirmado:** Bancos UYU $30.000; Emergencias $20.000 y Vacaciones $2.000 → disponible $8.000 y total bancario $30.000. Una aportación nueva de $2.000 a Vacaciones deja disponible $6.000 y total bancario $30.000. Si se retira esa aportación, vuelve a disponible $8.000 sin tocar el saldo real.
### 11.3.1 Aportaciones a fondos de ahorro — AMBAS MODALIDADES CONFIRMADAS

- **Manual (predeterminada):** el usuario entra a un fondo y utiliza «Añadir dinero» para asignar el importe cuando lo decida.
- **Automática (activación explícita y opcional):** el usuario puede configurar una **aportación recurrente mensual de importe determinado** a un fondo, por ejemplo $3.000 por mes para vacaciones. Cuando corresponda la aportación programada, la app **aumenta el dinero reservado en el fondo y disminuye el dinero disponible para gastar**, sin esperar que se pulse «Añadir dinero» cada mes.
- La programación **no ordena transferencias al banco ni reduce su saldo bancario real**: es una asignación virtual interna del dinero ya registrado. Tampoco genera gasto ni ingreso estadístico.
- Mostrar el plan de ahorro programado en el objetivo y un **historial distinguible** de aportes manuales y programados; evitar duplicar una aportación por consultar varias veces la aplicación o ejecutar de nuevo el proceso.
- La opción automática debe poder **activarse o desactivarse voluntariamente**; no imponer ninguna aportación recurrente sin una configuración del usuario. El momento exacto del mes, edición del importe, pausar/cancelar la recurrencia y reglas de ejecución deberán precisarse durante el diseño del flujo.
- **Falta de dinero disponible — OPCIÓN A CONFIRMADA:** antes de realizar cada aportación automática, comprobar si el **dinero disponible no reservado en la misma moneda del fondo** alcanza el importe completo programado. Si no alcanza, **no reservar nada**, no modificar el saldo del fondo ni el disponible, **dejar esa aportación en estado pendiente** y generar **un aviso no intrusivo** en el centro de notificaciones de la aplicación. No reservar parcialmente y no producir disponible negativo por esta automatización.
- El usuario podrá consultar el importe pendiente y **realizarlo manualmente más adelante** cuando tenga fondos suficientes; mantener su trazabilidad y **evitar ejecuciones duplicadas** de una misma aportación pendiente. La manera concreta de reintentar, posponer o cancelar pendientes queda pendiente de diseño.
- **Ejemplo confirmado:** aportación mensual prevista de $3.000 con solo $1.500 disponibles → fondo sin cambios; disponible permanece $1.500; aportación $3.000 pendiente y aviso. No se asignan $1.500 parciales ni se muestra −$1.500 de disponible.

- **Moneda de la reserva — REGLA DEFINITIVA CONFIRMADA:** al crear un fondo se elige **UYU, USD o EUR** y esa será su única moneda de registro; solo puede recibir aportaciones desde el **dinero bancario disponible no reservado de esa misma moneda**. No hay aportaciones de otra moneda, conversiones automáticas, fondos multimoneda ni saldos ficticios en una moneda de la que el usuario carece.
- **Validación de fondos suficientes — manual y automática:** no permitir ingresar al fondo más dinero que el disponible para gastar en **esa moneda** (saldo bancario consolidado de la moneda menos los fondos ya reservados en esa moneda). Ejemplo: si Bancos USD = US$0, no se pueden añadir US$100 a un fondo en USD aunque haya dinero disponible en UYU. Para la automática rige la opción A definida arriba: no ejecutar, dejar pendiente y avisar. Para la manual, impedir completar la aportación e informar el dinero disponible.
- **Conversor solo para visualizar:** cada fondo conserva su **saldo real reservado en moneda nativa**, pero puede mostrarse su **equivalencia aproximada en UYU, USD o EUR** mediante un selector, utilizando las cotizaciones de referencia de **datosUruguay** y el respaldo/caché ya definidos en §10. El selector es estrictamente una **vista**, NO cambia la moneda del fondo, NO registra cambio de divisas, NO mueve bancos, NO modifica el importe reservado y NO habilita aportaciones desde otra moneda.
- Mostrar la **fuente y fecha de cotización** empleada cuando se vean equivalencias. Si no existe cotización válida, indicar que la equivalencia no está disponible en lugar de inventarla. Las funcionalidades y límites reales de las APIs siguen sujetos a verificación antes de implementar (§10).
- **Ejemplo confirmado:** fondo Emergencia en USD = US$100; podrá visualizarse su equivalente estimado en UYU o EUR, pero para agregar US$50 tiene que haber al menos US$50 disponibles en Bancos USD. La equivalencia visual en UYU/EUR no se puede ingresar como dinero real al fondo.
### 11.3.2 Meta monetaria de cada fondo — CONFIRMADO

- **Importe objetivo opcional:** al crear un fondo **NO se exige** establecer una cantidad a alcanzar. Se puede ahorrar indefinidamente sin una meta fija (p. ej., fondo de emergencia).
- El usuario puede **añadir la meta después**, **modificar libremente su importe** o **quitarla cuando quiera**, sin borrar el fondo ni perder su saldo reservado, movimientos e historial.
- Cuando existe un importe objetivo, presentar **monto reservado actual**, **monto objetivo**, **progreso porcentual** y **cantidad restante**. Sin meta, mostrar solo monto reservado e historial; no fabricar una barra de porcentaje hacia un objetivo inexistente.
- **Cambiar o retirar la meta no mueve dinero**, no altera saldos bancarios ni dinero disponible, y no crea ingresos ni gastos. La meta es una referencia visual; los movimientos de reserva son operaciones independientes.
- **Meta alcanzada — CONFIRMADO:** cuando el importe reservado alcanza o supera el objetivo, mostrar simplemente el estado **«Meta alcanzada»**. **No bloquear ni pausar aportaciones**: el usuario puede seguir añadiendo dinero manualmente y las aportaciones automáticas configuradas continúan normalmente, con la regla ya aprobada de fondos disponibles suficientes (§11.3.1). No exigir confirmaciones especiales al superar la meta.
- Desde **«Editar fondo»** se puede aumentar o cambiar la meta en cualquier momento, o quitarla. La cifra ahorrada permanece intacta y el progreso se actualiza. Si supera el 100 %, conservar los importes reales sin recortar aportes.
- **Pendiente:** posibilidad de fecha objetivo (no aprobada ni requerida). No añadir reglas o alertas complejas al alcanzar la meta.

- **Otros detalles pendientes:** fechas objetivo, transferencias reales a cuentas de ahorro separadas, visualización final del dashboard, cierre de metas con historial y casos de concurrencia/corrección de transferencias. **Transferencias directas entre fondos de igual moneda ya confirmadas.** No inferir automatismos bancarios ni deducciones reales de una reserva virtual.

## 11.4 Usuarios, autenticación y sincronización — REQUISITOS CONFIRMADOS; HOSTING Y BASE DE DATOS ELEGIDOS

- La aplicación debe permitir que una persona sin cuenta elija **«Crear cuenta»** y que una persona registrada pueda **«Iniciar sesión»** posteriormente. No limitar el producto a un único usuario preconfigurado: deben existir **cuentas independientes**.
- Cada usuario accede a **sus propios saldos bancarios, gastos, tarjetas, deudas, presupuestos, fondos y configuración**, privados e inaccesibles para otros usuarios. Requerir identificación segura, autorización por usuario en base de datos y comunicación mediante HTTPS; no crear un almacenamiento compartido legible por todos.
- Los datos se guardan en una **base de datos remota persistente**, asociada a la cuenta, y se sincronizan al iniciar sesión desde teléfono, otra computadora o desde otro país. No depender exclusivamente del almacenamiento local de un dispositivo. **No implica conexión con los bancos**; los datos financieros siguen siendo manuales según decisiones anteriores.
- La experiencia buscada es una **web responsiva instalable como PWA**, con icono de inicio y aspecto de aplicación en móvil, además de acceso desde navegador de escritorio. No exigir una aplicación nativa ni publicación inicial en Apple App Store/Google Play, que podrían implicar costos.
- **Costo objetivo obligatorio para primera versión:** cero mensualidades y cero licencias/servicios de pago necesarios para crear cuentas, iniciar sesión, guardar y sincronizar datos dentro de un uso pequeño compatible con cuotas gratuitas. Seleccionar proveedores con plan gratuito y control de límites, sin prometer gratuidad ilimitada/perpetua; si se agotan cuotas, avisar o degradar servicio, **no contratar automáticamente** planes de pago.
- **Hosting confirmado:** **Vercel**, en su plan Hobby gratuito mientras el uso cumpla sus condiciones de uso personal/no comercial. La web responsive e instalable PWA se desplegará allí; no se necesita pagar un dominio propio inicialmente (se puede usar subdominio gratuito).
- **Base de datos confirmada:** **Neon (PostgreSQL en la nube)**, con su plan gratuito para cuentas independientes, datos de movimientos, fondos, tarjetas, presupuestos, etc. Diseñar todas las operaciones que afectan saldos y fondos como transacciones consistentes; aislar datos por usuario y evitar accesos cruzados.
- **Gratuidad:** la arquitectura Vercel + Neon se elige con el objetivo de **costo obligatorio cero** para uso pequeño (por ejemplo 5–7 personas), dentro de los límites vigentes de ambos proveedores. Los planes gratuitos tienen topes de cómputo, almacenamiento, transferencias y uso; no garantizar gratuidad perpetua ni que cualquier carga estará cubierta. No activar planes pagos ni cobros automáticos sin nueva decisión explícita.
- **Por definir:** proveedor/implementación concreta de **autenticación** (Neon Auth u otra alternativa compatible, sujeto a verificar condiciones y seguridad), registro por email/contraseña frente a opciones sociales, verificación de correo, recuperación de contraseñas, backups/exportación, política de privacidad y manejo de datos, disponibilidad offline, escalabilidad, monitoreo y límites gratuitos de cada servicio.
- **Alternativas consideradas, NO elegidas:** Firebase Spark (Authentication/Firestore/Hosting) y Supabase Free (PostgreSQL/Auth). La selección explícita para primera versión es **Vercel + Neon**; no sustituirla por Firebase o Supabase sin consultarlo. Todavía no está aprobado un proveedor concreto para autenticación.

## 12. Funcionalidades todavía PENDIENTES

1. **Gastos recurrentes:** funcionamiento general ya **CONFIRMADO** en §8.1; notificaciones informativas aprobadas en §11.1, con detalles menores de detección y estimación pendientes, sin descuentos automáticos.
2. **Tarjetas de crédito:** confirmado catálogo débito/crédito, efectos de compras, pagos y ajustes; **cuotas automáticas distribuidas en gastos mensuales sin descontar bancos hasta registrar el pago**, con **mes/año de primera cuota seleccionable y modificable** y **formulario sencillo de valor de cuota × cantidad de cuotas, sin precio original ni tasa de interés** (§9.5); importe/vencimiento opcionales del estado de cuenta y alertas basadas en datos cargados (§9 y §11.1). Pendiente: detalle de cierres, pagos mínimos, cuotas de importes variables, cargos posteriores, compras multimoneda y conciliación.
3. **Deudas por pagar y dinero por cobrar**: confirmados los módulos y el flujo de **préstamos con cuotas** (§9.4.1), así como **deudas simples, pagos y cobros parciales o totales, ajuste del importe pendiente sin movimiento bancario y seguimiento histórico** (§9.4.2). Pendiente: alta de deuda nueva con desembolso, obligaciones originadas por compras, detalles de conciliación de préstamos, cuotas variables y tratamientos de intereses especiales.
4. **Lista final de categorías/subcategorías** y opciones de configuración concreta.
5. **Presupuestos mensuales opcionales por categoría/subcategoría — CONFIRMADOS** (§11.2), con progreso por categoría e integración al sistema de avisos cuando se aproxima o supera el límite. **Objetivos de ahorro:** confirmada la reserva virtual, el disponible neto de fondos y el dinero bancario total separado (§11.3); **CONFIRMADAS aportaciones manuales y automáticas mensuales** (§11.3.1); **CONFIRMADO** que si falta disponible una aportación automática se omite, queda pendiente y avisa, sin reservas parciales ni disponible negativo; **CONFIRMADA** una moneda fija por fondo (UYU, USD o EUR, sin mezclar monedas); **CONFIRMADO** que solo se aporta desde el disponible bancario de la misma moneda y nunca se convierte realmente desde el fondo, con **conversor de visualización UYU/USD/EUR según cotizaciones**; **CONFIRMADA** meta monetaria opcional, añadible/editable/eliminable sin alterar fondos (§11.3.2); **CONFIRMADO** que al alcanzar la meta se muestra «Meta alcanzada» y se mantienen las aportaciones manuales y automáticas, con edición libre del objetivo; **CONFIRMADO** registrar gastos vinculados a fondos (gasto categorizado único; si se paga de banco, reducir tanto banco como reserva sin alterar el disponible libre), §11.3; **CONFIRMADO** que si el gasto bancario supera el fondo se utiliza todo el fondo y la diferencia sale del disponible en una sola operación (§11.3); **CONFIRMADA** vinculación opcional de compras con crédito a fondos: conservar la reserva al comprar y consumirla al registrar el pago correspondiente de la tarjeta, sin duplicar gastos ni débitos; **CONFIRMADAS** transferencias directas entre fondos de la misma moneda, sin efecto bancario o estadístico; **PENDIENTES** asignación de pagos parciales y compras en cuotas, falta de disponible para completar un gasto, fecha objetivo, transferencias reales y UX final. Para presupuestos siguen pendientes sugerencias automáticas de límites, alertas finas, arrastres, moneda, presupuestos padre/subcategoría y estadísticas adicionales. Correo/push todavía no confirmados.
6. **Importación de movimientos desde CSV/Excel — DESCARTADA POR AHORA:** el usuario decidió no implementarla en la primera versión. No asumir que se añadirá en otra fase sin una nueva aprobación.
7. **Cuentas independientes con registro/inicio de sesión y sincronización entre dispositivos — CONFIRMADO** (§11.4), con app web instalable (PWA) y cero costo obligatorio de uso en el rango gratuito. **HOSTING VERCEL Y BASE DE DATOS NEON ELEGIDOS.** **PENDIENTES:** sistema/proveedor de autenticación, método de login, verificación, recuperación, backups/exportación, políticas de privacidad, seguridad fina y validación de límites gratuitos.
8. **Stack y servicios**: **CONFIRMADOS Vercel (hosting web) y Neon PostgreSQL (base de datos)** en planes gratuitos para uso pequeño. Next.js, TypeScript, Tailwind, shadcn/ui, sistema de autenticación y demás detalles del stack **NO están cerrados**. Supabase y Firebase fueron alternativas exploradas, no seleccionadas. Verificar cuotas, términos de planes, persistencia, seguridad y copias de seguridad antes de implementar.
9. **Nombre final** e identidad textual (distinta de la marca de la captura).
10. **Política de conciliación y reportes históricos** cuando se editen movimientos anteriores a un ajuste de saldo, para conservar consistencia contable y trazabilidad.

## 13. Entorno técnico y repositorio — ESTADO INFORMADO

- Repositorio GitHub señalado por Codex: `SebastianGonzalez2/finanzas-personales`; proyecto local abierto en Codex en su carpeta raíz.
- Rama `main`; primer commit `834ef6f` con `docs/fintrack-original.jpeg`, según informe del usuario.
- Codex informó que el remoto `origin/main` y la rama local están sincronizados tras ese primer commit. Otros commits posteriores de documentación pueden existir; verificar localmente antes de trabajar.
- Playwright MCP probado: pudo navegar y realizar capturas; hubo una restricción de guardado fuera del directorio autorizado.
- El análisis visual fue elaborado y se informó como guardado localmente en `docs/design/fintrack-visual-spec.md`, pero **no se encontró en el repositorio remoto al revisar la rama `main`**. No darlo por versionado hasta comprobarlo.
- Este documento está versionado en `docs/product/decisiones-producto.md` en GitHub, rama `main` (versión indicada al inicio). Si Codex tiene una versión local distinta o sin seguimiento, primero debe traer los cambios de GitHub y comparar antes de sobrescribir nada.
- **No iniciar programación del producto hasta cerrar la planificación funcional suficiente**.
- **Arquitectura básica seleccionada — v3.7:** **Vercel** como alojamiento/despliegue web, **Neon PostgreSQL** como base de datos remota. Priorizar cuotas gratuitas: Vercel Hobby sujeto a términos de uso personal/no comercial y Neon Free sujeto a límites de procesamiento, almacenamiento y transferencia. **Sistema de autenticación todavía pendiente de elección**; no confundir Neon como base de datos con una decisión ya tomada sobre Neon Auth. No crear recursos de pago ni exigir tarjeta o facturación sin consentimiento. La verificación de condiciones actuales y pruebas de consumo se harán al implementar.

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
- **2026-11-06 — v1.4:** tarjetas registrables como débito o crédito; débito carga a bancos agrupados, crédito acumula deuda por tarjeta; pagos de tarjeta reducen banco y deuda sin registrar un segundo gasto; deuda inicial y ajustes manuales sin clasificar; quedan pendientes detalles de estados de cuenta y alertas.
- **2026-11-06 — v1.5:** alertas no intrusivas aprobadas: vencimientos de tarjetas y préstamos, recurrentes sin confirmar, revisión de movimientos, umbrales bajos y presupuestos futuros. Revisión bancaria opcional y desactivada por defecto; sin alerta periódica obligatoria de 14 días. Centro de avisos interno; correo y push pendientes.
- **2026-11-06 — v1.6:** estado de cuenta y vencimiento opcionales por tarjeta de crédito; deuda total diferenciada del importe a pagar en el período; recordatorio solo con importe y fecha aportados por el usuario, sin pagos automáticos. Siguiente decisión pendiente: compras en cuotas.
- **2026-11-06 — v1.7:** compra en cuotas ingresada una sola vez; importe distribuido automáticamente como gasto en cada mes; sin descuentos a bancos hasta pago real de la tarjeta. Vista de progreso y cuotas comprometidas; distinción entre plan futuro, deuda del emisor, facturación y pagos, para evitar doble conteo.
- **2026-11-06 — v1.8:** al registrar compras en cuotas, elegir mes/año de la primera cuota y permitir modificarlo después; se reajustan las cuotas y estadísticas mensuales sin duplicar ni alterar pagos efectivamente registrados.
- **2026-11-06 — v1.9:** simplificado el registro de compras en cuotas con o sin intereses: valor de cuota, cantidad de cuotas, tarjeta, categoría y primer mes; calcular total financiado automáticamente. Descartados precio original de contado y tasa de interés como datos obligatorios o campos del formulario principal.
- **2026-11-06 — v2.0:** confirmado alcance de dos módulos diferenciados: deudas/préstamos por pagar y dinero por cobrar. El modelo concreto de alta, pagos, cuotas e intereses queda pendiente, evitando dar por aprobadas propuestas de diseño.
- **2026-11-06 — v2.1:** confirmado flujo simple de préstamos con cuotas: datos de deuda y cuota conocida, registrar pago real descontado del banco, actualizar deuda pendiente manualmente y desglose opcional entre capital/intereses/cargos; no reducir automáticamente la deuda por toda la cuota cuando se desconoce el desglose.
- **2026-11-06 — v2.2:** confirmadas deudas simples y dinero por cobrar: importe pendiente y moneda, fecha opcional, pagos/cobros parciales y totales con efecto en bancos, correcciones manuales sin movimiento bancario, historial y saldado; quedan pendientes casos de alta con desembolso y deudas por consumo.
- **2026-11-06 — v2.3:** confirmados presupuestos mensuales opcionales por categoría/subcategoría, límites definidos por usuario, barra de progreso y alertas por cercanía/exceso; no bloquean gastos. Sugerencias automáticas, arrastres y detalles multimoneda quedan pendientes.
- **2026-11-06 — v2.4:** fondos de ahorro virtuales con aportes y retiros reversibles, sin mover dinero del banco en la mera reserva; dashboard prioriza **dinero disponible (total bancario menos fondos reservados)** y mantiene separado **dinero total bancario real**. Detalles de aportaciones programadas y gestión de metas pendientes.
- **2026-11-06 — v2.5:** aprobadas aportaciones manuales (predeterminadas) y automáticas mensuales opt-in por importe configurado; afectan al fondo y al disponible, nunca al saldo bancario real. Queda por decidir qué ocurre si no hay disponible suficiente.
- **2026-11-06 — v2.6:** si el disponible no alcanza el importe completo de una aportación automática, no se reserva nada: queda pendiente con aviso interno, sin reserva parcial ni disponible negativo; posible aporte manual posterior con trazabilidad.
- **2026-11-06 — v2.7:** cada fondo de ahorro tiene una única moneda (UYU, USD o EUR). No se mezclan monedas ni se presume conversión real al apartar dinero; pendiente definir metas en divisas diferentes a la tenencia bancaria.
- **2026-11-06 — v2.8:** resuelto alcance multimoneda: cada fondo solo recibe aportes del saldo disponible bancario de **su propia moneda**, con bloqueo si es insuficiente, sin conversiones entre monedas ni fondos ficticios. Selector opcional para visualizar equivalencia aproximada UYU/USD/EUR vía datosUruguay y respaldo definido, sin modificar saldo, moneda ni movimiento bancario.
- **2026-11-06 — v2.9:** el importe objetivo en fondos de ahorro es opcional al crearlos; puede añadirse después, editarse o quitarse cuando quiera sin afectar reservas, saldos o historial. Quedan pendientes la fecha objetivo y la conducta de aportaciones automáticas al cumplir la meta.
- **2026-11-06 — v3.0:** al alcanzar o superar la meta, mostrar solo «Meta alcanzada»; no bloquear aportaciones manuales ni detener las automáticas. Permitir cambiar o aumentar la meta desde «Editar fondo» sin alterar reservas.
- **2026-11-06 — v3.1:** confirmado «Pagar usando fondo de ahorro» al registrar un gasto: un solo gasto categorizado, débito bancario real y reducción del fondo por igual, preservando el dinero disponible libre. Quedan pendientes gastos mayores que el fondo y compras con tarjeta de crédito.
- **2026-11-06 — v3.2:** los gastos bancarios superiores a un fondo consumen primero toda su reserva y luego el dinero disponible por la diferencia, como gasto único sin duplicar saldos. Queda pendiente definir qué ocurre si tampoco hay disponible suficiente y la vinculación a compras con crédito.
- **2026-11-06 — v3.3:** compras con tarjeta de crédito vinculables a fondos; la reserva se mantiene (marcada como comprometida) hasta el pago correspondiente de la tarjeta, cuando se reduce banco y fondo sin repetir el gasto. Distribución de pagos parciales y cuotas pendiente.
- **2026-11-06 — v3.4:** aprobada transferencia directa entre dos fondos de igual moneda, desde saldo no comprometido: baja origen, sube destino, historial enlazado, sin modificar saldo bancario, disponible ni estadísticas; sin cambio de divisas.
- **2026-11-06 — v3.5:** descartada por ahora la importación de extractos bancarios CSV/Excel. Fuera del alcance de la primera versión, sin compromiso de incorporarla en una fase futura.
- **2026-11-06 — v3.6:** se confirman registro/inicio de sesión con cuentas separadas, sincronización de datos entre dispositivos y países, web instalable tipo PWA y requisito de funcionar sin pagos obligatorios dentro de planes gratuitos. Hosting, autenticación y base de datos específicos quedan pendientes; Firebase Spark se evalúa como alternativa, no como decisión aprobada.
- **2026-11-06 — v3.7:** elegidos **Neon PostgreSQL** como base de datos y **Vercel** como hosting de la aplicación web, aprovechando planes gratuitos sujetos a cuotas. No se decide todavía qué mecanismo/proveedor concreto manejará las cuentas y el inicio de sesión; se mantiene el objetivo de cero pagos obligatorios.