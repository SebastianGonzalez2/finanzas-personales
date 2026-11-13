# F6-07 · Auditoría final de riesgos y preparación del cierre

[F6-07](05-plan-de-implementacion.md) · Etapas A y B. Revisión de R-01–R-20 con la
evidencia real de F6-01 a F6-06, verificaciones adicionales y checklist de
cierre. **Este documento no aprueba el uso de datos financieros reales.** La puerta
final es la prueba HTTPS entre dispositivos con cuentas Google reales
([R-19](06-riesgos-y-pendientes.md)). La decisión por nivel está en la
[sección 0](#0-decisión-técnica-final-etapa-b).

## 0. Decisión técnica final (Etapa B)

| Nivel | Estado | Fundamento |
| --- | --- | --- |
| Pruebas y demostraciones **locales** con datos sintéticos | **Listo** | CI verde en `main` (`9a4a2e2`) y en esta rama (6 de 6 flujos, incluida `F0 database`); 67 CA: 60 PASS, 1 FAIL (CA-027, no afecta saldos), 6 PARTIAL por proveedor simulado. Revisión de código de la Etapa B sin defectos de seguridad ni de integridad. Salvedad: la Ayuda de F6-06 está en el PR #64, no en `main`. |
| Pruebas **controladas en un despliegue autorizado** (solo datos sintéticos, cuentas del titular) | **Condicionado a acciones del titular; sin bloqueo de código** | No hay defecto abierto que lo impida, pero nada se ha ejecutado en un destino: faltan proyecto de publicación, credenciales, callback de Google, rama de Neon con 0035–0037 (ADR 0004) y `CRON_SECRET`. El despliegue **es** el instrumento para cerrar H01/H02, cabeceras y R-19. |
| **Uso real con datos financieros** | **Bloqueado** | R-19 sin ejecutar; migraciones 0035–0037 sin aplicar en Neon (última comprobación documentada: hasta 0034); H01/H02, `Cache-Control`, revocación y aislamiento sin comprobar en un destino real; copia inicial y clave de firma sin establecer; rama de Neon destinataria de datos reales sin decidir. **No aprobado.** |

Resultado de la revisión crítica de la Etapa B (lectura de código, sin repetir
suites): no se encontró ninguna vulnerabilidad ni defecto de integridad en el
alcance de F6-07. Se corrigieron **tres imprecisiones de evidencia** en la Etapa A
(cron real, nombres de variables de entorno y estado de CI de #64); todas son
documentales y están reflejadas abajo. No hay ticket de seguimiento de seguridad
por abrir; los seguimientos propuestos están en la [sección 12](#12-seguimiento-sugerido).

Método: reutilización de evidencias comprobables por informe y por commit;
verificaciones adicionales **solo de lectura** (Git, GitHub API, inventario de
migraciones). No se ejecutaron suites repetidas para el mismo commit y entorno, no
se modificó lógica monetaria, autenticación, RLS ni infraestructura, y no se
conectó a Neon. Cierre del registro: [06-riesgos-y-pendientes.md](06-riesgos-y-pendientes.md).

## 1. Estado de integración al cierre (2026-11-13)

| Ticket | Entrega | Integración |
| --- | --- | --- |
| F6-01 Auditoría 67 CA | [PR #59](https://github.com/SebastianGonzalez2/finanzas-personales/pull/59), [informe](52-auditoria-67-ca-f6-01.md) | Integrado en `main` |
| F6-02 Seguridad | [PR #60](https://github.com/SebastianGonzalez2/finanzas-personales/pull/60), [informe](53-auditoria-seguridad-f6-02.md) | Integrado en `main` |
| F6-03 PWA/accesibilidad | [PR #61](https://github.com/SebastianGonzalez2/finanzas-personales/pull/61), [informe](54-pwa-accesibilidad-f6-03.md) | Integrado en `main` |
| F6-04 Backup/recuperación | [PR #62](https://github.com/SebastianGonzalez2/finanzas-personales/pull/62), [informe](55-backup-recuperacion-f6-04.md) | Integrado en `main` |
| F6-05 Políticas/cuotas | [PR #63](https://github.com/SebastianGonzalez2/finanzas-personales/pull/63), [informe](56-politicas-cuotas-costes-f6-05.md) | Integrado en `main` |
| F6-06 Ayuda/tutorial | [PR #64](https://github.com/SebastianGonzalez2/finanzas-personales/pull/64) en borrador | **No integrado** (dependencia abierta) |

- `main` en `9a4a2e2` (fusión de #62, contiene #59–#63). Los cinco flujos de CI
  (`F0 CI`, `auth spike`, `contracts`, `provider evidence`, `visual documentation`)
  pasaron sobre esa punta el 2026-11-13T17:47Z (ejecuciones 43476239817, -39742,
  -39877, -39914, -39747).
- PR #64 (F6-06): rama `codex/F6-06-ayuda-onboarding`, commits `f23330a`,
  `aed7bcc`, `05cb03d`. Checks consultados: `quality`, `auth spike`, `contracts`,
  `provider evidence`, `visual documentation` y `F0 database` SUCCESS
  (reconsultado en la Etapa B, 2026-11-13). Su evidencia (167/167 unitarias,
  verificación manual del tutorial) se cita desde el PR.
- **Dependencia:** mientras #64 no se integre, la punta de `main` no contiene la
  Ayuda ni el tutorial. Los controles afectados (prueba de almacenamiento
  `security-f6-02`, navegación) ya se ajustaron en ese PR; repetir CI completa
  tras la fusión. **El producto no se declara cerrado por anticipado.**
- Migraciones versionadas en el árbol: hasta `0037_F5-08_delete_account.sql`.
  Última comprobación documentada de Neon development (F6-02 §12.1): registra
  hasta `0034_F5-07`; `0035` (F5-09), `0036` (F6-02) y `0037` (F5-08) **quedan
  pendientes de aplicación autorizada**. En este ticket no se inspeccionó Neon.

## 2. Matriz de los 20 riesgos

Clasificación: MV = mitigado y verificado; MP = mitigado parcialmente; PV =
pendiente de verificación; NA = no aplicable por decisión vigente. «Verificado»
significa **en entorno local/desechable o CI**: ninguna fila está verificada en el
despliegue real. Detalle por fila en [06-riesgos-y-pendientes.md](06-riesgos-y-pendientes.md).

| ID | Clasificación F6-07 | Evidencia principal | Lo que falta | Severidad para uso real |
| --- | --- | --- | --- | --- |
| R-01 | MP | CA-002–005 PARTIAL con proveedor simulado; matrices de cookies/revocación de F6-02; cierre F0 | Google real + HTTPS + 2 dispositivos (R-19) | Alto: sin esto no hay acceso autorizado comprobado en destino |
| R-02 | NA | v9.49 + ADR 0004; F6-05 §3 | Nada (no implementar SMTP) | Ninguna |
| R-03 | MP | [F6-05](56-politicas-cuotas-costes-f6-05.md) re-verificación documental 2026-11-13 | Medición de consumo real en el despliegue | Medio: caída de servicio por cuota, sin cargo |
| R-04 | MV (local) | CA-011/015/018 PASS; checkpoints intactos, sin «gasto misterioso» | Aplicar 0035–0037 en Neon y repetir flujo allí | Alto si se usa con historial sin migrar |
| R-05 | MV (local) | CA-020–026 PASS; idempotencia 201/200/409 (I-11) | Controles en destino | Alto: duplicar gasto rompe patrimonio |
| R-06 | MV (local) | CA-038–041; locks, rollback, revalidación concurrente | Controles en destino | Alto: disponible incorrecto |
| R-07 | MV (local) | CA-028 PASS con frontera de Montevideo; compras/presupuesto febrero intactos | Controles en destino | Alto: decisión expresa v9.42 |
| R-08 | MV (local) | CA-040/050; pausa al alcanzar meta, sin reactivación automática | Controles en destino | Medio/alto |
| R-09 | MV (local) | CA-033/034; sobrecobro rechazado 409; sin ingreso ordinario | Controles en destino | Medio |
| R-10 | MP | 3A tanda 12 (excepción manual); **CA-027 (RF-020) FAIL abierto**, sin ticket asignado | Ticket funcional de referencia original | Medio: estadística, no saldo |
| R-11 | MP | [F5-06](50-cotizaciones-f5-06.md): doble fuente, caché ≤ fecha, último valor válido, ingreso manual | Indisponibilidad real en despliegue | Medio/alto: estadísticas, no saldos |
| R-12 | MV (local) | F0-05 dominio exacto; CA-007 «100,1251 USD»; I-01 | Controles en destino | Alto |
| R-13 | MP | Matrices F6-02 sin fuga A/B; H03 cerrado por 0036; **H04 abierto (bajo)** | Cabeceras/caché en despliegue; negativas sobre recursos nuevos | **Alto: bloquea producción ante fuga** |
| R-14 | MV (local) | [F6-04](55-backup-recuperacion-f6-04.md): desastre 45/59 tablas, rollback total, tampering rechazado | Custodia de clave de firma; copia tras cada migración financiera; restauración puntual de Neon sin probar | Alto: pérdida de datos |
| R-15 | MV (local) | [F6-03](54-pwa-accesibilidad-f6-03.md): sin cola offline, sin éxito falso, CA-065 | iOS/Android reales; push real | Medio/alto: falsa certeza de saldo |
| R-16 | MV (local) | Frontera de mes en `test:integration`; CA-028; CA-019/044 | Husos distintos al del servidor | Medio |
| R-17 | MV (local) | SVG propio sin SaaS; H05 eliminó Neon Auth; `npm audit` 0 | Revisar dependencias nuevas futuras | Medio |
| R-18 | MP | Guía consolidada + aserciones y capturas de F6-03 | Aceptación humana formal; lector de pantalla real | Medio: divergencia visual, no datos |
| R-19 | **PV / bloqueante** | Requiere acciones del titular | Todo el paquete del destino HTTPS | **Bloqueante para datos reales** |
| R-20 | Mitigado (documental) | Fases y gates; este informe delimita estados | Mantener delimitación al comunicar | Medio/alto: expectativas |

Conteo: MV 11 (R-04, R-05, R-06, R-07, R-08, R-09, R-12, R-14, R-15, R-16, R-17) ·
MP 6 (R-01, R-03, R-10, R-11, R-13, R-18) · PV/bloqueante 1 (R-19) · NA 1 (R-02) ·
control documental 1 (R-20). Ningún riesgo histórico se declaró resuelto por notas
antiguas: todos los cambios de estado citan evidencia de F6-01–F6-07.

## 3. Riesgos bloqueantes para usar datos reales

1. **R-19 (principal):** no existe destino HTTPS autorizado con credenciales,
   callback de Google y prueba con dos cuentas reales desde dos dispositivos.
   Todo lo demás depende de completar esto primero.
2. **Migraciones no aplicadas en Neon:** `0035_F5-09`, `0036_F6-02` y `0037_F5-08`
   según la última comprobación documentada. Sin `0036` la app desplegada usa la
   firma vieja de copia (reabre H03) y sin `0035`/`0037` faltan tablas/funciones
   del esquema vigente. Requieren proceso ADR 0004 (SQL exacto, destino, impacto,
   SHA-256, aprobación específica).
3. **R-13 en el destino:** la ausencia de fuga está probada en local; las
   cabeceras de seguridad (H02) y el límite por IP (H01) solo se acreditarán en
   un despliegue de vista previa/producción. Antes de datos reales.
4. **R-01/R-03/R-04 en el destino:** revocación real, consumo y conciliación con
   el esquema migrado se re-verifican en el destino como parte del gate.
5. **Cron sin `CRON_SECRET` (hallazgo de la Etapa B):** `vercel.json` programa
   `/api/cron/contributions` (aportes programados a fondos, afecta dinero) y
   `/api/cron/card-push`, ambos diarios. `authorizedCron` exige `CRON_SECRET` de al
   menos 16 caracteres y responde 401 si falta o no coincide: es **seguro por
   defecto**, pero sin ese secreto los aportes programados no se ejecutan y no hay
   aviso visible. Debe configurarse antes de cualquier uso con aportes programados y
   comprobarse con una ejecución real (§9).

No son bloqueantes de datos pero sí pendientes de producto: CA-027 (RF-020),
límites de R-14 y los residuales de R-11/R-15/R-16/R-18.

## 4. Riesgos residuales aceptables o pendientes (no bloqueantes)

| Residual | Origen | Tratamiento propuesto |
| --- | --- | --- |
| CA-027 (RF-020): sin opción de referencia original en compras en moneda distinta | [F6-01](52-auditoria-67-ca-f6-01.md) §3 | Ticket funcional antes o después del despliegue; no afecta saldos (cargo registrado una sola vez) |
| H04: rol runtime puede insertar cotizaciones de referencia con SQL arbitrario | [F6-02](53-auditoria-seguridad-f6-02.md) §12 | Riesgo documentado y aceptado; requiere compromiso del rol runtime para explotarse |
| Copias no restaurables entre versiones de esquema; sin conversión | [F6-04](55-backup-recuperacion-f6-04.md) §3 | Rutina: descargar copia nueva tras cada migración financiera |
| 14 tablas sin filas en la prueba de desastre | [F6-04](55-backup-recuperacion-f6-04.md) §4 | Mismo mecanismo genérico verificado; repetir el desastre si se activan módulos nuevos |
| Límite de tamaño de copia sin medir con datos reales; sin cron de copias | [F6-04](55-backup-recuperacion-f6-04.md) §6, [F6-05](56-politicas-cuotas-costes-f6-05.md) §5 | Medir en la primera etapa de uso. Hay dos crons diarios de aportes y push (F3-03/F4-05, ver §3.5); un tercero exige re-evaluar CPU activa |
| Entrega push real y PWA en iOS/Android; lector de pantalla | [F6-03](54-pwa-accesibilidad-f6-03.md) §9 | Prueba con dispositivos del titular; no es gate de integridad |
| Indisponibilidad real de fuentes de cotización en despliegue | R-11 | La lógica local ya cae a último valor válido o manual; observar la primera indisponibilidad |
| Aceptación humana de la especificación visual | R-18 | Sesión de revisión del titular; opcional antes de datos reales |

## 5. Pruebas existentes aprovechadas (sin re-ejecutar)

Reutilizadas por commit y entorno, conforme a la regla de no repetir suites:

| Ticket | Evidencia reutilizada | Resultado registrado |
| --- | --- | --- |
| F6-01 | `test:integration` 107/107; Playwright finanzas 74/74 ×2 viewports; acceso 18/18; `test:unit` 126/126; `npm run check`; matriz 67 CA (60 PASS, 1 FAIL CA-027, 6 PARTIAL) | [52-auditoria-67-ca-f6-01.md](52-auditoria-67-ca-f6-01.md) |
| F6-02 (etapa B) | `check` OK; unit 145; integration 131; e2e 18; finanzas 84; escaneo de secretos en repo, build y logs = 0 coincidencias | [53-auditoria-seguridad-f6-02.md](53-auditoria-seguridad-f6-02.md) §12.3 |
| F6-03 | unit 152/152; integration 131/131; acceso 36/36 Chrome+Edge; finanzas 98 Chrome; PWA instalada en Chrome escritorio con privacidad A/B | [54-pwa-accesibilidad-f6-03.md](54-pwa-accesibilidad-f6-03.md) §8 |
| F6-04 | unit 157/157; integration 134/134 (desastre, deriva de inventario); exports 4/4 | [55-backup-recuperacion-f6-04.md](55-backup-recuperacion-f6-04.md) §5 |
| F6-05 | Re-verificación documental de políticas y cuotas con fuentes oficiales 2026-11-13 | [56-politicas-cuotas-costes-f6-05.md](56-politicas-cuotas-costes-f6-05.md) |
| F6-06 (PR #64) | unit 167/167; lint/typecheck/format/build; `/ayuda` sin sesión redirige 307; manual del tutorial en escritorio y móvil | PR #64 (borrador) |
| Integración | CI de `main` `9a4a2e2`: 5 flujos success 2026-11-13 | ejecuciones listadas en §1 |

## 6. Verificaciones adicionales ejecutadas en F6-07

Todas de lectura, sin modificación de código, datos ni servicios:

1. **Topología de integración:** ramas, PRs (#59–#64) y merge-base; confirmado
   que F6-05 está en `main` y F6-06 no (`git log origin/main..HEAD`).
2. **CI:** estado de los flujos sobre `9a4a2e2` (verde) y del PR #64 (5 success,
   1 en curso) vía GitHub API.
3. **Inventario de migraciones:** `0030`–`0037` versionadas; estado documentado de
   Neon (hasta `0034`) en F6-02 §12.1 → tres migraciones pendientes de aplicación
   autorizada. No se consultó Neon.
4. **CA-027:** búsqueda en `05-plan-de-implementacion.md` sin resultados → defecto
   abierto sin ticket asignado (dado de alta en el registro, R-10).
5. **Registro de riesgos:** `grep` en `tests/` sin referencias al documento → su
   edición no rompe pruebas automatizadas de documentación.

No se ejecutaron suites completas: la evidencia por rama/PR y el CI verde de la
punta integrada cubren el mismo código y entorno; la punta de esta rama solo
agrega documentación.

### 6.1 Verificaciones de la Etapa B (contraste con el código)

Lectura dirigida del código vigente, sin ejecutar suites repetidas ni tocar Neon:

| Control | Comprobado en | Resultado |
| --- | --- | --- |
| Acceso Google-only, sin contraseña ni alta directa | `google-auth-factory.ts`: `emailAndPassword` deshabilitado, `disableIdTokenSignIn`, vinculación de cuentas, cambio de correo y borrado de usuario deshabilitados; `validateUserInfo` y hooks de creación exigen correo verificado, `sub` del ID token verificado y fila habilitada de la allowlist; un rechazo borra las sesiones del `sub` | Coincide con CA-001–005 y v9.49 |
| Sesión y propietario en servidor por solicitud | `google-auth.ts`: `getSession` sin caché de cookie, y `withGoogleOwner` llama `app_access.authorize_session(token)`; la función (`0003_F0-04`) exige sesión no vencida, `allowlist.enabled`, correo verificado y `sub` coincidente | La revocación de la allowlist corta el acceso en la siguiente solicitud |
| Origen y cookies | `authOrigin` solo admite `https:` o `http://localhost:<puerto>`; cookies `httpOnly`, `sameSite=lax`, `secure` y prefijo seguro bajo HTTPS; sesión de 7 días sin renovación | Sin camino a cookies inseguras en un despliegue HTTPS |
| Límite por IP (H01) | `google-http.ts`: solo se reenvía `x-vercel-forwarded-for` si es IP válida y el runtime es Vercel; la cabecera entrante se borra | Correcto en código; **la inyección real de la cabecera solo se comprueba en Vercel** |
| Cabeceras (H02) | `next.config.ts`: CSP (`frame-ancestors 'none'`, `object-src 'none'`), `X-Frame-Options`, `nosniff`, `no-referrer`, `Permissions-Policy` | Correcto en código; falta comprobarlas en el dominio real |
| Cron | `google-cron.ts`: `CRON_SECRET` ≥ 16 y `timingSafeEqual`; el ciclo recorre solo titulares habilitados y `cron_owner_is_active()` | Seguro por defecto; ver §3.5 |
| Migración 0036 | SHA-256 recalculado del archivo: `8ba70ab3…cdb017`, igual al registrado en F6-02 §12.1 | Coincide |
| RLS de lo nuevo | `0035` activa `ENABLE` y `FORCE ROW LEVEL SECURITY` en `bank_benefits`; `0036` y `0037` no crean tablas con titular (F6-04 §1) | Sin tabla nueva sin RLS |
| Estado de CI | Los 6 flujos de la rama de este PR y los 6 de #64: SUCCESS (consulta GitHub, 2026-11-13) | Sin regresión en la rama |

Las matrices de fuga A/B, la restauración completa y el escaneo de secretos
(F6-02, F6-04) se aceptan por su evidencia de CI; este ticket no las repite.

## 7. Delimitación de estados (los cuatro niveles)

1. **Código funcionalmente implementado:** todos los RF y CA de F0–F5 y F6-01–F6-03
   (67 CA: 60 PASS); Ayuda/tutorial de F6-06 implementados en PR #64 (no integrados);
   sin cola offline, sin movimientos futuros genéricos, sin conciliación bancaria
   automática (la conciliación es manual contra saldo confirmado).
2. **Seguridad probada en entorno local/desechable:** aislamiento A/B y RLS en
   matrices F6-02; revocación/cierre; exportaciones y copias con tampering
   rechazado; recuperación completa F6-04; sin fuga de secretos en repo/build/logs;
   PWA instalada en Chrome escritorio sin almacenamiento privado. CI verde sobre
   `main` integrada.
3. **Seguridad probada en despliegue real:** **nada todavía.** No hay despliegue
   auditado: cabeceras H02, límite por IP H01, `Cache-Control` real, callback de
   Google, revocación con proveedor real y aislamiento entre titulares en el
   destino quedan pendientes de la primera publicación autorizada.
4. **Condiciones todavía no verificadas:** HTTPS con dos cuentas Google reales y
   dos dispositivos (R-19); consumo real Vercel/Neon (R-03); migraciones
   0035–0037 aplicadas en Neon; PWA/push en dispositivos reales (R-15); entrega
   de cotizaciones con fuente caída (R-11); restauración puntual de Neon;
   aceptación humana visual y lector de pantalla (R-18); volumen real de copias.

## 8. Dependencias de despliegue (acciones del titular)

| # | Acción | Detalle |
| --- | --- | --- |
| 1 | Aplicar migraciones en Neon development | `0035` → `0036` → `0037` en ese orden, proceso ADR 0004 (SHA-256 de `0036`: `8ba70ab3…cdb017`); sin producción |
| 2 | Proyecto de publicación en Vercel | Plan Hobby sin método de pago; protección de preview decidida (probar callback de Google si se activa) |
| 3 | Credenciales privadas | Variables que lee el código: `GOOGLE_AUTH_READY=true`, `GOOGLE_AUTH_ORIGIN` (origen HTTPS exacto, sin barra final), `GOOGLE_AUTH_SECRET` (≥ 32 caracteres), `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_AUTH_DATABASE_URL` y `GOOGLE_FINANCE_DATABASE_URL` (roles de runtime separados, nunca el propietario de migraciones), `CRON_SECRET` (≥ 16; **necesario**, hay dos crons diarios en `vercel.json`) y `FINANCE_BACKUP_SIGNING_KEY` (32 bytes hex, respaldada fuera del repo). Nunca en Git ni en chat |
| 3b | Rama de Neon para datos reales | Decidir explícitamente qué rama aloja datos reales (hoy solo existe `development`, con datos sintéticos). Cualquier SQL en una rama de producción exige autorización ADR 0004 específica; aprovisionar las contraseñas de los roles de runtime con los scripts del repositorio (`auth:google:runtime`) |
| 4 | Google OAuth real | Callback del dominio de publicación; allowlist con las cuentas reales |
| 5 | Puerta R-19 | Dos cuentas Google reales + una denegada, desde dos dispositivos, sobre HTTPS |
| 6 | Verificación en destino | H01 (cabecera de IP), H02 (cabeceras de seguridad), `Cache-Control` de páginas privadas, revocación real |
| 7 | Copia inicial | Tras el despliegue: descargar la primera copia por titular y definir rutina «copia nueva tras cada migración financiera» |
| 8 | Supervisión | Registro mensual de consumo Vercel/Neon ([F6-05](56-politicas-cuotas-costes-f6-05.md) §5); 1 snapshot manual de Neon como segunda línea |

## 9. Checklist antes de usar datos financieros reales

- [ ] PR #64 (F6-06) integrado y CI completa en la nueva punta de `main`.
- [ ] Migraciones `0035`, `0036`, `0037` aplicadas y verificadas en Neon development (ADR 0004).
- [ ] Despliegue autorizado en HTTPS con credenciales del titular y callback de Google configurado.
- [ ] Prueba R-19: alta autorizada de dos cuentas Google reales desde dos dispositivos, y rechazo de una cuenta no listada.
- [ ] Revocación: deshabilitar a una cuenta en la allowlist y comprobar que su sesión ya abierta pierde acceso en la siguiente solicitud; el cierre de sesión invalida la cookie (R-01 en destino).
- [ ] Sesiones entre dispositivos: la misma cuenta abierta en dos dispositivos; cerrar en uno no debe filtrar datos en el otro y la sesión caduca a los 7 días sin renovación.
- [ ] Aislamiento A/B puntual en el despliegue (dos titulares, recurso ajeno → 404), incluidas exportaciones y copias.
- [ ] `CRON_SECRET` cargado y ambos crons verificados con una ejecución real (respuesta 204; sin el secreto responden 401 y los aportes programados no corren).
- [ ] Prueba de «eliminar cuenta» (F5-08) solo con cuentas de prueba; no con datos reales hasta comprobarla en el destino.
- [ ] Rama de Neon de datos reales decidida, con migraciones 0001–0037 y roles de runtime sin privilegios elevados (sección 8, filas 1 y 3b).
- [ ] Cabeceras de seguridad (H02) y `Cache-Control: private, no-store` verificados en el dominio real; H01 sin bloqueo cruzado de acceso.
- [ ] Flujo de conciliación de saldo y de corrección retroactiva ejecutado con datos migrados (R-04).
- [ ] Primera copia de seguridad descargada, con contraseña, y clave de firma respaldada fuera del dispositivo.
- [ ] Consumo Vercel/Neon observado tras la primera semana y registrado (R-03).
- [ ] Comunicar al titular las limitaciones de la sección 10.

## 10. Limitaciones que deben comunicarse al titular

1. La conciliación bancaria es **manual contra un saldo confirmado**: no existe
   conexión bancaria ni conciliación automática, y no hay transacciones futuras
   genéricas (las recurrentes requieren confirmación real).
2. La copia de seguridad solo se restaura en la **misma versión del esquema**:
   tras cada migración financiera hay que descargar una copia nueva; sin la
   contraseña o sin la clave de firma, la copia es inservible.
3. La app es **online-only**: sin red no se registran operaciones ni se finge
   éxito; la PWA instalada no guarda datos privados en el dispositivo.
4. No hay backup automatizado del proveedor en el plan gratuito: la copia por
   titular es la vía primaria; Neon ofrece solo 1 snapshot manual e instant
   restore de 6 h.
5. Los avisos push y su entrega real dependen del dispositivo y del proveedor; la
   app no envía correo (sin SMTP vigente).
6. Sin aceptación humana formal de la especificación visual ni prueba con lector
   de pantalla real; se usaron aserciones y capturas.
7. Operación dentro de cuotas gratuitas sin disponibilidad garantizada: agotar
   cuota pausa el servicio hasta el ciclo, nunca factura.

## 11. Recomendación preliminar

**Uso real: no autorizado; bloqueado (§0).** El código funcional de F0–F5 y
F6-01–F6-03 está implementado y probado en local con cobertura amplia (§7.1–7.2),
y el árbol integrado pasa CI; la revisión crítica de la Etapa B no halló defectos
de seguridad ni integridad. El bloqueo es operativo: completar el paquete de la
sección 8 y la puerta R-19. Una vez verificado en el despliegue —y reconfirmados
H01/H02, `Cache-Control`, revocación, cron y aislamiento en el destino— se podrá
evaluar la autorización con evidencia del entorno real. Las pruebas locales no
sustituyen esa validación. La decisión corresponde al titular, no a este ticket.

## 12. Seguimiento sugerido

1. Integrar #64 (retarget a `main` si hace falta tras la fusión) y repetir CI. Sus 6 flujos ya están en verde.
2. Gestionar con el titular la aplicación autorizada de `0035`–`0037` en Neon development.
3. Citar los resultados reales del destino (§9) en este documento con fecha y evidencia.
4. Crear el ticket funcional de CA-027 (RF-020) si el titular lo aprueba.
5. No prometer conciliación bancaria automática ni funciones fuera del alcance vigente.
6. Tras el primer despliegue autorizado, ejecutar los crons una vez con `CRON_SECRET` y registrar el resultado (§9).
7. Limpieza no bloqueante propuesta (`OPS`): una prueba que compare `vercel.json` con la documentación de cuotas para evitar otra deriva documental.
