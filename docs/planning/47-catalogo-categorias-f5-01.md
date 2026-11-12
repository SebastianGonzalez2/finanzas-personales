# F5-01 — Catálogo de categorías y subcategorías

Cada titular tiene un catálogo de ingresos y gastos con dos niveles. Las categorías y subcategorías iniciales de v6.3/v6.6 usan identificadores estables y se guardan como filas privadas al usarlas como categoría, como superior de una nueva subcategoría o al archivarlas. Los nombres se comparan dentro del mismo tipo y nivel superior, normalizando mayúsculas, espacios y Unicode.

Desde los formularios de movimientos, compras con tarjeta, gastos compartidos, recurrentes y presupuestos, así como desde la corrección de historial, se puede crear una categoría o subcategoría. Queda seleccionada en el formulario abierto, que conserva sus otros campos. El registro financiero requiere su propia confirmación.

En **Categorías**, archivar una categoría superior oculta también sus subcategorías en nuevas asignaciones. Al restaurarla vuelven a estar disponibles las subcategorías que estaban activas. Una subcategoría archivada individualmente conserva su estado al restaurar la superior.

El archivo cambia solo `archived_at`. El historial conserva el identificador y el nombre, y permite mantener la categoría original al corregir el movimiento. RLS y claves foráneas por titular siguen protegiendo las relaciones. La creación, asignación y archivo se serializan por titular para que un formulario anterior al archivo reciba un rechazo al intentar una nueva asignación.

La migración `0027_F5-01_category_archive.sql` otorga al rol `finanzas_app` permiso de actualización únicamente sobre `archived_at`. Su aplicación en Neon development requiere la aprobación específica del ADR 0004.

[RF-039](01-alcance-y-requisitos.md) · [CA-051](03-criterios-de-aceptacion.md) · [I-12](02-modelo-de-dominio-y-datos.md). Siguiente ticket, F5-02.
