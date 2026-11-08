# F0-04 — HTTPS de prueba y guía de autenticación real

Fecha: 2026-11-08, America/Montevideo. PR #12 en borrador, sin merge.
RF-001…004, CA-001…005, RNF-01/09/11 e I-12. Sin F1 ni nuevas migraciones.
**Fase 1 autorizada y ejecutada:** el titular seleccionó «Autorizar fase 1 con
altas cerradas». Publicación READY en
[finanzas-personales-f0-04.vercel.app](https://finanzas-personales-f0-04.vercel.app),
Hobby verificado, Node 24 y región gru1. Diez variables de runtime cargadas,
cuatro Secret, sin owner. Webhook de development guardado y releído: exclusivamente
`user.before_create`, timeout 5 s. Alta email y UI siguen cerradas; código revocado.
[Evidencia pública sanitizada](../evidence/f0-04-https.json).
Configurar el webhook todavía **no demuestra un callback real firmado**.

El titular tiene dos Gmail disponibles y una cuenta Vercel sin proyecto.
La cuenta estaba sin proyecto al iniciar esta continuación. La conexión Vercel
aparece instalada/habilitada, pero sus herramientas no quedaron expuestas en
esta sesión. Se usó CLI oficial 65.12.1; el titular completó personalmente los
accesos de Vercel y Neon, sin enviar secretos al chat.

## Recomendación y alternativas gratuitas

**Recomendación: proyecto personal de pruebas separado en Vercel Hobby**, nombre
propuesto `finanzas-personales-f0-04`, únicamente con Neon development existente.
Es la misma arquitectura Next.js/Node/PostgreSQL elegida por el producto, permite
una dirección estable para OAuth/reset y no depende de un túnel desde el PC.
Es una recomendación técnica, no evidencia de un despliegue funcionando.

| Alternativa | Ventaja para esta prueba | Límite relevante |
| --- | --- | --- |
| Vercel Hobby | Next.js nativo, HTTPS y dominio vercel.app; no expone el PC | Cuenta necesaria, cuotas y uso personal/no comercial; el webhook necesita acceso público sin challenge de Vercel |
| Cloudflare Quick Tunnel | Gratis, sin cuenta ni dominio | Expondría el servidor local; depende del PC, URL cambia al reiniciar y no garantiza disponibilidad |
| ngrok Free | Dominio de desarrollo estable, HTTPS | Otra cuenta/agente; 1 GB/20.000 solicitudes mensuales y pantalla intermedia en tráfico HTML de navegador |

Fuentes oficiales consultadas: [Hobby](https://vercel.com/docs/plans/hobby),
[Quick Tunnels](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/),
[ngrok Free](https://ngrok.com/docs/pricing-limits/free-plan-limits).
Neon [exige HTTPS público](https://neon.com/docs/auth/guides/webhooks): localhost,
IPs, destinos privados y redirects no sirven. No usar un inspector de webhooks que
registre cuerpos con email/identidad, ni reemplazar firma por URL secreta.

Hobby tiene precio base **USD 0**, uso personal/no comercial y cuotas. No activar
Pro, trial, dominio pago, Marketplace ni método de pago. Si la cuenta real no
permite este uso gratuitamente, detener y consultar; no aceptar upgrades.
Al agotar cuotas puede pausarse el servicio: no prometer disponibilidad ilimitada.
Neon/Google/email compartidos existentes no necesitan otro proveedor para esta
prueba. SMTP de producción sigue pendiente de F0-07.

## Qué autorización se solicita para la fase 1

La autorización descrita debajo ya fue concedida y ejecutada; se conserva como
registro del alcance. La fase 2 requiere aprobación adicional antes de abrir altas.

1. Crear **solo** el proyecto de pruebas indicado en la cuenta personal Hobby
   que el titular conectó; verificar cuenta y plan antes de crear recursos.
2. Publicar una copia aislada de PR #12 con Auth cerrada y código grupal revocado,
   bajo un subdominio gratuito vercel.app. No conectar el repo a auto-deploy.
3. Cargar únicamente variables de runtime development, con las dos credenciales
   restringidas; ningún URL propietario ni código grupal. Marcar secretos como
   Secret/sensitive, sin pasarlos en argumentos ni imprimirlos. No enviar .env.
4. Configurar `user.before_create` de **development** a la URL pública final,
   timeout 5 s, sin suscribir eventos de envío. La política sigue rechazando altas.
5. Ejecutar las sondas anónimas del endpoint. No registrar usuarios todavía.

**Particularidad de Vercel:** su [CLI](https://vercel.com/docs/cli/deploying-from-cli)
documenta que la primera publicación de un proyecto nuevo se etiqueta
`production`, incluso sin `--prod`. Aquí sería exclusivamente el proyecto temporal
de pruebas y su dominio, con Neon development; no implica publicar la aplicación
final ni tocar Neon production. La autorización debe incluir expresamente esa
primera publicación. No describirla incorrectamente como un preview privado.

Conservar [Standard Protection](https://vercel.com/docs/deployment-protection)
para las URL de preview/generadas y usar únicamente el dominio principal público
del proyecto de pruebas para navegador/webhook. Si se requiere quitar protección
adicional, explicar qué URL queda pública antes de cambiarla. Una pantalla de
login/confirmación delante del webhook impide que Neon lo invoque.

La URL exacta la asigna Vercel al crear/publicar. Verificar que corresponde al
proyecto y cuenta aprobados antes de guardarla en Neon; usarla como AUTH_APP_ORIGIN
sin slash final y sin comodines de dominios. No adivinar un dominio ya ocupado.
No emitir enlaces de reset hasta fijar ese origen.

## Qué quedaría expuesto

| Ruta/capacidad | Fase 1 | Cuando se autorice la fase 2 |
| --- | --- | --- |
| `/`, icono y assets | Vista estática de preparación, pública | Igual |
| `/auth/*` | Aviso de acceso en preparación | Formularios públicos de acceso, verificación y recuperación |
| `/api/admission` | 503, sin permisos | Verificación del código, limitada y persistente |
| `/api/auth/*` | 503 | Solo métodos necesarios de email/Google/OTP/reset/sesiones, con validación de origen/campos |
| `/api/webhooks/neon-auth` | Público; sin firma válida nunca permite alta | Público y firmado, con decisión persistente |
| `/api/account`, `/account` | Sin acceso anónimo | Sesión fresca + email verificado + admisión + RLS; solo preferencias existentes del titular |

Los HTML/JS públicos revelan rutas y funcionamiento normal del frontend, no los
secretos de servidor. Vercel alojaría código y secretos de runtime y procesaría
las solicitudes de autenticación; Neon/Google/Gmail intervienen en sus flujos.
No subir datos financieros reales, ni contraseñas de Gmail. El acceso con Google
usa su pantalla oficial y permisos básicos; no solicita Gmail/Drive.
`noindex` evita solicitar indexación, pero **no** es un control de acceso.
No habilitar Analytics, capturas de cuerpos, exportación HAR ni logging de
tokens/códigos. No prometer ausencia de metadatos operativos propios del proveedor.

## Preparación local ya implementada

- `auth:deploy:prepare` crea directorio nuevo bajo `.deployment/`, ignorado por Git,
  con lista permitida de código fuente, manifiesto SHA-256 y exclusión de archivos
  privados, SQL, migradores, fixtures, scripts y repositorio Git. No publica.
- El paquete tiene solo scripts build/start, región `gru1` próxima al Neon de São
  Paulo, [Node 24 admitido](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions)
  por la plataforma, auto-deploy desactivado y headers noindex/no-referrer/nosniff.
- El tracing de Next queda limitado al directorio que se compila para evitar
  arrastrar el workspace padre cuando se construye el paquete local.
- Exportador de variables limitado a runtime: valida rama/host/roles y fuerza
  NEON_AUTH_ADMISSION_READY=false. No sube valores ni llama a Vercel por sí solo.
- `probe:auth:published -- --origin https://<dominio-aprobado>.vercel.app` comprueba
  acceso anónimo, owner manipulado, Auth cerrada y webhook sin firma; no usa secretos.
- `auth:invitation:prepare` genera código aleatorio local en archivo privado
  ignorado, sin imprimirlo ni cambiar Neon. La CLI de rotación carga únicamente
  secreto HMAC y código de sus archivos privados; conserva la conexión admin.

El paquete inicial contiene 32 archivos revisables. Preparar/compilar no demuestra
que Vercel o el webhook real funcionen. El peer del SDK descrito en el informe
anterior sigue abierto; no se fuerza resolución ni se declara resuelto por build.

## Fase 2: autorización adicional antes de habilitar altas

Después de publicar y verificar la fase 1 se presentará el estado real de URL,
plan, secretos cargados y webhook leído de vuelta. Entonces autorizar una ventana
de pruebas de nuevas cuentas **solo en development**:

- Activar alta email temporalmente con webhook bloqueante y política todavía
  revocada. Intentar registro directo sin permiso: debe llegar un evento firmado
  y rechazarse sin usuario creado. Repetir para Google con el Gmail B.
- Confirmar contrato/metadatos: `additionalData` figura en el OpenAPI público de
  Google, pero no en las propiedades declaradas de signup/email. Eso no prueba
  que el servidor conserve el campo en el webhook. Si falta, mantener rechazo,
  investigar transporte soportado y no activar una solución solo frontend.
- Solo después de las negativas, activar el código grupal para los registros de
  prueba y habilitar la UI. No cambiar políticas de production ni SMTP/proveedores.

No habilitar altas durante la fase 1 por ver CI verde. Si una llamada directa crea
identidad sin invitación, se detiene la prueba y se vuelven a cerrar altas/política;
no darla por segura por negar después el acceso financiero.

## Guía para el titular: Gmail, OTP, recuperación y Google

Estos pasos están **preparados, no ejecutados**. Los haremos uno por uno cuando
la fase 2 esté autorizada y el endpoint esté listo. No comenzar ahora en Neon Console.
Identificar las cuentas como A y B en evidencias; no enviar direcciones, contraseñas,
OTP, cookies o enlaces de reset al chat. Ingresarlos personalmente en navegador.
Puede informarse solamente «llegó», «rechazado», «verificado» o el mensaje genérico.

### 1. Preparar dos perfiles de navegador

1. Elegir Gmail A para correo/contraseña y Gmail B para Google. Usar perfiles
   separados de Chrome/Edge u otro navegador, para no mezclar sesiones.
2. Abrir Gmail en cada perfil, confirmar acceso y revisar Spam/Promociones.
3. Elegir una contraseña de aplicación de prueba, diferente de la contraseña Gmail.
4. Cuando se indique, abrir la URL exacta de prueba. No usar un enlace recibido
   de otro origen ni pegar enlaces con tokens aquí.

### 2. Negativas e invitación

1. Intentar alta sin código y con código inválido; debe rechazarse sin crear cuenta.
2. En el perfil B, probar Google sin invitación por el flujo directo preparado
   para la prueba. Elegir B en la pantalla de Google; no autorizar Gmail/Drive.
3. Se comprobará en servidor que no apareció identidad/admisión inesperada.
4. Se habilitará el código únicamente después de estas comprobaciones. Copiarlo
   desde el archivo privado al campo de la app; nunca al chat.

### 3. Registro Gmail A y OTP

1. Crear cuenta por correo con A, contraseña de aplicación y código grupal válido.
2. Antes de verificar, intentar la zona privada: debe estar denegada.
3. Revisar que llega el correo de Neon. No abrir/compartir el contenido en capturas.
4. Probar un valor incorrecto controlado; observar rechazo, sin adivinar códigos.
5. Probar caducidad esperando el tiempo real que indique el proveedor/correo.
   No sustituir el reloj del proveedor por un mock para marcar este caso aprobado.
6. Solicitar reenvío una vez y verificar con el nuevo código, ingresado en la app.
   Comprobar reutilización del código anterior y límites con una secuencia acotada;
   si el proveedor bloquea, respetar su espera, sin eludirla con IPs alternativas.
7. Confirmar entrada, recargar, cerrar navegador/reabrir y volver a iniciar sesión
   sin que se solicite invitación otra vez.

### 4. Recuperación y revocación

1. Abrir dos sesiones de A en perfiles/dispositivos separados, ambas con acceso.
2. En otra ventana cerrar sesión y usar «¿Olvidaste tu contraseña?» con A.
3. Abrir personalmente el correo de recuperación y el enlace en el origen de
   prueba; establecer una nueva contraseña de aplicación. No copiar el enlace aquí.
4. Confirmar que la contraseña anterior falla y la nueva funciona.
5. Volver a las dos sesiones previas: una solicitud privada nueva debe rechazarse
   inmediatamente, incluso si la UI aún conserva una cookie de sesión cacheada.
6. Comprobar reutilización del enlace y, en una solicitud aparte, expiración real.
   Comparar respuesta pública para correo existente/no existente sin revelar cuál es.
7. Probar «Cerrar otras sesiones» y «Cerrar sesión» con nuevas solicitudes al servidor.

### 5. Google B y aislamiento

1. Crear B con el mismo código grupal válido usando «Continuar con Google».
2. Escribir el email B en el formulario y elegir **esa misma cuenta** en Google.
   El permiso de admisión no debe servir para otra dirección elegida accidentalmente.
3. Si Google acredita correo verificado, no debe pedirse otro OTP de email.
4. Confirmar persistencia al recargar y login posterior sin invitación.
5. Mantener A y B en perfiles separados. Se ejecutarán las comprobaciones de API
   y DB con sus identidades verificadas, incluyendo parámetros/IDs ajenos y errores.
   Cualquier fixture adicional se describirá antes de escribir; no crear gastos.
6. Rotar/revocar el código: alta nueva con código viejo falla y A/B existentes
   mantienen acceso. Probar permiso pendiente al rotar y reintento del webhook.
7. Por último revisar A→Google y B→email como conflictos de método, sin enlazar,
   fusionar o recuperar cuentas por inferencia. Registrar el comportamiento observado.

## Evidencia, cierre y retirada

Registrar solo resultado, instante, método, alias A/B y contadores; nada privado.
Firma/retry/red, OTP/reset y dos usuarios Auth reales siguen pendientes hasta
ejecutarlos. Los anteriores tests SQL con owners sintéticos no los sustituyen.
Al terminar: cerrar altas, revocar código de prueba, desactivar el webhook antes
de retirar el endpoint y acordar la retirada del proyecto temporal. No modificar
neon_auth por SQL ni borrar cuentas/recursos de otros proyectos.
No fusionar PR #12 ni declarar F0 cerrada por completar la publicación HTTPS.

## Verificaciones de esta preparación

- Unitarios 18/18: incluye exclusión de secretos/SQL/administración del paquete,
  exportador de variables fijado a development/Auth cerrada y carga privada de
  la CLI sin cambiar la credencial administrativa.
- Formato, lint y typecheck pasan. Build de aplicación pasa con permiso de
  ejecución; un intento en sandbox falló EPERM en `.next`. Los primeros intentos
  de navegador posteriores a ese fallo no arrancaron por falta de build; después
  del build correcto pasan E2E 4/4 y formularios 2/2, móvil/escritorio.
- Paquete aislado: npm ci y build pasan **sin .env** y sin la advertencia inicial
  de tracing al workspace padre después de fijar outputFileTracingRoot.
  Su SHA-256 de manifiesto es
  `c8e9615a08bc3e3638b9cf6984d9d125bc57e143fab16a744ee8f31cb1bb0c4e`.
- `auth:invitation:prepare` creó solo un archivo privado ignorado; lectura real
  de política confirma código revocado y generación 1, sin cambios remotos.
- OpenAPI de development consultado por GET sin sesión: /sign-in/social declara
  additionalData; /sign-up/email no lo incluye entre propiedades. No se enviaron
  correos ni altas para inferir su transporte; queda pendiente el evento firmado.
- Registro npm de CLI oficial consultado: `vercel` 65.12.1, Apache-2.0, Node >=20.
  No se incorpora como dependencia de la aplicación ni se crean recursos por ello.
- No se ejecutó la sonda de publicación porque todavía no existe URL autorizada.
  Esa era la situación al preparar el paquete; después de la autorización se
  ejecutó realmente y pasó 6/6. Los controles no son resultados Auth E2E.
- CI del commit `4b38473`: 6/6 checks SUCCESS. PR permanece en borrador.
- La creación inicial con un campo no admitido fue rechazada antes de crear
  recursos. Se creó el proyecto con el contrato actual y se fijó Node 24 mediante
  PATCH. La carga genérica de env fue rechazada sin variables; el comando
  específico con `npm.cmd` e input por stdin creó las diez variables previstas.
  No se imprimieron valores privados; se retiraron los payloads temporales.
- El primer acceso a consola Neon correspondía a otra organización vacía. El
  titular cambió personalmente al acceso correcto; solo se configuró el proyecto
  existente y la rama development. No se crearon proyectos/organizaciones Neon.

## Fase 2 autorizada: primer intento real

El titular autorizó «fase 2 de pruebas»: registrar el origen HTTPS exacto,
abrir temporalmente alta email con código revocado y comprobar primero el
rechazo directo. Se agregó únicamente el origen del proyecto temporal.

A las 14:26 UTC se envió una solicitud sintética sin invitación directamente
al Auth de development. Resultado: HTTP 502 `WEBHOOK_DELIVERY_FAILED`, sin usuario
ni token. Vercel recibió los tres intentos de Neon y respondió 503. Lectura SQL
posterior: cero usuarios Auth y código revocado. Se volvió a cerrar inmediatamente
el alta email; UI continúa cerrada. Esto prueba el fallo cerrado, todavía no la
validación satisfactoria de la firma ni la política de invitaciones.

Se agregan motivos de rechazo tipados y etapas sanitizadas al receptor para
resolver el error real. No se registran payloads, firmas, correos ni mensajes de
excepción. Unitarios 18/18 y build pasan; el primer ensayo del diagnóstico usaba
una propiedad de parámetro TypeScript incompatible con strip-only de Node y se
corrigió antes de publicar. CI de `82b1429`: seis checks SUCCESS.
