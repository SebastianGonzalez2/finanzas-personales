# F0-05 — Revisión técnica independiente del PR #11

Fecha: 2026-11-08, America/Montevideo. Base revisada: `f971bc7`, contra
`e3d1ec4`. Alcance: diff completo del PR #11, AGENTS, producto v9.48,
plan F0-05, ADR 0003 e informe de implementación. RF-004,
RNF-01/02/03/04/12/15, CA-001 en DB e invariantes I-10/11/12.

## Hallazgo y corrección

**P1, integridad:** `withOwnerTransaction` devolvía el resultado del trabajo
si la promesa de `COMMIT` se resolvía. Cuando el trabajo captura un error SQL
sin recuperar la transacción mediante savepoint, PostgreSQL contesta con la
etiqueta `ROLLBACK`: el helper podía informar éxito aunque nada persistiera.
Ahora exige `result.command === 'COMMIT'`; en caso contrario rechaza con
el error genérico existente, sin revelar detalles financieros.

La regresión usa PostgreSQL real: inserta una preferencia sintética, captura
una división por cero y devuelve un resultado aparente; el helper debe
rechazar, no dejar la fila y limpiar rol/contexto antes de reutilizar la conexión.
No cambia el SQL autorizado ni requiere migraciones adicionales en Neon.

## Resultado de la revisión

- Las seis políticas usan USING y WITH CHECK, owner opaco, contexto local y
  denegación sin contexto. Las FK y unicidad incluyen el titular. No existen
  rutas financieras ni un resolver Auth ficticio conectado a la aplicación.
- Permisos efectivos contrastados por una consulta de solo lectura al catálogo
  de development: seis tablas ENABLE/FORCE RLS; rol NOLOGIN/NOBYPASSRLS,
  sin superuser, creación de roles/base, herencia, UPDATE/DELETE/TRUNCATE,
  CREATE en finance ni USAGE en finance_meta/neon_auth. Políticas y ledger
  coinciden con el código. No se consultaron filas de usuarios ni sesiones.
- El dominio NUMERIC sin typmod rechaza escala excesiva y valores no finitos;
  Money usa BigInt y transporte string. No hay cálculo monetario final float.
- El migrador mantiene DDL y ledger en una transacción bajo advisory lock,
  valida destino/checksum y no usa conexión pooled para DDL. `db:plan`
  vuelve a producir el SHA aprobado `2b61f79cae12eb1b6c504e9a2f30f296ba00a2cf5df87281c91daa39f4e29c7b`.
- Diff sin nuevas dependencias, secretos detectados ni cambios de UI,
  production, Auth administrado, facturación o despliegue. Las escrituras
  nuevas de esta revisión se limitan al PostgreSQL desechable de CI.

**Límite de confianza vigente:** el GUC no autentica. Quien ejecuta SQL
arbitrario puede cambiar el owner; `SET LOCAL ROLE` sobre una conexión
propietaria tampoco elimina la posibilidad de `RESET ROLE`. Es una reducción
de privilegios para consultas de servidor confiables, no una frontera frente
a un atacante con las credenciales propietarias. Antes de publicar, F0-04
debe aportar Auth/admisión fresca y credencial LOGIN de runtime restringida,
sin capacidad de recuperar el rol propietario. La revisión no cierra R-13
integral, CA-001 de API ni CA-006.

## Pruebas y evidencia comprobada

- Head original `f971bc7`: seis checks vigentes SUCCESS, sin hilos de revisión
  pendientes. Log real de [F0 database](https://github.com/SebastianGonzalez2/finanzas-personales/actions/runs/42441395183/job/128611181107):
  PostgreSQL 17.6, integración 2/2, sin omitidos. No se aceptó solo el informe.
- Local: unitarios 9/9; formato, lint y typecheck pasan. Build inicial falló
  por EPERM al crear un directorio generado de `.next`; repetición con permiso
  de ejecución pasa, exit 0, sin desplegar.
- Nueva suite de integración: dos migradores concurrentes aplican una sola vez;
  checksum cambiado e historial desconocido abortan; dos conexiones con la
  misma clave producen un único evento; identidad inválida no ejecuta trabajo;
  COMMIT/ROLLBACK limpian el contexto y reutilizan conexión entre titulares;
  error SQL capturado rechaza el falso éxito. Esta suite solo usa el harness
  localhost protegido. Confirma esquema y un evento sintético exclusivamente
  en el contenedor desechable; nunca se importa al harness Neon de rollback.
- No hay PostgreSQL/Docker local disponible. La suite ampliada pasó realmente
  en CI sobre `4f65668`: Node informa 10/10 (tres pruebas principales y siete
  subpruebas), cero fallos/omitidos, PostgreSQL 17.6.
  [Log del job verificado](https://github.com/SebastianGonzalez2/finanzas-personales/actions/runs/42442291081/job/128613871547).
  Los seis checks de ese head pasan, incluido quality con build/unitarios/E2E.
  No se repitieron migraciones ni fixtures en Neon durante esta revisión.
- Protección de main leída por API: seis checks obligatorios, rama actualizada
  requerida y protección aplicada a administradores. No se modifica ni omite.

La integración está autorizada expresamente por el titular únicamente para
PR #11, condicionada a resolver hallazgos y pasar checks. El estado Merged,
SHA de main y checks del commit final se verifican en GitHub después del merge;
este documento no los da por ocurridos antes de ejecutarlos.

## Pendiente para F0-04

Integrar Auth en servidor y verificar sesiones frescas/revocadas, invitación
grupal reutilizable y su rotación para correo y Google, verificación OTP,
recuperación y entrega SMTP real. Validar dos sesiones y dos titulares contra
la capa DB usando credencial runtime restringida y pruebas negativas de API,
sin confiar en owner enviado por cliente ni caché de sesión obsoleta.
Los límites/costos y autorización de publicación siguen siendo una puerta
separada. F0 continúa abierta y no se inicia F1.
