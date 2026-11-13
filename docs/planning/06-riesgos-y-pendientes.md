# Registro de riesgos y verificaciones antes de implementar

**Cierre técnico F0 — 2026-11-08.** Google-only con Better Auth autogestionado pasó las pruebas reales de rechazo, revocación y aislamiento A/B en development. R-01 y R-13 tienen evidencia para el acceso y la API de preferencias. R-03 conserva la comprobación de uso y consumo del despliegue, y R-19 la configuración HTTPS y la prueba entre dispositivos antes de datos reales. El ADR 0004 retira R-02 del acceso vigente. [Evidencia](25-google-only-f0-04.md) · [Proveedores](13-informe-f0-07.md) · [ADR 0004](../adr/0004-google-only-allowlist-auth.md).

**Corte histórico F0-INTEGRATE.** La auditoría previa describe el origen de la protección de `main` y el estado anterior de la fase. [Integración previa](16-integracion-controlada-f0.md).

**Estado:** evaluación de planificación; **funcionalmente cerrado**, técnicamente **requiere verificación**.  
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
| R-01 | **Google OAuth + Better Auth propio + allowlist**: acceso de terceros, alta directa, cambios de identidad, revocación y sesiones. | **Bloquea acceso real** si el servidor permite crear sesión/usuario no autorizado o filtra datos A/B. | Verificado en desarrollo | Pruebas Google reales A/B, rechazo, revocación y rol limitado. Falta acceso desde otro dispositivo en el destino HTTPS de publicación. |
| R-02 | **Histórico:** envío de OTP/recuperación para cuentas propias con contraseña. | **No aplica** a v9.49: Google gestiona autenticación y recuperación. | Retirado como bloqueo | No implementar SMTP para login ni contratarlo. Si una función futura requiere email, evaluar nuevo riesgo y servicio explícitamente. |
| R-03 | **Vercel Hobby** y condición personal/no comercial, además de cuotas gratuitas; Neon Free/cuotas. | **Bloquea publicación** si uso previsto contraviene términos o requiere plan pago no autorizado. | Políticas y cupos re-verificados documentalmente (2026-11-13) | [F6-05](56-politicas-cuotas-costes-f6-05.md): sin cambios de límites frente a F0-07; sin gasto activado. Falta medición de consumo y adecuación del uso concreto en el despliegue autorizado; no se cierra por leer documentación. |
| R-04 | Corrección retroactiva anterior a saldo bancario manual confirmado. | **Bloquea mutaciones monetarias históricas F1** sin algoritmo seguro. | [F1-05](29-conciliacion-saldos-f1-05.md): algoritmo y CA-015 probados en PostgreSQL local con datos sintéticos. | Aplicación autorizada de la migración y validación del flujo en Neon development pendientes. No compensar con «gasto misterioso». |
| R-05 | Doble débito/gasto por tarjeta, cuotas, pagos mixtos o cobros por tercero. | Alto, integridad financiera. | Diseño de invariantes; sin código | Pruebas I-02/I-04/I-05/I-06; transacciones, validación de asignaciones e idempotencia. Ningún despliegue sin esos tests por etapa. |
| R-06 | Reserva virtual vs banco real, concurrencia, aportes automáticos y pagos de tarjeta. | Alto; mostrar disponible negativo/incorrecto. | Diseño, sin código | Locks o versiones, pruebas concurrentes y de insuficiencia. Reservas y bancos con efectos separados. |
| R-07 | **Reembolso de compra de mes previo** mostrado como gasto negativo del mes receptor. | Alto; contradice confirmación expresa. | Resuelto funcionalmente en **v9.42** | Enero conserva compra; febrero muestra devolución por separado sin modificar **compras febrero ni presupuesto febrero**. Tests CA-028 + Gherkin. Descartar interpretaciones anteriores de v9.40. |
| R-08 | Meta de ahorro alcanzada y pausa automática inconsistente. | Medio/alto; mover dinero no autorizado. | Resuelto funcionalmente en v9.28–v9.30 | Pausar aportes automáticos **al alcanzar meta**; no reactivar sin confirmación aunque luego baje saldo. Reglas posteriores prevalecen sobre notas anteriores. |
| R-09 | Cobros de préstamo simple superior al capital entregado (p. ej., préstamo 10.000 y total pactado 10.500) sin desglose obligatorio de intereses. | Medio; clasificación estadística de 500 potencialmente ambigua. | Decisión **3B tanda 7** confirmada, política exacta de rendimiento no inferible | Mantener total por cobrar y capital entregado histórico; cobrar dinero real una vez. No contabilizar todo como ingreso ordinario, ni clasificar excedente sin fuente confirmada. Documentar criterio técnico al construir informes del caso. |
| R-10 | Comisiones, monedas y contabilizaciones excepcionales de bancos/emisores. | Medio; cálculo fraudulento si se adivina. | Decisión **3A tanda 12**: alcance habitual + excepción manual | Usuario ingresa fechas y montos reales; vista previa, conciliación, auditoría; excepciones fuera de flujo no se aplican solas. Registrar limitación y prueba. |
| R-11 | Tipos históricos UYU/USD/EUR insuficientes, fuente caída, fines de semana o límites de API. | Medio/alto; estadísticas falsas. | Fuentes elegidas, integraciones no validadas | Probar cobertura y tasas de datosUruguay/Frankfurter; guardar última tasa válida <= fecha y fuente; ante falta, marcar no disponible, nunca inventar. |
| R-12 | Tipos monetarios JS, precisión de porcentajes, cuotas y conversiones. | Alto; centésimos inventados. | Diseño numérico propuesto | Decimal seguro, restricciones PG, tests de redondeo y equivalencia; importe original jamás sobrescrito por visualización. |
| R-13 | Privacidad multicuenta, filtros, backups, exportación y caché de servidor. | **Bloquea producción** ante fuga entre usuarios. | RLS y API de preferencias probadas con A/B | Extender pruebas negativas y revisiones de permisos a los recursos nuevos, incluidos importación y exportación. |
| R-14 | Backups **con contraseña opcional** con cifrado débil, import malicioso o restauración parcial. | Alto; pérdida/exposición de información. | Funcional confirmado, implementación no revisada | Usar primitivas estándar, prueba de contraseña errónea y tampering, cargas grandes, validación referencias, reemplazo atómico y versión de esquema. |
| R-15 | PWA offline genera operaciones locales inconexas. | Medio/alto; falsa certeza de saldo. | Descartado funcionalmente | Sin cola de escritura offline; respuesta persistida del servidor obligatoria para éxito. Test CA-065. |
| R-16 | Inconsistencia de mes/período al viajar entre zonas horarias. | Medio; cuotas/recurrencias en mes erróneo. | Diseño pendiente | Fecha de calendario separada de timestamp UTC; tests con fechas de fin de mes y distintos husos. |
| R-17 | Gráficos/bibliotecas y dependencias de uso comercial/costo no verificado. | Medio; deuda técnica/licencias. | Stack base elegido; paquetes adicionales pendientes | Elegir mínimo paquete mantenido y gratuito, testear licencias/compatibilidad/cantidad de dependencias. No enviar datos de gastos a SaaS de gráficos. |
| R-18 | Falta de especificación visual versionada y reproducción visual aún sin probar. | Medio; divergencia del diseño aprobado. | Mitigado parcialmente en F0-02; UI pendiente | 2026-11-07: [guía consolidada](../design/fintrack-visual-spec.md), [evidencia F0-02](10-informe-f0-02.md) y `node docs/design/verify-visual-spec.mjs` para enlaces/contraste. Falta aceptación humana y ejecutar matriz visual móvil/escritorio al implementar F1-01/F6; no se declara resuelto. |
| R-19 | Conexión de Neon/Google/Vercel requiere credenciales y acciones del titular. | Operativo; no se puede completar sin permisos del dueño. | Neon y Google verificados en desarrollo | Configurar credenciales privadas y callback en el destino HTTPS autorizado antes de probar entre dispositivos. |
| R-20 | Backlog amplio genera falsa «MVP completa» al finalizar núcleo. | Medio/alto; expectativas equivocadas. | Controlado con fases | Distinguir demostración interna incremental de producto completo aprobado; conservar todas RF P1/P2 en plan y establecer gates. |

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
