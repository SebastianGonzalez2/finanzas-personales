# Registro de riesgos y verificaciones antes de implementar

**Auditoría final F6-07 — 2026-11-13.** Revisión completa de R-01 a R-20 sobre la
evidencia de F6-01 a F6-06 y el árbol integrado de `main` (`9a4a2e2`, CI verde).
Ningún riesgo se declara verificado en el entorno desplegado: toda la evidencia
ejecutable es local o de CI. R-19 continúa bloqueando datos reales; R-02 no
aplica por v9.49; los demás quedan clasificados y con residuales explícitos en la
matriz de abajo y en el [informe de preparación](57-preparacion-uso-real-f6-07.md).
F6-06 ([PR #64](https://github.com/SebastianGonzalez2/finanzas-personales/pull/64),
en borrador) sigue sin integrar: su evidencia se cita desde el PR y no cierra el
producto. No se ejecutaron migraciones ni se tocó Neon.

**Cierre técnico F0 — 2026-11-08.** Google-only con Better Auth autogestionado pasó las pruebas reales de rechazo, revocación y aislamiento A/B en development. R-01 y R-13 tienen evidencia para el acceso y la API de preferencias. R-03 conserva la comprobación de uso y consumo del despliegue, y R-19 la configuración HTTPS y la prueba entre dispositivos antes de datos reales. El ADR 0004 retira R-02 del acceso vigente. [Evidencia](25-google-only-f0-04.md) · [Proveedores](13-informe-f0-07.md) · [ADR 0004](../adr/0004-google-only-allowlist-auth.md).

**Corte histórico F0-INTEGRATE.** La auditoría previa describe el origen de la protección de `main` y el estado anterior de la fase. [Integración previa](16-integracion-controlada-f0.md).

**Estado:** evaluación de planificación; **funcionalmente cerrado** (F6-01 a F6-06),
técnicamente **requiere verificación en el destino desplegado** antes de datos reales.  
**Registro fuente:** [decisiones v9.49](../product/decisiones-producto.md).  
**Regla:** «pendiente» significa *no verificado/no implementado*; **no** implica abrir automáticamente otra tanda de decisiones.

## Resultado de auditoría inicial

**Actualización F0-05 — 2026-11-08:** [PR #11 e informe](19-informe-f0-05.md).
R-12 mitigado en persistencia inicial: dominio exacto que rechaza escala/overflow
y Money BigInt/string; tres monedas probadas. R-13 mitigado en DB: 48 controles
directos y 48 pooled con rol sin bypass, RLS/FK por dueño y rollback; no hay
fixtures persistentes. R-19 permite migración development expresamente
autorizada/aplicada. R-13 integral, R-01/02/17, SMTP, sesiones reales, invitación
y credencial final de runtime continúan abiertos. No hay aprobación de producción.

- La planificación funcional de los módulos principales está **suficientemente cerrada** para iniciar tareas técnicas F0.
- El repositorio remoto visto en noviembre de 2026 contenía únicamente `docs/` con la imagen visual y el registro de decisiones. **No se encontró aplicación ni esquema de base de datos desplegados**. No se deben dar por implementados.
- En la auditoría original la guía visual local `docs/design/fintrack-visual-spec.md` **no se encontró en `main` remoto**. F0-02 confirmó su existencia local y la consolidó para revisión; ver [evidencia y límites](10-informe-f0-02.md). Esto no demuestra reproducción visual de una aplicación.
- El apartado histórico §12 del documento de producto mezcla decisiones ya cerradas con pendientes antiguos: **no usar ese apartado literalmente como lista de cosas sin resolver**, sin consultar decisiones posteriores y este registro.
- No identificamos un nuevo requisito funcional que sea obligatorio decidir en otra ronda para **iniciar F0**. Sí existen puertas de **seguridad/viabilidad** que deben probarse antes de desplegar o tratar datos reales.

## Matriz de riesgos y puertas

| ID | Riesgo / incertidumbre | Impacto | Estado | Mitigación y evidencia exigida |
|---|---|---|---|---|
| R-01 | **Google OAuth + Better Auth propio + allowlist**: acceso de terceros, alta directa, cambios de identidad, revocación y sesiones. | **Bloquea acceso real** si el servidor permite crear sesión/usuario no autorizado o filtra datos A/B. | **Mitigado parcialmente.** Transporte simulado local: rechazo de alta directa, correo sin verificar, `state`/JWT inválido, revocación y cierre invalidan sesión; cookies falsificadas/revocadas responden 401. | [F6-01](52-auditoria-67-ca-f6-01.md) CA-002–005 PARTIAL (proveedor simulado), [F6-02](53-auditoria-seguridad-f6-02.md) §8/§12; cierre F0 [25](25-google-only-f0-04.md). Falta la puerta R-19: Google real, HTTPS y dos dispositivos en el destino autorizado. |
| R-02 | **Histórico:** envío de OTP/recuperación para cuentas propias con contraseña. | **No aplica** a v9.49: Google gestiona autenticación y recuperación. | **No aplicable por decisión vigente** (retirado como bloqueo). | v9.49 + [ADR 0004](../adr/0004-google-only-allowlist-auth.md); [F6-05](56-politicas-cuotas-costes-f6-05.md) §3 re-verificó que no hay dependencia SMTP vigente. No contratar SMTP; si se requiere correo futuro, evaluar como riesgo nuevo. |
| R-03 | **Vercel Hobby** y condición personal/no comercial, además de cuotas gratuitas; Neon Free/cuotas. | **Bloquea publicación** si uso previsto contraviene términos o requiere plan pago no autorizado. | **Mitigado parcialmente** (documental, 2026-11-13). | [F6-05](56-politicas-cuotas-costes-f6-05.md): límites sin cambios frente a F0-07, sin gasto activado; uso personal no comercial es inferencia documental. Falta medición de consumo y adecuación del uso concreto en el despliegue autorizado. |
| R-04 | Corrección retroactiva anterior a saldo bancario manual confirmado. | **Bloquea mutaciones monetarias históricas F1** sin algoritmo seguro. | **Mitigado y verificado en local.** | [F1-05](29-conciliacion-saldos-f1-05.md) + [F6-01](52-auditoria-67-ca-f6-01.md): CA-011/015/018 PASS con PostgreSQL local y navegador; checkpoints intactos, diferencia explicada, sin «gasto misterioso». Pendiente: aplicar migraciones en Neon development (ADR 0004) y repetir el flujo en el destino real. |
| R-05 | Doble débito/gasto por tarjeta, cuotas, pagos mixtos o cobros por tercero. | Alto, integridad financiera. | **Mitigado y verificado en local.** | [F6-01](52-auditoria-67-ca-f6-01.md): CA-020–026 PASS; I-02/I-05/I-06; idempotencia y carreras (I-11) con 201/200/409; [F6-04](55-backup-recuperacion-f6-04.md) restaura cuotas y pagos idénticos. Repetir controles en el destino antes de datos reales. |
| R-06 | Reserva virtual vs banco real, concurrencia, aportes automáticos y pagos de tarjeta. | Alto; mostrar disponible negativo/incorrecto. | **Mitigado y verificado en local.** | [F6-01](52-auditoria-67-ca-f6-01.md): CA-038–041 PASS; `INT:savings-funds`/`INT:fund-coverage` con bloqueo, rollback y revalidación concurrente del disponible; aportes sin efecto bancario (CA-039). |
| R-07 | **Reembolso de compra de mes previo** mostrado como gasto negativo del mes receptor. | Alto; contradice confirmación expresa. | **Mitigado y verificado en local** (v9.42). | [F6-01](52-auditoria-67-ca-f6-01.md): CA-028 PASS con frontera 02:59:59Z/03:00:00Z de Montevideo; compras y presupuesto de febrero intactos; `INT:bank-benefits`/`INT:refunds`/E2F. |
| R-08 | Meta de ahorro alcanzada y pausa automática inconsistente. | Medio/alto; mover dinero no autorizado. | **Mitigado y verificado en local** (v9.28–v9.30). | [F6-01](52-auditoria-67-ca-f6-01.md): CA-040/050 PASS; pausa `paused_target_reached` y sin reactivación automática al bajar saldo; E2F y UNIT. |
| R-09 | Cobros de préstamo simple superior al capital entregado (p. ej., préstamo 10.000 y total pactado 10.500) sin desglose obligatorio de intereses. | Medio; clasificación estadística de 500 potencialmente ambigua. | **Mitigado y verificado en local.** | [F6-01](52-auditoria-67-ca-f6-01.md): CA-033/034 PASS; sobrecobro simple rechazado 409 sin tocar Bancos; cobro multimoneda sin ingreso ordinario; criterio técnico registrado en el informe. |
| R-10 | Comisiones, monedas y contabilizaciones excepcionales de bancos/emisores. | Medio; cálculo fraudulento si se adivina. | **Mitigado parcialmente.** | Decisión 3A tanda 12 vigente: fechas y montos reales del usuario, vista previa, conciliación y auditoría; excepciones no se aplican solas. Defecto abierto **CA-027 (RF-020)**: falta opción de referencia original en compra en moneda distinta; sin ticket asignado en [05-plan](05-plan-de-implementacion.md) (registrado por F6-07). |
| R-11 | Tipos históricos UYU/USD/EUR insuficientes, fuente caída, fines de semana o límites de API. | Medio/alto; estadísticas falsas. | **Mitigado parcialmente.** | [F5-06](50-cotizaciones-f5-06.md): datosUruguay (BCU) + Frankfurter, caché por fecha ≤, último valor válido con fuente, ingreso manual si falta; cobertura y formatos verificados contra las fuentes públicas (F0-07/F5-06). Falta validar indisponibilidad real en el despliegue; nunca inventar tasa. |
| R-12 | Tipos monetarios JS, precisión de porcentajes, cuotas y conversiones. | Alto; centésimos inventados. | **Mitigado y verificado en local.** | F0-05: dominio rechaza escala/overflow, Money BigInt/string, tres monedas; [F6-01](52-auditoria-67-ca-f6-01.md): CA-007 «100,1251 USD» separado, I-01; `INT:exchange-rates` inmoviliza tasa original. |
| R-13 | Privacidad multicuenta, filtros, backups, exportación y caché de servidor. | **Bloquea producción** ante fuga entre usuarios. | **Mitigado parcialmente.** | [F6-02](53-auditoria-seguridad-f6-02.md): matrices de rutas, páginas, RSC, referencias A/B, exportaciones y copias sin fuga; H03 corregido con migración 0036 (pendiente en Neon); H04 abierto (bajo: escritura de cotizaciones por rol runtime solo con SQL arbitrario). Falta: cabeceras/caché en despliegue y negativas sobre recursos nuevos (p. ej. `/ayuda` de F6-06, con guardia de sesión probada). |
| R-14 | Backups **con contraseña opcional** con cifrado débil, import malicioso o restauración parcial. | Alto; pérdida/exposición de información. | **Mitigado y verificado en local.** | [F6-04](55-backup-recuperacion-f6-04.md): desastre con 45/59 tablas pobladas, restauración idempotente con rollback total, contraseña errónea/tampering/FK rota rechazados; [F6-02](53-auditoria-seguridad-f6-02.md): copia exige token vigente (0036). Residuales: custodia de `FINANCE_BACKUP_SIGNING_KEY`, copia no restaurable entre versiones de esquema, restauración puntual de Neon sin probar. |
| R-15 | PWA offline genera operaciones locales inconexas. | Medio/alto; falsa certeza de saldo. | **Mitigado y verificado en local** (decisión: sin cola offline). | [F6-03](54-pwa-accesibilidad-f6-03.md): CA-065 sin éxito falso, formulario conservado, reintento con el mismo cuerpo; sin IndexedDB/localStorage ni caché de datos privados (probado en PWA instalada de Chrome). Falta iOS/Android reales y entrega push real. |
| R-16 | Inconsistencia de mes/período al viajar entre zonas horarias. | Medio; cuotas/recurrencias en mes erróneo. | **Mitigado y verificado en local.** | [F6-01](52-auditoria-67-ca-f6-01.md): frontera de mes incluida en `test:integration`; CA-028 con medianoche de Montevideo; CA-019/044 períodos futuros sin efectos. Sin recorrido de husos distintos al del servidor. |
| R-17 | Gráficos/bibliotecas y dependencias de uso comercial/costo no verificado. | Medio; deuda técnica/licencias. | **Mitigado y verificado en local.** | Gráficos SVG propios sin SaaS externo ([F6-03](54-pwa-accesibilidad-f6-03.md)); código de Neon Auth descartado eliminado (H05, [F6-02](53-auditoria-seguridad-f6-02.md)); `npm audit --omit=dev` sin vulnerabilidades (F0-04); sin dependencia de pago. |
| R-18 | Falta de especificación visual versionada y reproducción visual aún sin probar. | Medio; divergencia del diseño aprobado. | **Mitigado parcialmente.** | [Guía consolidada](../design/fintrack-visual-spec.md) + [F0-02](10-informe-f0-02.md); [F6-03](54-pwa-accesibilidad-f6-03.md): aserciones de accesibilidad, desborde y contraste, con [capturas](../evidence/f6-03/mobile-menu.png) a 360 px. Falta aceptación humana formal y sesión con lector de pantalla real; no se declara resuelto. |
| R-19 | Conexión de Neon/Google/Vercel requiere credenciales y acciones del titular. | Operativo; no se puede completar sin permisos del dueño. | **Pendiente de verificación — bloqueante para datos reales.** | Acciones del titular: destino HTTPS, credenciales privadas, callback de Google, aplicación autorizada de 0035–0037 en Neon development y prueba con dos cuentas Google reales desde dos dispositivos; supervisión de consumo según [F6-05](56-politicas-cuotas-costes-f6-05.md) §5. |
| R-20 | Backlog amplio genera falsa «MVP completa» al finalizar núcleo. | Medio/alto; expectativas equivocadas. | **Mitigado (control documental).** | Fases y gates vigentes; [57-preparacion-uso-real-f6-07.md](57-preparacion-uso-real-f6-07.md) delimita implementado / probado local / probado en despliegue / no verificado y **no autoriza** el uso real. |

## Evidencia F0-04 — 2026-11-07

Entrega revisable: [PR #3 en borrador](https://github.com/SebastianGonzalez2/finanzas-personales/pull/3), commit `2c12f46`; no constituye cierre de los riesgos.

- **R-01 — En investigación:** [informe y procedimiento](12-informe-f0-04.md), [pruebas locales](../../spikes/neon-auth/tests/admission.test.mjs). Política experimental cubre ambos proveedores, código reutilizable, rotación, revocación y permisos pendientes. Transporte real de admisión en Google/email, webhook configurado y rechazo directo en Neon: **pendientes**; no hay proyecto de prueba, confirmado por el titular.
- **R-02 — No configurado:** métodos OTP/reset compilan; envío, reenvío, expiración, antiabuso y SMTP real **no ejecutados**. No se contrató servicio.
- **R-13 — En investigación:** pruebas sintéticas de aislamiento pasan; no hay pruebas DB A/B. SDK 0.8.2 conserva cookie cacheada con `disableCookieCache: true` boolean; [reproducción](../../spikes/neon-auth/tests/sdk.test.mjs). Debe verificarse sesión fresca y revocación inmediata antes de autorizar datos.
- **R-17 — En investigación:** SDK Apache-2.0 instalado en spike con lockfile; advertencia de peer transitivo fetch 1.3.2/1.3.3, sin override. No declarar compatibilidad runtime completa por compilación de contrato.
- **R-19 — Pendiente:** titular debe preparar Neon Free de prueba y buzones según el informe; no se requieren secretos en Git/chat. Procedimiento de consola documentado, sin configuración real ni facturación.

Resultados ejecutados: `npm ci --ignore-scripts --no-audit --no-fund` (pasa con advertencia de peer), `npm test` (27/27), `npm run typecheck` (pasa), `npm run probe` (salida 2: URL ausente), `npm audit --omit=dev --json` (0 vulnerabilidades reportadas), todos desde `spikes/neon-auth`. Ningún riesgo se marca verificado por estas pruebas locales. Resto de la matriz conserva sus estados.

## Precaución: decisiones anteriores reemplazadas

**Actualización F0-NEON, 2026-11-07:** el entorno de prueba ya existe y el
conector tiene acceso efectivo al proyecto autorizado `dry-voice-45959315`,
solo `development`. Better Auth, esquema administrado y sonda anónima/JWKS
verificados; OTP obligatorio y revocación en reset configurados/releídos.
Altas por correo apagadas provisionalmente, sin afirmar cierre del alta Google.
R-19 parcialmente mitigado; R-01/02/13/17 siguen abiertos. Invitaciones,
revocación real, entregabilidad e integración A/B no probadas. Ver
[evidencia y límites vigentes](17-informe-f0-neon.md); las notas de ausencia
de proyecto anteriores son históricas, no el estado actual.

| Tema | Regla definitiva a implementar |
|---|---|
| Devolución de compra de enero recibida en febrero | **v9.42**: devolución febrero separada, compras y presupuesto febrero **intactos**; no ingreso ordinario. |
| Meta de ahorro alcanzada | **v9.28**: detener futuros aportes automáticos; posteriores reglas de reactivación v9.30, no automatizar de nuevo al disminuir saldo. |
| Copias de seguridad | Reemplazo total de **datos financieros del titular** con validación, no merge; cifrado con contraseña **opcional** v9.46. |
| Presupuestos | Solo mensuales, sin arrastre; excepción de un mes v9.46; sin anual ni etiquetas como presupuesto. |
| Dashboard | Disposición fija, favoritos en sección Estadísticas; sin ocultación con asteriscos. |
| Operaciones futuras | Sin movimientos futuros genéricos planificados; los recurrentes/compromisos usan reglas específicas y no afectan banco sin confirmación real. |
| Planificación funcional | **v9.48**: cerrada. Desarrollar por fases, reglas contables manuales seguras en excepciones, documentación consolidada para Codex. |

## Gate de arranque vs gate de despliegue

**Para comenzar desarrollo técnico F0:** acceso a repo, documentos leídos, herramientas de desarrollo, sin necesidad de saldos reales. **Estado: autorizado por decisión de usuario.**

**Para desplegar con datos privados reales:** deben estar **verificados** R-01/02/03/04/05/06/11/12/13/14/15 según alcance activado, haber pasado los CA críticos y existir plan de recuperación. **Estado: NO verificado; no publicar aún.**

**Para incluir flujos extraordinarios de crédito/FX:** prueba con caso real confirmado, siempre registro manual verificable; si hay ambigüedad, bloquear ese flujo puntual antes que contaminar patrimonio.

## Revisión y actualización

Usar estados: `No iniciado`, `En investigación`, `Verificado con evidencia`, `Bloqueado`, `Mitigado`. Toda actualización añade enlace a PR/commit, comando de test y fecha real; **no** cambiar un riesgo a «verificado» por leer documentación o por aprobar una pantalla. Si un requisito de seguridad resulta imposible sin coste, informar al usuario antes de desviar proveedor o funcionalidad.

## Referencias oficiales para los primeros spikes

- https://nextjs.org/docs/app/getting-started/installation
- https://vercel.com/docs/plans/hobby (uso personal/no comercial y límites; verificar fecha)
- https://neon.com/blog/neon-backend-is-ga (capacidad Managed Better Auth/Free; verificar fecha)
- https://neon.com/blog/neon-auth-branchable-identity-in-your-database (precauciones SDK/Better Auth)
- https://neon.com/docs/ai/ai-rules-neon-auth (skill de Neon para agentes)

Las condiciones cambian: estos enlaces guían una **verificación actual** en F0 y no sustituyen pruebas del proveedor.
