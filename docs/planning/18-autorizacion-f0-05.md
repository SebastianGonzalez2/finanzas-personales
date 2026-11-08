# F0-05 — Cambios exactos propuestos para development

Estado: **pendiente de autorización; ninguna escritura Neon ejecutada**.
Destino exclusivo: proyecto `dry-voice-45959315`, rama `development`
`br-late-feather-b6czfkx0`, endpoint `ep-falling-queen-b63xbfuk`, base `neondb`.
Base Git: `e3d1ec456054f659aef848aafd2e8f070b5452e8`.

El SQL completo revisable es
[`0001_F0-05_initial.sql`](../../src/db/migrations/0001_F0-05_initial.sql).
`npm run db:plan` calcula su SHA-256 sin conectar a Neon. El ejecutor exige
ese hash con `--apply` y verifica destino antes de cualquier DDL.

## Objetos que se crearán

| Objeto | Columnas / cambios |
| --- | --- |
| Rol `finanzas_app` | NOLOGIN, NOSUPERUSER, NOCREATEDB, NOCREATEROLE, NOINHERIT, NOBYPASSRLS. Membresía para el usuario que ejecuta la migración (`neondb_owner` actual). |
| Esquemas `finance`, `finance_meta` | Sin permisos PUBLIC. Rol app solo USAGE en finance. |
| `finance.currency` | Dominio text: UYU, USD, EUR. |
| `finance.exact_amount` | Dominio numeric exacto: escala <=4, -10^16 < valor < 10^16. Rechaza overflow, NaN e infinitos. |
| `finance_meta.schema_migrations` | version text PK; sha256 text de 64 hex obligatorio; applied_at timestamptz default now(). Solo tooling propietario. |
| `finance.user_preferences` | owner_id text PK (1–200 caracteres), display_currency (USD default), language (`es`), version integer >0 default 1. |
| `finance.categories` | owner_id, id UUID (PK compuesta); parent_id UUID opcional con FK del mismo dueño y distinta de id; kind income/expense; name 1–100; archived_at timestamptz opcional. |
| `finance.financial_events` | owner_id, id UUID (PK compuesta); kind income/expense/bank_transfer/balance_adjustment; concept 1–200; effective_on date; status confirmed/corrected/voided (confirmed default); idempotency_key UUID única por dueño; command_hash 64 hex; created_at timestamptz. |
| `finance.bank_effects` | owner_id, id UUID (PK compuesta); event_id UUID con FK del mismo dueño; currency; amount_signed exacto distinto de cero; effective_on date. |
| `finance.balance_checkpoints` | owner_id, id UUID (PK compuesta); currency; confirmed_amount exacto; as_of_date date; source manual; created_at timestamptz. |
| `finance.audit_changes` | owner_id, id UUID (PK compuesta); event_id UUID opcional con FK del mismo dueño; change_type created/corrected/voided/checkpoint_confirmed; created_at timestamptz. |

Todo campo es NOT NULL salvo los señalados opcionales. No se crean usuarios,
cuentas espejo, extensiones, funciones SECURITY DEFINER, triggers, servicios
ni seeds. No se cambia ni lee el contenido de usuarios/sesiones de Neon Auth.

## Índices y permisos

Además de índices PK/UNIQUE, se crean cinco índices:

- Eventos: `(owner_id,effective_on DESC,id)`.
- Efectos: `(owner_id,event_id)` y `(owner_id,currency,effective_on DESC,id)`.
- Checkpoints: `(owner_id,currency,as_of_date DESC,id)`.
- Auditoría: `(owner_id,event_id)`.

Las PK/UNIQUE adicionales las crea PostgreSQL.

Cada una de las seis tablas finance recibe ENABLE + FORCE RLS y una política
`owner_isolation`, USING/WITH CHECK según `finance.owner_id`, solo para
`finanzas_app`. Se conceden SELECT e INSERT; no UPDATE/DELETE/TRUNCATE/DDL.
Sin contexto no hay filas visibles ni inserts permitidos. No hay permisos
sobre finance_meta ni neon_auth para este rol.

## Escrituras de validación solicitadas

Tras aplicar la migración, se registrará una única fila de ledger con versión
y checksum. Se reejecutará el migrador para comprobar que no repite cambios.
Se probará el mismo SQL desde cero en PostgreSQL desechable de CI.

En development se insertarán **solo fixtures sintéticos A/B** en las seis
tablas finance, dentro de transacciones terminadas con ROLLBACK, tanto por
conexión directa como pooled. No se confirmará ningún dato financiero de
prueba. Se ensayarán SELECT/INSERT ajenos y FK cruzadas; intentos UPDATE
y CREATE del rol limitado deben fallar por permisos, sin modificar datos.
La ausencia de DELETE/TRUNCATE se verifica consultando privilegios, sin
ejecutar esas instrucciones. Un intento SELECT del rol contra neon_auth debe
ser denegado. No habrá limpieza ni operaciones destructivas.

Pruebas monetarias: 0.1+0.2 exacto por moneda, cifras superiores a
Number.MAX_SAFE_INTEGER, máximo y mínimo, rechazo de escala >4, moneda ajena,
overflow, NaN, infinito y cero en efectos. Unicidad por titular, rollback de
operación incompleta y borrado del contexto al terminar la transacción.
No se insertan usuarios Auth ni se presentan estas pruebas como sesiones reales.

## Recuperación y límites

DDL + ledger atómicos bajo advisory lock. Fallo antes de commit: ROLLBACK.
Después de commit: solo corrección aditiva revisada, sin down destructivo.
`.env.local` se preserva. Sin cambios en production, pagos, merge, deploy ni F1.
Auth/invitaciones/SMTP y validación end-to-end continúan pendientes.

Trazabilidad y decisiones: [ADR 0003](../adr/0003-esquema-migraciones-f0-05.md).
