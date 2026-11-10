# F2-08 · Gastos compartidos y pendientes de pago

**RF-025 · CA-035/036 · I-01/02/04/05/10/11/12.** Decisiones v9.23, v9.38 y v9.40 (§9.4.3–§9.4.5). El flujo usa los pagos y cobros de F2-06/07.

- En **Resumen → Nueva transacción → Gasto con otras personas**, una entrada de UYU 1.000 pagada por otra persona registra UYU 1.000 de consumo y una deuda del mismo importe. Bancos cambia al confirmar el pago de la deuda.
- Una cena de UYU 4.000 pagada con débito registra un débito de UYU 4.000, UYU 1.000 de consumo propio y tres derechos de UYU 1.000. Cada persona tiene su saldo, vencimiento opcional e historial. El cobro parcial o total aumenta Bancos y reduce esa obligación. La compra a crédito conserva el cargo confirmado y distribuye únicamente la parte propia entre las cuotas.
- Desde **Historial** se puede repartir un gasto existente de un solo medio, abrir sus obligaciones y corregir concepto, categoría y nota con versiones. Para cambios al saldo acordado de una obligación se usa **Actualizar pendiente** en su ficha. Los cambios de importe o medio del gasto, las anulaciones y las cancelaciones de cuotas que requieren coordinar efectos con obligaciones vinculadas quedan bloqueados. Los reembolsos se tratan en F2-09.

## Migración y permisos

[0013_F2-08_shared_expenses.sql](../../src/db/migrations/0013_F2-08_shared_expenses.sql) agrega el reparto, su historial de datos y una relación de origen con cada obligación. La FK incluye titular y moneda. Las tablas nuevas usan RLS forzada y permisos de lectura e inserción. Las vistas usan el rol del invocador. El bloqueo por titular y la idempotencia cubren el gasto, el reparto y las obligaciones en una sola transacción. Las anclas bancarias conservan las reglas de F1-05.

Destino previsto **Neon development, base neondb**, con migraciones aplicadas hasta `0012`. SHA-256 de `0013` según `npm run db:plan`:

`df9e4976395ed534f7f4d5a3ced16ae5ea951761dfaccef80064887e22be6b75`

La prueba se realizó en PostgreSQL 17.6 desechable. Para aplicar el SQL en Neon development se requiere autorización expresa del destino y hash. [ADR 0004](../adr/0004-google-only-allowlist-auth.md)
