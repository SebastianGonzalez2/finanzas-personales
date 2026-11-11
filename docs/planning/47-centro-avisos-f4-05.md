# F4-05 · Centro de avisos y push de tarjetas

RF-037, RF-038 y CA-049. En **Avisos**, los vencimientos de deudas y recurrentes se calculan con la fecha local de Montevideo. La anticipación predeterminada es de tres días calendario. Para deudas y tarjetas se usa el valor configurado en cada obligación. Las series con fecha aproximada o desconocida conservan la previsión informativa en **Recurrentes**.

El resumen oficial prevalece sobre la estimación del mismo ciclo. Con el mínimo oficial cubierto y saldo restante, el aviso de la tarjeta pasa a informativo. Al confirmar el pago completo desaparece el vencimiento pendiente. Los avisos internos se actualizan a partir de los registros vigentes.

## Envío opcional

- La suscripción requiere pulsar **Activar avisos push** en **Avisos**, permiso del navegador y una sesión autorizada. Cada dispositivo se puede desactivar desde la misma pantalla. Si dos cuentas comparten navegador, cada una necesita su propio perfil para suscribirse.
- El cron consulta a los titulares habilitados y selecciona vencimientos de tarjeta pendientes dentro de la antelación configurada, hasta el día del vencimiento inclusive. El contenido cifrado activa un texto genérico y abre **Avisos** al tocarlo. Los importes, identificadores de tarjeta, fechas y datos del titular se muestran dentro de la sesión.
- Cada intento se registra antes de contactar al proveedor, por suscripción, tarjeta, ciclo y moneda. Si hay varios ciclos elegibles en la misma ejecución se agrupan en un push por dispositivo. Si una entrega queda indeterminada o falla, el ciclo sigue disponible en **Avisos** y se conserva el intento para evitar duplicados. Una respuesta 404 o 410 desactiva la suscripción.
- La preferencia conserva el registro del dispositivo al desactivarlo para deduplicar si se reactiva. El service worker se ocupa de la notificación y de abrir **Avisos**.

## Configuración y prueba

En el entorno que vaya a emitir push, configurar `CARD_PUSH_VAPID_SUBJECT` con un contacto operativo en formato `mailto:`, `CARD_PUSH_PUBLIC_KEY` y `CARD_PUSH_PRIVATE_KEY` con un par P-256 estable en base64url sin relleno, y `CRON_SECRET` con al menos 16 caracteres. Guardar la clave privada y el secreto como variables de servidor. Sin configuración válida, el envío queda inactivo y el centro de avisos sigue disponible.

El cron de Vercel se declara para las 12:00 UTC, una vez al día. La entrega depende del navegador y del proveedor. En iPhone, agregar la app a la pantalla de inicio y activarla desde allí. Validar con datos sintéticos bajo HTTPS en los dispositivos objetivo antes de habilitar la recepción real. [Vercel Cron Jobs](https://vercel.com/docs/cron-jobs) · [Web Push en Safari](https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers).

Migraciones para revisión en Neon **development**, base `neondb`, después de F4-04. [0026](../../src/db/migrations/0026_F4-05_loan_notice_lead.sql) añade la antelación a los préstamos. [0027](../../src/db/migrations/0027_F4-05_card_push.sql) agrega el opt-in y el registro de intentos con RLS. Para cada aplicación al esquema compartido se requiere aprobación específica del SQL y su hash según [ADR 0004](../adr/0004-google-only-allowlist-auth.md).
