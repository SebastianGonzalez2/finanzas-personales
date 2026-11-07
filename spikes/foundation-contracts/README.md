# F0-09 — Contratos experimentales

Node 24.19.0. Desde esta carpeta: `npm ci`, `npm run typecheck`, `npm test`, `npm run test:timezones`.
ADR y amenazas: [0001](../../docs/adr/0001-contratos-dominio-seguridad.md).

Sin dependencias de runtime. TypeScript/@types/node fijados con lockfile, Apache-2.0/MIT respectivamente; se conservan licencias en node_modules. No se implementan sesión Neon, DB, transacciones ni motor contable. La guarda de pertenencia recibe una identidad previamente validada por un adaptador de servidor **todavía inexistente aquí**. Nunca aceptar esa identidad desde el cuerpo de una petición. Pruebas de política sintética no son pruebas de autorización end-to-end.

Verificado localmente el 2026-11-07: instalación limpia, tipos estrictos, nueve pruebas y las nueve repetidas en tres husos pasan. CI independiente repite los contratos en Linux. RF-004/010/012, RNF-01/02/03/04/12/15, CA-001/006/013/014/015 e I-01/08/10/11/12: evidencia preparatoria; CA funcionales pendientes. Sin cambios de UI ni migraciones; auth, relaciones en DB y persistencia concurrente requieren F0-04/F0-05/F0-08.
