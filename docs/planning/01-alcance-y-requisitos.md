# Alcance y catálogo de requisitos

**Estado:** especificación derivada de decisiones confirmadas hasta v9.49. Cada fila identifica una capacidad; no implica que esté implementada.  
**Prioridades:** P0 = imprescindible para un uso seguro del núcleo; P1 = parte del producto completo aprobado, depende del núcleo; P2 = refinamiento de experiencia/analítica aprobado. **P1/P2 no significa descartado.**  
**Fases:** F0 basamento, F1 núcleo, F2 tarjetas/deudas, F3 ahorro/presupuestos, F4 recurrencias, F5 analítica/utilidades, F6 finalización.

## Usuarios y límites

- **Actor principal:** titular de una cuenta de usuario. Los amigos/contactos y comercios son **registros nominales**, no usuarios colaborativos con acceso a información.
- **Sistema externo:** Google OAuth (proveedor de identidad), Better Auth autogestionado en Next.js, Neon PostgreSQL, Vercel, fuentes de tipo de cambio. No existen proveedores bancarios conectados.
- **Monedas:** UYU, USD, EUR; saldo bancario **consolidado por moneda**, no por banco. Sin efectivo ni inversiones.
- **Entrada de datos:** manual, excepto cotizaciones de referencia y automatismos **virtuales de reservas** explícitamente aprobados. La app no tiene certeza sobre movimientos no registrados.

**Precedencia v9.49:** RF-001/002/003 se sustituyeron por Google-only + allowlist. Los demás RF de datos, historial y privacidad siguen vigentes. Fuente: [ADR 0004](../adr/0004-google-only-allowlist-auth.md). No fusionar el PR #12 legado tal como está.

## Requisitos funcionales

| ID | Prior. | Fase | Requisito verificable y alcance |
|---|---|---|---|
| RF-001 | P0 | F0 | Inicio de sesión y primera alta **solo con Google** mediante **Better Auth autogestionado**; cuentas personales separadas, cierre de sesión y retorno a misma identidad. Sin passwords propios. |
| RF-002 | P0 | F0 | Alta limitada a **lista privada de cuentas Google autorizadas** por el titular, con comprobación en servidor **antes de crear usuario**; altas ajenas rechazadas, incorporación/revocación auditable sin panel complejo, revocación efectiva de sesiones. |
| RF-003 | P0 | F0 | Google OAuth con identidad/email verificados y callback/cookies seguros, sesiones y cierre de sesión; recuperación de cuenta delegada a Google. **Sin OTP, email/contraseña ni SMTP para acceso.** |
| RF-004 | P0 | F0 | Acceso a datos solo del titular autenticado; servidor verifica identidad y pertenencia de todos los recursos. |
| RF-005 | P0 | F1 | Configurar y visualizar saldos bancarios agregados **independientes** en UYU/USD/EUR. |
| RF-006 | P0 | F1 | Registrar ingresos ordinarios reales y gastos reales con fecha, importe y moneda; categoría opcional; concepto de gasto obligatorio y nota opcional. |
| RF-007 | P0 | F1 | Gastos debitados/transferidos restan banco; ingresos reales acreditados aumentan banco; sin duplicaciones. |
| RF-008 | P0 | F1 | Ajustar un saldo bancario real de forma explícita y fechada **sin crear gastos o ingresos presumidos**. |
| RF-009 | P0 | F1 | Transferencias/cambios de moneda entre saldos UYU/USD/EUR basados en **dos importes reales**, sin ingresos/gastos ficticios. |
| RF-010 | P0 | F1 | Consultar, editar y anular registros con efectos inversos exactos, auditoría e idempotencia. |
| RF-011 | P0 | F1 | Mantener todo el historial durante la vida de la cuenta; búsqueda, filtros y paginación eficaz. |
| RF-012 | P0 | F1 | Corregir registros históricos y recalcular métricas del período original **sin sobrescribir saldos posteriores confirmados**; diferencia de conciliación explícita. |
| RF-013 | P0 | F1 | Distinguir datos registrados, estimaciones, saldos confirmados y operaciones pendientes. |
| RF-014 | P1 | F2 | Configurar tarjetas de débito/crédito identificables, asociadas al banco consolidado o a deuda propia en una o varias monedas. |
| RF-015 | P1 | F2 | Compra con crédito registra cargo/deuda una sola vez; **pago de resumen reduce banco y deuda, no crea gasto nuevo**. |
| RF-016 | P1 | F2 | Compra a crédito en cuotas **iguales**, período inicial elegible y distribución estadística por los meses de las cuotas, no doble gasto inicial. |
| RF-017 | P1 | F2 | Registrar deuda inicial, mínimo oficial, monto oficial de resumen, cierre y vencimiento habitual/excepcional; diferenciar estimación de dato bancario confirmado. |
| RF-018 | P1 | F2 | Registrar pagos de tarjeta parciales/totales, asignar fuentes y compras manualmente cuando existan, con estados de deuda/resumen consistentes. |
| RF-019 | P1 | F2 | Registrar compras con varios medios de pago en un gasto lógico; incluir cuota en **solo la porción** de crédito cuando aplique. |
| RF-020 | P1 | F2 | Crédito con compras y pagos multimoneda, cargos reales del emisor, comisiones conocidas, ajustes de resumen con confirmación y trazabilidad. |
| RF-021 | P1 | F2 | Gestionar reembolsos reales por débito/crédito, saldo a favor de tarjeta, cuotas anuladas o abonos; respetar acreditaciones efectivas. |
| RF-022 | P1 | F2 | Deudas por pagar y dinero por cobrar, préstamos simples y con cuotas, fecha opcional, saldos separados y pagos/cobros parciales. |
| RF-023 | P1 | F2 | «Prestar dinero» descuenta banco y crea por cobrar; «Recibir préstamo» acredita banco y crea por pagar; capital no es gasto/ingreso. |
| RF-024 | P1 | F2 | Préstamos cancelados/cobrados en moneda diferente con importes realmente acordados; sin conversión ficticia. |
| RF-025 | P1 | F2 | Gasto pagado por tercero genera gasto del usuario + deuda; gasto pagado por usuario para terceros genera **solo su parte de gasto** + cuentas por cobrar. |
| RF-026 | P1 | F3 | Fondos de ahorro **virtuales** y dinero disponible = saldo bancario menos fondos reservados y compromisos que corresponda. |
| RF-027 | P1 | F3 | Reservar/liberar dinero manualmente sin crear salida bancaria ni ingreso/gasto; transferir reservas entre fondos de misma moneda. |
| RF-028 | P1 | F3 | Aportes automáticos mensuales opcionales según día, desde disponible, empezando mes siguiente, con pendientes si insuficiente y sin reserva parcial automática. |
| RF-029 | P1 | F3 | Meta monetaria y fecha objetivo opcionales, progreso y estimación orientativa; finalización de aportes al alcanzar meta; reactivación **expresa**. |
| RF-030 | P1 | F3 | Utilizar fondo para cubrir gastos/pagos de tarjeta con autorización y sin doble débito; fondos insuficientes admiten varios fondos y disponible, con validación global. |
| RF-031 | P1 | F3 | Presupuesto **mensual** opcional por categoría/subcategoría, límites editables por moneda y jerarquía; sin arrastre de saldo mensual. |
| RF-032 | P1 | F3 | Advertir al 80% y 100% del presupuesto por mes sin duplicar avisos; una excepción puede cambiar límite **solo un mes**. |
| RF-033 | P1 | F4 | Recurrencias de gasto e ingreso con frecuencia semanal/mensual/trimestral/anual, inicio/fin opcionales y seguimiento por período sin cobro automático. |
| RF-034 | P1 | F4 | Confirmar pagos/cobros reales de recurrencia, importes variables, parciales/tardíos, períodos independientes y omisión puntual sin alterar otros períodos. |
| RF-035 | P1 | F4 | Pausar y reactivar recurrencias explícitamente; pausa de ingreso y un período omitido mantienen historial y evitan avisos irrelevantes. |
| RF-036 | P1 | F4 | Recurrencia compartida genera gasto propio y cuentas por cobrar **únicamente cuando se confirma pago real**. |
| RF-037 | P1 | F4 | Avisos internos por vencimientos **ciertos** de tarjetas/deudas/recurrentes; anticipación configurable; push opcional **solo para vencimientos de tarjeta**. |
| RF-038 | P1 | F4 | Recordatorios de ingreso, límite de crédito, fondos y saldos según reglas, sin correo de avisos financieros. |
| RF-039 | P1 | F5 | Catálogo por usuario de categorías/subcategorías predeterminadas y personalizables; crear desde formulario; historial protegido ante archivo. |
| RF-040 | P1 | F5 | Dividir un gasto o ingreso entre categorías con suma exacta y **una sola operación bancaria**. |
| RF-041 | P1 | F5 | Comercios y personas con autocompletado, normalización, archivo reversible, y fusión manual confirmada para comercios. |
| RF-042 | P1 | F5 | Etiquetas cruzadas independientes de categoría y filtros por etiquetas sin gasto duplicado. **Sin presupuesto por etiqueta.** |
| RF-043 | P1 | F5 | Buscar por comercio, monto, moneda, fecha, método, categoría, persona cuando aplique; guardar filtros y clasificar/etiquetar movimientos en lote. |
| RF-044 | P1 | F5 | Dashboard principal de diseño **fijo** y sección Estadísticas separada con favoritos personalizables. |
| RF-045 | P1 | F5 | Gráficos y comparaciones por períodos, métodos, categorías, recurrente/no recurrente, deudas y evolución histórica; profundizar hasta movimientos. |
| RF-046 | P1 | F5 | Convertir para **visualización** por tipo de cambio histórico según fecha original con tasa/fuente reproducibles; selector de moneda recordado entre sesiones. |
| RF-047 | P1 | F5 | Mostrar devoluciones de compras de meses previos **por separado en mes de acreditación**, sin alterar compras o presupuesto del mes receptor. |
| RF-048 | P1 | F5 | Exportar estadísticas a PDF/Excel/CSV y realizar backups restaurables por titular; **copia cifrada opcional con contraseña**. |
| RF-049 | P1 | F5 | Eliminar cuenta con confirmación y exportación previa opcional; restauración de respaldo validado **reemplaza** datos financieros, no fusiona. |
| RF-050 | P2 | F5 | Resumen inteligente **determinista**, verificable, solo con datos que el usuario registró; mostrar insuficiencia de información. |
| RF-051 | P1 | F6 | PWA responsive accesible desde iPhone/Android/PC, sin escritura offline ni dependencia de instalación para funcionar. |
| RF-052 | P1 | F6 | Usabilidad simple, español, coherencia visual con imagen Fintrack, estados vacíos/errores claros, controles responsivos y accesibles. |
| RF-053 | P1 | F6 | Registro de cashback no vinculado como ingreso **solo al acreditarse**, distinto de reembolso específico de compra. |
| RF-054 | P1 | F6 | Mantenimiento de privacidad, costos/capacidad gratuitos comprobados y pruebas de regresión de los módulos conectados. |

## Restricciones fuera del alcance de v1

**No construir por inferencia:** integración bancaria/open banking, importación bancaria CSV/Excel, efectivo, inversiones, entrada por voz/IA, OCR de comprobantes, adjuntos PDF/imagen de compras, presupuestos anuales, presupuestos por etiquetas, recordatorios financieros por email, gestor de movimientos futuros hipotéticos, modo de registro offline, arrastrar widgets de dashboard, ocultar saldos con asteriscos, repetición/clonado de movimiento previo, historial eliminado automáticamente, apps nativas de tiendas o suscripciones de pago obligatorias. Un cashback no implica un agregador bancario.

## Requisitos no funcionales y calidad

| ID | Regla comprobable |
|---|---|
| RNF-01 | Toda consulta y escritura financiera usa identidad validada por servidor; prueba negativa de acceso cruzado entre dos usuarios. |
| RNF-02 | Operaciones relacionadas se guardan **atómicamente** o no se guarda ninguna; sin deducción doble ante reintentos de red. |
| RNF-03 | Importes decimales exactos por moneda: no utilizar `number` binario de JS para contabilidad monetaria final. |
| RNF-04 | Auditoría inmutable o equivalente para rectificaciones, anulaciones, deuda, conciliaciones y restauraciones; no borrar historia sin acción autorizada. |
| RNF-05 | Historial eficiente con filtros/paginación e índices, sin descargar todos los movimientos del usuario al cliente. |
| RNF-06 | No escribir operaciones offline; ante fallo de red nunca declarar «Guardado» sin confirmación persistida del servidor. |
| RNF-07 | Accesibilidad básica WCAG 2.2 AA como objetivo de calidad: teclado, foco visible, etiquetas, contraste, errores y lectores. |
| RNF-08 | Mobile-first y escritorio; usabilidad comprobada al menos en dos anchos de pantalla y navegadores móviles actuales. |
| RNF-09 | Variables/secretos solo en servidor; protección CSRF/cookies y limitación de abusos por proveedor y aplicación. |
| RNF-10 | Respaldo cifrado con primitivas criptográficas estándar cuando el usuario opta; error de clave no causa reemplazo. |
| RNF-11 | Sin dependencia obligatoria de proveedores pagos; detener despliegue si el uso requiere pago/licencia no aprobados. |
| RNF-12 | Pruebas unitarias de operaciones monetarias, integración DB/autorización, E2E de flujos críticos, migraciones y restauración. |
| RNF-13 | Distinguir visualmente datos **confirmados**, **calculados**, **estimados** y **pendientes**. |
| RNF-14 | PWA accesible por URL sin instalación y sin almacenar en caché pública datos sensibles; sin funciones financieras offline. |
| RNF-15 | Todas las colecciones son por usuario: etiquetas, comercios, contactos, categorías, tarjetas, fondos, eventos y preferencias. |

## Historias de usuario representativas

- **HU-01:** Como titular, quiero registrar una compra con débito para saber cuánto dinero bancario me queda.
- **HU-02:** Como titular, quiero comprar con tarjeta en tres cuotas para ver gasto por mes y deuda total sin duplicaciones.
- **HU-03:** Como titular, quiero confirmar mi saldo real sin que la app invente gastos para explicar diferencias.
- **HU-04:** Como titular, quiero reservar dinero virtualmente para un viaje sin sacarlo del banco.
- **HU-05:** Como titular, quiero registrar una cena pagada por mí y tres amigos, y luego sus cobros individuales, sin contabilizar como gasto las partes de ellos.
- **HU-06:** Como titular, quiero consultar estadísticas, descargas y backups sin exponer información ajena.

## Criterios transversales de aceptación

Cada RF será aceptable solamente si: (a) existe UI usable y mensajes de error, (b) la base de datos persiste los hechos correctamente, (c) se conserva trazabilidad y autorización del usuario, (d) pasa criterios `CA-*` en [aceptación](03-criterios-de-aceptacion.md), (e) no rompe invariantes de [dominio](02-modelo-de-dominio-y-datos.md), y (f) tiene pruebas automatizadas y una demostración manual al cerrar la fase.

**No suponer cierre del 100 % de requisitos por crear este documento.** El backlog propuesto se revisa al crear cada PR y se mantiene trazable al requisito original de §5–§11 del registro.
