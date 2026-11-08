# F0-COORD — Estado verificado de F0

**Estado vigente:** [integración controlada F0-INTEGRATE](16-integracion-controlada-f0.md). Los siete PR previos a #8 ya se fusionaron bajo autorización posterior; main tiene protección activa. Las tablas siguientes son históricas y no declaran pendientes esos merges ni vigente la ausencia de protección.

**Fecha:** 2026-11-07, America/Montevideo. **Alcance autorizado:** continuar pendientes sin repetir F0-02/F0-03 ni intervenir F0-04; priorizar F0-06/07/09. Este registro distingue entrega, revisión y aceptación. Ningún merge, despliegue, servicio pago ni modificación de datos reales realizados.

**Corte histórico:** las tablas siguientes registran la entrega F0-COORD previa a la revisión posterior. Los heads, correcciones, pruebas reejecutadas y orden de integración vigentes se encuentran en la [auditoría F0-REVIEW](15-auditoria-integracion-f0.md). No interpretar los SHA históricos de esta tabla como los heads actuales después de las correcciones.

## Inspección inicial y aislamiento

Se leyeron AGENTS, README/handoff y `docs/planning/0*.md`, modelo/CA/riesgos y decisiones del producto v9.48. `git fetch origin`, estado, ramas, log, diferencias con main, worktrees y PR reales inspeccionados. Base `origin/main`: e493658. Directorio compartido limpio en F0-04/a3401bd, conservado sin cambiar rama ni archivos. F0-02/03/04 tienen PR abiertos #1/#2/#3, no están fusionados; F0-01 tiene informe local versionado y no se repitió.

Lista de chats consultada: `[F0-02] Diseño visual`, `[F0-03] Esqueleto Next.js`, `[F0-04] Investigar Neon Auth e invitaciones`, junto al chat inicial de F0-01 y este coordinador. No se encontraron chats sobre F0-06/07/09 al comenzar. F0-04 se reservó a su conversación aunque aparecía inactiva. Se usaron worktrees distintos dentro del directorio autorizado de artefactos, sin agentes adicionales, merges locales/remotos, rebase ni push forzado. El título del coordinador incluye F0-COORD. El usuario autorizó expresamente coordinar varios tickets en este chat; las entregas conservan rama/commits/PR separados por ID.

## Tabla de tickets

| Ticket | Estado real | Cambios/evidencia | Pruebas | Rama | Head / PR |
| --- | --- | --- | --- | --- | --- |
| F0-01 | Informe local previo; aceptación no verificada | Inventario existente, no repetido. No está incorporado a main. | Evidencia histórica del informe; no se ejecutó de nuevo. | `codex/f0-01-revision-inicial` | d4f7d85; sin PR encontrado |
| F0-02 | En revisión previa | Especificación visual existente, no modificada. | Evidencia previa: 35 enlaces/54 contrastes, sin UI funcional. | `codex/F0-02-diseno-visual` | 43754b2; [PR #1](https://github.com/SebastianGonzalez2/finanzas-personales/pull/1) |
| F0-03 | En revisión previa | Scaffold existente, no repetido. Reutilizado como base F0-06. | Informe previo de check/build/dev; check/build revalidados con F0-06. | `codex/F0-03-scaffold-nextjs` | 2be0fbb; [PR #2](https://github.com/SebastianGonzalez2/finanzas-personales/pull/2) |
| F0-04 | En curso reservado; validación real pendiente | Spike e informe en conversación ajena, no modificados. | Informe previo: 27/27, SDK typecheck; no prueba Neon real. No se repitieron. | `codex/F0-04-neon-auth-invitaciones` | a3401bd; [PR #3 borrador](https://github.com/SebastianGonzalez2/finanzas-personales/pull/3) |
| F0-05 | Bloqueado para entorno Neon; no iniciado | No hay proyecto Neon test disponible según F0-04. No se creó DB, ORM ni migración. | Ninguna de aplicación. PostgreSQL temporal de F0-06 no sustituye este ticket. | Sin rama | Sin commit/PR |
| F0-06 | Infraestructura entregada; falta protección efectiva | CI de app, PostgreSQL temporal y E2E; documentación y aislamiento de spikes. | Check pasa; unidad 3/3, DB real 1/1, E2E 2/2; CI positivo y negativo comprobados. Audit 0 avisos. | `codex/F0-06-ci-tests` | c05c80c; [PR #4 borrador](https://github.com/SebastianGonzalez2/finanzas-personales/pull/4), base #2 |
| F0-07 | Parcialmente bloqueado | Fuentes oficiales/cupos, SMTP y fallback; seis muestras públicas con atribución. | Seis GET 200; cinco verificaciones de evidencia; sintaxis pasa. SMTP no ejecutado. | `codex/F0-07-viabilidad-proveedores` | e60abc1; [PR #5 borrador](https://github.com/SebastianGonzalez2/finanzas-personales/pull/5) |
| F0-08 | Prototipo puro en revisión; integración pendiente | Motor bancario/checkpoints y corrección auditada sin efectos compensatorios. Dependencia F0-09 comprobada antes de empezar. | 16/16 (7 nuevos + 9 base), 48/48 en tres husos y tipos; CI verde. | `codex/F0-08-prototipo-checkpoints` | 27bc3fc; [PR #7 borrador](https://github.com/SebastianGonzalez2/finanzas-personales/pull/7), base #6 |
| F0-09 | Entrega técnica en revisión | ADR de convenciones/amenazas; contratos exactos de dinero/fechas/pertenencia. No autentica ni persiste. | Tipos, 9/9, 27/27 en tres husos; CI verde. | `codex/F0-09-contratos-seguridad` | 353764a; [PR #6](https://github.com/SebastianGonzalez2/finanzas-personales/pull/6) |

Estados al inspeccionar los PR: todos abiertos, ninguno fusionado. Las evidencias previas de F0-01/02/03/04 se leyeron en informes/commits/chats; no se atribuyen como ejecución nueva de esos tickets.

## Commits nuevos y evidencia de CI

- F0-06: `14b8ff3` configura CI y centinela deliberado; `36b62d4` lo retira después de comprobar fallo; `c05c80c` separa checks de app/spikes. [CI negativo 42405689022](https://github.com/SebastianGonzalez2/finanzas-personales/actions/runs/42405689022) falla exactamente en el centinela, DB pasa. [CI final 42406241091](https://github.com/SebastianGonzalez2/finanzas-personales/actions/runs/42406241091) pasa ambos jobs en c05c80c. El centinela no está en el head final.
- F0-07: `e60abc1`; [informe](https://github.com/SebastianGonzalez2/finanzas-personales/blob/e60abc13c097086b741393ec9f19902c62d2c313/docs/planning/13-informe-f0-07.md) y evidencia pública. Frankfurter v1 omite UYU pese al 200; v2 responde EUR/UYU. No se implementó integrador financiero.
- F0-09: `7cc60ea` contratos/ADR; `e3fcafc` aislamiento/formato; `353764a` corrige aceptación de terminadores de línea en parseo monetario y añade regresión. [CI final 42406302014](https://github.com/SebastianGonzalez2/finanzas-personales/actions/runs/42406302014) verde.
- F0-08: `27bc3fc`; [CI 42406650768](https://github.com/SebastianGonzalez2/finanzas-personales/actions/runs/42406650768) verde. La proyección conserva dos anclas y saldo actual 990 tras corregir febrero -100 → -150; devuelve diferencia +50 en marzo y auditoría, sin movimiento inventado.

Los cuatro worktrees técnicos quedaron limpios y publicados. Se comprobaron diff/whitespace, enlaces locales y patrones de claves privadas/tokens en los nuevos cambios, sin hallazgos. Esta revisión de patrones no se presenta como auditoría exhaustiva de secretos. No se cambió UI. Las pruebas móviles de CI son Chromium a 390 px, no certificación de Safari/Android nativos.

## Bloqueos y acciones del titular

1. **Neon/Auth/DB — R-01/R-13/R-19:** preparar proyecto **Free de prueba aislado**, sin datos reales, y coordinar F0-04. No publicar secretos en Git/chat; usar consola/entorno privado. Aún faltan alta real por ambos métodos/invitación/OTP/recovery/revocación y DB con aislamiento A/B/migraciones reproducibles. F0-05 no se empieza contra producción ni sin entorno seguro.
2. **SMTP — R-02:** remitente gratuito verificable y buzones de test para entrega, expiración, reenvío/abuso y recuperación. Elegir proveedor/dominio solo tras confirmar condiciones; cualquier compra o cambio del stack necesita autorización nueva. Documentado en PR #5, sin repetir implementación F0-04.
3. **Merge — F0-06:** main privado sin protección (API 404) ni rulesets (`[]`). Los checks fallan/pasan correctamente, pero **no se demostró impedir merge**. Revisar disponibilidad del plan; después de integrar scaffold/CI por decisión humana, configurar checks obligatorios `F0 quality`/`F0 database` y comprobar bloqueo efectivo. No se compró plan, cambió visibilidad ni intentó merge de prueba.
4. **Revisión técnica:** revisar ADR F0-09, orden temporal/prototipo F0-08, uso concreto no comercial para Hobby y límites residuales. F0-08 no implementa métricas/UI, persistencia, idempotencia DB ni restricciones de reservas/deudas; no habilita mutaciones reales.

Los PR #4 y #7 se apilan para que el diff contenga solo su ticket. Revisar #2 antes de #4 y #6 antes de #7; luego actualizar la base/compatibilidad por decisión humana, sin automatizar merge. Los PR #5 y coordinación son documentales/independientes de main.

## Puerta de fase

**F0 sigue abierta; no iniciar F1 ni uso real.** No basta con CI verde o primitivas locales: falta validar identidad/SMTP/DB y aislamiento real, condiciones de cuenta/proveedor, protección de merge y tratamiento completo de operaciones. RF/CA/invariantes y cobertura parcial se detallan en cada PR y ADR. No se declara resuelto un riesgo por leer documentación ni por crear una rama.
