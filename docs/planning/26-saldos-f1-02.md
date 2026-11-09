# F1-02 — Saldos bancarios iniciales por moneda

**Trazabilidad:** F1 · RF-005 · CA-007 · I-01, I-10 (preservación de anclas),
I-11 e I-12. [Plan](05-plan-de-implementacion.md) ·
[Decisiones de producto, §4](../product/decisiones-producto.md#4-cuentas-bancarias--confirmado) ·
[Modelo, §§3–6](02-modelo-de-dominio-y-datos.md).

- En **Resumen → Dinero disponible**, cada titular puede configurar por
  separado Bancos UYU, USD y EUR. Las monedas pendientes no bloquean el
  resumen ni se muestran como cero. La fecha corresponde al saldo que la
  persona consultó, se guarda como fecha de calendario y no puede ser
  posterior a hoy en Montevideo.
- Cada apertura es un checkpoint manual inmutable de F0-05 con el importe
  exacto y una fila de auditoría en la misma transacción. Ambas filas
  comparten identificador, dentro de sus respectivas tablas y del mismo
  titular. La apertura no escribe eventos financieros ni efectos bancarios.
- El ID de apertura es fijo por moneda y está bajo la clave primaria
  `(owner_id, id)` existente. Un reintento con importe y fecha equivalentes
  devuelve éxito sin escribir otra vez; una apertura distinta para una
  moneda ya configurada devuelve conflicto. Para otros checkpoints futuros
  se usan IDs propios. La lectura trae solo la última referencia de cada
  moneda del titular autorizado.
- No cambia el esquema, los permisos ni la configuración de Neon. Se
  conserva la sesión Google validada en servidor y la RLS de F0; el cliente
  no puede enviar un identificador de titular. El cálculo posterior al
  ancla corresponde al registro de movimientos y su motor (F1-03/F1-04);
  la actualización manual y la conciliación histórica corresponden a F1-05.

## Revisión manual en desarrollo

En el entorno privado configurado según la [guía Google](../development-google-auth.md),
abrir `/resumen` con un titular de prueba sin saldos. Guardar **10000 UYU**
con fecha **31/01/2026**, **100 USD** con fecha **01/02/2026** y dejar EUR sin
configurar. Recargar: se ven **10.000,00 UYU** y **100,00 USD** con sus fechas
respectivas, EUR sigue sin configurar e ingresos y gastos siguen sin datos.
Guardar después **0 EUR** y comprobar que se muestra **0,00 EUR**. En otro
titular las tres monedas deben seguir sin configurar.

## Verificación

- `npm run check`: formato, lint, tipos y build correctos.
- `npm run test:unit`: 14 pruebas; `npm run test:integration`: 23 pruebas
  contra PostgreSQL 17.6 local desechable; `npm run test:e2e`: 8 pruebas
  en Chromium, incluidas peticiones anónimas y de otro origen.
- Flujo positivo en Chromium 1440×900 y 390×844, con API y PostgreSQL
  reales en una copia de prueba con dos identidades sintéticas: guardado,
  recarga, cero, error de importe, foco, ausencia de desborde y aislamiento.
  [Escritorio](../evidence/f1-02/escritorio-1440.png) ·
  [Móvil](../evidence/f1-02/movil-390.png). Esta prueba no usa OAuth ni Neon
  reales; no sustituye la prueba HTTPS entre dispositivos del ADR 0004.
