# F6-02 · Auditoría de seguridad y pruebas negativas (etapa A)

Auditoría de privacidad, autenticación, autorización, aislamiento A/B, RLS, PWA/caché, exposición de secretos y exportaciones/copias. Ticket [F6-02](05-plan-de-implementacion.md) ("Sin fuga entre cuentas; secretos ausentes de artefactos/logs"). Continúa el seguimiento F6 de [52-auditoria-67-ca-f6-01.md](52-auditoria-67-ca-f6-01.md).

**Restricciones respetadas:** no se modificó código productivo (autenticación, sesiones, autorización, RLS, exportaciones), secretos, `.env*`, Neon ni esquemas. Todo se ejecutó contra una PostgreSQL 17 local desechable (`127.0.0.1:55432`, protegida por `testDatabaseConfig`) con identidades sintéticas (`.invalid`) y secretos de prueba. No hubo tráfico hacia Google, Neon, Vercel ni producción.

## 1. Resumen ejecutivo

- **Sin fuga entre cuentas ni elusión de sesión confirmadas.** Las matrices de API, páginas, referencias cruzadas A/B, sesión revocada, origen, cron, exportaciones y copias pasaron con la aplicación compilada y la base desechable.
- **Cinco hallazgos confirmados, ninguno crítico ni alto:** 1 media (H01, disponibilidad), 4 bajas (H02–H05). Se codificaron como pruebas marcadas `todo` / `test.fail`: la suite sigue en verde y el defecto queda ejecutable hasta que se corrija.
- **Bloqueos de infraestructura:** no hay Google real ni Neon accesibles desde esta auditoría; la validación HTTPS con dos cuentas Google reales (R-19) sigue pendiente (sección 7).

## 2. Entorno y ejecuciones

| Elemento | Valor |
| --- | --- |
| Rama / base | `codex/F6-02-auditoria-seguridad`, 9 commits por delante de `origin/main` (incluye F6-01) |
| Código auditado | `dac920a` (sin cambios productivos en esta rama) |
| Plataforma | Windows 11, Node 24.19.0, PostgreSQL 17 local, Next.js 16.4.5 (`next start`, puerto 3108), Chrome instalado |
| Datos | Titulares sintéticos A (dos sesiones: A1, A2) y B; contraseñas y secretos de fixture; ninguna cuenta ni dato financiero real |

El servidor compilado se arrancó con las variables privadas sintéticas del propio harness de F2/F5, de modo que el escaneo de artefactos busca esos valores exactos.

## 3. Superficies de ataque

| Superficie | Cobertura |
| --- | --- |
| Frontera HTTP de Better Auth (`/api/auth/*`) | Solo `GET callback/google`, `POST sign-in/social`, `POST sign-out`; el resto responde 404 |
| 30 rutas `route.ts` de aplicación (2 de cron) | Sin sesión, sesión revocada, origen ajeno/ausente/`null`/otro puerto, `Sec-Fetch-Site: cross-site`, `owner_id` en la URL, `Content-Type` no JSON, verbos no declarados |
| 18 páginas privadas (+ `/` y `/auth/sign-in` públicas) | Sin sesión, cookie inválida, RSC y prefetch RSC, parámetros de URL maliciosos |
| Aislamiento A/B | Referencias de A usadas por B en movimientos, tarjetas, préstamos, reembolsos y categorías; detalle e historial |
| Cookies y sesión | Firma, expiración, revocación por allowlist, cierre de sesión, atributos |
| Base de datos | RLS, privilegios de runtime, vistas, funciones `SECURITY DEFINER`, roles |
| Cron | Credencial `Bearer` exclusiva |
| PWA / caché / cabeceras | `Cache-Control`, service worker, manifiesto, archivos públicos, errores |
| Secretos | Repositorio versionado, JavaScript del cliente, salida del servidor compilado, logs del servidor |
| Exportaciones y copias | CSV/Excel/PDF, copia firmada, vista previa y restauración entre titulares, archivos manipulados |

## 4. Archivos y funciones revisados

- Adaptador y Auth: `src/server/google-http.ts` (`handleGoogleHttp`), `google-auth-factory.ts` (`createGoogleAuth`: rate limit, cookies, sesión, proveedores), `google-auth.ts`, `google-policy.ts` (origen, allowlist), `google-database.ts`, `google-cron.ts` (comparación `timingSafeEqual`), `require-google-owner-page.ts`.
- Contexto de titular: `src/db/owner-context.ts` (`withOwnerTransaction`, `SET LOCAL ROLE`, GUC `finance.owner_id`).
- Descargas y copias: `src/server/private-download.ts`, `backup-format.ts` (firma HMAC ligada al titular, restauración confirmada con la sesión).
- SQL: `src/db/proposals/0003_F0-04_google_only.sql`, migraciones `0033`/`0034` y el esquema completo aplicado (roles `finanzas_google_auth`, `finanzas_google_finance`, `finanzas_app`; políticas FORCE RLS; vistas `security_invoker`; `authorize_session`, `account_backup_snapshot`, `restore_account`).
- Todas las rutas bajo `src/app/api/**` y páginas bajo `src/app/**` (inventario derivado del sistema de archivos), `public/card-push-worker.js`, `manifest`, `next.config.ts`, `vercel.json`.

## 5. Hallazgos confirmados

Los cinco se reproducen con una prueba ejecutable y están codificados como esperados-fallidos; ninguno es hipotético.

| ID | Severidad | Componente | Riesgo | Evidencia | Comportamiento esperado | Acción correctiva |
| --- | --- | --- | --- | --- | --- | --- |
| F6-02-H01 | Media (disponibilidad) | `src/server/google-http.ts` (`handleGoogleHttp`) | El adaptador reconstruye la solicitud con solo `content-type`, `origin` y `cookie`, sin IP. Better Auth la agrupa en el cubo único `no-trusted-ip\|/sign-in/social` (límite de 3 intentos cada 10 s en total). Un cliente anónimo que envíe el `Origin` correcto (cualquier cliente no navegador puede) agota el cubo y deja sin acceso a todas las cuentas autorizadas mientras repita las llamadas. No expone datos. | `INT: security-auth-f6-02 · F6-02-H01` con Better Auth real y PostgreSQL: seis clientes con IP distinta comparten una única clave `no-trusted-ip\|/sign-in/social`. `UNIT: security-surface-f6-02 · F6-02-H01`: la solicitud reenviada carece de IP. | Límite por cliente: cada visitante cuenta en su propio cubo. | Reenviar la IP que provee la plataforma (cabecera de confianza de Vercel) en la solicitud reconstruida y fijar `advanced.ipAddress.ipAddressHeaders`; mantener el límite global como respaldo. Verificar el nombre exacto de la cabecera en producción. |
| F6-02-H02 | Baja | `next.config.ts`, `vercel.json` | No hay cabeceras de seguridad en páginas (`X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, CSP/`frame-ancestors`). La explotación de clickjacking es poco probable porque la cookie es `SameSite=Lax` (no viaja en un iframe de terceros), pero se pierde defensa en profundidad. | `E2E: security-f6-02 · F6-02-H02` (`test.fail`): `/resumen` no devuelve ninguna de esas cabeceras. Solo las descargas privadas fijan `nosniff` (`private-download.ts`). | Páginas con `nosniff`, referrer restrictivo, `frame-ancestors 'none'` y política de permisos. | Añadir `headers()` en `next.config.ts` (CSP probada con la PWA y los estilos de shadcn). No se modificó la configuración. |
| F6-02-H03 | Baja (defensa en profundidad) | `finance.account_backup_snapshot()` | A diferencia de `restore_account()`, no reautoriza el token de sesión: confía en el GUC `finance.owner_id`, que el rol de runtime puede fijar. Exige ejecutar SQL arbitrario con el rol de runtime, la misma raíz de confianza de RLS. | `INT: security-rls-f6-02 · F6-02-H03`: con contexto B fijado a A, la función devuelve la copia de A. `restore_account` rechaza los mismos casos con `42501`. | Ambas funciones aplican la misma reautorización. | Evaluar que `account_backup_snapshot` reciba y valide el token como `restore_account`. Cambio de esquema: requiere el proceso ADR 0004. |
| F6-02-H04 | Baja | `finance.fx_reference_rates` | La tabla no tiene titular ni RLS y `finanzas_app` puede insertar cotizaciones de referencia, que condicionan las conversiones de todos los titulares. Solo explotable con SQL arbitrario del runtime. | `INT: security-rls-f6-02 · F6-02-H04`: un `INSERT` ficticio con la fuente permitida se acepta con el rol de runtime. | Solo el actualizador de cotizaciones puede publicar referencias. | Revisar privilegios del rol de runtime sobre esa tabla o enrutar la escritura por una función dedicada. Cambio de esquema bajo ADR 0004. |
| F6-02-H05 | Baja (código histórico) | `src/server/neon-development-config.ts` | Contiene `developmentAuthConfig` (Neon Auth administrado), descartado por v9.49, y ningún módulo de runtime lo importa. Superficie y confusión innecesarias. | `UNIT: security-surface-f6-02` lo excluye explícitamente del barrido de `neon_auth` y lo documenta. | Sin código de autenticación descartada. | Eliminar el código inerte y su prueba en un ticket aparte. |

## 6. Observaciones (no son defectos)

- **RSC anónimo con 200:** una petición `RSC` sin sesión recibe 200 con la redirección dentro del flujo (`NEXT_REDIRECT;replace;/auth/sign-in;307`) y solo los metadatos estáticos de la página; el prefetch devuelve el esqueleto de segmentos. No contienen datos del titular ni marcadores; es el comportamiento de Next.js. La prueba lo exige explícitamente.
- **Credencial de cron con espacio final:** `Bearer <secreto> ` se acepta porque el protocolo HTTP elimina el espacio final de la cabecera; no debilita la comparación. La prueba cubre credencial truncada y con sufijo.
- **`/historial?q=` refleja el término del propio titular** en su página; B no obtiene resultados de A (`entries` vacío).
- **Identificadores de infraestructura en el repositorio:** `tests/unit/google-auth.test.mjs`, `docs/` y `neon-development-config.ts` contienen el host del endpoint de Neon de desarrollo y los IDs de proyecto/rama. Son identificadores, no credenciales; la contraseña de esas cadenas es un fixture. El escaneo de secretos no encontró claves, tokens ni contraseñas reales.
- **Dependencia de orden en la suite:** `schema.test.mjs` termina dejando `finance`, `finance_meta` y el rol `finanzas_app`. Las pruebas nuevas, que exigen una base vacía, fallaban al correr la suite completa; se resolvió con `tests/support/f6-02-clean-database.mjs`, que elimina solo ese residuo exacto en la base local de pruebas y no toca nada más.

## 7. Casos no verificados y motivo

| Caso | Motivo |
| --- | --- |
| Inicio de sesión con dos cuentas Google reales sobre HTTPS (R-19) | Requiere Google OAuth real y dispositivos; prohibido usar cuentas reales y servicios externos |
| Estado real de Neon (esquema, roles, políticas aplicadas) | No se inspeccionó ni se modificó Neon; las pruebas validan el SQL versionado en PostgreSQL local, no la instancia |
| Cabeceras de IP que Vercel inyecta (H01) y cabeceras de seguridad en producción | No hay despliegue auditado |
| Entrega real de notificaciones push y estado de PWA instalada / cachés del navegador del usuario | Requiere dispositivos y proveedor push; solo se auditó el código del service worker, el manifiesto y las cabeceras |
| Estado de fusión de los PR vinculados (#57/#58) | No se consultó GitHub; no afecta a las pruebas locales |
| Segundo viewport y otros navegadores para la matriz HTTP | La matriz es independiente del tamaño de pantalla y se ejecuta una vez en `chromium-desktop`; se omite en el proyecto móvil |

## 8. Pruebas

### 8.1 Existentes ejecutadas como regresión

Toda la suite previa: `test:unit`, `test:integration` y Playwright de finanzas.

### 8.2 Agregadas en F6-02

| Archivo | Tipo | Cobertura |
| --- | --- | --- |
| `tests/unit/security-surface-f6-02.test.mjs` | Unit (17) | Inventario de rutas y verbos, origen y `Sec-Fetch-Site`, `Cache-Control`, páginas con sesión en servidor, SQL sin interpolación, configuración Google-only, cron, service worker, adaptador HTTP; H01 |
| `tests/unit/secrets-surface-f6-02.test.mjs` | Unit (3) | Repositorio sin credenciales ni `.env*`, JavaScript del cliente y salida del servidor compilado sin secretos ni mapas de fuentes (se omiten si no existe `.next`) |
| `tests/integration/security-rls-f6-02.test.mjs` | Integración (17) | RLS forzada, privilegios, vistas, funciones privilegiadas, A/B en todas las tablas, sin contexto, `authorize_session` y `restore_account`; H03, H04 |
| `tests/integration/security-auth-f6-02.test.mjs` | Integración (7) | Cookies falsificadas, manipuladas, expiradas y revocadas; cierre de sesión; atributos de cookie; H01 |
| `tests/e2e-finance/security-f6-02.spec.mjs` | E2E HTTP (9) | Matrices de API sin sesión, páginas anónimas/RSC, sesión revocada, origen, cron, referencias cruzadas A/B, exportaciones y copias, caché y archivos públicos; H02 |
| `tests/support/f6-02-clean-database.mjs` | Soporte | Residuo de `schema.test.mjs` (sección 6) |

## 9. Resultados reales

| Comando | Resultado observado |
| --- | --- |
| `npm run test:unit` | 146 pruebas, 145 aprobadas, 0 fallidas, 1 `todo` (H01) |
| `npm run test:integration` (PostgreSQL local) | 131 pruebas, 128 aprobadas, 0 fallidas, 3 `todo` (H01, H03, H04). Referencia previa a F6-02: 107/107 |
| `playwright test` (configuración de finanzas, Chrome instalado) | 83 aprobadas, 0 fallidas, 9 omitidas (la matriz HTTP en el proyecto móvil). H02 figura como fallo esperado |
| `npm run lint` / `npx prettier --check .` / `npm run typecheck` | Sin errores |
| Revisión de la salida del servidor durante la matriz E2E | Sin los secretos sintéticos, claves privadas ni `GOCSPX` |

Durante la elaboración fallaron pruebas por errores de la propia especificación (formato `excel` frente a `xlsx`, saldo inicial insuficiente para el préstamo, redirección `_rsc` de Next, eco del término buscado) y por la dependencia de orden descrita arriba; ninguna ocultó un defecto de la aplicación. Se corrigieron las pruebas, no se relajó ningún control.

## 10. Recomendaciones para Codex

1. **H01 primero:** reenviar la IP de confianza en `handleGoogleHttp`, configurar las cabeceras de IP de Better Auth y reemplazar la prueba `todo` por una afirmativa. Comprobar en un despliegue de vista previa.
2. **H02:** declarar cabeceras de seguridad en `next.config.ts` y quitar el `test.fail` de `F6-02-H02` al cumplirse.
3. **H03 y H04:** decidir si el riesgo justifica un cambio de esquema; si sí, SQL exacto, destino, impacto y SHA-256 según ADR 0004.
4. **H05:** eliminar el código inerte de Neon Auth en un ticket de limpieza.
5. Mantener estas matrices en CI: el inventario de rutas y páginas se deriva del sistema de archivos, de modo que una ruta nueva entra automáticamente.
6. Antes de usar datos financieros reales, completar la validación HTTPS con dos cuentas Google reales y verificar las cabeceras de IP y de seguridad en producción.

## 11. Cómo reproducir

```bash
npm run test:unit
TEST_DATABASE_CONFIRM=isolated-local-test TEST_DATABASE_URL=postgresql://f0_test:f0_test@127.0.0.1:55432/finanzas_test npm run test:integration
npm run build
TEST_DATABASE_CONFIRM=isolated-local-test TEST_DATABASE_URL=postgresql://f0_test:f0_test@127.0.0.1:55432/finanzas_test npm run test:e2e:finance
```

Las pruebas de artefactos de `secrets-surface-f6-02` se omiten (no se informan como aprobadas) si no existe `.next`; para que busquen los secretos sintéticos, compilar con las variables privadas de prueba del harness.
