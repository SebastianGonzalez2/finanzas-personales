# F0-06 — Pruebas y CI

Base: scaffold F0-03, PR #2 integrado; F0-06 también integrado. Este ticket agrega infraestructura de pruebas; no implementa auth, esquema ni motor financiero de aplicación. Estado vigente: [integración controlada](planning/16-integracion-controlada-f0.md).

Los spikes aislados llevan sus propios package/tsconfig/pruebas y quedan fuera del formato/lint/tsconfig de la app. Evita que el target ES2017 de Next compile contratos Node/BigInt o que la app requiera dependencias de un experimento. Al incorporar un spike hay que ejecutar sus verificaciones propias; F0-09 incluye workflow dedicado. Esto no excluye src ni tests de aplicación.

- `npm ci`: instalación reproducible en Node 24.19.0/npm 11.17.0.
- `npm run check`: formato, ESLint, tipos y build.
- `npm run test:unit`: Node test runner incorporado; guardas del entorno desechable.
- `npx playwright install chromium`, `npm run build`, `npm run test:e2e`: Chromium real, 1440×900 y 390×844, portada/teclado/desborde. Puerto 3106 exclusivo; no reutiliza servidores ajenos. No certifica navegadores móviles nativos.
- `npm run test:integration`: PostgreSQL real; **falla** si no existe el servicio o faltan las variables; no salta tests ni toma `DATABASE_URL`.

## PostgreSQL desechable

CI provisiona PostgreSQL 17.6 en el runner Ubuntu. El driver `pg` es solo de desarrollo y no decide ORM/driver de producción F0-05. Las credenciales siguientes son públicas y solo corresponden a ese contenedor, sin datos persistentes ni reales. En local, requiere Docker ya instalado:

```sh
docker run --rm --name finanzas-f0-test -p 127.0.0.1:55432:5432 -e POSTGRES_USER=f0_test -e POSTGRES_PASSWORD=f0_test -e POSTGRES_DB=finanzas_test postgres:17.6
```

En otra terminal PowerShell:

```powershell
$env:TEST_DATABASE_CONFIRM = 'isolated-local-test'
$env:TEST_DATABASE_URL = 'postgresql://f0_test:f0_test@127.0.0.1:55432/finanzas_test'
npm run test:integration
```

Detener con Ctrl+C la terminal del contenedor al terminar. Nunca adaptar la guarda a una DB real. La prueba usa tabla temporal y rollback: verifica NUMERIC exacto, clave compuesta por titular y ausencia de escritura parcial. **No prueba aislamiento del esquema de la aplicación**; eso depende de F0-04/F0-05 y CA-001/006.

## Merge y seguridad de CI

**Configuración vigente verificada por API:** main protegido con rama actualizada obligatoria, reglas también para administradores, sin fuerza/borrado y seis checks requeridos de GitHub Actions: `F0 quality`, `F0 database`, `F0 visual documentation`, `F0 contracts`, `F0 auth spike`, `F0 provider evidence`. PR obligatorio, mínimo de reviews aprobatorias 0. Se observó bloqueo mientras checks pendientes y habilitación al pasar; no se intentó fusionar un head fallido. La inspección sin protección y recomendaciones siguientes son históricas, anteriores a F0-INTEGRATE.

Checks únicos: `F0 quality` y `F0 database`. Workflow en PR/push de la rama F0-06 y main; sin filtros que omitan archivos, sin secretos ni `pull_request_target`, permisos `contents: read`, checkout sin persistir credenciales, 15/10 minutos y cancelación de runs obsoletos. No publica artefactos financieros ni despliega. Node nativo evita otra dependencia para unidad; Playwright 1.65.0 Apache-2.0 y pg 8.23.1 MIT son compatibles con Node 24; lockfile y licencias de la instalación conservados.

**Inspección 2026-11-07:** repositorio privado, permisos admin disponibles, `main` sin protección (404) y sin rulesets (`[]`). Un check rojo por sí solo **no impide** un merge. [GitHub limita protección en repos privados según plan](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches). No se cambió visibilidad ni plan. Activar checks obligatorios después de integrar scaffold/CI y comprobar disponibilidad en la cuenta; antes dejaría PR anteriores sin checks requeridos. No se afirma cumplido ese criterio de F0-06 hasta verificar bloqueo efectivo con prueba negativa.

Referencias oficiales: [Node 24 test runner](https://nodejs.org/docs/latest-v24.x/api/test.html), [Playwright web server](https://playwright.dev/docs/test-webserver), [pg transacciones](https://node-postgres.com/features/transactions), [PostgreSQL en Actions](https://docs.github.com/en/actions/tutorials/use-containerized-services/create-postgresql-service-containers).

## Evidencia local 2026-11-07

`npm run check`: pasa. `npm run test:unit`: 3/3. `npm run test:e2e`: 2/2. `npm audit --json`: cero avisos. Integración local sin variables: falla cerrada, esperada; no hay Docker/psql/postgres instalados. Primer intento E2E aislado quedó sin respuesta local; se canceló y repetición fuera del sandbox pasó. Un segundo intento simultáneo falló EADDRINUSE y no se ocultó reutilizando el servidor.

RF-004/RNF-01/02/03/12, CA-001/006/013/014/066, I-11/12: infraestructura y comprobaciones parciales, **no aceptación funcional**. Sin migraciones ni cambios de UI, Neon o datos. R-13/R-19 abiertos. CI remoto y prueba negativa se registran en el PR con su SHA. Siguiente: F0-05 en entorno Neon aislado; protección ya aplicada, con los límites descritos arriba.

## Evidencia remota negativa

[Run 42405689022](https://github.com/SebastianGonzalez2/finanzas-personales/actions/runs/42405689022), SHA `14b8ff3`: `F0 quality` falla exactamente en el centinela unitario (3 pasan, 1 falla); formato/lint/tipos/build pasan. `F0 database` pasa contra PostgreSQL real. El test temporal se elimina en un commit nuevo, conservando la evidencia histórica. Esto demuestra propagación del fallo al check, **no** protección efectiva de merge. No se intentó hacer merge como experimento.
