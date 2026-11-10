# F3-02 — Disponible libre y reservas atómicas

En **Resumen → Disponible libre**, cada moneda muestra el importe libre, el saldo bancario vigente y el importe reservado cuando existe. La proyección bancaria y la suma de reservas del titular se leen en una única consulta. El mismo cálculo alimenta Fondos y se mantiene en la moneda original.

Las operaciones monetarias de Bancos y Fondos comparten un bloqueo transaccional por titular. Una salida que reduce el saldo vigente, o una corrección que quita una acreditación vigente, solo puede usar el disponible libre de su moneda. Las ediciones de movimientos y transferencias validan la reducción neta por moneda. Una confirmación manual puede registrar un saldo real inferior a las reservas y revelar un disponible negativo. Las nuevas reservas y las salidas que reducirían ese disponible se rechazan hasta recuperar cobertura. Las correcciones cubiertas por una confirmación conservan el saldo bancario vigente.

La protección cubre gastos, la parte bancaria de compras mixtas, cambios de moneda, pagos de tarjetas, débitos por préstamos y anulaciones o correcciones que reducen el saldo vigente. Por ejemplo, con 1.200 UYU en Bancos y 1.000 UYU reservados, un gasto de 200,0001 UYU se rechaza. Un gasto de 200 UYU registra un único débito y deja 1.000 UYU en Bancos, 1.000 UYU reservados y cero disponible.

[RF-026 y RF-030](01-alcance-y-requisitos.md) · [CA-041](03-criterios-de-aceptacion.md) · [I-01/02/03/06/12](02-modelo-de-dominio-y-datos.md). F3-02 cubre la validación atómica del disponible para CA-041. La asignación explícita de fondos a gastos y pagos de tarjeta corresponde a F3-05.

F3-02 reutiliza las tablas y RLS de F3-01. Las migraciones de esa dependencia siguen el [procedimiento de autorización de Neon development](42-fondos-ahorro-f3-01.md). El siguiente ticket es F3-03, aportes mensuales programados.
