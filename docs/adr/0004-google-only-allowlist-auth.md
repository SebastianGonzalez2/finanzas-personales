# ADR 0004 — Acceso exclusivo con Google y lista privada de autorizados

**Fecha:** 2026-11-08  
**Estado:** decisión de producto confirmada (v9.49); **implementación pendiente**.  
**Ticket:** F0-04 (sustituye la estrategia anterior de autenticación).  
**Motivo:** aplicación privada para aproximadamente cinco o seis familiares/amigos. El webhook administrado `user.before_create` de Neon Auth presentó una discrepancia de identificación de rama y bloqueó las pruebas reales; se prioriza sencillez sin sacrificar aislamiento financiero. Véase `docs/planning/24-bloqueo-webhook-f0-04.md` en la rama histórica del PR #12.

## Decisión vigente

1. **Única forma de acceder:** botón **«Entrar con Google»**; Google OAuth/OpenID Connect gestiona la autenticación. **No** ofrecer registro por correo/contraseña, contraseñas propias, códigos OTP, correos de verificación propios, enlaces mágicos ni recuperación de contraseñas dentro de la app. La recuperación de la cuenta de Google corresponde a Google.
2. **Acceso cerrado:** el titular administra una **lista privada de aproximadamente 5–6 cuentas de Google autorizadas**. Cada alta inicial solo procede si la identidad Google verificada está autorizada; el resto se rechaza **antes de crear un usuario o una sesión utilizable**, incluso mediante acceso directo a endpoints. No hay código grupal de invitación ni registro público. Agregar/quitar autorizaciones debe ser una operación sencilla, hecha en el servidor o DB con registro auditable; **no hace falta panel de administración en v1**.
3. **Autenticación autogestionada:** ejecutar **Better Auth dentro de Next.js** (Vercel), usando **Neon PostgreSQL** como persistencia. No depender de **Neon Auth administrado** ni de su webhook para aprobar nuevas cuentas. Mantener Vercel, Neon y el esquema financiero F0-05 sin reiniciar el proyecto.
4. **Propietarios independientes:** cada cuenta autorizada tiene un identificador interno estable de titular. La autorización financiera y `finance.owner_id` se derivan exclusivamente de **sesión validada por el servidor**, nunca de valores del cliente. RLS, rol limitado de runtime, FK por titular y protección de exportaciones/backups permanecen obligatorios.
5. **Costo objetivo:** usar prestaciones gratuitas dentro de cuotas y términos vigentes, sin comprar servicios ni activar facturación sin autorización expresa. Se requerirá un **OAuth Client ID/Secret propios en Google Cloud** y callback exacto para el entorno de prueba/despliegue correspondiente; no comprar dominio obligatoriamente.

## Reglas de seguridad y comportamiento

- La lista de autorizados se guarda/controla **en servidor**, nunca en el bundle público, localStorage o una variable expuesta al cliente. Normalizar correo de manera conservadora; **no** inferir equivalencia entre alias, puntos o dominios. Google debe acreditar `email_verified` cuando la política dependa del correo.
- En el primer acceso, cotejar la cuenta Google verificada con la autorización previa, y **vincularla de forma persistente al identificador estable del proveedor** (Google `sub` / provider account ID) para prevenir que cambios posteriores de correo transfieran la propiedad de la cuenta. Al iniciar sesión de nuevo, validar identidad vinculada, estado de autorización y sesión; decidir explícitamente cómo tratar cambios de correo o de cuenta Google. No vincular/combinar cuentas por coincidencia de email ni permitir una segunda identidad para un mismo titular sin proceso explícito revisado.
- Emplear un **hook de creación de usuario** de Better Auth como defensa previa al alta, y verificar con la versión elegida que realmente se aplica al registro OAuth. Añadir controles en sesión/autorización y no tratar el filtrado de UI como protección. **Fail closed** ante errores de DB, perfil no verificado o identidad no autorizada.
- El administrador podrá **revocar acceso**: impedir nuevas sesiones y denegar inmediatamente APIs financieras con sesiones existentes; verificar en servidor el estado de autorización (no confiar solo en cookies cacheadas). Implementar cierre de sesión, caducidad y revocación/rechazo con pruebas.
- Solicitar a Google **solo permisos mínimos** para autenticación (`openid`, `email`, `profile`, si corresponde); **no** solicitar Gmail, Drive ni acceso a correos. Mantener secretos OAuth y Better Auth solo en configuración privada de servidor. HTTPS, cookies seguras, CSRF/state/PKCE según biblioteca y configuración confiable de orígenes/redirecciones.
- **No** desplegar la app para acceso financiero real sin pruebas con **dos cuentas Google autorizadas** y una no autorizada: rechazo de alta directa, revocación, persistencia entre dispositivos, cambio de cuenta, A/B para API y DB con solicitudes manipuladas, y protección de session/owner. La naturaleza familiar del grupo **no** elimina la obligación de privacidad de los datos.
- Mantener la función **«Eliminar mi cuenta y mis datos»** confirmada en v9.48, adaptando el borrado/revocación al Auth propio. No borrar datos financieros o identidades antiguas automáticamente durante la migración.

## Persistencia y migración desde la investigación previa

- La rama `development` de Neon y las tablas `finance` / `finance_meta` de F0-05 **se conservan**. Crear las tablas propias necesarias para Better Auth y la autorización en un **esquema de aplicación separado de `neon_auth`**, siguiendo compatibilidad con el adaptador y migraciones versionadas. Revisar cuidadosamente la propiedad de tablas y permisos del runtime.
- Antes de escribir nuevas tablas o modificar roles en Neon, **presentar SQL exacto, destino, impacto, hash y pruebas al titular para autorización**; no inventar migraciones ni eliminar las tablas previas de admisión. No modificar manualmente el esquema administrado `neon_auth`, ni la rama `production`.
- El **PR #12** contiene código basado en Neon Auth gestionado y el webhook antiguo: **NO fusionarlo tal cual**. Puede consultarse para reutilizar UI, protección de API, funciones financieras y pruebas seguras, pero hay que refactorizar/verificar antes de integrar código. Mantenerlo como borrador/registro hasta decidir su cierre; evitar mezclar las dos arquitecturas de autenticación en el runtime.
- El webhook temporal anterior y la configuración `allow_sign_up=false` de Neon Managed Auth no forman parte del flujo nuevo. **No reabrir altas del proveedor antiguo**, ni eliminar infraestructura o credenciales sin una decisión separada.
- Las investigaciones, incidentes e informes anteriores permanecen **históricos**, no son especificaciones vigentes. El nuevo flujo depende de Google OAuth propio; SMTP para OTP/reset **deja de ser una dependencia de acceso**. F0-07 debe continuar validando Vercel Hobby/Neon Free, pero no bloquear F0 por un correo de contraseña que ya no existe.

## Aceptación de F0-04 revisada

1. Usuario Google **autorizado** puede entrar con un clic y salir; al volver entra a su misma cuenta y ve solo sus datos.
2. Usuario Google **no autorizado** no crea cuenta ni puede consultar APIs, incluso saltándose la UI.
3. La gestión de autorizaciones permite añadir y revocar cuentas sin interferir con otros titulares; sesiones ya existentes se deniegan al revocar.
4. Dos cuentas reales de prueba A/B no comparten saldos, eventos, configuraciones ni recursos; una petición que use IDs ajenos falla sin filtrar datos.
5. Sesiones, OAuth, callback, cookies y consultas de servidor se prueban en entorno real de desarrollo con credenciales privadas; los tests simulados por sí solos no cierran F0-04.
6. No quedan rutas de email/password, OTP, invitación grupal ni proxy de Neon Managed Auth habilitadas para acceso real.

**Fuentes oficiales (verificar versiones al implementar):**
- Better Auth Next.js: https://better-auth.com/docs/integrations/next
- Better Auth Google: https://better-auth.com/docs/authentication/google
- Better Auth database hooks: https://better-auth.com/docs/concepts/database
- Better Auth account linking: https://better-auth.com/docs/concepts/users-accounts

**Precedencia:** decisión de producto **v9.49**, que reemplaza explícitamente los flujos de autenticación e invitaciones de v9.48 y anteriores. **No** reemplaza reglas financieras ni privacidad multicuenta.
