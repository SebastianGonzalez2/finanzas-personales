# F5-03 — Comercios y contactos

El catálogo privado normaliza mayúsculas, acentos y espacios y conserva el nombre registrado. Un gasto puede guardar su comercio y una obligación puede guardar su contacto en la misma transacción que la operación. Los gastos compartidos enlazan el contacto de cada obligación. El concepto se guarda por separado.

En **Comercios y contactos**, elegí el duplicado y el nombre que querés conservar. La vista previa cuenta los movimientos asociados a ambos. La confirmación comprueba las dos versiones y la cantidad mostrada. El duplicado pasa a ser un alias del canónico y aparece como el nombre canónico al autocompletar. Los vínculos originales quedan en el historial y el libro registra origen, destino y versión de la fusión.

Historial permite filtrar por comercio. Los enlaces anteriores a una fusión abren el historial del comercio canónico. Los gastos por comercio se pueden consultar por mes y moneda y comparten las reglas de imputación de cuotas, compras mixtas y gastos compartidos de Resumen. Los gastos existentes sin un comercio identificado y las obligaciones existentes sin contacto conservan sus datos originales.

Archivar quita la entrada de las sugerencias. Las referencias existentes siguen disponibles en el historial de gastos y el detalle de las deudas. Una deuda de un contacto archivado se puede seguir cobrando o pagando.

La migración `0023_F5-03_catalogo_nombres.sql` crea catálogos, vínculos por titular y la vista que resuelve los alias. Todas las escrituras del catálogo y sus vínculos usan un bloqueo transaccional por titular. La aplicación en Neon development requiere la aprobación del [ADR 0004](../adr/0004-google-only-allowlist-auth.md).

Pruebas automatizadas en `tests/unit/catalog.test.mjs`, `tests/integration/catalog.test.mjs`, `tests/integration/shared-expenses.test.mjs` y `tests/e2e-finance/catalog.spec.mjs`. Cubren [RF-041](01-alcance-y-requisitos.md) y [CA-053 a CA-055](03-criterios-de-aceptacion.md), incluidos reintentos concurrentes, aislamiento A/B, referencias históricas, cuotas y totales exactos.
