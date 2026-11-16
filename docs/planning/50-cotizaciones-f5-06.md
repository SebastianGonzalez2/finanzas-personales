# F5-06 — Cotizaciones de referencia y moneda de visualización

RF-046 · CA-060 · R-11 · I-01, I-02, I-03, I-08, I-10, I-11 e I-12.

- El Resumen guarda UYU, USD o EUR por cuenta en `finance.user_preferences`. USD es el valor inicial. Estadísticas y Fondos heredan esa preferencia y permiten elegir otra moneda para su vista.
- El Resumen y Fondos valorizan los saldos vigentes con cotizaciones de referencia actuales. El flujo y patrimonio históricos se valorizan por fecha efectiva de cada movimiento o posición. Se conserva la moneda original en los detalles.
- La tasa histórica queda fijada al primer uso por titular, fecha efectiva y par dirigido. Una corrección de fecha consulta la tasa fijada para la nueva fecha, o registra una si aún falta. El registro de la fecha anterior queda disponible para reconstruir esa valoración. Las tasas manuales son privadas e inmutables y se aplican a las equivalencias históricas del mismo par y día.
- Los agregados históricos multiplican importes exactos por su tasa antes de sumar. El resultado se redondea a cuatro decimales, con los empates alejándose de cero. Cada devolución conserva su fecha y su métrica separada. Cambiar de moneda de visualización únicamente escribe una preferencia.

## Proveedores y cobertura

El servidor pide ventanas públicas por año y un mes de margen al inicio. Las solicitudes contienen únicamente los límites de calendario y códigos de las series. Las series USD/UYU y EUR/UYU del BCU vienen de datosUruguay. El cruce EUR/USD usa dos observaciones del mismo día y se atribuye a ambas series. Frankfurter v2 cubre los pares que falten o tengan huecos largos. Una cotización reciente de la fuente principal tiene prioridad sobre el respaldo y cubre fines de semana y feriados. Si ambas fuentes están indisponibles para ese día, se usa la última observación válida en caché con fecha anterior o igual. Si falta, se mantienen los importes originales y se ofrece ingreso manual en el histórico.

La caché compartida se actualiza al consultar, una vez por día para el año en curso y cada 30 días para años históricos completos. Si queda cobertura incompleta se reintenta al cabo de una hora o del `Retry-After` si es mayor. La lectura de años pendientes y la importación se hacen en transacciones breves. La consulta a los proveedores ocurre fuera de ellas. El proceso comparte consultas simultáneas por año y PostgreSQL comprueba la vigencia al importar para conservar un solo resultado entre instancias. Las cotizaciones de proveedores conservan su fecha de observación, par, fuente e importe decimal. El runtime puede añadir observaciones y lecturas históricas, con RLS en las valoraciones privadas.

Las consultas de F0-07 y los GET públicos repetidos para F5-06 verificaron ambos formatos y cobertura de UYU, USD y EUR. [datosUruguay API](https://datosuruguay.com/api) · [Licencia CC BY 4.0](https://datosuruguay.com/licencia-de-datos) · [Frankfurter v2](https://frankfurter.dev/) · [Evidencia pública de F0-07](../evidence/f0-07-probe.json).

## Migración

`0033_F5-06_reference_exchange_rates.sql` crea el caché público, sus metadatos de actualización y las valoraciones privadas. Habilita al runtime a guardar la moneda y versión en el registro existente de preferencias, bajo RLS. Destino previsto para la siguiente validación compartida: Neon `development`, base `neondb`. Su aplicación requiere la aprobación específica de SQL y SHA-256 conforme al ADR 0004. El plan se puede generar con `npm run db:plan`.

## FIX-FX — Cuotas nuevas

Presupuestos conserva la fecha efectiva de las compras ordinarias y respeta las referencias ya fijadas en `budget_rates`. Estadísticas y Presupuestos reutilizan `fx_valuations` para las cuotas nuevas, con el primer día de cada mes del plan como fecha de referencia. Los pares sin observación automática válida pueden usar una tasa manual del primer día de ese mes. Mientras el mes sea futuro, Presupuestos calcula una estimación con referencias públicas disponibles hasta hoy. El cálculo de avisos usa referencias históricas y excluye las estimaciones.

El informe de Estadísticas prepara y verifica las referencias para toda la selección, la ventana de gráficos y la comparación. Los gráficos mantienen su ventana de hasta 12 meses. Los detalles muestran la moneda y el importe de la cuota; las referencias de visualización quedan asociadas al titular, la fecha y el par dirigido.

### Migración 0039

SQL exacto en [0039_FIX-FX_installment_monthly_reference.sql](../../src/db/migrations/0039_FIX-FX_installment_monthly_reference.sql). SHA-256 `95f814d7536962146a8e2cac282c84b2c342c0059e8dc09e0039ce85c7c19d67`. Destino previsto para una aplicación posterior aprobada, Neon `development`, base `neondb`. El cambio agrega un indicador de política en `installment_plans` y actualiza dos vistas y el disparador que captura referencias de Presupuestos. La primera versión del plan determina la política en revisiones futuras. El runtime marca explícitamente el plan al crearlo con la nueva política. Los registros anteriores y las compras hechas por el runtime anterior durante una actualización conservan el criterio previo y sus referencias. El DDL puede tomar un bloqueo breve y actualiza la huella técnica del inventario de copias para incluir el indicador. Los registros financieros quedan intactos. El restablecimiento sigue exigiendo una copia compatible con el esquema vigente. La ejecución compartida requiere autorización específica conforme al ADR 0004.

## Comprobación de CA-060

Cargar un gasto sintético de 10 EUR el domingo 1 de noviembre de 2026. Con EUR/USD del viernes a 1,25, abrir Estadísticas en USD y verificar 12,50 USD. El detalle conserva EUR 10 y muestra la fecha efectiva, la cotización del viernes y su fuente. Cargar después una observación distinta para el domingo y volver a consultar. El gasto conserva 12,50 USD. Al corregir la fecha al lunes con cotización de 1,50, el informe muestra 15,00 USD.
