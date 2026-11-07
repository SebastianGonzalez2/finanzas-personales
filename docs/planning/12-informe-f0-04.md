# F0-04 — Neon Auth, sesiones e invitación en ambos métodos

**Fecha:** 2026-11-07. **Estado:** investigación y experimento local entregados; **validación real pendiente por falta de proyecto Neon de prueba**, confirmada por el titular. No cierra F0 ni habilita publicación.

**Revisión:** [PR #3 en borrador](https://github.com/SebastianGonzalez2/finanzas-personales/pull/3), rama `codex/F0-04-neon-auth-invitaciones`; implementación local en commit `2c12f46`. Sin merge ni despliegue.

## Alcance y trazabilidad

RF-001…004; CA-001…006 como referencia, especialmente CA-002/003/004/005; RNF-01/09/11/12; I-12 (aislamiento). Producto v9.48, §§11.4.2/3/5 y 12.1. No hay movimientos, migraciones ni efectos monetarios: I-01…I-11 no se modifican.

Se investigaron SDK actual, sesiones, Google, verificación por código, recuperación e invitación grupal. Se añadió un [experimento reproducible](../../spikes/neon-auth/README.md) con política y verificación criptográfica locales. **No se implementó el registro/inicio de sesión de la aplicación**. Se evita declarar RF/CA funcionales satisfechos por pruebas de fixtures.

## Base de Git y compatibilidad

El workspace comenzó limpio en `codex/F0-03-scaffold-nextjs`, commit `2be0fbb`. Antes del fetch: HEAD estaba 1 commit adelante de la referencia local `origin/main`; después del fetch: 1 adelante/3 atrás. `origin/main` actualizado: `e493658`. Rama F0-04 creada desde ese `origin/main`, sin cambiar ni reescribir F0-03. El scaffold sigue separado; este PR no incorpora sus archivos ni sus commits.

El título del chat fue establecido a `[F0-04] Investigar Neon Auth e invitaciones` mediante la función de la aplicación. Dependencias instaladas solo en `spikes/neon-auth`, con lockfile. SDK oficial consultado en npm: **`@neon/auth` 0.8.2**, Apache-2.0, Node >=20.19, pares Next >=16 y React >=18. Se compiló su contrato con Node 24.19.0, npm 11.17.0, Next 16.4.5, React 19.3.1 y TypeScript 5.9.3. Son las versiones elegidas en F0-03; no prueba aún su ejecución conjunta en App Router.

La [guía Next.js actual](https://neon.com/docs/auth/quick-start/nextjs) usa `@neon/auth/next/server` (`createNeonAuth`) y `@neon/auth/next` (`createAuthClient()` sin argumentos). Evitar copiar ejemplos antiguos de Stack Auth o asumir que se puede instalar un plugin servidor arbitrario de Better Auth administrado.

## Hallazgos y límites observados

### Sesiones y revocación

El contrato compilado cubre `auth.handler()`, `getSession`, `listSessions`, `revokeOtherSessions` y `signOut`. La identidad está en `result.data.user`, con comprobación de `result.error`. Middleware y `useSession` no reemplazan autorización en cada operación de servidor. El `owner_id` debe derivarse de esa identidad y todas las relaciones deben pertenecer al mismo dueño.

El [SDK servidor](https://neon.com/docs/auth/reference/nextjs-server) mantiene una cookie de sesión cacheada durante 300 segundos por defecto. **Observación reproducida del paquete 0.8.2:** `getSession({ query: { disableCookieCache: true } })` devuelve el caché firmado sin consultar upstream; la cadena `"true"` sí consulta upstream en tiempo de ejecución. Los tipos públicos exponen boolean. Ver prueba `sdk.test.mjs`. No se propone un cast silencioso para producción. La integración debe verificar una ruta soportada de consulta fresca (el handler HTTP admite `?disableCookieCache=true`) o una versión corregida, y demostrar que sesiones revocadas no autorizan operaciones. Reducir TTL no prueba revocación inmediata. Otro desacuerdo documental: la referencia dice SameSite `strict`, mientras el paquete usa `lax`; configurar explícitamente `lax` para probar la vuelta de OAuth, con HttpOnly/Secure y CSRF del proveedor.

### Google OAuth

La [guía oficial OAuth](https://neon.com/docs/auth/guides/setup-oauth) ofrece Google compartido para desarrollo; producción requiere credenciales propias. El redirect autorizado en Google es **`{NEON_AUTH_BASE_URL}/callback/google`**, distinto del `callbackURL` final de la aplicación. Orígenes confiables y callback se configuran por rama.

La prueba del SDK real confirma que `signIn.social` transmite `additionalData` en el JSON. **No prueba** que Neon lo conserve y lo exponga como `event_data.signup_metadata` al volver de Google. Tampoco se verificó el transporte equivalente para email/contraseña. El nombre y mapeo exactos de esos metadatos son una dependencia de integración, no un contrato inventado. Sin ellos debe rechazarse el alta.

Solo una identidad Google efectivamente verificada omite el segundo código de email. Vinculación Google/email con la misma dirección sigue sin validación: no fusionar titulares ni habilitar enlaces manuales por inferencia. Probar ambas direcciones del conflicto y cuentas email no verificadas; cualquier acceso cruzado bloquea lanzamiento.

### Verificación y recuperación

La [verificación de email](https://neon.com/docs/auth/guides/email-verification) permite códigos con correo compartido; enlaces de verificación requieren proveedor propio. Activar **Verify at Sign-up → Verification code**. Se compilaron `emailOtp.sendVerificationOtp` con `type: 'email-verification'` y `emailOtp.verifyEmail`; eso no verifica envío, expiración, reenvío ni límite de intentos. No incorporar OTP como tercer método de login aprobado.

La [recuperación oficial](https://neon.com/docs/auth/guides/password-reset) usa enlaces de 15 minutos. Activar **Revoke sessions on password reset**, apagado por defecto y configurable por rama. Neon documenta revocación en la transacción del reset; la caché adicional del adaptador Next exige la comprobación anterior. Se compilaron `requestPasswordReset`/`resetPassword`; no se usó el adaptador Supabase `resetPasswordForEmail`, que la documentación señala como no plenamente soportado. Para la UI posterior reutilizar vistas oficiales, mensajes que no revelen si existe el correo y redirección fija permitida. No implementar tokens de contraseña propios. No pedir recuperación a usuarios exclusivamente Google.

## Invitación: opciones y propuesta técnica

**Descartadas:** ocultar el botón, validar solo una Server Action mientras el endpoint administrado sigue abierto, comprobar únicamente después de OAuth, o usar `user.created` no bloqueante para impedir altas. Las invitaciones individuales de organizaciones no corresponden al código grupal aprobado.

**Opción preferida para probar:** webhook administrado `user.before_create`, más permiso temporal de admisión creado por servidor. El [contrato de webhooks](https://neon.com/docs/auth/guides/webhooks) describe bloqueo previo a escritura, proveedor `credential`/`google`, metadatos, firma Ed25519 y rechazo si falla el webhook. Solo se dispara para usuarios nuevos. Requiere HTTPS público; no admite localhost. El evento `user.created` no ofrece esta garantía.

El experimento propone este flujo; es diseño técnico sujeto a prueba con Neon:

1. Validar código grupal en servidor, con comparación de digest y límite persistente de intentos por origen/global. Guardar una autorización opaca aleatoria de cinco minutos ligada a email exacto normalizado y método. El código original no viaja a Neon. La duración es una propuesta técnica, no nueva decisión funcional.
2. Para Google, capturar el email de la cuenta que se utilizará antes de salir a OAuth y rechazar si el proveedor vuelve con otra identidad. No normalizar puntos ni aliases de Gmail. Transmitir solo el ID opaco mediante el mecanismo de metadatos que se confirme en ambos métodos. No usar query strings con códigos ni permisos.
3. En webhook, verificar cuerpo crudo, firma y clave de la rama configurada, timestamp, ID/tipo de evento. Consumir permiso de forma atómica, ligado al usuario de Neon y al evento. Reintento idéntico devuelve la decisión anterior; otro evento no reutiliza ese permiso. Falta de metadatos, caducidad, código revocado o método distinto rechazan.
4. Una única fila de política compartida en DB debe contener digest activo y generación. Rotar/revocar en una transacción aumenta generación y deja inválidos permisos pendientes de la anterior. No usar solo env vars o caché por instancia: no garantiza revocación inmediata. Permisos técnicos por intento no son códigos de invitación por destinatario.
5. Registrar admisión por ID inmutable del titular; exigir sesión fresca y email verificado antes de habilitar datos. Rotación no elimina esa admisión ni afecta cuentas existentes. Si se interrumpe el alta o falla el guardado en Neon, no activar una identidad distinta; reconciliar intentos fallidos y reintentos.

**Límite del código entregado:** Maps en memoria para probar la política en un proceso, sin endpoint público, rate limiter, DB compartida ni recuperación tras reinicio. La integración necesitará transacciones, unicidad, limpieza de permisos/decisiones y manejo de creación fallida. Verificar que el webhook entregue un ID de usuario estable antes de la escritura. No modificar `neon_auth` manualmente. Si el transporte de permisos no se soporta, investigar admisión pendiente por identidad con controles equivalentes; no sustituirla silenciosamente por una barrera posterior.

No se identificó documentalmente un servicio pago imprescindible para esta opción. **La viabilidad gratuita completa no está demostrada:** faltan cuenta real, disponibilidad del webhook en ella, transporte OAuth, hosting HTTPS de prueba, entrega y cuotas. R-01/R-02 permanecen abiertos.

## Procedimiento: acciones del titular

### A. Configuración que podés preparar ahora

1. Entrar personalmente a [Neon Console](https://console.neon.tech). Crear un proyecto **exclusivo para pruebas**, en Free, sin facturación ni datos financieros reales. Confirmar que no solicita pago; si lo solicita, detener esa configuración. No hace falta dar una API key a Codex para esta preparación.
2. En el proyecto, crear/seleccionar una rama vacía de prueba, por ejemplo `f0-04-auth-test`. No ramificar datos privados de otra cuenta. En **Branch → Auth / Better Auth → Configuration**, habilitar Auth. La ruta puede aparecer bajo Settings → Better Auth según versión de consola. Copiar la **Auth Base URL de esa rama**, no una URL JDBC ni connection string PostgreSQL.
3. En el repositorio, abrir PowerShell en `spikes/neon-auth`, ejecutar `Copy-Item .env.example .env.local` **si aún no existe**, y editar ese archivo local para asignar `NEON_AUTH_BASE_URL`. No pegar secretos en chat, PR o capturas. Ejecutar `git check-ignore .env.local`: debe indicar que está ignorado.
4. Ejecutar `npm ci --ignore-scripts --no-audit --no-fund` y `npm run probe`. Compartir solo los indicadores de resultado. Esta sonda no crea cuentas y no necesita contraseña, cookie secret, clave API ni URL de DB. Si no encuentra clave de firma, conservar el resultado como fallo pendiente.
5. Preparar un buzón al que tengas acceso y una cuenta Google de prueba; si se puede, dos destinatarios de proveedores distintos para revisar entrega. No usar contraseñas habituales ni datos bancarios. Mantener credenciales en tu gestor de contraseñas.

**Lo que todavía hará falta integrar antes de probar altas:** scaffold F0-03 revisado, receptor seguro HTTPS, almacenamiento atómico de admisiones/límites, UI de auth y transporte de metadatos comprobado. Este spike no contiene ese receptor ni una app navegable. No apuntar un webhook público a sus módulos en memoria. Continuar esta integración dentro de F0-04 cuando exista la conexión; coordinar persistencia con F0-05 sin darlo por ejecutado.

### B. Configuración acompañada cuando exista el receptor de prueba

1. En la rama de Neon elegida, configurar email/contraseña: Sign-up y Sign-in with Email; **Verify at Sign-up**, método **Verification code**; **Revoke sessions on password reset** activado. Guardar y volver a leer los valores. No elegir enlace para verificar el registro. Usar inicialmente correo compartido; no contratar SMTP, dominio ni proveedor de envío. Mantener las altas deshabilitadas hasta registrar el webhook y comprobar rechazo sin permiso. Si la consola no permite preparar esos valores con altas apagadas, realizar la configuración completa en la misma sesión de prueba, sin publicar la app.
2. En **Auth → Configuration → Webhooks**, registrar la URL HTTPS final del receptor de pruebas que proveerá la integración. Activar exclusivamente **`user.before_create`**, timeout inicial 5 segundos. No suscribir `send.otp`/`send.magic_link`: hacerlo sustituye el envío integrado y exigiría implementar la entrega. Confirmar primero que una petición sin admisión válida se rechaza incluso llamando directamente al endpoint de Neon.
3. En dominios confiables, añadir únicamente el origen exacto de la app de prueba; por ejemplo `http://127.0.0.1:3000` para el scaffold existente. `localhost` es otro origen: añadirlo solo si efectivamente se usa. No añadir comodines amplios. Elegir una ruta fija de regreso y otra de reset en ese origen; probar rechazo a otros hosts.
4. Para **Google de desarrollo**, usar las credenciales compartidas que ofrece Neon; no crear una app de Google ni habilitar facturación solo para este primer test. Comprobar que el email devuelto esté verificado y que el alta nueva atraviese el mismo webhook. Iniciar sesión de nuevo sin pedir invitación.
5. Para credenciales Google propias, antes de uso real: en [Google Cloud Console](https://console.cloud.google.com/), seleccionar/crear el proyecto, configurar **Google Auth Platform → Branding/Audience/Data Access** con datos del titular, mantener estado de prueba y agregar tus cuentas como usuarios de prueba. Crear cliente OAuth de tipo **Web application**. Copiar desde Neon el callback de esa rama: `{NEON_AUTH_BASE_URL}/callback/google`, sin duplicar barras; agregar el origen exacto de la app si Google lo solicita. Pegar **Client ID y Client Secret solo en el proveedor Google de Neon**, guardar y probar. No van en el bundle, repositorio ni variables `NEXT_PUBLIC_*`. No habilitar servicios pagos. Seguir las etiquetas actuales de [configuración oficial](https://neon.com/docs/auth/guides/setup-oauth).
6. El cookie secret de la futura aplicación se generará localmente con al menos 32 bytes aleatorios y se guardará solo en `.env.local`/almacén seguro de entorno, diferente de cualquier código de invitación. En Google/Neon no se usa como Client Secret. La sonda actual no lo necesita.
7. El titular elegirá/generará el código privado de grupo y lo compartirá fuera de Git. La integración deberá ofrecer una operación administrativa sencilla para rotar la fila de política; no se construyó panel ni CLI de rotación de DB en este ticket. Registrar solo generación y resultado, nunca el código ni digest en evidencias públicas.

### C. Evidencia necesaria antes de aceptar F0-04

Todas estas comprobaciones reales están **NO EJECUTADAS**. Usar perfiles de navegador separados y datos sintéticos. Guardar resultados sin cookies, tokens, emails completos, OTP ni URLs de reset.

| Caso                     | Procedimiento y resultado exigido                                                                                                                                                                                                                        | Referencia       |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| Alta directa sin código  | Intentar email y Google por UI, API local y endpoint administrado directo. Debe rechazar antes de crear identidad/acceso, también si faltan metadatos o se cancela/reanuda OAuth. Revisar usuarios en Neon.                                              | CA-002           |
| Código válido compartido | Registrar dos identidades distintas por cada método con el mismo código grupal; OTP obligatorio para email y no duplicado para Google verificado.                                                                                                        | CA-003/004       |
| Rotación/revocación      | Abrir intento, rotar antes de finalizar, rechazar código y permisos viejos en varias instancias; login existente sigue funcionando. Probar retry del webhook sin dobles efectos.                                                                         | CA-003           |
| OTP                      | Intentar usar app antes de verificar; código erróneo, expirado, reutilizado y reenvío repetido deben controlarse; comprobar entrega real y mensajes.                                                                                                     | CA-004, R-02     |
| Reset                    | Dos sesiones; solicitar para correo existente/inexistente con respuesta pública equivalente; enlace válido/expirado/reutilizado; nueva contraseña funciona, anterior falla y ambas sesiones previas dejan de autorizar en la siguiente operación fresca. | CA-005           |
| Aislamiento y sesión     | Manipular owner solicitado, sesión ausente/vencida/revocada, cambiar usuario en navegador y cerrar sesión. Ninguna lectura/escritura ni caché permite datos ajenos. Saldo real A/B requerirá F0-05/F1.                                                   | CA-001/006, I-12 |
| Choque de métodos        | Email verificado/no verificado → Google y orden inverso, sin fusionar ni atribuir datos al titular equivocado.                                                                                                                                           | RF-004, R-01/13  |
| Fallos de webhook        | Firma inválida, endpoint caído, timeout, duplicado, claves rotadas y metadatos perdidos deben rechazar altas inseguras.                                                                                                                                  | CA-002, R-01     |
| UI posterior             | Completar flujos y errores en móvil/escritorio, foco y teclado; sin tokens en logs ni respuestas públicas.                                                                                                                                               | RNF-07/08/09     |

Antes de lanzamiento: probar entregabilidad/cuotas y alternativa SMTP gratuita si el compartido no alcanza. Si no existe opción fiable sin pago, informar bloqueo; no prometer producción con entrega sin comprobar. Revalidar términos y costo en F0-07, sin activarlos.

## Pruebas ejecutadas en esta entrega

| Comando (desde `spikes/neon-auth`)                  | Resultado observado                                                                                                        |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `npm install --ignore-scripts --no-audit --no-fund` | Instalado; advertencia de peer transitivo descrita abajo.                                                                  |
| `npm ci --ignore-scripts --no-audit --no-fund`      | Instalación limpia desde lockfile pasa; misma advertencia de peer transitivo, sin scripts de paquetes.                     |
| `npm test`                                          | 27/27 pasan: política local, firmas sintéticas y transporte/caché del SDK con fetch simulado. No E2E real.                 |
| `npm run typecheck`                                 | Pasa; contrato Next/React/Neon compila con `skipLibCheck`, sin comprobar internamente todas las declaraciones de terceros. |
| `npm run probe`                                     | Pendiente, salida del proceso 2 por ausencia de `.env.local`/URL. No se llamó a Neon.                                      |
| `npm audit --omit=dev --json`                       | 0 vulnerabilidades reportadas en dependencias de producción en esta consulta. No prueba ausencia de fallos de seguridad.   |

Advertencia no corregida por override: SDK fija `@better-fetch/fetch` 1.3.2, mientras `@better-auth/oauth-provider` resuelto 1.7.18 declara peer 1.3.3. Mantener aislado; comprobar combinación soportada o versión corregida antes de integrar en la app. No ocultar con `--legacy-peer-deps` ni asumir compatibilidad total por typecheck.

Lint/build/E2E del frontend y revisión móvil/escritorio: no ejecutados aquí porque `main` no contiene el scaffold y este PR no cambia UI. No se configuraron CI, DB, SMTP ni proveedores. Se añadieron reglas de ignore para secretos y artefactos locales previos, conservándolos en disco.

## Pendientes y siguiente paso

R-01/R-02/R-19: **pendientes de entorno real**. R-13: política local probada, aislamiento de datos reales sin probar. Caché del SDK y peer transitivo: abiertos hasta integración corregida y pruebas reales. Entrega offline revisable; ticket no aceptado funcionalmente. El siguiente ticket del plan es **F0-05** (DB aislada/driver/migraciones/propiedad); no se inició. Retomar los pendientes de F0-04 en este chat cuando exista el proyecto de prueba y no declarar puerta F0 superada.
