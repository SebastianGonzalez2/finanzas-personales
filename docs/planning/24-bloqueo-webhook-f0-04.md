# F0-04 — Discrepancia de rama en el webhook firmado real

2026-11-08. RF-001/002/004, CA-001/002, I-12. PR #12 en borrador, sin merge.
**Bloquea las pruebas de alta válida.** No se acepta F0-04 ni se avanza a F1.

**Investigación posterior, 16:24 UY:** el valor recibido también está almacenado
en `neon_auth.project_config` **dentro de development**, cuya configuración fue
copiada del padre. Se corrigió la respuesta de denegación de nuestra aplicación,
pero no hay una atribución segura de rama para autorizar altas. El valor por sí
solo **no demuestra que la solicitud se haya enrutado a production**. Ver la
investigación y alternativas debajo; este matiz prevalece sobre la interpretación
inicial del informe.

## Resultado observado y protección vigente

Se ejecutaron tres intentos sintéticos de alta por correo **sin invitación**,
exclusivamente contra el Auth URL de development. El código grupal permaneció
revocado y la UI deshabilitada. En cada ventana se habilitó solo el alta email,
se hizo un intento y se volvió a cerrar. Todos devolvieron HTTP 502
`WEBHOOK_DELIVERY_FAILED`; lecturas posteriores de development: cero identidades,
sin usuario/token en respuestas. No se enviaron correos reales ni se usó Google.

Vercel recibió tres reintentos por solicitud. El diagnóstico del tercer ensayo
confirma que **Ed25519, timestamp, tipo y event ID pasan**, pero el endpoint
firmado difiere:

| Dato | Valor verificado |
| --- | --- |
| Proyecto | `dry-voice-45959315` |
| Rama solicitada | `development`, `br-late-feather-b6czfkx0` |
| Host Auth solicitado | `ep-falling-queen-b63xbfuk.neonauth.c-2.sa-east-1.aws.neon.tech` |
| Endpoint esperado | `ep-falling-queen-b63xbfuk` |
| `context.endpoint_id` firmado recibido | `ep-morning-sunset-b6i4kxdg` |
| Rama de ese endpoint según API de control | `production`, `br-wild-mode-b64fgovd` |
| Respuesta del receptor | HTTP 503, etapa `verification`, motivo `event_envelope` |

La correspondencia endpoint/rama se consultó solo como metadatos de control;
**no se hicieron solicitudes Auth ni consultas SQL ni cambios de production**.
La configuración releída de development conserva URL propia, origen HTTPS
exacto del proyecto temporal y webhook habilitado exclusivamente para
`user.before_create` con timeout 5 s. Alta email quedó cerrada; el webhook sigue
bloqueando altas de cualquier método que no satisfagan la política.

La investigación localizó ese identificador en los metadatos administrados
copiados a development. No se ha demostrado qué código interno de Neon lo pone
en el evento ni que sea un identificador del origen de cada solicitud. No se
permitió ninguna creación. No se reprovisionó Auth ni se editó `neon_auth`.

## Por qué no relajar el control

[Neon documenta](https://neon.com/blog/managed-better-auth-oauth-provider-mcp)
que las ramas del proyecto comparten claves de firma. Por ello no basta con
verificar la firma contra el JWKS de development para atribuir el evento a esa
rama. La [guía de webhooks](https://neon.com/docs/auth/guides/webhooks) presenta
`context.endpoint_id` en un ejemplo, configuración por rama y creación bloqueante
antes de escribir al usuario. **No define ese campo como una garantía de la rama
que originó la solicitud.** Exigir su igualdad con el host era una suposición de
nuestra aplicación, aunque el rechazo conservador sigue siendo necesario hasta
disponer de una prueba equivalente segura.

Se mantiene el endpoint esperado exacto, sin aceptar production ni eliminar la
comprobación. La prueba unitaria reproduce un evento firmado correctamente con
ese endpoint ajeno y exige el rechazo. La aceptación de un evento permitido y el
transporte de `additionalData` siguen sin demostrarse.

## Investigación autónoma posterior

Se mantuvieron altas email/UI cerradas y código revocado durante toda esta
investigación. No se usaron Gmail, ventanas de alta, cambios remotos de esquema,
recreación de Auth ni modificaciones de production.

### Configuración heredada: hallazgo nuevo verificable

Consulta de solo lectura en development, sin extraer proveedores ni secretos:

```sql
SELECT current_setting('neon.branch_id', true) AS connected_branch,
       id, endpoint_id, created_at, updated_at
FROM neon_auth.project_config;
```

Resultado: rama `br-late-feather-b6czfkx0`, config
`e30f021d-ed01-4f3b-a96c-2c519034a752`, endpoint
`ep-morning-sunset-b6i4kxdg`. La fila tiene created_at/updated_at
`2026-11-08T02:06:12.307Z`, anteriores a la creación de development
(`02:09:04Z`); API de rama confirma padre `br-wild-mode-b64fgovd` e inicialización
`parent-data`. La [documentación de branching](https://neon.com/docs/auth/branching-authentication)
explica la copia independiente de configuración. Todo ello sustenta la hipótesis
de metadatos heredados; no justifica tratar ese campo como prueba del origen.

La configuración de la misma fila sí conserva las opciones propias verificadas:
`email_and_password.disableSignUp = true`, webhook habilitado, URL exacta del
proyecto temporal, un solo evento `user.before_create` y timeout 5 s.

### Destinos y código descartados como causa de la diferencia

- `.env.local` y `.env.runtime.local`: proyecto/rama/Auth URL de development;
  PostgreSQL directo/pooled en ese endpoint. Runtime usa solamente
  `finanzas_runtime` y `finanzas_admission`. No se imprimieron contraseñas ni URLs
  PostgreSQL completas.
- Vercel: proyecto exacto `prj_pb5iMyLfSTdQQKqZ0U3TbYqnRcQi`, scope
  `sebastian-gonzalez1`, cinco Config comparadas en memoria coinciden: proyecto,
  rama, Auth URL, origen HTTPS y flag `false`. No hay variables owner en la
  exportación. Los cuatro Secret existen en el entorno previsto; la lectura los
  devuelve como marcadores ocultos, **no permite verificar sus valores actuales**.
  No se confundió esa desigualdad con una credencial errónea. Se conservan los
  guardas de destino/rol del runtime y las validaciones del exportador original.
- `env pull --deployment` fue rechazado por CLI 65.12.1 porque solo admite ese
  recurso en INITIALIZING, no READY. Se auditó el entorno actual del proyecto,
  no se afirma haber descifrado una instantánea histórica del deployment.
  Los archivos temporales de lectura se eliminaron sin sobrescribir `.env.local`.
- OpenAPI real de development devuelve como único `servers[].url` su Auth URL.
  No expone rutas de configuración/project/webhook para reparar ese metadato.
- Código público del [proxy oficial](https://github.com/neondatabase/neon-js/blob/71526c0639ca0079a11716bea9ad139fc15243c1/packages/auth/src/server/proxy/request.ts)
  y dist instalado 0.8.2: construyen upstream desde `baseUrl` y la ruta, sin inferir
  el endpoint de `context`. Regresión usando SDK instalado y fetch simulado
  confirma URL exacta y cuerpo/metadata preservados. El webhook de creación lo
  genera el servicio administrado, no ese proxy. Las sondas firmadas originales
  además fueron directas al proveedor, sin pasar por la aplicación/SDK.
- Búsqueda de incidencias públicas de `neondatabase/neon-js` no encontró una
  resolución oficial para esta combinación campo/rama. Reportes de otros fallos
  de webhook/OAuth no prueban la causa de este caso ni autorizan un workaround.

### Corrección segura de la aplicación

Antes, un evento que pasaba firma pero fallaba contexto terminaba como HTTP 503:
Neon reintentaba tres veces y el usuario veía `WEBHOOK_DELIVERY_FAILED`.
Ahora ese caso produce HTTP 200 con `allowed: false` y
`error_code: AUTH_CONTEXT_MISMATCH`, conforme al contrato oficial de denegación
de `user.before_create`. **No es una admisión**: el verificador sigue rechazando
el evento antes de invocar admisión/DB. No se acepta production ni se elimina
ninguna comprobación. Firma/clave/red/DB no verificables siguen fallando cerrados.

La regresión firma un evento sintético con endpoint ajeno, comprueba el rechazo
y que la respuesta explícita nunca permite el alta. Esta corrección evita tratar
una denegación permanente como indisponibilidad transitoria; **no desbloquea un
registro válido ni está certificada por un callback nuevo de Neon**.

### Pruebas actuales y límite de lo demostrado

`npm run audit:auth:development -- --probe-closed-signup` ejecuta SQL READ ONLY,
comprueba branch antes de leer configuración y hace un POST sintético solo si
siguen cerradas las altas, el código revocado y hay cero usuarios. No cambia
opciones, no permite eventos y no hace reparaciones automáticas. Resultado real
19:24:54 UTC: HTTP 400 `EMAIL_PASSWORD_SIGN_UP_DISABLED`, sin usuario/token;
cero usuarios antes/después. Log de solicitudes del receptor en esa ventana:
cero entregas. Exit 1 **esperado** por `storedEndpointMatchesDevelopment=false`.
No debe reportarse ese exit como prueba de un fallo de entrega nuevo.

[Evidencia sanitizada reproducible](../evidence/f0-04-managed-config-audit.json).
Unitarios: 22/22. Formato/lint/typecheck pasan; build pasó con permiso de ejecución
tras EPERM de sandbox en `.next`. CI y publicación se registran en PR.

Con altas cerradas no es posible obtener un nuevo `user.before_create` por correo;
Neon rechaza antes de llamar al receptor y no ofrece test events/redelivery.
No se abrió una ventana para aparentar una verificación real de la corrección.

### Reparación soportada y alternativas

La [API actual de configuración](https://neon.com/docs/reference/api/auth/update-neon-auth-config)
solo admite `name`. No expone cambio de `endpoint_id` ni una operación de
reconciliación del metadato heredado. Re-guardar webhook no acredita un cambio de
ese dato; reiniciar compute tampoco reescribe un campo persistido. No se hicieron
PATCH con campos no documentados, SQL manual sobre `neon_auth` ni re-provisionado.

| Alternativa | Condición para que sea segura | Estado en este alcance |
| --- | --- | --- |
| Neon corrige/reconcilia metadatos de la integración existente | Rama firmada inequívoca y prueba sintética de separación; sin tocar production | Vía preferida; requiere confirmación/intervención de Neon |
| Neon documenta que el campo es una referencia heredada y ofrece otra prueba autenticada de rama | Contrato estable y prueba de no aceptación cruzada, por ejemplo identificador de rama firmado o autenticación propia de webhook por rama | No está expuesto en el contrato consultado; no implementable por suposición |
| Better Auth autogestionado en el Vercel existente y PostgreSQL Neon | Hook síncrono propio, esquema separado, roles restringidos, SMTP y OAuth propios, nuevas pruebas | Cambio de arquitectura/producto y SQL sujetos a autorización; no se inició ni se sustituye Managed Auth automáticamente |

La firma del proyecto, un `Origin`/IP, un token entregado al navegador o un filtro
posterior al alta no sustituyen la atribución segura de rama. Crear otro proyecto
aislado podría separar claves, pero está fuera del destino autorizado y no se hizo.

**Conclusión:** se corrigió una respuesta nuestra y se localizó el valor anómalo
en configuración administrada heredada. No se confirmó un desvío de tráfico a
production. Para continuar con Managed Auth sin relajar seguridad sí hace falta
que Neon aclare/corrija el contrato o proporcione una reparación soportada. La
aplicación no controla la emisión del cuerpo firmado ni tiene una API documentada
para modificar ese metadato.

## Reproducción mínima para revisión de Neon

Texto preparado, **no enviado** a soporte, Discord ni ningún tercero:

> Managed Better Auth: a request to a development branch's Auth URL triggers a
> signed `user.before_create` event whose `context.endpoint_id` equals inherited
> project_config metadata pointing at the parent endpoint. We have NOT established
> that the request was routed to production. Project `dry-voice-45959315`; development branch
> `br-late-feather-b6czfkx0`, expected endpoint `ep-falling-queen-b63xbfuk`;
> signed endpoint `ep-morning-sunset-b6i4kxdg`, mapped by the control API to
> production branch `br-wild-mode-b64fgovd`. Last reproduction:
> 2026-11-08 14:36:45 UTC. Request went directly to
> `https://ep-falling-queen-b63xbfuk.neonauth.c-2.sa-east-1.aws.neon.tech/neondb/auth/sign-up/email`
> with a random example.invalid identity and no admission metadata. The webhook
> verified Ed25519 using that development URL's JWKS, timestamp, event type and
> matching event ID, then rejected the foreign endpoint. All 3 delivery attempts
> received 503; the caller received 502 WEBHOOK_DELIVERY_FAILED. Development has
> zero Auth users; signup was disabled again after each test. No production Auth
> requests or database changes were made. Read-only SQL on development confirms
> current_setting('neon.branch_id') = br-late-feather-b6czfkx0 while
> neon_auth.project_config.endpoint_id = ep-morning-sunset-b6i4kxdg. The config row
> predates branch creation; the branch was initialized from parent-data. Branch
> config, SDK 0.8.2 upstream destination, OpenAPI server URL and Vercel Config
> values all point at development. A closed probe at 19:24:54 UTC returned
> EMAIL_PASSWORD_SIGN_UP_DISABLED with no callback and zero users before/after.
> Please clarify whether context.endpoint_id identifies the current request branch
> or inherited provider metadata, what authenticated field binds a webhook to a
> branch given shared project signing keys, and the supported repair for this existing development
> integration, without modifying production or manually editing neon_auth.

No adjuntar contraseñas, cookies, OTP, firmas, payload completo, tokens ni cadenas
de conexión. Si el titular quiere enviarlo, puede usar el canal gratuito que Neon
enlaza en su documentación; no se abrió un servicio ni se envió ningún mensaje.

## Reanudación y pruebas todavía pendientes

1. Obtener explicación/corrección verificable de Neon sobre el contexto de rama.
   Evaluar cualquier reparación concreta antes de ejecutarla; SQL remoto nuevo
   requiere presentar el SQL y autorización del titular.
2. Repetir el preflight autorizado con código revocado y cero identidades:
   `npm run probe:auth:admission -- --approved-phase2-preflight`, durante una
   ventana email abierta de development. La sonda no abre/cierra altas por sí
   misma. Debe devolver rechazo de política `INVITATION_REQUIRED` sin identidades.
3. Solo entonces activar el código privado y UI dentro de la fase 2 autorizada,
   probar rechazo directo Google y continuar los pasos Gmail A/B de la guía 23.
4. Completar invitación inválida/válida/reutilización/rotación/revocación, OTP
   recibido/caducado/reenvío/límite, reset y revocación real con caché obsoleta,
   A/B autenticados y solicitudes manipuladas contra datos sintéticos distinguibles.

La evidencia real está en [live-admission](../evidence/f0-04-live-admission.json).
Los tests SQL previos 29+16 usan fixtures con rollback; los tests locales de SDK
usan respuestas upstream simuladas. Ninguno sustituye OTP/Google/reset reales.
F0-07 conserva pendientes SMTP fiable de producción, OAuth propio de producción,
límites gratuitos y adecuación de Hobby al uso final. No se activaron pagos.
