# F0-07 — Viabilidad de proveedores y cotizaciones

Fecha de consulta: **2026-11-07**, America/Montevideo. Estado: investigación documental y pruebas públicas entregadas; **SMTP real y consumo de cuentas no validados**, por lo que F0-07 sigue parcialmente bloqueado. Rama `codex/F0-07-viabilidad-proveedores`, base `origin/main` e493658. Ninguna cuenta, servicio, configuración de facturación ni dato financiero real modificados. F0-04 continúa en su conversación/PR #3 y no se reproduce.

## Vercel

[Hobby](https://vercel.com/docs/plans/hobby) publica: 100 GB transferencia rápida, 10 GB de origen, 1 M solicitudes CDN y funciones, 4 horas CPU activa y 360 GB-horas de memoria. Al superar cupos puede requerir esperar al nuevo ciclo; no equivale a disponibilidad ilimitada. [Fair use](https://vercel.com/docs/limits/fair-use-guidelines) restringe Hobby a uso personal no comercial e incluye como comercial recibir pagos por crear/actualizar/alojar el sitio, cobrar visitantes o publicidad.

**Evaluación técnica condicionada:** finanzas privadas propias/grupo sin explotación comercial parece compatible con el uso descrito; es inferencia, no aprobación contractual de Vercel. Antes de publicar el titular debe confirmar uso concreto y ausencia de lucro/pagos a desarrolladores; ante duda consultar soporte. No se contrató asesoría ni plan, no se creó despliegue. Si no encaja, detener publicación y presentar alternativa gratuita para aprobación; nunca cambiar proveedor o visibilidad silenciosamente.

## Neon Free

[Planes oficiales](https://neon.com/docs/introduction/plans), consultados directamente y no desde snippets antiguos: 100 proyectos, 10 ramas/proyecto, 100 CU-horas/proyecto/mes, hasta 2 CU, 1 GB Postgres/proyecto y 20 GB total, 5 GB transferencia pública/proyecto/mes, Auth hasta 60.000 MAU/proyecto. Suspensión tras 5 minutos inactivo; historia de recuperación hasta seis horas/1 GB de cambios. Compute/egress agotados suspenden servicio hasta renovación o upgrade; límites de almacenamiento hacen fallar operaciones que aumenten uso, no eliminan los datos. No confundir recuperación breve con backup restaurable del titular. La cifra histórica 0,5 GB quedó desactualizada; hay que verificar consola al crear el proyecto.

No existe proyecto Neon de prueba disponible según el informe F0-04. No se midió consumo, recuperación ni aislamiento de una cuenta real. Usar únicamente Free, sin introducir tarjeta ni upgrades; medir tamaño de eventos/auditoría, consultas y arranques en pruebas sintéticas. No prometer cantidad de usuarios sostenible sin medición.

## SMTP y recuperación

[Checklist oficial](https://neon.com/docs/auth/production-checklist): correo compartido para desarrollo; configurar SMTP propio para producción. Códigos de verificación y reset soportan compartido/custom; enlaces de verificación requieren custom. No se publica en la página un cupo contractual numérico del compartido: **no inventar uno**. No configurar webhooks de envío sin proveedor operativo: reemplazan el envío predeterminado ([comportamiento oficial](https://neon.com/docs/auth/guides/customize-emails)).

Opciones gratuitas para evaluar, sin elegir ni crear cuentas:

| Opción | Límite documental y condición | Pendiente |
| --- | --- | --- |
| [Brevo Free](https://help.brevo.com/hc/en-us/articles/208580669-FAQs-What-are-the-limits-of-the-Free-plan) + [SMTP transaccional](https://help.brevo.com/hc/en-us/articles/7924148470546-How-can-I-send-transactional-emails-with-Brevo) | 300 envíos/día; superado cupo puede encolar transaccionales, perjudicando OTP/reset. | Aprobación de cuenta/remitente, condiciones DNS y entrega real; no garantiza resolver sin dominio existente. |
| [Resend Free](https://resend.com/docs/knowledge-base/account-quotas-and-limits) | 100/día y 3.000/mes. [Dominio de prueba](https://resend.com/docs/knowledge-base/403-error-resend-dev-domain) restringe destinatario al correo de la cuenta; uso general requiere dominio verificado. | Si no hay dominio disponible, no comprar uno ni tratar remitente de prueba como producción. |

**Bloqueo R-02/R-19:** el titular debe preparar proyecto Neon Free aislado y un remitente gratuito verificable que ya controle. Secretos solo en consola/entorno local fuera de Git/chat. Coordinar con F0-04 para probar OTP, reenvío/caducidad/límites, recuperación y revocación de sesiones en buzones de test, incluyendo proveedor lento/agotado. Sin ello no habilitar registros reales. No se enviaron mensajes ni se alteró F0-04.

## Cotizaciones: evidencia real, sin integración bancaria

[datosUruguay API](https://datosuruguay.com/api) y [USD](https://datosuruguay.com/api/usd): acceso GET sin clave, series BCU UYU/USD y UYU/EUR, atribución CC-BY-4.0 obligatoria; fechas/limit/offset y errores 429. No hay garantía de SLA; aplicar caché y respetar Retry-After. [Frankfurter v2](https://frankfurter.dev/) amplía monedas; no requiere clave, sin cupo diario/mensual pero con límite antiabuso. Caché permitida.

Se ejecutaron **seis GET reales**, guardados en [evidencia pública](../evidence/f0-07-probe.json), con [probe reproducible](../../scripts/probe-f0-07.mjs). Todas respondieron 200. USD/EUR primarios incluyen fuente/unidad/atribución. Consulta primaria al domingo 2026-11-01 devuelve última observación 2026-10-30; `meta.last_updated` indica noviembre y **no** la fecha de la tasa pedida. Frankfurter v2 devuelve EUR/UYU, incluso con etiqueta de fecha dominical; no asumir calendario BCU ni equivalencia entre fuentes. v1 devuelve 200 y **omite UYU**: no usar v1 como fallback completo.

Contrato pendiente F5-06/CA-060: exigir todos los pares solicitados, tasa positiva, fuente/proveedor/fecha real y fecha <= hecho; congelar tasa usada. Respetar principal → respaldo → última válida anterior en caché → «No disponible», nunca tasa futura/cero/inventada. Registrar fallback y derivación EUR/USD vía UYU cuando haya ambas observaciones compatibles. Los rates JSON de esta evidencia son observaciones públicas, no cálculo contable: el futuro importador debe preservar precisión decimal y redondear explícitamente solo presentación. No se cambia dinero bancario ni original por una equivalencia.

## Pruebas y trazabilidad

- `node --check scripts/probe-f0-07.mjs` y `node --check scripts/verify-f0-07.mjs`: sintaxis.
- `node scripts/probe-f0-07.mjs`: seis solicitudes reales, 200, 2026-11-07.
- `node --test scripts/verify-f0-07.mjs`: cinco verificaciones sobre la evidencia conservada; no simulación de SMTP ni test del integrador futuro.
- `git diff --check`: sin errores al preparar commit.

F0-07, RF-003/046/054, RNF-09/11, CA-004/005/060, I-01/08/12: cobertura documental o de proveedor público, **sin aceptación funcional**. R-03/R-11 investigados con fuentes y muestras; R-02/R-19 bloqueados; no se cierran riesgos por leer páginas. No migraciones, UI ni cambios de permisos. Próximo paso independiente F0-09; publicación depende de R-01/02/03/13 y aprobación humana.
