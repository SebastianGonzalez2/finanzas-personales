# QA-FINAL · Validación integral y cierre funcional de la versión 1.0

Auditoría acotada del 2026-11-16. Rama `claude/QA-FINAL-validacion-v1` (desde `main` en `31f12ee`, que incluye F0–F6, UI-01–UI-06, FIX-FX, QA-FIX-01 y QA-D02), [PR #95](https://github.com/SebastianGonzalez2/finanzas-personales/pull/95). No hay cambios productivos: solo una prueba de integración nueva, la evidencia de este informe y este documento.

Estados usados: **PASS** verificado, **FAIL** defecto encontrado, **BLOCKED** no se pudo verificar, **PARTIAL** comprobado parcialmente. Cada estado indica el entorno: **Local** (esta máquina, sin PostgreSQL), **CI** (GitHub Actions con PostgreSQL 17.6 desechable y datos sintéticos) o **Production** (despliegue real, solo lectura y sin credenciales).

## 1. Resumen ejecutivo

- **No se encontró ningún defecto CRÍTICO ni IMPORTANTE.** Hay tres observaciones MENORES (sección 6), ninguna afecta saldos, aislamiento ni copias.
- Los flujos financieros principales pasan en **CI** con datos sintéticos. La paridad Presupuestos ↔ Estadísticas, el punto de mayor riesgo reciente, quedó cubierta con una prueba nueva contra un cálculo independiente.
- El aislamiento entre usuarios pasa en **CI** (RLS forzada en todas las tablas con titular, matrices A/B). En **Production** solo se verificó la superficie sin autenticar: no hay fuga sin sesión. **No se pudo verificar** login real, cuenta no autorizada ni A/B con Google real: Production tiene un único usuario y yo no puedo ejecutar OAuth ni introducir credenciales.
- Backup y restauración pasan en **CI** sobre PostgreSQL 17.6 desechable. Neon corre PostgreSQL 18, así que la restauración en un motor idéntico al de Production queda **BLOCKED**. No se restauró ni se tocó nada en Production.
- **Recomendación:** aprobar el cierre funcional del código y de los flujos de la v1.0. **No** declarar el sistema listo para datos financieros reales hasta completar la puerta R-19 sobre HTTPS (sección 9).

## 2. Estado de los flujos financieros

Todas las filas se apoyan en la ejecución completa de CI sobre `4265fb9` ([run 43980408039](https://github.com/SebastianGonzalez2/finanzas-personales/actions/runs/43980408039)): `test:integration` 139/139, `test:e2e:finance` 128 aprobadas (10 omitidas por diseño, variantes móviles de seguridad ejecutadas en escritorio), unit 244/244 y `test:e2e` 44/44. La trazabilidad por criterio está en la [matriz F6-01](52-auditoria-67-ca-f6-01.md); aquí no se repite.

| Área | Estado | Entorno | Evidencia (archivos en `tests/`) y límites |
| --- | --- | --- | --- |
| A. Saldos iniciales UYU/USD/EUR, ingresos, gastos | PASS | CI | `integration/bank-balances`, `movements` (CA-006 a CA-010); saldos por moneda sin mezcla. |
| A. Editar y eliminar movimientos, sin duplicados | PASS | CI | `integration/movement-revisions` (CA-013/014/016), `e2e-finance/regression`: una sola corrección, reintento `replayed`, «Deshacer». |
| A. Transferencias y cambio de moneda | PASS | CI | `integration/bank-transfers` (CA-012): sin ingreso/gasto en estadísticas, reintento concurrente, anulación exacta. |
| A. Actualización manual de saldo | PASS | CI | `integration/bank-reconciliation` (CA-011/015): diferencia explicada, checkpoints intactos, sin movimiento ficticio. |
| B. Compras normales y en cuotas, distribución entre meses | PASS | CI | `integration/credit-installments` (CA-022: 3 × 2000, nunca 6000 en un mes), `f2-10-consistency`. |
| B. Pago de tarjeta: baja banco y deuda, sin gasto duplicado | PASS | CI | `integration/f2-10-consistency` (CA-021/024), `card-cycles`: un solo gasto, sobrepago rechazado. |
| B. Resúmenes, vencimientos, devoluciones | PASS | CI | `integration/card-cycles`, `due-notices`, `refunds` (CA-023/028/029/037). Reembolso de febrero separado de la compra de enero (v9.42). |
| C. Presupuestos y Estadísticas coinciden (período, categoría, moneda) | PASS | CI | **Prueba nueva** `integration/qa-final-parity.test.mjs`. Tres categorías, gastos en UYU/USD/EUR y dos planes de cuotas (USD y EUR). Presupuestos y Estadísticas coinciden con un cálculo independiente en BigInt en cada mes, con el mismo texto de importe. |
| C. Cotizaciones históricas fijadas | PASS | CI | Una cotización publicada después (USD/UYU 01/02 y EUR/UYU 01/03 a 99) no reescribe febrero ni marzo (nueva prueba y `integration/fix-fx`). |
| C. Cuotas en períodos históricos y futuros | PASS | CI | Abril de 2025 se estima sin fijar la cotización (`provisional`) y luego se fija; Estadísticas puede leer antes que Presupuestos. Estadísticas no admite fechas futuras por diseño. |
| C. Dos decimales | PASS | CI | Nueva prueba con `formatBankAmount`: 0,455 + 0,455 + 415,415 = «416,33 UYU» redondeado una sola vez sobre el agregado; `e2e-finance/fix-fx` (QA-F01: «0,80 UYU»). |
| C. Períodos superiores a 12 meses | PASS | CI | Nueva prueba: 01/12/2024 → 15/02/2026 (14,5 meses) por categoría. La suma de los meses de Presupuestos coincide con el total de Estadísticas. `fix-fx` usa 18 meses. |
| C. Cotizaciones automáticas con los proveedores configurados | PARTIAL | CI + lectura externa | En CI los proveedores están simulados. El 2026-11-16 las APIs reales respondieron con la forma esperada (datosUruguay/BCU para USD y EUR con `unit` UYU/…, `source` BCU, `has_more` false; Frankfurter EUR/USD). **No** se observó una actualización ejecutada por la aplicación desplegada (requiere sesión). |
| C. Presupuestos en USD/EUR con gastos cruzados | PARTIAL | CI | La prueba nueva usa presupuestos en UYU. Presupuestos en EUR con cotización manual los cubren `integration/fix-fx` y `budgets`. El cruce EUR↔USD no se ejercitó aquí. |
| D. Fondos y reservas, aportes | PASS | CI | `integration/savings-funds`, `fund-coverage`, `scheduled-contributions` (CA-038 a CA-041). |
| D. Deudas, préstamos, devoluciones | PASS | CI | `integration/loans` (CA-030 a CA-034): capital de préstamo fuera de ingreso/gasto ordinario. |
| D. Recurrentes | PASS | CI | `integration/recurrences`, `recurrence-settlements` (CA-044 a CA-047). |
| D. Gastos compartidos | PASS | CI | `integration/shared-expenses`, `recurring-shares` (CA-035/036/048). |
| Recorrido manual de estos flujos en Preview/Production | BLOCKED | — | No hay sesión utilizable por mí, y no se escribe en Production. Solo se comprobó que existe un despliegue Preview de esta rama. |

## 3. Autenticación y aislamiento entre usuarios

| Control | CI (proveedor simulado, PostgreSQL real) | Production |
| --- | --- | --- |
| 1. A puede iniciar sesión | PASS · `integration/google-auth` (callback, state, PKCE, binding inmutable) | PARTIAL · Neon production tiene 1 usuario, 1 cuenta Google y 2 sesiones vigentes, lo que indica un acceso previo. **No observé ningún login.** |
| 2. Cuenta no autorizada sin acceso | PASS · `google-auth` (CA-002): OAuth directo y correo sin verificar no crean usuario ni sesión | BLOCKED · requiere otra cuenta Google real |
| 3. A no consulta ni modifica datos de B | PASS · `integration/security-rls-f6-02` (todas las tablas con titular), `e2e-finance/regression` (referencias ajenas = inexistentes, 404) | BLOCKED · solo existe un titular |
| 4. Aislamiento en APIs, exportaciones y copias | PASS · `e2e-finance/exports`, `integration/account-backup`, `security-f6-02` | BLOCKED · requiere sesión |
| 5. Cerrar sesión invalida el acceso | PASS · `google-auth` (CA-003/005), `security-auth-f6-02`: la otra sesión de A sigue activa | BLOCKED · solo se verificó `sign-out` sin cookie: 200 sin efecto |
| 6. Sin datos privados sin autenticación | PASS · `e2e/google-access` | **PASS** · ver abajo |

**Production, sondeo sin credenciales** (solo lectura; [script](../evidence/qa-final/probe-production.mjs) y [salida](../evidence/qa-final/probe-production.txt), despliegue `31f12ee`):

- Las 16 páginas privadas responden 307 a `/auth/sign-in` con `Cache-Control: private, no-store`.
- Las 28 rutas API sondeadas con GET devuelven 401, 404 o 405, nunca 200 ni claves financieras. Los dos `cron` devuelven 401.
- Los POST con origen ajeno devuelven 403.
- Presentes en todas las respuestas: HSTS, `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer` y CSP. Es la comprobación en destino de F6-02-H02.

**Configuración de Production observada** (consultas de metadatos en Neon, sin leer filas financieras):

- 39 de 39 migraciones aplicadas (última `0039_FIX-FX…`), igual que development.
- RLS habilitada y forzada en 61 de 63 tablas de `finance`. Las dos restantes son las cachés públicas de cotizaciones, documentadas.
- Los roles de ejecución no son superusuario ni tienen `BYPASSRLS`.
- No hay restauraciones registradas.
- El despliegue READY de Production es `31f12ee`.

**Tampoco verificado:** que `CRON_SECRET` esté cargado. El 401 anónimo es el mismo con o sin secreto.

## 4. Backup y restauración

| Requisito | Estado | Evidencia |
| --- | --- | --- |
| Copia completa de datos ficticios con la información necesaria | PASS (CI) | `integration/disaster-recovery-f6-04`: 45 de las 59 tablas con titular pobladas con los servicios reales (saldos, tarjetas, cuotas, fondos, deudas, presupuestos…). |
| Restauración en base desechable | PASS (CI, PostgreSQL 17.6) | Las 59 tablas quedan idénticas (decimales y marcas de tiempo), efectos bancarios sin cambios, recibo único, restauración idempotente. |
| Saldos, movimientos, tarjetas, cuotas, fondos y deudas reconstruidos | PASS (CI) | Misma prueba; además `e2e-finance/exports` (CA-062/063) en navegador. |
| Copia alterada o inválida rechazada | PASS (CI) | Contraseña errónea, cifrado manipulado, clave foránea rota, tabla ausente, esquema de otra versión: rechazados sin cambios. `unit/backup-format-f6-04`. |
| Información de otro usuario sin autorización | PASS (CI) | Copia de otro titular o sesión ajena rechazada; B intacto. |
| Restauración en un motor idéntico a Neon (PostgreSQL 18) | BLOCKED | CI usa 17.6. La guarda de pruebas solo admite `localhost`, y no se debe adaptar. La restauración es SQL de la aplicación (no `pg_dump`), así que el riesgo es bajo pero no está verificado. |
| Backup/restauración en Production | BLOCKED (por instrucción) | No se generó ni restauró nada. |

Límites ya documentados en [F6-04](55-backup-recuperacion-f6-04.md): una copia anterior a una migración financiera no es restaurable (hay que descargar una nueva tras cada migración), y 14 tablas no tienen filas en la prueba de desastre.

## 5. Pruebas ejecutadas y evidencia verificable

| Entorno | Comando | Resultado |
| --- | --- | --- |
| Local (Windows, Node 24.19.0) | `npm run test:unit` | 244/244 |
| Local | `PLAYWRIGHT_CHANNEL=chrome npm run test:e2e` | 44/44 |
| Local | `npm run typecheck`, `npm run build`, `eslint src tests scripts` | Pasan. `format:check` y `lint` globales fallan solo por residuos locales no versionados; los archivos versionados pasan. |
| CI | [run 43980408039](https://github.com/SebastianGonzalez2/finanzas-personales/actions/runs/43980408039) (`4265fb9`): `F0 quality` y `F0 database` | Success: unit 244/244, e2e 44/44, e2e-finance 128 aprobadas y 10 omitidas por diseño, integración 139/139 (incluye la prueba nueva). |
| CI (base) | Run de `main` en `31f12ee` | Success (`F0 quality` y `F0 database`). |
| Production | `node docs/evidence/qa-final/probe-production.mjs <URL>` | 0 respuestas 200 ajenas a `/auth/sign-in`, sin claves financieras. |
| Production (Neon, solo lectura) | Migraciones, RLS y roles | Ver sección 3. |
| Externo | Proveedores de cotizaciones | Responden con la forma esperada. |

Los dos runs previos de esta PR fallaron **por errores de mi propia prueba nueva** (presupuestos creados a partir de marzo en lugar de diciembre de 2024, y comparación de `"0"` con `"0.0000"`), no por el producto. Ambos fallos se corrigieron y el run actual pasa. Las otras 138 pruebas de integración ya pasaban en esos runs.

## 6. Problemas encontrados

Ninguno CRÍTICO ni IMPORTANTE.

| ID | Gravedad | Hallazgo | Reproducción | Causa probable | Corrección propuesta (no aplicada) |
| --- | --- | --- | --- | --- | --- |
| M-01 | MENOR | `POST /api/movements` sin sesión valida el cuerpo antes de autenticar y responde 400, no 401. No filtra datos y con cuerpo válido responde 401. Es el mismo patrón corregido en Estadísticas por QA-F02. | `POST` con origen propio, JSON `{}` y sin cookie → 400 `Solicitud inválida.` | `handleMovement` analiza el cuerpo antes de llamar a `withGoogleOwner`. | Autenticar primero y validar después, como QA-F02. |
| M-02 | MENOR | `POST /api/auth/sign-out` con cuerpo vacío devuelve 503 (debería ser 400) y se registra como error de runtime. Con `{}` devuelve 200. | `POST` sin cuerpo, origen propio. Los dos errores `stage=request.body` del 2026-11-16 23:04 en Vercel corresponden a mis sondeos. | El `catch` de `handleGoogleHttp` convierte un cuerpo vacío en 503. | Responder 400 al cuerpo ausente. |
| M-03 | MENOR | Presupuestos devuelve el consumo nulo como `"0"` y Estadísticas como `"0.0000"`. La UI muestra `0,00` en ambos casos. | Fallo del primer intento de la prueba nueva (`'0' !== '0.0000'`). | Formato de cadena distinto para el caso sin consumo. | Normalizar a cuatro decimales. La prueba nueva normaliza por ahora. |

Observación sobre **F6-02**: en este CI los casos H03 y H04 pasan como pruebas normales. Las cabeceras (H02) están presentes en Production. No se reevaluó el resto del informe F6-02.

## 7. Pruebas bloqueadas o pendientes por falta de acceso

1. **R-19 completo:** login real con Google sobre HTTPS, dos cuentas autorizadas y una denegada, desde dos dispositivos. Requiere cuentas reales; no ejecuté OAuth ni introduje credenciales.
2. A/B real en Production: API, exportaciones y copias entre titulares.
3. Cierre de sesión y revocación reales en Production (R-01 en destino).
4. Recorrido autenticado de los flujos en Preview/Production y actualización automática real de cotizaciones por la app desplegada.
5. Restauración de una copia en PostgreSQL 18, motor de Neon (requeriría una base desechable de ese motor y una guarda de pruebas ampliada, con autorización específica).
6. `CRON_SECRET` y ejecución real de ambos crons (respuesta 204).
7. Dispositivos físicos y lector de pantalla (CA-065/066 siguen PARTIAL según F6-01/F6-03).
8. Exportaciones incompletas: fuera de alcance, tendrán su propio ticket.

## 8. Riesgos residuales

- La puerta R-19 sigue abierta. Production ya tiene un usuario Google con sesiones vigentes; no consulté el contenido financiero y **no puedo afirmar si hay datos reales cargados**. Si los hay, se están usando antes de cerrar esa puerta.
- Diferencia de motor: PostgreSQL 17.6 en CI frente a 18 en Neon (secciones 4 y 7).
- Una copia previa a una migración financiera no es restaurable. No hay copia automática por cron.
- Historial de errores de runtime en Production del 2026-11-14 (`config.neon-connection-production`, `request.forward`): no se repiten desde esa fecha salvo mis sondeos. No se investigaron más.
- Las cotizaciones externas dependen de proveedores públicos; en indisponibilidad la lógica cae al último valor válido o a manual (R-11), probado solo con simulación.
- Aceptación visual humana (R-18) y entrega push real: sin cambios respecto a F6-07.

## 9. Recomendación de cierre

**Aprobar el cierre funcional de la versión 1.0** en cuanto al código y los flujos financieros: pasan en CI sin defectos críticos ni importantes, y la paridad Presupuestos ↔ Estadísticas quedó verificada con una prueba nueva.

**No declarar el sistema listo para datos financieros reales** hasta completar, sobre el despliegue HTTPS, la [lista de F6-07 §9](57-preparacion-uso-real-f6-07.md):

1. R-19: dos cuentas Google reales autorizadas y una no autorizada, desde dos dispositivos.
2. A/B, exportaciones y copias entre titulares en el despliegue.
3. Cierre de sesión y revocación reales.
4. `CRON_SECRET` y los dos crons verificados.
5. Primera copia de seguridad real con contraseña, y su restauración en una base desechable del mismo motor que Neon.

Las tres observaciones menores (M-01 a M-03) pueden resolverse en un ticket posterior; no bloquean el cierre.
