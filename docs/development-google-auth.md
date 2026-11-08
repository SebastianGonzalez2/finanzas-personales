# Google-only: pruebas locales con Neon development

F0-04, v9.49, ADR 0004. PR #14 en borrador. No es habilitación del sistema.

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
5. Habilitar GOOGLE_AUTH_READY solo cuando schema, roles, allowlist y OAuth estén
   comprobados. Iniciar `npm run dev:google` y abrir Chrome/Edge externo en
   `http://localhost:3000/auth/sign-in`.

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
