# F0-04 — Integración persistente, pendiente de validación real completa

Fecha: 2026-11-08, America/Montevideo. Estado: **implementación protegida por
deshabilitación predeterminada; ticket no aceptado**. F0 abierta, sin avanzar F1.
Complementa el [informe anterior](12-informe-f0-04.md); prevalece sobre sus
menciones históricas de ausencia de proyecto Neon y de scaffold.

## Base y trazabilidad

Inicio limpio en main `da7f442f8ea8b0f7602adc5e3bb82b5608ebd7c5`, fetch real
y diferencia 0/0 con origin/main. Nueva rama
`codex/F0-04-autenticacion-persistente`. Chat renombrado con el mismo ID.
No se reescribió trabajo local ni F0-05. Se leyeron AGENTS, planificación 0*,
producto v9.48, informes Auth/F0-NEON/F0-05 y revisión del PR #11.

RF-001…004; CA-001…005 como cobertura parcial, CA-006 sigue pendiente.
RNF-01/02/09/11/12; I-12. I-01…I-11 sin nuevos efectos financieros.
No se implementan movimientos, saldos ni funcionalidades F1.

## Código entregado

- SDK oficial `@neon/auth` 0.8.2, Apache-2.0, compatible en pares directos con
  Node/Next/React fijados. Middleware oficial para intercambio OAuth; proxy HTTP
  con lista explícita de rutas, método, origen, tamaño y campos permitidos.
  No expone APIs de Admin, enlace de cuentas, organizaciones o nuevos métodos.
- Vistas en español para registro/login, Google, OTP/reenvío, recuperación/reset,
  callback bloqueado y cierre de sesión/otras sesiones. Usan APIs oficiales,
  sin inventar tokens ni entrega de correo. **Flujos reales aún no certificados**.
- `resolveAuthorizedOwner` consulta Neon por HTTP con `disableCookieCache=true`,
  valida identidad/sesión/caducidad/email verificado y admisión persistente.
  Ningún owner viene del cliente. `/api/account` lee solamente preferencias ya
  existentes de F0-05, sin crearlas ni mutarlas, con transacción/RLS y no-store.
- Receptor Ed25519 de `user.before_create`: cuerpo crudo acotado, clave pública
  de URL fija, endpoint/tipo/evento firmados, timestamp, JWKS cacheado con refresh
  limitado y rechazo por defecto ante errores. No acepta URLs de claves del emisor.
- Admisión en PostgreSQL: HMAC de código/email con dominios separados, permiso
  aleatorio de 256 bits ligado a email/método/generación por 5 minutos, consumo y
  decisión atómicos, retries idénticos persistidos y rechazo de replay alterado.
  Límite 5 intentos/email y 100 globales/15 minutos, sin confiar en IP del cliente.
  Rotación/revocación serializadas con el mismo lock e invalidación de permisos
  pendientes. Los titulares ya admitidos permanecen admitidos.
- Dos conexiones restringidas separan finanzas y admisión; no hay fallback a las
  URLs propietarias. Cada conexión usada se comprueba por catálogo: identidad,
  rama, flags, membresías privilegiadas, propiedad y acceso a neon_auth.
- [SQL exacto autorizado, permisos y consecuencias](22-autorizacion-f0-04.md),
  runner con checksum/modo plan y CLI local de rotación. Aplicado solo después de
  aprobación expresa; ledger/reaplicación y rollback verificados. No se rotó ni
  activó un código persistente.

Next/Webpack no transpila los `.mts` existentes al importarlos desde rutas.
Las dos fuentes compartidas pasan a `.ts`; `.mts` reexporta los contratos de
Node/F0-05 para conservar compatibilidad. `src/package.json` declara ESM en ese
ámbito, sin cambiar la clasificación del resto del repositorio.

## Seguridad y límites que siguen abiertos

`NEON_AUTH_ADMISSION_READY` permanece falso por defecto; no se modifica `.env.local`.
No habilitarlo por ver tests verdes. El receptor puede validarse mientras la UI
sigue cerrada; el permiso de alta es siempre persistente y debe verificarse en
el proveedor. Una barrera posterior al OAuth no satisface el ticket por sí sola.

El mapeo `additionalData.admissionId` → `event_data.signup_metadata.admissionId`
**no se ha observado con Neon real para ninguno de los dos métodos**. Se envía
solo el permiso opaco, nunca el código grupal; el receptor rechaza si se pierde.
Si Neon no conserva ese campo, ajustar el transporte con evidencia o declarar
bloqueo; no sustituir por verificación solamente frontend/post-registro.

La caché del SDK con boolean reproduce el fallo previo. La vía HTTP real del SDK
evita el caché en pruebas con fetch simulado, **no demuestra revocación real**.
El peer transitivo sigue advirtiendo `@better-fetch/fetch` 1.3.2 frente a 1.3.3 del
OAuth Provider 1.7.18. No se fuerza override, plugin ni `--legacy-peer-deps`.
El proxy solo permite los métodos requeridos y deja cerrada la funcionalidad;
compatibilidad completa de Google sigue siendo puerta previa a habilitación.

El GUC financiero no autentica frente a SQL arbitrario. El servidor sigue siendo
la frontera confiable, con SQL parametrizado y sesión fresca. La nueva credencial
LOGIN impide recuperar el propietario con RESET ROLE: probado con ambos LOGIN
reales y con controles negativos entre esquemas. Se generaron contraseñas privadas
y se conservaron solo en `.env.runtime.local` ignorado, que mantiene Auth falsa y
las variables propietarias vacías. El acceso financiero por sesiones Auth reales
sigue pendiente.

Si Neon rechaza el alta después de aprobar el webhook, puede quedar admisión sin
usuario Auth: no concede acceso sin sesión válida del ID exacto y email verificado.
No se modifica neon_auth para reconciliarla. Falta validar fallo/timeout real,
reintentos y política de mantenimiento de filas expiradas; no borrar admisiones
activas ni usar el correo como sustituto del ID inmutable.

## Evidencia ejecutada

| Comando/caso | Resultado y alcance |
| --- | --- |
| `npm run test:unit` | 15/15; validación, CSRF, restricción de credenciales, firma sintética y caché del SDK con fetch simulado. No Auth E2E. |
| `npm run check` | Formato/lint/typecheck/build pasan. Se corrigió fallo inicial del loader `.mts`; no se ocultó. |
| `npm run test:e2e` | 4/4, Chromium móvil/escritorio: scaffold, Auth cerrada, acceso anónimo, owner manipulado y webhook sin firma denegados. |
| `npm run test:auth:ui` | 2/2, formularios móvil/escritorio con configuración sintética, DB vacía y cero POST al proveedor. No prueba registro. |
| `npm audit --omit=dev --json` | 0 vulnerabilidades conocidas reportadas; no garantía de seguridad ni resolución del peer. |
| `npm run auth:sql:plan` | Sin conexión; checksum y destino aprobables. |
| `npm run test:auth:development` sin flag | Rechazo local previo a conexión (exit 2); el flag requiere aprobación explícita. |
| `npm run auth:sql:apply -- --apply-approved-sql <hash autorizado>` | **Real**: applied true; segunda ejecución alreadyApplied true, sin repetir DDL. |
| `npm run test:auth:development -- --approved-rollback-fixtures` | **Real**: 29 comprobaciones de lógica SQL/privilegios, fixtures revertidos. [JSON](../evidence/f0-04-admission.json). Eventos/owners sintéticos; no sesiones Auth. |
| `npm run auth:runtime:prepare -- --provision-approved-roles` | **Real**: dos logins restringidos, SET ROLE propietario denegado y RESET ROLE no eleva. Archivo privado exclusivo; sin nuevos grants. |
| `npm run test:auth:runtime -- --approved-rollback-fixtures` | **Real**: 16 comprobaciones con LOGIN restringidos: RLS A/B sintética, inserción ajena, separación de esquemas y rollback. [JSON](../evidence/f0-04-runtime.json). |
| `npm run probe:auth:development` | **Real, exit 0**: sesión anónima/inválida vacías, Ed25519, rechazo directo email `EMAIL_PASSWORD_SIGN_UP_DISABLED`, rama y seis tablas RLS forzada. La sonda final relee esquema y roles aplicados. [JSON sin secretos](../evidence/f0-04-auth.json). |
| API Neon de configuración | Solo development: email signup false, OTP requerido, revocación en reset true, Google/SMTP compartidos, webhook false. No se modificaron ajustes. |

Primeras sondas de alta encontraron `INVALID_ORIGIN` con 127.0.0.1 y
`MISSING_ORIGIN` sin Origin: **no prueban invitación**. Con `http://localhost:3000`
se observó el rechazo por signup deshabilitado. Tampoco prueba invitación activa.
Usar localhost en la prueba local o registrar el origen exacto de 127.0.0.1 con
Neon antes de probarlo. Las pruebas de navegador necesitaron permiso de ejecución
local; se liberó exclusivamente el servidor de este test tras colisión de puerto.

La primera ejecución del harness de admisión falló con SQLSTATE 42501: el owner
no puede asumir los nuevos roles. No se concedieron membresías para ocultarlo.
Se ejecutó la lógica dentro del rollback administrativo y se añadió la suite
separada de LOGIN restringidos reales. Catálogo confirma cero filas después.

CI de PR: consultar el head actual; no asumirlo por pruebas locales. La suite
PostgreSQL desechable preexistente de F0-05 continúa en CI; **no prueba admisión**
ni se ha ejecutado como sustituto de las nuevas pruebas solicitadas en Neon.
Las nuevas pruebas SQL se limitan al proyecto/rama autorizados, tras aprobación.

## Para aceptar F0-04

1. SQL/fixtures y credenciales ya preparados y probados; todavía debe validarse
   su integración con sesiones Auth, pérdida de conexión y errores de COMMIT
   en el flujo completo. No confundir las pruebas DB con Auth E2E.
2. Autorizar un destino HTTPS concreto; desplegar/configurar receptor bloqueante
   y demostrar rechazo directo para email **y Google** antes de abrir altas.
3. Preparar dos buzones sintéticos controlados y Google de prueba (el titular
   indicó que aún debe prepararlos). Completar registro válido/incorrecto en ambos
   métodos, metadatos, reutilización/rotación/revocación e interrupciones de red.
4. Probar OTP entregado, incorrecto, expirado, reenvío/límites; recovery con reset
   expirado/reutilizado, contraseña previa inválida y revocación de dos sesiones.
5. Probar A/B **autenticados realmente** contra API y RLS, IDs/solicitudes
   manipuladas, recarga/persistencia, cookies obsoletas y fallos del proveedor.
   Las identidades sintéticas de SQL y los mocks no cumplen este punto.
6. Revisar conflictos Google/email sin enlazar o fusionar cuentas por inferencia;
   cerrar compatibilidad SDK y registrar entregabilidad/limitaciones con evidencia.

F0-07 conserva SMTP gratuito fiable **para producción**, términos Hobby para el
uso real, límites/consumo de cuentas y credenciales Google propias de producción.
Las cotizaciones investigadas no se cambian. Se aplicó únicamente el SQL remoto
expresamente autorizado. No se activaron servicios, facturación, dominios,
despliegues públicos, altas, merge ni F1.
