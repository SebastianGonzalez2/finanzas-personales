# F6-05 · Políticas, cuotas y costes de proveedores

[F6-05](05-plan-de-implementacion.md) · R-03 · R-19 (parcial) · RNF-09/11. Rama `codex/F6-05-politicas-cuotas`, creada desde `origin/main` (8c04dc8, incluye F6-01 a F6-03). **Validación documental** de uso permitido y sostenible con límites: políticas y cuotas re-verificadas contra las páginas oficiales vigentes. **Sin activar gasto**: no se crearon cuentas, no se agregó tarjeta, no se cambió de plan, no se desplegó ni se modificó Neon. Conforme a la regla de [riesgos](06-riesgos-y-pendientes.md), leer documentación **no** convierte R-03 en «verificado»: la medición de consumo real queda para el despliegue autorizado.

Consulta: **2026-11-13**, America/Montevideo. Fuentes oficiales con su propia fecha de actualización, citadas por sección. Linea base previa: [F0-07](13-informe-f0-07.md) (2026-11-07).

## 1. Vercel Hobby

[Límites oficiales](https://vercel.com/docs/plans/hobby) (doc actualizada 2026-09-14) — sin cambios respecto a F0-07:

| Recurso | Inclusión mensual Hobby |
| --- | --- |
| Fast Data Transfer | 100 GB |
| Fast Origin Transfer | 10 GB |
| CDN Requests | 1.000.000 |
| Function Invocations | 1.000.000 |
| Active CPU | 4 h |
| Provisioned Memory | 360 GB-h |
| Image Optimization | 5.000 transformaciones; caché 300.000 lecturas / 100.000 escrituras |
| Proyectos | 200; despliegues 100/día; 50 dominios por proyecto |
| Duración máxima de función | 300 s |

- **Superar cuota no genera cargo en Hobby**: hay que esperar al ciclo (30 días; Analytics se pausa antes y retoma a los 7). El efecto es una caída de servicio, nunca una factura.
- [Fair use](https://vercel.com/docs/limits/fair-use-guidelines) (2026-09-14): Hobby es para **uso personal no comercial**. El uso previsto (aplicación privada del titular y su grupo, sin cobros, publicidad ni pagos a desarrolladores) encaja con esa definición; es una **inferencia documental**, no una aprobación contractual de Vercel. Re-verificar el uso concreto del despliegue antes de publicar; ante duda, consultar soporte y no cambiar de proveedor silenciosamente.
- Protección de despliegue: Hobby incluye Vercel Authentication para previews y producción. Si se activa manualmente, probar el callback de Google OAuth contra la protección antes de datos reales.
- Notificaciones de uso: **automáticas** en todos los planes; la configuración de umbrales y [Spend Management](https://vercel.com/docs/pricing/manage-and-optimize-usage) (2026-09-18) son de Pro/Enterprise. El control de Hobby es el panel Usage con proyección del ciclo.

## 2. Neon Free

[Planes oficiales](https://neon.com/docs/introduction/plans) (doc actualizada **2026-11-12**):

| Límite | Free por proyecto |
| --- | --- |
| Proyectos / ramas | 100 proyectos en la organización; 10 ramas por proyecto |
| Compute | 100 CU-h/mes; autoscaling hasta 2 CU; scale to zero tras 5 min (no desactivable) |
| Storage | 1 GB Postgres; **20 GB total en toda la organización** |
| Transferencia pública | 5 GB/mes, **compartida por todos los productos del proyecto** |
| Instant restore | 6 h de historia, máx. 1 GB de cambios; solo desde ramas root |
| Snapshots | **1 manual**; backup programado solo en planes pagos |
| Auth | 60.000 MAU (no aplica: Better Auth es autogestionado, no Neon Auth) |
| Monitoreo | 1 día de retención; sin export; **sin notificaciones de gasto** |
| Otros | Object Storage 5 GB; Functions 1 M invocaciones; soporte comunitario |

**Comportamiento al superar límites** (no borra datos): agotar CU-h o transferencia **suspende el compute** hasta el próximo ciclo (`SQLSTATE 53000`, también falla `pg_dump`); superar 1 GB por proyecto o 20 GB por organización hace **fallar las escrituras** hasta liberar espacio. La exportación con `pg_dump` **cuenta contra la transferencia** del proyecto: hacerla antes de un eventual cambio de plan, no después.

**Precisiones y cambios frente a F0-07:**

1. Egres compartido entre productos del proyecto: la copia por titular de [F6-04](55-backup-recuperacion-f6-04.md) transfiere los datos de Neon a la función (egress de Neon) y de ahí al navegador (transferencia Vercel). Una copia de pocos MB sigue siendo marginal frente a 5 GB; medir tamaño de copia real cuando haya datos.
2. 1 snapshot manual por proyecto es una **segunda línea** puntual (consola, sin costo), complementaria a la copia titular; no sustituye ni automatiza nada.
3. Instant restore 6 h/1 GB **no es backup**; ya está registrado en F0-07 y se mantiene.
4. La app usará un proyecto de desarrollo (`dry-voice-45959315`) y otro de publicación: los límites aplican **por proyecto**, los 20 GB de storage son por organización. Historial permanente con índices y paginación cabe en 1 GB para 5–6 titulares, pero el tamaño real se verifica con datos.
5. Launch no tiene mínimo mensual y no factura < $0.50: ningún argumento para activar facturación; RNF-11 la prohíbe sin aprobación.

## 3. SMTP, dominio y correo

**Sin dependencia vigente:** v9.49 y [ADR 0004](../adr/0004-google-only-allowlist-auth.md) retiraron OTP/SMTP del acceso; la recuperación la gestiona Google. No se contrata SMTP; si una función futura requiere correo transaccional, es un riesgo y servicio nuevo a evaluar explícitamente (R-02, retirado como bloqueo). Opciones gratuitas re-verificadas solo como referencia:

| Proveedor | Cupo Free documentado | Condiciones relevantes |
| --- | --- | --- |
| [Resend](https://resend.com/docs/knowledge-base/account-quotas-and-limits) | 100/día (día **UTC**, reset 00:00) y 3.000/mes; cuenta enviados + recibidos; varios To/CC/BCC cuentan separado | Al agotar cupo responde `429` (`daily_quota_exceeded`) **sin cola ni reintento**; dominio de prueba (`resend.dev`) solo permite destinatario propio de la cuenta; 3 dominios; 10 req/s por equipo; rebote < 4 % y spam < 0,08 % (pausa si se supera); retención de datos 30 días |
| [Brevo](https://help.brevo.com/hc/en-us/articles/208580669-FAQs-What-are-the-limits-of-the-Free-plan) | 300/día, sin rollover | Transaccionales agotado el cupo: cola de reintento de hasta 1.000; siempre agrega sello «Sent with Brevo»; 1 usuario |

El bloqueo histórico de F0-07 se mantiene como documento: sin remitente gratuito ya controlado por el titular, no usar envío real; no comprar dominio.

**Dominio:** la publicación prevista es subdominio gratuito `.vercel.app` con SSL incluido (decisión de producto, §12: «no comprar dominio obligatoriamente»). Vercel Hobby admite 50 dominios personalizados por proyecto sin costo adicional si el titular ya posee uno; Resend exige dominio verificado propio para enviar a destinatarios arbitrarios, con su dominio de prueba restringido al correo de la cuenta.

## 4. Recuperación ante desastres (enlace con F6-04)

- **Primario:** copia firmada/cifrada por titular con versión de esquema exacta ([F6-04](55-backup-recuperacion-f6-04.md), en su rama; prueba de desastre automatizada). Es independiente del proveedor y restaura a la misma versión.
- **Secundario (consola Neon Free, sin costo):** 1 snapshot manual por proyecto y instant restore de hasta 6 h/1 GB de cambios; solo ramas root; su alcance es técnico, no contractual, y no cubre borrados antiguos.
- **No disponible en Free:** backup programado automatizado (solo planes pagos) y ventanas de historia > 6 h. Activarlos requeriría plan pago no autorizado: descartado.

## 5. Alertas y supervisión de consumo

Ninguno de los planes gratuitos ofrece alertas de gasto configurables: Vercel limita umbrales/Spend Management a Pro y Neon Free no tiene spending notifications (solo Launch/Scale) ni retención de métricas > 1 día. El control vigente es **revisión manual programada**, sin código nuevo:

1. **Mensual, antes del cierre del ciclo:** Vercel → Usage (transferencia, invocaciones, CPU activa, proyección); Neon → console del proyecto (CU-h, storage, transferencia); confirmar que el plan sigue siendo Hobby/Free y sin método de pago.
2. **Tras cada despliegue:** revisar picos de invocaciones y cualquier job nuevo (no hay cron implementado; añadir uno exige re-evaluar CPU activa de 4 h).
3. **Registro:** anotar fecha, valores y enlace de evidencia en el ticket de seguimiento; un salto anómalo se investiga antes del siguiente despliegue.
4. **Ante límite agotado:** el servicio se pausa hasta el ciclo (Hobby) o se suspende el compute (Neon Free); no hay cargo — **no** «resolverlo» activando facturación sin autorización (RNF-11); avisar al titular y esperar ciclo o ajustar consumo.

## 6. Sostenibilidad estimada para el uso previsto

Estimación **documental** para 5–6 cuentas allowlist con uso doméstico intermitente; no es medición de consumo (pendiente en el despliegue, R-03):

| Recurso | Límite | Estimación | Margen |
| --- | --- | --- | --- |
| Vercel invocaciones | 1 M/mes | ~10–50 k | Holgado |
| Vercel transferencia | 100 GB/mes | < 1 GB | Holgado |
| Vercel CPU activa | 4 h/mes | < 30 min (funciones cortas, sin cron) | Holgado; vigilable si se agregan procesos pesados |
| Neon CU-h | 100/proyecto/mes | ≪ 100 (scale to zero; compute 0,25 CU admite 400 h) | Holgado salvo consultas muy pesadas |
| Neon storage | 1 GB/proyecto | «MB por proyecto con 5–6 titulares» | Verificar tamaño real con datos |
| Neon transferencia | 5 GB/proyecto/mes | ~MB–decenas de MB (cada página consulta DB; copias suman) | Holgado; vigilar con copias |
| Neon Auth MAU | 60 k | No aplica (Better Auth autogestionado) | — |

El presupuesto declarado de producto se mantiene: **operación sin costos obligatorios**, dentro de cuotas gratuitas, sin disponibilidad garantizada por el proveedor.

## 7. Cobertura y trazabilidad

- Fuentes consultadas 2026-11-13: [Vercel Hobby](https://vercel.com/docs/plans/hobby) (2026-09-14), [Fair Use](https://vercel.com/docs/limits/fair-use-guidelines) (2026-09-14), [Manage usage](https://vercel.com/docs/pricing/manage-and-optimize-usage) (2026-09-18), [Neon plans](https://neon.com/docs/introduction/plans) (2026-11-12), [Resend quotas](https://resend.com/docs/knowledge-base/account-quotas-and-limits), [Brevo Free](https://help.brevo.com/hc/en-us/articles/208580669-FAQs-What-are-the-limits-of-the-Free-plan).
- Relación con requisitos: RNF-11 (sin proveedor pago obligatorio), RNF-09 (límites anti-abuso de proveedor), R-03 (planes y cupos), R-19 parcial (recurso/supervisión del despliegue), CA de export/backup vía F6-04. No hay RF ni CA funcionales nuevos.
- **No se ejecutó** código ni pruebas automatizadas: el ticket no cambia implementación. Verificación de integridad del cambio: `git diff --check` sin errores.
- **No se hizo:** crear/ modificar cuentas, planes, tarjetas ni facturación; despliegues; consultas de escritura a Neon; cambios de configuración del proyecto `dry-voice-45959315`.
- Pendiente explícito (no de este ticket): medir consumo real del despliegue autorizado y probar HTTPS entre dispositivos (R-19, puerta previa a datos reales, según AGENTS.md).

## 8. Estado de riesgos tras este ticket

| ID | Cambio |
| --- | --- |
| R-03 | Políticas y cupos **re-verificados con fuentes oficiales** (2026-11-13): [este informe](56-politicas-cuotas-costes-f6-05.md). Sigue sin ser «verificado»: falta consumo real del despliegue autorizado. |
| R-19 | Sin cambio directo; supervisión manual de consumo definida en §5 como insumo para el despliegue. |
| R-02/R-11 | Sin cambio: SMTP sigue sin dependencia (R-02) y las fuentes de cotización mantienen su evaluación en [F0-07](13-informe-f0-07.md)/[F5-06](50-cotizaciones-f5-06.md). |
