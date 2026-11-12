# 47 — Informes PDF/Excel/CSV y exportación (F5-07, ruta MIX)

## Reparto MIX (matriz `10-modelos-por-ticket.md`)

| Tramo | Responsable | Alcance |
| --- | --- | --- |
| Diseño de informe, formatos y UI de exportación | OpenCode (este ticket) | `src/lib/export/report-format.ts`, `src/app/informes/`, `src/components/informes-panel.tsx`, entrada de navegación, contrato del endpoint |
| Exportación privada, cifrado, backup y restore seguros | Codex (misma rama/commits) | Generación server-side de archivos, cifrado opcional, restauración completa, pruebas de seguridad (RF-048/049, CA-061…063) |

## Diseño del informe del período

Definido como datos puros en `src/lib/export/report-format.ts` (reutilizable por la UI y por el generador de Codex). Secciones:

1. **Resumen del período** — totales por moneda y concepto. Las transferencias internas entre cuentas propias no se cuentan como ingreso ni gasto.
2. **Movimientos** — movimientos confirmados del rango, con fecha, tipo, categoría, banco, tarjeta, cuotas, moneda, importe, estado de confirmación e identificador trazable.
3. **Saldos por banco** — saldo confirmado (checkpoint) al cierre; la proyección se reporta aparte y nunca reemplaza el checkpoint.
4. **Tarjetas** — por ciclo: compras, pagos y saldo pendiente. Pagar una tarjeta reduce deuda y banco sin duplicar el gasto.
5. **Presupuestos** — asignado, gastado y restante por categoría y mes; los reembolsos acreditados en otro mes no reducen el presupuesto (v9.42).
6. **Fondos de ahorro** — aportado, objetivo y disponible al cierre.

Reglas transversales: importes como **texto decimal exacto** (sin floats), fechas `YYYY-MM-DD`, moneda en columna separada, solo datos del titular de la sesión (RLS), sin credenciales, cookies ni datos de otras cuentas (CA-061).

## Formatos

| Formato | Extensión | MIME | Especificación |
| --- | --- | --- | --- |
| CSV | `.csv` | `text/csv` | UTF-8 con BOM, separador `;` (Excel es-UY), comillas RFC 4180, secciones apiladas con encabezado repetido. |
| Excel | `.xlsx` | `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` | Una hoja por sección; importes como texto con escala exacta (evita IEEE-754). |
| PDF | `.pdf` | `application/pdf` | Paginado, una sección por capítulo, total por moneda al cierre de cada capítulo. |

Nombre de archivo: `finanzas-<desde>_<hasta>.<ext>` (p. ej. `finanzas-2026-02-01_2026-02-28.csv`). Período máximo: 366 días (`parseReportPeriod` valida calendario, orden y tope; el valor por defecto es el mes en curso de `America/Montevideo`, igual que `bankReferenceToday`).

## Contrato del endpoint (`POST /api/export`)

- Solicitud: JSON `{ from, to, format }` con `format ∈ csv | excel | pdf`; origen propio y sesión Google del titular obligatorios (andamiaje ya implementado con `freshGoogleSession`, cabeceras `googlePrivateHeaders`).
- Respuesta exitosa (Codex): archivo binario con `Content-Disposition: attachment; filename="..."` y cabeceras privadas; streaming para archivos grandes.
- Errores: `400` período/formato inválido, `401` sin sesión, `403` origen cruzado, `503` acceso no configurado, `501` mientras no exista la generación segura (estado actual).
- La UI (`/informes`) ya descarga y guarda el archivo cuando la respuesta es exitosa y muestra `501` como estado informativo honesto hasta completar la parte crítica.

## Pendiente de Codex (parte crítica, misma rama)

1. Generación server-side de CSV/XLSX/PDF a partir de los datos del titular, con consultas owner-scoped y sin exponer datos de otros usuarios; elegir dependencias libres (xlsx/pdf) revisando licencia y compatibilidad antes de agregarlas.
2. Cifrado opcional con contraseña (KDF + AES-256-GCM o equivalente) y verificación de integridad (SHA-256); con clave incorrecta **no se reemplaza ninguna fila** (CA-062).
3. Restauración/copia completa de cuenta: advierte pérdida de cambios posteriores, ofrece backup del estado actual y **reemplaza** (no fusiona) solo el dominio financiero del titular (CA-063, RF-049).
4. Pruebas: unitarias de formatos y validación, integración con DB desechable (owner A/B, concurrencia), E2E de CA-061 y regresión. No desactivar tests ni atribuir resultados no observados.
