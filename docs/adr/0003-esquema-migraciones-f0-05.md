# ADR 0003 — Persistencia inicial F0-05

Fecha: 2026-11-07, America/Montevideo. Estado: implementación local preparada;
**aplicación en Neon pendiente de autorización expresa**. Producto v9.48,
RF-004, RNF-01/02/03/04/12/15, CA-001 (capa DB), I-10/11/12.

## Decisiones

Reutilizar `pg` 8.23.1 MIT y TypeScript/Node 24 ya fijados. SQL directo y
migraciones versionadas evitan un ORM y dependencias nuevas para seis tablas.
La [transacción usa un único cliente](https://node-postgres.com/features/transactions).
El ejecutor fija proyecto/rama/host/base, TLS verificado y comprobación de rama
devuelta por PostgreSQL antes del DDL. Conexión directa para migrar; conexión
pooled de Neon para consultas y prueba adicional, con contexto local a transacción.
No se crea ni se cambia el ciclo de vida de ninguna rama Neon.

Una migración SQL aditiva se aplica en una transacción, con advisory lock y
ledger de SHA-256. Reejecutar el mismo archivo no repite DDL; divergencia del
checksum o una migración desconocida abortan. Sin `down`, DROP ni limpieza de
datos: antes del commit un fallo revierte todo; después del commit se corrige
mediante otra migración aditiva revisada. No deshacer una migración aceptada
borrando tablas con datos. Ante pérdida de confirmación de commit, verificar
ledger antes de reintentar.

`finance.exact_amount` es dominio `numeric` sin typmod, con escala máxima 4,
valor absoluto menor que 10^16, y exclusión implícita de NaN/infinito por rango.
Mantiene el rango propuesto para NUMERIC(20,4), pero rechaza exceso de escala
antes de cualquier redondeo. [PostgreSQL redondea al usar typmod](https://www.postgresql.org/docs/current/datatype-numeric.html).
La representación de transporte es string; Money usa BigInt de unidades 10^-4,
reutilizando el contrato F0-09. Las cuatro posiciones son escala técnica; la
validación de precisión bancaria de cada formulario corresponde a su ticket.
No se instala parser float de pg, decimal adicional ni conversión FX.

## Aislamiento y límites de confianza

El rol `finanzas_app` es NOLOGIN, sin bypass RLS, sin DDL, UPDATE, DELETE ni
TRUNCATE. Solo USAGE de `finance` y SELECT/INSERT en seis tablas. RLS habilitada
y forzada, con USING/WITH CHECK por owner; sin contexto no se ve ni inserta nada.
FK `(owner_id,id)` impide relaciones cruzadas y unicidad
`(owner_id,idempotency_key)` evita colisiones dentro del titular.
Índices comienzan por owner para consultas y relaciones.

El `owner_id` es string opaco de la identidad externa. No se duplican cuentas
ni se crean FK hacia tablas internas administradas de Auth: evitar acoplarse
a su esquema de proveedor. F0-04 debe validar existencia, sesión fresca,
verificación y admisión antes de permitir cada transacción.

`withOwnerTransaction` recibe un resolver exclusivamente de servidor y fija
`SET LOCAL ROLE` + contexto local. **El contexto no autentica**: quien posea
credenciales SQL o pueda ejecutar SQL arbitrario puede elegir el owner. No
exponer esos privilegios, GUC, resolver o cliente a usuarios/HTTP. La conexión
propietaria existente sirve al tooling local de desarrollo; una credencial
LOGIN de runtime restringida y la integración Auth deben revisarse antes de
publicar. No se modifica `.env.local` para sustituir credenciales.

Los [propietarios y roles BYPASSRLS pueden eludir RLS](https://www.postgresql.org/docs/current/ddl-rowsecurity.html).
Las pruebas cambian efectivamente al rol restringido y verifican aislamiento
con y sin filtro owner, IDs ajenos, inserciones y FK cruzadas. Las identidades
A/B son sintéticas de DB: **no equivalen a dos sesiones Neon Auth**. CA-001 de
API, CA-006 y R-13 integral siguen abiertos por F0-04 y F1-08.

## Alcance inicial y exclusiones

Seis tablas financieras vacías, tipos, índices y políticas; una tabla técnica
de migraciones. Checkpoints/auditoría append-only para el rol de aplicación.
No se habilitan acciones de negocio, rutas financieras, UI, auto-onboarding,
saldos calculados ni correcciones históricas. Estados y claves son estructura,
no motor de idempotencia/respuesta/hash de comandos de F1-04. Integridad de
una operación completa entre evento/efectos/auditoría depende de ese servicio
futuro. I-10 se protege por permisos de anclas, sin declarar terminado el motor.
La jerarquía completa de categorías y auditoría de rectificaciones se validará
cuando existan esas mutaciones; no se habilitan ahora.

No se tocan `neon_auth`, `production`, datos reales, facturación ni F1.
