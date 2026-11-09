# Google-only: pruebas locales con Neon development

F0-04, v9.49, ADR 0004. PR #14 en borrador. No es habilitación del sistema.

OAuth Google real comprobado localmente con A y B. Ambas sesiones pasaron las
pruebas de API y el aislamiento de PostgreSQL se comprobó con preferencias
temporales revertidas. B fue revocada y A conservó su sesión.
Ver [evidencia sin datos personales](evidence/f0-04-google-oauth-local.json).

## Destino definido

| Elemento | Valor |
| --- | --- |
| Aplicación | Next.js local, puerto 3000 |
| Origen | `http://localhost:3000` |
| **Callback exacto Google** | **`http://localhost:3000/api/auth/callback/google`** |
| PostgreSQL | Proyecto `dry-voice-45959315`, rama development `br-late-feather-b6czfkx0`, DB neondb |
| Nuevos esquemas propuestos | app_auth, app_access, app_auth_meta |
| Proveedor anterior | Cerrado; sin cambios ni borrado |

Este primer entorno no necesita un endpoint HTTPS público, otro servicio,
dominio ni despliegue. No se usará el dominio del receptor antiguo como callback.
Las pruebas entre dispositivos quedarán pendientes hasta acordar y autorizar un
destino HTTPS para esta nueva aplicación; localhost solo se prueba en este PC.

## Orden seguro

1. Revisar/aprobar el SQL exacto y su hash en el informe 25. No ejecutar los pasos
   siguientes sobre DB antes de esa autorización.
2. Aplicar únicamente el archivo aprobado con el runner. Autorizar por separado
   la provisión de credenciales de runtime restringidas: el script solo ejecuta
   `ALTER ROLE finanzas_google_auth PASSWORD <secreto aleatorio>` y
   `ALTER ROLE finanzas_google_finance PASSWORD <secreto aleatorio>` dentro de una
   transacción en development, y crea `.env.google.local` privado sin sobrescribir.
   Los secretos son aleatorios de 256 bits y nunca se imprimen ni se incluyen en
   Git. No se ejecutó esta provisión al preparar la propuesta.
3. Preparar cliente Google Web con el callback exacto anterior, siguiendo la guía
   de consola debajo. Guardar credenciales directamente en `.env.google.local`.
4. Añadir las cuentas de prueba A/B a la allowlist por el administrador. Para
   probar un rechazo real, incluir una cuenta de prueba en Google OAuth Testing
   pero **no** en la allowlist de la aplicación. Ambas listas tienen fines distintos.
5. Para la primera prueba negativa, mantener la allowlist vacía. Iniciar
   `npm run dev:google -- --test-login` y abrir Chrome/Edge externo en
   `http://localhost:3000/auth/sign-in`. El flag habilita solo el flujo OAuth del
   proceso local; las altas dependen siempre de la allowlist persistente.
   Sin ese flag se respeta GOOGLE_AUTH_READY del archivo privado (false inicial).
   Comprobar el rechazo antes de autorizar A/B mediante la CLI.

Reiniciar el proceso local después de cambiar `.env.google.local`; las variables
se cargan al arrancar. Revocar una autorización en DB no requiere reinicio y debe
denegar las solicitudes siguientes aunque el navegador conserve su cookie.

El launcher carga `.env.google.local` con `process.loadEnvFile` y lanza Next sin
`--env-file` en execArgv: Next 16.4.5 reenviaba ese flag a NODE_OPTIONS y Node lo
rechazaba antes de arrancar. Exige localhost y URLs owner vacías. Las conexiones
nombradas siguen verificándose con los guards de servidor y sus roles limitados.
Se deshabilitan logs entrantes de desarrollo y forwarding de argumentos/logs de
navegador para evitar imprimir code/state de los callbacks OAuth. No adjuntar
trazas/red/cookies/URLs completas a Git ni al chat.

Si el titular guardó GOOGLE_CLIENT_ID/SECRET en `.env.local`, copiar únicamente
esos dos valores al archivo de runtime, sin reemplazar el resto ni cargar las
credenciales propietarias en la aplicación. No imprimirlos para comprobarlos.

## Google Cloud Console, paso a paso

No crear credenciales hasta llegar juntos a este paso. Las etiquetas pueden
variar; se comprobará la pantalla real antes de realizar cambios.

1. Acceder personalmente a Google Cloud Console. Elegir un proyecto OAuth propio
   existente o acordar la creación de uno gratuito; no vincular facturación ni
   activar Google Identity Platform, APIs Gmail o Drive.
2. Abrir Google Auth Platform → Branding. Definir nombre de la aplicación y correo
   de contacto del titular. No introducir datos financieros ni secretos en el chat.
3. Audience: External, estado Testing, con las cuentas sintéticas de prueba.
   No hace falta publicar para usuarios generales en esta prueba.
4. Data Access: solo `openid`, `email`, `profile`. Ningún scope sensible de
   Gmail/Drive. La biblioteca verifica identidad, firma, issuer, audience,
   caducidad, state y PKCE; la aplicación comprueba además email_verified/allowlist.
5. Clients → Create Client → Web application. Nombre sugerido:
   `finanzas-personales-f0-04-local`. Authorized JavaScript origins:
   `http://localhost:3000`. Authorized redirect URIs:
   **`http://localhost:3000/api/auth/callback/google`** (sin barra final).
6. Copiar Client ID y Client Secret personalmente a los campos GOOGLE_CLIENT_ID
   y GOOGLE_CLIENT_SECRET de `.env.google.local`, nunca al chat, PR ni capturas.
   El secreto Better Auth es independiente y lo genera el script privado.
7. Mantener pantalla/página de credenciales privada. Avisar solamente que la
   configuración está lista. Si aparece pedido de pago, detener ese paso.

Fuente: [Google OAuth en Better Auth](https://better-auth.com/docs/authentication/google),
[Google OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect).

## Administración sencilla de la lista

En archivo ignorado `.env.google-admin.local`:

```dotenv
GOOGLE_ALLOWLIST_EMAIL="cuenta-autorizada@example.invalid"
```

El titular escribe el correo real directamente en ese archivo privado, sin
enviarlo al chat. `npm run auth:google:allowlist -- --allow` añade/rehabilita;
`--revoke` revoca y elimina sesiones en la misma transacción. Solo la CLI
administrativa usa `.env.local` owner; la aplicación usa exclusivamente las dos
conexiones limitadas de `.env.google.local`. La gestión es auditable en DB y no
imprime direcciones. No hay panel ni rutas administrativas públicas.

La CLI serializa operaciones por correo, registra add/revoke/enable solo ante
cambios reales y no reanima sesiones eliminadas. Una repetición sin cambio es
un no-op sin evento de auditoría.

Para verificar una sesión Google existente sin extraer cookies del navegador:
`node --conditions=react-server --env-file=.env.google.local scripts/test-google-development.mjs --existing-google-sessions`.
En terminal interactiva: `capture A` o `capture B` lee únicamente la cuenta del
archivo privado, `api A`/`api B` prueba el acceso y `denied A`/`denied B` verifica
la cookie anterior después de cerrar/revocar. `quit` cierra el proceso. Usa roles
restringidos, mantiene la firma y token solo en memoria y nunca crea sesiones.

## Pruebas reales a realizar con el titular

- Cuenta fuera de lista: intento OAuth desde la app y endpoint directo, sin
  usuario/sesión nuevos ni acceso a API; comprobar conteos en DB.
- A y B autorizados: primera entrada, logout, nueva entrada al mismo titular,
  cambio de cuenta, persistencia al reiniciar navegador y caducidad.
- Preferencias sintéticas distinguibles A/B, lectura y manipulación de owner/IDs;
  sin gastos, saldos ni datos bancarios reales. Fixtures explícitos autorizados.
- Revocar B mientras está conectado: cookie existente y nueva entrada denegadas;
  A sigue funcionando. Rehabilitar B no resucita sesiones revocadas.
- OAuth cancelado, state alterado/repetido/caducado, error de red/DB: no presentar
  éxito ni filtrar datos. Perfil no verificado y cambio de email/sub se prueban
  automatizados con Google simulado y se distingue ese alcance del proveedor real.

Las claves, contraseñas Google, códigos OAuth, cookies y enlaces de callback
completos se ingresan/usarán en los servicios correspondientes, nunca en chat.
