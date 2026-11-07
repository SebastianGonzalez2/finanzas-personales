# F0-08 — Prototipo puro de efectos bancarios y checkpoints

2026-11-07. Rama `codex/F0-08-prototipo-checkpoints`, apilada sobre F0-09 (PR #6, SHA 353764a). **Revisión previa de dependencias:** contratos exactos/fechas/propiedad disponibles y con CI verde; F0-04/F0-05 no tienen entorno Neon validado. Por eso se implementa exclusivamente una función pura de laboratorio, sin rutas, credenciales, DB ni escrituras. No se usa dinero real. No se cambia auth ni otro ticket existente.

Alcance: `spikes/foundation-contracts/checkpoints.ts`, tests y esta nota. Usa el tooling del spike F0-09 y su workflow, sin nuevas dependencias. `npm ci`, `npm run typecheck`, `npm test` desde esa carpeta. El prototipo no se importa desde la aplicación.

La proyección ordena fecha efectiva y secuencia explícita; al llegar a un checkpoint devuelve `confirmado - proyectado` y toma el confirmado como nueva ancla. Solo suma efectos bancarios confirmados de la moneda pedida; pending/voided no afectan banco. No produce ingresos/gastos para compensar diferencias. Rechaza IDs duplicados, orden ambiguo, dueño ajeno y valores inválidos. La secuencia es un requisito técnico del experimento para no adivinar el lugar de un movimiento del mismo día; el adaptador futuro debe fijar una regla verificable antes de persistirla.

Corregir devuelve un nuevo conjunto de efectos y auditoría antes/después con motivo/actor/instante. No edita anclas y valida todas las proyecciones antes de devolver resultado; un error no cambia la entrada. La diferencia devuelta permite mostrar inconsistencia, pero **no existe UI todavía**. La salida auditada debe persistirse atómicamente con el evento en el futuro; devolver objetos no demuestra transacción DB.

Caso CA-015/I-10: inicial enero 1000; efecto febrero -100; checkpoint marzo 900; abril +100; checkpoint mayo 1000; junio -10. Actual 990. Corregir febrero a -150 deja actual 990 y ambas anclas intactas; marzo muestra diferencia +50, mayo 0; existe auditoría -100 → -150 y ningún evento compensatorio. Editar junio a -20 sí cambia actual a 980.

Pruebas: siete casos nuevos (además de nueve contratos base) cubren ese escenario, corrección posterior, orden intradía, anulación/pending, tres monedas, suma exacta, dueño/duplicados/ancla y rechazo por overflow sin mutación. No prueba concurrencia, reintento de comando persistido ni migraciones; rechazar un ID duplicado no equivale a idempotencia de servicio. No hay implementación de métricas/categorías, reservas/deudas ni restricciones dependientes de otros módulos. No habilita edición/anulación real en F1.

Resultados locales observados: `npm ci --ignore-scripts --no-fund --no-audit` pasa; `npm run typecheck` pasa; `npm test` 16/16; `npm run test:timezones` 48/48 (los 16 casos en tres husos); `git diff --check` pasa. El workflow heredado ejecuta contratos y prototipo en Linux para el PR.

Trazabilidad: F0-08, RF-008/010/012/013; RNF-02/03/04; CA-011/013/015 (parte pura del saldo, no aceptación funcional completa); I-01/10/12, sin contradecir I-02…09/11. R-04 parcialmente mitigado por prueba del algoritmo; R-12 depende del contrato exacto; R-13/R-19 abiertos. Persistencia/autorización real requieren F0-04/F0-05 y F1-04/05, junto con prueba DB concurrente, auditoría y UI de diferencias. Sin migraciones, cambios de UI, pagos ni despliegues. Revisión humana del modelo y reglas de orden pendiente.
