# F3-03 — Aportes mensuales programados

RF-028, CA-039 e invariantes I-03, I-11 e I-12. El calendario puro de OpenCode se conserva en la rama `codex/F3-03-aportes-programados`. El flujo completo sigue las decisiones v5.8, v5.9, v9.24–v9.27 y v9.31.

## Ejecución y resolución

- Cada fondo puede activar un importe mensual en su moneda y un día entre 1 y 31. La activación y reactivación comienzan el mes calendario siguiente. Un día inexistente se ajusta al último del mes sin cambiar la preferencia.
- La edición conserva el próximo vencimiento si pertenece al mes actual. Guarda la configuración nueva para el mes siguiente y mantiene los datos originales de los períodos ya registrados. Pausar el plan cancela los próximos vencimientos y conserva sus pendientes. Pausar el fondo desde el catálogo también pausa su plan y registra el cambio.
- El vencimiento es único por titular, fondo y mes. Usa los mismos bloqueos y efectos de reserva que F3-01 y F3-02. La reserva completa reduce el disponible libre en la moneda del fondo. Bancos y los gastos se mantienen intactos.
- Una insuficiencia deja el período pendiente con su fecha, moneda e importe originales. El calendario sigue avanzando y evalúa cada mes por separado. Fondos y Avisos muestran el estado y su causa. Completar o descartar requiere confirmación expresa. Completar vuelve a validar el disponible y es idempotente.
- Si se pierde el día programado, al siguiente procesamiento el período queda pendiente por ejecución fuera de fecha. La fecha se calcula en Montevideo. Las aperturas de Fondos y Avisos procesan los vencimientos del titular autenticado.

## Ejecución diaria en Vercel

`vercel.json` agenda la ruta `/api/cron/contributions` a las 10:00 UTC. La ruta requiere `CRON_SECRET`, valida el runtime existente y procesa una transacción por titular habilitado en la allowlist. Una invocación fallida devuelve un estado HTTP de error sin datos del titular.

Hobby admite una ejecución diaria por cron con precisión de una hora. La entrega es de mejor esfuerzo. Para habilitar la ejecución sin abrir la app, configurar un `CRON_SECRET` de al menos 16 caracteres en el entorno autorizado y verificar una primera ejecución desplegada. [Límites de Vercel](https://vercel.com/docs/schedules/cron-jobs/usage-and-pricing) · [Seguridad y entrega del cron](https://vercel.com/docs/schedules/cron-jobs/manage-cron-jobs).

## Migraciones

Destino verificado en solo lectura. Neon proyecto `dry-voice-45959315`, rama `development` (`br-late-feather-b6czfkx0`), base `neondb`. El historial aplicado coincide con los primeros nueve SQL. Para llegar a F3-03 hay que aplicar los ocho SQL de la tabla en orden después de la autorización específica de [ADR 0004](../adr/0004-google-only-allowlist-auth.md).

| Orden | SQL exacto | SHA-256 | Impacto |
| --- | --- | --- | --- |
| 0010 | [Ciclos de tarjetas](../../src/db/migrations/0010_F2-04_card_cycles.sql) | `cd829c24be9ad2fcd8b3fd46ae29d0fa56e25b6e8018c88d16ee270ac1e5579d` | Añade ciclos auditados y el período de cierre en líneas de crédito. |
| 0011 | [Compras mixtas](../../src/db/migrations/0011_F2-05_mixed_purchases.sql) | `99ecb90c59b2e30be397b5120dff1ed279f6cfaf602da6345d08b457b68bdbb6` | Añade relaciones y distribución por categoría. Difiere la validación del vínculo de auditoría del reemplazo. |
| 0012 | [Préstamos](../../src/db/migrations/0012_F2-06_loans.sql) | `3d1ec927efd36399796f08bd78b2e5d5f4adb7e26c55eb15c16520ba4f264325` | Añade préstamos y operaciones. Amplía los tipos de evento permitidos. |
| 0013 | [Gastos compartidos](../../src/db/migrations/0013_F2-08_shared_expenses.sql) | `df9e4976395ed534f7f4d5a3ced16ae5ea951761dfaccef80064887e22be6b75` | Añade el reparto, sus vínculos a préstamos y validaciones de auditoría. |
| 0014 | [Devoluciones](../../src/db/migrations/0014_F2-09_purchase_refunds.sql) | `ba4800b36209437a14e988e7e824f41f11bccfbb8023b2bfd2e2316382887d9a` | Añade devoluciones, aplicaciones a cuotas y saldo a favor. Amplía los tipos de evento permitidos. |
| 0015 | [Catálogo de fondos](../../src/db/migrations/0015_F3-01_savings_funds.sql) | `f1c728994b1a6c103d79516fea3998e871e798419423d7b9b157d46d1a8018d7` | Crea fondos y auditoría con RLS por titular. |
| 0016 | [Efectos de reserva](../../src/db/migrations/0016_F3-01_reserve_effects.sql) | `d514325230518d9f58f1e7a633191e666155efefcfa403801012f4f05973620f` | Añade efectos y permisos limitados de reserva. Conserva las filas y versiones existentes. |
| 0017 | [Aportaciones mensuales](../../src/db/migrations/0017_F3-03_scheduled_contributions.sql) | `00cfc76826b23163b873cccdac42975bbbb00c6e739967ec499dc32f9c9dfd01` | Crea planes, períodos y auditoría con RLS. Agrega el disparador de pausa a los fondos. Las tablas nuevas empiezan vacías. |

El lote conserva los movimientos y saldos. El DDL puede tomar bloqueos breves sobre las tablas cuyas restricciones modifica.

Las metas y el cierre definitivo de fondos corresponden a F3-04.
