# Aplicación de finanzas personales — Registro de decisiones del producto

**Versión:** 2.1  
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
- Deben poder existir tanto préstamos con cuotas, vencimientos e intereses como **deudas simples sin plan de pagos**. **El flujo de los préstamos con cuotas ya está confirmado (§9.4.1)**; los datos y el funcionamiento exactos de las deudas simples y del dinero por cobrar siguen pendientes.
- **Evitar doble contabilización:** entregar o recibir capital de un préstamo y amortizar principal no equivalen por sí solos a ingreso o gasto ordinario; intereses y cargos sí requieren tratamiento diferenciado. Definir posteriormente cómo mostrarlos en estadísticas y flujo de caja, y cómo se concilian con los saldos bancarios.
- El módulo no debe inventar fechas, amortización de capital ni intereses cuando el usuario no dispone de ellos. Los detalles técnicos de la conciliación de préstamos y el diseño de deudas simples quedan pendientes.

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

#### 9.4.2 Deudas simples y dinero por cobrar — DETALLE PENDIENTE

- El alcance de ambos está aprobado, pero todavía falta definir y confirmar las reglas particulares de registro, pago parcial/total, cobro y conciliación.

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

## 11.1 Alertas y recordatorios — CONFIRMADO (canales externos pendientes)

**Principio:** avisar únicamente sobre situaciones útiles o revisiones opcionales, sin crear trabajo administrativo innecesario ni presentar datos inferidos como si fueran hechos confirmados.

- Incluir un **centro de notificaciones dentro de la aplicación** (por ejemplo, campana visible en el dashboard). Los avisos deben tener un texto entendible, un estado de atención y, cuando proceda, una acción directa para resolverlos.
- **Vencimiento de tarjeta de crédito:** alerta de alta prioridad **solo cuando el usuario haya registrado el importe del próximo estado de cuenta y la fecha de vencimiento** (§9.3), mientras el pago del período esté pendiente de confirmación. Se propuso **3 días antes** como valor inicial ajustable; el plazo final exacto se puede configurar. Si faltan datos, no inventarlos ni afirmar que existe un atraso.
- **Cuotas de préstamos/deudas:** alerta de alta prioridad con antelación a un vencimiento registrado, mientras la cuota correspondiente esté pendiente. No inventar fechas ni importes.
- **Gastos recurrentes:** recordatorio de prioridad media o informativa si llegó el período habitual y el pago todavía no se registró. Con fecha desconocida, indicar **«pago de este período sin confirmar»**, **NO «vencido»**; no realizar descuentos automáticos.
- **Revisión de movimientos:** recordatorio de baja prioridad para revisar si hubo ingresos/gastos olvidados, orientativamente semanal; puede desactivarse o posponerse. No afirmar que existieron movimientos no registrados.
- **Saldo bancario bajo:** aviso cuando el saldo registrado de una moneda caiga por debajo de un **umbral que establezca el usuario**. Reconocer que ese saldo puede no coincidir con el real si no se concilió.
- **Presupuesto por categoría excedido:** posible aviso cuando se habilite el módulo de presupuestos y exista un límite configurado. No implica que presupuestos ya esté aprobado.
- **Revisión del saldo bancario real:** **NO generar una alerta obligatoria ni automática cada 14 días**. Mantener «Actualizar saldo real» disponible en todo momento, mostrando la fecha de **última comprobación manual**. Ofrecer únicamente un **recordatorio de revisión opcional, desactivado por defecto**, cuyo intervalo configure quien lo active.
- **Antirruido:** como regla general, un aviso por situación, no repetirlo todos los días; permitir marcar revisado, posponer o desactivar tipos de alertas. Resolver la situación (registrar el pago, actualizar lo requerido, etc.) debe cerrar o actualizar el aviso correspondiente.
- Separar avisos de **vencimientos confirmados** de sugerencias o recordatorios basados en el historial. No convertir predicciones, importes estimados ni desconocimiento del banco en obligaciones ciertas.
- **Canales de envío:** queda confirmada la presencia de avisos **dentro de la app**. **NO quedó elegido todavía** si habrá correos electrónicos (p. ej., resumen semanal) o notificaciones push al dispositivo. Ambos canales externos son opciones pendientes y no deben implementarse por inferencia.
- **Detalles técnicos abiertos:** preferencias y tiempos concretos por tipo de alerta, modo de persistencia, política de deduplicación/posposición y configuración de permisos para los eventuales canales externos.

## 12. Funcionalidades todavía PENDIENTES

1. **Gastos recurrentes:** funcionamiento general ya **CONFIRMADO** en §8.1; notificaciones informativas aprobadas en §11.1, con detalles menores de detección y estimación pendientes, sin descuentos automáticos.
2. **Tarjetas de crédito:** confirmado catálogo débito/crédito, efectos de compras, pagos y ajustes; **cuotas automáticas distribuidas en gastos mensuales sin descontar bancos hasta registrar el pago**, con **mes/año de primera cuota seleccionable y modificable** y **formulario sencillo de valor de cuota × cantidad de cuotas, sin precio original ni tasa de interés** (§9.5); importe/vencimiento opcionales del estado de cuenta y alertas basadas en datos cargados (§9 y §11.1). Pendiente: detalle de cierres, pagos mínimos, cuotas de importes variables, cargos posteriores, compras multimoneda y conciliación.
3. **Deudas por pagar y dinero por cobrar**: confirmados ambos módulos y el flujo básico de **préstamos con cuotas** (§9.4.1: registrar pago, actualizar deuda y desglose de intereses opcional). Pendiente: **deudas simples**, cobros, pagos parciales, conciliación de préstamos, cuotas variables, historial y detalles de datos mínimos.
4. **Lista final de categorías/subcategorías** y opciones de configuración concreta.
5. **Presupuestos y límites de gasto**, objetivos de ahorro y estadísticas adicionales: qué conservar de la captura y qué adaptar. **Alertas:** reglas generales aprobadas en §11.1; todavía pendientes configuración final de tiempos y canales externos (correo/push).
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
- Este documento está versionado en `docs/product/decisiones-producto.md` en GitHub, rama `main` (versión indicada al inicio). Si Codex tiene una versión local distinta o sin seguimiento, primero debe traer los cambios de GitHub y comparar antes de sobrescribir nada.
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
- **2026-11-06 — v1.4:** tarjetas registrables como débito o crédito; débito carga a bancos agrupados, crédito acumula deuda por tarjeta; pagos de tarjeta reducen banco y deuda sin registrar un segundo gasto; deuda inicial y ajustes manuales sin clasificar; quedan pendientes detalles de estados de cuenta y alertas.
- **2026-11-06 — v1.5:** alertas no intrusivas aprobadas: vencimientos de tarjetas y préstamos, recurrentes sin confirmar, revisión de movimientos, umbrales bajos y presupuestos futuros. Revisión bancaria opcional y desactivada por defecto; sin alerta periódica obligatoria de 14 días. Centro de avisos interno; correo y push pendientes.
- **2026-11-06 — v1.6:** estado de cuenta y vencimiento opcionales por tarjeta de crédito; deuda total diferenciada del importe a pagar en el período; recordatorio solo con importe y fecha aportados por el usuario, sin pagos automáticos. Siguiente decisión pendiente: compras en cuotas.
- **2026-11-06 — v1.7:** compra en cuotas ingresada una sola vez; importe distribuido automáticamente como gasto en cada mes; sin descuentos a bancos hasta pago real de la tarjeta. Vista de progreso y cuotas comprometidas; distinción entre plan futuro, deuda del emisor, facturación y pagos, para evitar doble conteo.
- **2026-11-06 — v1.8:** al registrar compras en cuotas, elegir mes/año de la primera cuota y permitir modificarlo después; se reajustan las cuotas y estadísticas mensuales sin duplicar ni alterar pagos efectivamente registrados.
- **2026-11-06 — v1.9:** simplificado el registro de compras en cuotas con o sin intereses: valor de cuota, cantidad de cuotas, tarjeta, categoría y primer mes; calcular total financiado automáticamente. Descartados precio original de contado y tasa de interés como datos obligatorios o campos del formulario principal.
- **2026-11-06 — v2.0:** confirmado alcance de dos módulos diferenciados: deudas/préstamos por pagar y dinero por cobrar. El modelo concreto de alta, pagos, cuotas e intereses queda pendiente, evitando dar por aprobadas propuestas de diseño.
- **2026-11-06 — v2.1:** confirmado flujo simple de préstamos con cuotas: datos de deuda y cuota conocida, registrar pago real descontado del banco, actualizar deuda pendiente manualmente y desglose opcional entre capital/intereses/cargos; no reducir automáticamente la deuda por toda la cuota cuando se desconoce el desglose.