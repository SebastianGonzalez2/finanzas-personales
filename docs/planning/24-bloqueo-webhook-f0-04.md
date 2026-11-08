# F0-04 — Discrepancia de rama en el webhook firmado real

2026-11-08. RF-001/002/004, CA-001/002, I-12. PR #12 en borrador, sin merge.
**Bloquea las pruebas de alta válida.** No se acepta F0-04 ni se avanza a F1.

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

No se conoce todavía la causa de la discrepancia. Es evidencia de una asociación
incoherente del contexto firmado, no prueba de que una identidad se haya escrito
en otra rama: no se permitió ninguna creación. No se reprovisionó Auth ni se
editó `neon_auth` para intentar repararla.

## Por qué no relajar el control

[Neon documenta](https://neon.com/blog/managed-better-auth-oauth-provider-mcp)
que las ramas del proyecto comparten claves de firma. Por ello no basta con
verificar la firma contra el JWKS de development para atribuir el evento a esa
rama. La [guía de webhooks](https://neon.com/docs/auth/guides/webhooks) presenta
`context.endpoint_id`, configuración por rama y creación bloqueante antes de
escribir al usuario. No se encontró una explicación oficial que permita aceptar
el endpoint ajeno observado como identidad segura de development.

Se mantiene el endpoint esperado exacto, sin aceptar production ni eliminar la
comprobación. La prueba unitaria reproduce un evento firmado correctamente con
ese endpoint ajeno y exige el rechazo. La aceptación de un evento permitido y el
transporte de `additionalData` siguen sin demostrarse.

## Reproducción mínima para revisión de Neon

Texto preparado, **no enviado** a soporte, Discord ni ningún tercero:

> Managed Better Auth: a request to a development branch's Auth URL triggers a
> signed `user.before_create` event whose `context.endpoint_id` belongs to the
> project's production branch. Project `dry-voice-45959315`; development branch
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
> requests or database changes were made. Please clarify the endpoint field's
> branch-binding contract and the supported repair for this existing development
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
