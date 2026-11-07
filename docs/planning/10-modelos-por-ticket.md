# Modelos recomendados por ticket en Codex — matriz de calidad y consumo

**Fecha:** 2026-11-07. **Alcance:** orientación de operación para el titular, no una decisión funcional del producto ni garantía de resultados. **Fuente de tickets:** [plan de implementación](05-plan-de-implementacion.md); reglas de trabajo: [guía Codex](08-guia-operativa-codex.md). El modelo se elige **manualmente en Codex**; este archivo no cambia automáticamente el selector.

## Principio

**No rebajar capacidad cuando la tarea manipula dinero, deuda, permisos, migraciones, información confidencial o conciliaciones.** Cuando el riesgo es moderado y el trabajo está acotado por criterios de aceptación, evaluar **GPT-6.1 Sol · Medium** antes que Sol · High. **GPT-6.1 Terra** se recomienda solo para trabajo principalmente visual/redacción y con criterios medibles. No usar un modelo débil para calcular dinero para ahorrar cupo.

**No existe configuración que garantice calidad perfecta**: exigir los tests CA/RF, revisión del diff, test de permisos y controles por fase. Un nivel High puede consumir más uso sin mejorar automáticamente el resultado. Cambiar modelos solo si aparecen en el selector de Codex: disponibilidad y límites dependen de plan y workspace.

**Leyenda:** Sol = GPT-6.1 Sol. Terra = GPT-6.1 Terra. Astra = GPT-6 Astra. En «Revisión» Astra es **una segunda revisión independiente recomendable** para cambios de alto riesgo, no sustituto de pruebas; si no está disponible, pedir revisión separada con Sol High, preferiblemente en una conversación con solo el diff y los criterios relevantes.

**No extender la revisión Astra al trabajo entero por defecto:** usarla sobre PR concreto y diff + CA de alto riesgo, para limitar consumo.

## F0 — Preparación

| Ticket | Objetivo resumido | Modelo | Intensidad | Motivo | Revisión opcional |
|---|---|---|---|---|---|
| F0-01 | Confirmar estado actual del repositorio | Sol | **Medium** | Inventario de Git y documentación; validación de hechos. | — |
| F0-02 | Verificar si existe localmente docs/design/fintrack-visual-spec.md | Terra | **High** | Interpretación de imagen y especificación visual. | — |
| F0-03 | Crear esqueleto Next.js App Router + TypeScript + Tailwind + shadcn/ui, ESLint/formatter, scripts, README y lock | Sol | **Medium** | Scaffold estándar y build reproducible. | — |
| F0-04 | Investigar cliente Neon Auth actual, sesiones, Google OAuth, email OTP, recuperación y validación del código de  | Sol | **High** | Autenticación, OTP, OAuth e invitaciones; seguridad. | Astra Medium |
| F0-05 | Crear DB de prueba aislada Neon, escoger ORM/migraciones/driver/pooling/decimal, esquema inicial y aislamiento p | Sol | **High** | DB, migraciones, autorización por propietario y transacciones. | Astra Medium |
| F0-06 | Configurar CI mínima y frameworks de tests: unidad, integración DB real de test, E2E de navegador. | Sol | **Medium** | CI y tests con herramientas conocidas. | — |
| F0-07 | Verificar viabilidad legal/técnica de Vercel Hobby no comercial, límites de Neon Free, SMTP real y cotizaciones. | Sol | **High** | Términos de proveedor, correos, coste y límites; verificar fuentes. | — |
| F0-08 | Diseñar/implementar prototipo de motor de efectos + checkpoints históricos con pruebas de CA-015 e I-10. | Sol | **High** | Motor contable y checkpoints; riesgo de saldos erróneos. | Astra High |
| F0-09 | Decidir convenciones de módulos, IDs, timestamps, decimales, transacciones y eventos | Sol | **High** | Decisiones técnicas transversales de dinero y seguridad. | — |

## F1 — Bancos y movimientos

| Ticket | Objetivo resumido | Modelo | Intensidad | Motivo | Revisión opcional |
|---|---|---|---|---|---|
| F1-01 | Layout, navegación básica, dashboard fijo inicial y estados vacíos | Terra | **High** | Pantallas y responsive apoyadas en referencia visual. | — |
| F1-02 | Saldos agregados independientes UYU/USD/EUR, inicialización y fechas de referencia. | Sol | **High** | Saldos y monedas: invariantes financieros. | — |
| F1-03 | Formulario ingreso/gasto normal con categoría opcional, concepto, nota, fecha, moneda y medio básico. | Sol | **Medium** | Formulario acotado; servidor valida reglas ya probadas. | — |
| F1-04 | Engine de eventos monetarios, validación decimal exacta, transacciones DB, idempotency key y reversión auditada. | Sol | **High** | Motor de asientos, decimal, atomicidad e idempotencia. | Astra High |
| F1-05 | Ajuste manual de saldo y checkpoints por fecha/moneda | Sol | **High** | Conciliación retroactiva sin modificar checkpoints. | Astra High |
| F1-06 | Transferencia entre saldos y cambio de moneda usando importes reales de ambos lados. | Sol | **High** | Movimiento real entre monedas y cuentas; exactitud. | — |
| F1-07 | Historial permanente paginado, búsqueda/filtros base y edición/anulación segura. | Sol | **Medium** | Historial, paginación y filtros; revisar anulación. | — |
| F1-08 | Tests de regresión y aislamiento para dos cuentas y dos sesiones, reporte de errores. | Sol | **High** | Regresión financiera y aislamiento entre cuentas. | Astra Medium |

## F2 — Tarjetas, préstamos y reembolsos

| Ticket | Objetivo resumido | Modelo | Intensidad | Motivo | Revisión opcional |
|---|---|---|---|---|---|
| F2-01 | Catálogo de tarjetas débito/crédito, tipos, monedas, deuda/saldo a favor y límites opcionales. | Sol | **Medium** | CRUD de tarjetas; verificar deuda/saldo a favor. | — |
| F2-02 | Compra con tarjeta de crédito y pago de resumen, deuda inicial, parcial y total sin doble gasto. | Sol | **High** | Compra crédito y pago de resumen sin doble gasto. | Astra High |
| F2-03 | Cuotas iguales, mes inicial, cargo real al emisor, reporte mensual, cancelación/edición con auditoría. | Sol | **High** | Periodización exacta de cuotas y correcciones. | Astra High |
| F2-04 | Ciclos de cierre, mínimos/resumen oficial, estimaciones, alertas, fechas excepcionales y reconciliación de ciclo | Sol | **High** | Ciclos, fecha de cierre, estimación frente a dato oficial. | — |
| F2-05 | Compra con dos medios y porción crédito financiada en cuotas | Sol | **High** | Pagos mixtos y cuotas; varias posiciones financieras. | Astra Medium |
| F2-06 | Deudas y préstamos simples/cuotas, pago/cobro, entrega/recepción de capital, intereses de deuda reales, actualiz | Sol | **High** | Préstamos, intereses y deudas; activos/pasivos correctos. | — |
| F2-07 | Pago/cobro de préstamo en otra moneda según montos reales acordados. | Sol | **High** | Pago/cobro en divisas distintas; doble importe real. | — |
| F2-08 | Gasto pagado por tercero y gasto pagado para varios amigos con derechos por cobrar individualizados. | Sol | **High** | Repartos entre amigos y obligaciones independientes. | — |
| F2-09 | Devoluciones reales en débito/crédito, cuotas, saldo a favor y compras/medios divididos. | Sol | **High** | Reintegros, saldo a favor, cuotas, presupuesto y fechas. | Astra High |
| F2-10 | Tests de consistencia ante pagos parciales, reintentos, saldos negativos indebidos, autorización y concurrencia. | Sol | **High** | Pruebas de concurrencia, pagos, reintentos y permisos. | Astra High |

## F3 — Ahorro y presupuestos

| Ticket | Objetivo resumido | Modelo | Intensidad | Motivo | Revisión opcional |
|---|---|---|---|---|---|
| F3-01 | Fondos con nombre/moneda/estado, reservar/liberar/traspasar internamente sin tocar Bancos. | Sol | **High** | Reservas virtuales sin efectos falsos en banco. | — |
| F3-02 | Disponible libre vs saldo bancario real: garantía atómica de fondos no reservados. | Sol | **High** | Disponible, reservas y concurrencia atómica. | Astra Medium |
| F3-03 | Aportes programados mensuales, primera ejecución siguiente mes, día inexistente → último del mes, insuficiencia  | Sol | **High** | Aportes periódicos: calendario, insuficiencia y estado. | — |
| F3-04 | Metas monetarias opcionales y fechas, última aportación exacta, pausa automática por meta, reactivación expresa, | Sol | **High** | Metas, pausa de aportes y excepciones de calendario. | — |
| F3-05 | Cubrir gasto con uno o más fondos y disponible | Sol | **High** | Gasto con fondos y pago tarjeta; evitar doble débito. | Astra Medium |
| F3-06 | Presupuestos categoría/subcategoría por moneda y mes, jerarquía, cuotas, edición con historial y excepción tempo | Sol | **High** | Presupuestos, cuotas, moneda e historial de límites. | — |
| F3-07 | Avisos internos de presupuestos 80%/100%, metas/fondos y validación de concurrencia. | Sol | **Medium** | Alertas con deduplicación, con dominio de fondos probado. | — |

## F4 — Recurrencias

| Ticket | Objetivo resumido | Modelo | Intensidad | Motivo | Revisión opcional |
|---|---|---|---|---|---|
| F4-01 | Definición de ingreso/gasto recurrente, frecuencia, primer período, día flexible, fecha final, referencia y esta | Sol | **High** | Modelo de recurrencias y calendario con fechas flexibles. | — |
| F4-02 | Seguimiento y confirmación manual real, pagos en meses distintos, varios depósitos por sueldo, importes variable | Sol | **High** | Cobros/pagos reales, parciales y referencia por período. | — |
| F4-03 | Omitir mes/período, pausar/reanudar serie y períodos independientes | Sol | **Medium** | Pausar y omitir períodos respetando historial y pruebas. | — |
| F4-04 | Recurrente compartido con persona/contacto y desglose real al pagarse | Sol | **High** | Recurrentes compartidos, deudas y porciones reales. | Astra Medium |
| F4-05 | Centro de avisos, tres días de antelación si fecha conocida, push solo tarjetas cuando el usuario lo activa, ant | Sol | **High** | Avisos, push opcional, permisos y notificaciones no duplicadas. | — |
| F4-06 | Tests de calendarios (febrero, fin de año, husos horarios), reintentos, meses omitidos, pagos tardíos y facturas | Sol | **High** | Pruebas temporales, husos horarios e idempotencia. | — |

## F5 — Estadísticas y utilidades

| Ticket | Objetivo resumido | Modelo | Intensidad | Motivo | Revisión opcional |
|---|---|---|---|---|---|
| F5-01 | Categorías/subcategorías por titular, creación desde formularios, archivo y protección de historial. | Sol | **Medium** | Categorías, archivo y formularios con pruebas. | — |
| F5-02 | División de ingreso y gasto por categorías e importes exactos | Sol | **High** | División exacta de importes; no duplicar ingreso/gasto. | — |
| F5-03 | Comercios/contactos autocompletables, archivo/restauración, fusión manual de comercios. | Sol | **Medium** | Autocompletado, normalización, archivo y fusión manual. | — |
| F5-04 | Filtros guardados, operaciones de categorización masiva seguras y búsqueda eficiente. | Sol | **Medium** | Filtros guardados y edición masiva de metadatos. | — |
| F5-05 | Estadísticas con métricas, comparaciones, favoritos, histórico por fecha, filtros y drilldown | Sol | **High** | Estadísticas transversales, cálculos y filtros históricos. | — |
| F5-06 | Cotizaciones UYU/USD/EUR con fuente/fallback, tipo histórico reproducible | Sol | **High** | Tipos históricos y fuentes; evitar cambios de valoración. | Astra Medium |
| F5-07 | Informes PDF/Excel/CSV del período y restauración/copia completa de cuenta, con cifrado opcional e integridad. | Sol | **High** | Exportaciones y restauración con cifrado e integridad. | Astra High |
| F5-08 | Eliminación de cuenta y revisión de privacidad/ciclo de retención. | Sol | **High** | Borrado de cuenta y privacidad; operación irreversible. | Astra Medium |
| F5-09 | Distinguir reembolsos de compras de otros meses y cashback, sin cambios ficticios a presupuesto. | Sol | **High** | Devoluciones y cashback; contra gasto separado. | Astra High |

## F6 — Integración y lanzamiento

| Ticket | Objetivo resumido | Modelo | Intensidad | Motivo | Revisión opcional |
|---|---|---|---|---|---|
| F6-01 | Revisión de 67 CA con resultados y evidencias | Sol | **High** | Auditoría integrada de 67 criterios y evidencia. | Astra Medium |
| F6-02 | Revisión de permisos multiusuario, APIs de administración, PWA, cookies, RLS y exportaciones | Sol | **High** | Auditoría de fuga entre cuentas, API y secrets. | Astra High |
| F6-03 | PWA/manifest/online-only, UX responsive, teclado/lectores, contraste, validaciones y estados de error. | Sol | **High** | PWA, caché de datos privados y accesibilidad real; apoyarse en Terra para visual si hace falta. | — |
| F6-04 | Plan de backups/restauración cifrada, versión de esquema y prueba de desastre controlada. | Sol | **High** | Restauración cifrada, desastres, pruebas destructivas. | Astra High |
| F6-05 | Revisión de políticas Hobby, Neon, SMTP, dominio, cuotas, límites, recuperación y alertas | Sol | **High** | Costes, límites, despliegue y requisitos de proveedor. | — |
| F6-06 | Guía corta para usuario final: crear cuenta, ingresar saldos, registrar gasto, tarjetas, fondos, correcciones, r | Terra | **Medium** | Guía de usuario desde funcionalidades verificadas. | — |
| F6-07 | Cierre de puntos técnicos de 06-riesgos-y-pendientes.md y aprobación de uso real | Sol | **High** | Cierre de riesgos y gate de publicación con evidencia. | Astra High |

## Reglas de control de calidad y consumo

1. **Primera pasada:** ejecutar ticket en modelo/intensidad recomendados; solicitar tests según los criterios específicos del ticket (no tests genéricos inventados). No fusionar si falla el test.
2. **Escalada:** si el ticket descubre ambigüedad de negocio, bug contable, excepción de fecha/moneda, problema de autorización o migración riesgosa, cambiar **a Sol High** inmediatamente; si el problema es inusual/muy difícil, revisión con **Astra Medium o High** si está disponible.
3. **Para tickets Sol Medium:** no bajar tests ni permisos; si el alcance crece, dividir tickets o subir intensidad, no forzar una implementación incorrecta.
4. **Para tickets Terra:** Terra solo si la mayor parte es visual, prototipo, redacción o navegación; cualquier lógica financiera, API protegida, autorización y persistencia monetaria deben desarrollarse/revisarse en Sol High, incluso si surgieron incidentalmente en un ticket visual.
5. **Revisión independiente:** al final de los PR con marca Astra, abrir revisión aparte con «analizá solo este diff y CA asociados; detectá problemas de datos, dinero, permisos, concurrencia, falta de pruebas; no modifiques nada». Esto evita que el autor sea su único revisor. Si no hay Astra, una revisión separada de Sol High sigue siendo útil, aunque no equivale a auditoría formal.
6. **Medir ahorro por tarea terminada, no por tokens de una sola respuesta:** llevar el número de intentos, tests fallidos, correcciones, consumo y tiempo para F0-01/F0-03/F1-03; si Medium obliga a rehacer trabajo, usar High. No convertir precios por millón de tokens de la API en consumo exacto de Codex por suscripción: la asignación y modalidades difieren.
7. **Criterio de aceptación independiente del modelo:** ejecutar pruebas, review, evidencia y gate de fase. Si un modelo rápido no supera CA, no cumple, aunque su respuesta parezca convincente.
8. **Uso de High por defecto cuando haya dudas:** dinero, deuda, concurrencia, privacidad, backups y seguridad siempre Sol High. Considerar Astra para auditorías puntuales de F0-08, F1-04/F1-05, F2-09/F2-10, F5-07 y F6-02/F6-04/F6-07.
9. **Contexto eficiente:** no pegar 300k caracteres de decisiones en cada prompt: Codex lee archivos relevantes del repositorio; usar ticket + RF + CA + diff y referenciar documentos por ruta. Un chat nuevo por ticket, no por cada error.

## Referencias de modelos (sujetas a cambios)

- Selección de modelos de OpenAI: https://developers.openai.com/api/docs/guides/model-selection
- GPT-6.1 Sol: https://developers.openai.com/api/docs/models/gpt-6.1-sol
- Comparativa GPT-6: https://developers.openai.com/api/docs/guides/latest-model
- Consumo de Work/Codex: https://help.openai.com/en/articles/20001516-managing-usage-with-gpt-6-astra-in-work-and-codex
- Modelo y selector Codex: https://help.openai.com/en/articles/20001275-chatgpt-work-and-codex

**Nota:** estas recomendaciones son juicio técnico basado en el ticket y fuentes públicas, no una evaluación comparativa empírica de ejecución de los 56 tickets. Si un modelo o esfuerzo no aparece en el selector del usuario, priorizar Sol High antes que un downgrade incierto.
