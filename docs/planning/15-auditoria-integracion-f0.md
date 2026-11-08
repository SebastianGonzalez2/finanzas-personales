# F0-REVIEW — Auditoría y preparación de PR #1–#8

**Informe histórico de auditoría anterior a la autorización.** La decisión y las fusiones posteriores, los nuevos heads y la protección aplicada se registran en [F0-INTEGRATE](16-integracion-controlada-f0.md). La ausencia de autorización/protección y las bases descritas a continuación corresponden al corte de revisión, no al estado vigente.

**Fecha:** 2026-11-07, America/Montevideo. **Decisión pendiente del titular:** autorizar integración; **ningún PR fusionado ni aprobado mediante review de GitHub**. No se modificó main, producción, proveedores, facturación ni datos reales. La aprobación técnica de un artefacto parcial no equivale a cerrar su ticket ni la fase F0.

## Método y estado de Git

Se revisaron AGENTS, convenciones, documentación de planificación y producto v9.48, los archivos de cada diff, lockfiles/instalaciones, tests, informes y checks actuales. Las reseñas e hilos inline de GitHub estaban vacíos en los ocho PR. No se evaluaron solo sus descripciones. Base remota `main`: **e493658**, sin cambios durante la revisión. La rama local main sigue en su posición previa, sin actualizarla ni modificarla.

Se utilizaron worktrees aislados. PR #3 se corrigió desde HEAD separado y se publicó sin fuerza sobre su rama remota; el checkout original F0-04/a3401bd queda limpio y un commit detrás de su remoto nuevo, preservando sus archivos ignorados. No se borraron dependencias ni archivos del usuario. PR #4 conserva base F0-03; PR #7 conserva base F0-09. No se cambiaron esas bases prematuramente para aparentar independencia.

`git merge-tree --write-tree` y objetos temporales sin referencias de rama simularon toda la secuencia. No se ejecutó merge de ningún PR ni se movió main. La primera simulación #1+#2 detectó conflicto real en `docs/planning/README.md`, aunque GitHub los marcaba CLEAN individualmente. Una copia aislada del código inicial conjunto reprodujo **12 errores de lint y 2 scripts con formato incompatible**.

## Hallazgos y correcciones

| Hallazgo | Impacto | Corrección y evidencia |
| --- | --- | --- |
| #1 y #2 insertaban distintos párrafos en el mismo lugar del índice | Conflicto al integrarlos juntos | #1 `05d5e75`: enlace visual reubicado; no se descartó contenido del scaffold. |
| #2 y #3 creaban distintos `.gitignore` de raíz; #2/#3 insertaban seguimiento en el mismo punto del plan | Conflicto add/add y de documentación | #3 `5ce6d6e`: reglas propias en `spikes/neon-auth/.gitignore`, seguimiento en sección separada. `.env.local` y dependencias del spike siguen ignorados. |
| Verificador de #1 y scripts de #5 no pasaban ESLint de #4 | CI conjunto rojo pese a checks separados verdes | Imports de Node explícitos y globals web de Node mediante globalThis; dos scripts formateados. No se deshabilitó lint para ocultarlos. |
| Sonda pública #5 devolvía exit 0 en fallos HTTP/red/JSON | Un comando fallido podía parecer exitoso | #5 `76f6b96`: propaga error; importación sin red/escrituras; cuatro regresiones offline para éxito, 429, JSON/HTML inválidos y error de red sin filtrar diagnóstico. Snapshot público original conservado. |
| README heredado en #4 afirmaba que no existía npm test | Instrucciones falsas tras integrar CI | #4 `9a9dd42`: tabla de comandos, requisitos E2E, límites de DB y separación de spikes actualizados. |
| README de #7 solo enumeraba nueve pruebas base | Confusión de cobertura motor/contratos | #7 `05f4e6c`: explicita 16 casos/48 ejecuciones tras el motor y conserva evidencia histórica F0-09. |
| #1/#3/#5 carecían de CI propio | Verificaciones no visibles/repetibles automáticamente | Workflows independientes de documentación visual, spike Auth y evidencia de proveedores. Sin secretos, sondas reales ni despliegues; acciones fijadas a SHA y timeouts. |
| #3: caché SDK y peer incompatibles ya identificados | Bloqueo de uso real de identidad/datos | Reproducción actual confirma caché con boolean y advertencia fetch 1.3.2/1.3.3. No se ocultaron con casts/overrides ni se declara auth segura. F0-04 permanece abierto. |
| main sin protección (404), sin rulesets (`[]`) | CI rojo no impide por sí solo merge | No se cambió configuración/plan/visibilidad. F0-06 permanece parcialmente pendiente hasta checks obligatorios y prueba de bloqueo. |

## Veredicto por PR y cobertura real

"Sí, parcial" permite integrar únicamente el artefacto descrito; **no** declara que se cumpla la aceptación completa del ticket.

| Orden | PR / ticket / head | Revisión y pruebas comprobadas | Cobertura real | Dependencias y aprobación recomendada |
| --- | --- | --- | --- | --- |
| 1 | #1 · F0-02 · `05d5e75` | Guía contrastada con producto; 34 enlaces/54 contrastes; CI documental verde. | RF-044/051/052 y CA-059/065/066 como especificación; ningún CA funcional cerrado. | Independiente. **Sí**, documentación para implementación. |
| 2 | #2 · F0-03 · `2be0fbb` | Lectura de UI/config/dependencias/licencias; npm ci + check local pasan; mismo código cubierto por build y E2E conjuntos. No tiene check propio. | Stack y portada española responsive; CA-066 parcial. No dashboard ni PWA/auth/DB. | Antes de #4. **Sí**, scaffold acotado. |
| 3 | #4 · F0-06 · `9a9dd42` | Check/unitarios 3/3 y E2E 2/2; CI PostgreSQL real 1/1, NUMERIC, rollback y unicidad. Negativo original 14b8ff3 falló por el centinela esperado, ya retirado. | RNF-12 e infraestructura para CA-013/014/066; no prueba seguridad DB del producto ni CA-001. | Base #2. **Sí, parcial**, CI; no cerrar F0-06 sin protección efectiva. |
| 4 | #6 · F0-09 · `353764a` | Types strict, 9/9 y 27/27 en tres husos reejecutados; CI verde. Revisión de límites, precisión, fechas y relaciones. | RNF-03 y mitigación parcial de R-12/R-16, contratos preparatorios; política de dueño sintética, no autenticación. CA-001/006/013/014/015 funcionales pendientes. | Antes de #7. **Sí**, ADR/contratos; sin migraciones/servicios. |
| 5 | #7 · F0-08 · `05f4e6c` | Tipos, 16/16 y 48/48 reejecutados; CI verde. Se revisaron orden estable, dos anclas, pending/voided, monedas y rechazo sin mutación. | Parte pura de CA-015/I-10: saldo 990 y anclas intactos tras corregir febrero; diferencia +50 y auditoría, sin compensación inventada. No métricas/UI/DB. | Base #6. **Sí**, solo prototipo experimental. |
| 6 | #3 · F0-04 · `5ce6d6e` | Instalación limpia, tipos, 27/27 sintéticos y CI verde. Firma contrastada con contrato oficial de Neon; Google/OTP/reset con transporte simulado. Audit prod 0 avisos. | CA-002/003/004 y política I-12 solo locales/sintéticos. **CA-001…006 reales no aceptados**. | Spike aislado, sin importar SDK en app. **Sí, parcial**, investigación; F0-04 sigue bloqueado para uso real. |
| 7 | #5 · F0-07 · `76f6b96` | 5 verificaciones de evidencia pública anterior + 4 regresiones offline = 9/9; CI verde; no se reejecutaron GET reales ni SMTP. | Fuentes/cupos documentados y muestras de FX. CA-004/005/060 del producto pendientes; HTTP 200 no garantiza UYU (v1 lo omite). | Independiente documental. **Sí, parcial**, informe; no cerrar proveedores/SMTP. |
| 8 | #8 · F0-COORD | Registro previo actualizado con esta auditoría, sin modificar evidencia histórica. Links/diffs/estados contrastados. No CI propio; solo docs. | Trazabilidad, sin implementar RF ni aceptar CA. | Después de las entregas técnicas. **Sí**, registro actualizado. |

F0-05 **no tiene PR ni implementación**. PostgreSQL temporal de CI no es un proyecto Neon, esquema de app ni migración F0-05. La escala técnica de cuatro decimales de #6 no autoriza pagos fraccionarios reales; guarda de pertenencia no verifica sesiones. El motor de #7 exige orden intradía explícito y no implementa idempotencia persistida, deudas/reservas ni métricas de febrero.

## Evidencia reproducible y compatibilidad conjunta

Entorno local Node 24.19.0/npm 11.17.0; Linux en Actions. Árbol de código combinado probado: **6b56584f03709a62f8733c93df8f962195d1aba0**. Tras actualizar README de #4/#7, segunda simulación sin conflictos: **15d6db6937966e7efc95ce8dcb573ff13adbc892**; la diferencia son únicamente esos dos Markdown, sin cambios de código/lockfile.

| Comprobación | Resultado observado |
| --- | --- |
| npm ci en scaffold #2 y árbol combinado | Instalación limpia desde lockfile, correcta |
| npm run check en #2 y árbol conjunto | Formato, lint, typecheck y build pasan |
| npm run test:unit conjunto | 3/3 pasan |
| npm run test:e2e conjunto | 2/2 Chromium, 1440×900 y 390×844; h1/español/teclado/desborde y sin pageerror |
| node docs/design/verify-visual-spec.mjs conjunto | 46 enlaces de cinco documentos combinados y 54 contrastes pasan; UI no certificada |
| node --test scripts/probe-f0-07.test.mjs scripts/verify-f0-07.mjs | 9/9; sin consultar proveedores ni reescribir muestra |
| npm ci --ignore-scripts, typecheck, npm test en Auth | 27/27; advertencia de peer conservada; no hay entorno real |
| typecheck/test/test:timezones en contratos #6 | 9/9 y 27/27 |
| typecheck/test/test:timezones en motor #7 | 16/16 y 48/48 |
| npm audit --json conjunto / --omit=dev Auth | Cero avisos reportados; no sustituye revisión de seguridad ni resuelve peer/caché |
| git diff --check y simulación de los ocho PR | Sin whitespace inválido/conflictos tras correcciones; sin cambios de refs main |

Checks enlazados por SHA: [visual #1](https://github.com/SebastianGonzalez2/finanzas-personales/actions/runs/42431310779), [Auth #3](https://github.com/SebastianGonzalez2/finanzas-personales/actions/runs/42431318975), [CI #4](https://github.com/SebastianGonzalez2/finanzas-personales/actions/runs/42431694326), [proveedores #5](https://github.com/SebastianGonzalez2/finanzas-personales/actions/runs/42431324955), [contratos #6](https://github.com/SebastianGonzalez2/finanzas-personales/actions/runs/42406302014), [motor #7](https://github.com/SebastianGonzalez2/finanzas-personales/actions/runs/42431701385). El [negativo original de #4](https://github.com/SebastianGonzalez2/finanzas-personales/actions/runs/42405689022) sigue conservado. No había revisiones humanas aprobadas en GitHub al consultar.

## Preparación del merge humano (no ejecutado)

Orden recomendado: **#1 → #2 → #4 → #6 → #7 → #3 → #5 → #8**. #3/#5 podrían adelantarse como investigación aislada tras comprobar compatibilidad, pero quedan al final para distinguirlos de la base ejecutable. Los estados de borrador se conservan; el titular decide aceptar explícitamente cada entrega parcial y pasarla a lista para integrar.

Para padres apilados **#2/#6**, preferir **merge commit conservando historia** cuando se autorice la integración. Después de incorporar el padre a main, retargetear **#4/#7 a main**, comprobar diff y volver a ejecutar checks sobre la nueva combinación. No fusionar el hijo dentro de la rama del padre como sustituto de incorporarlo a main. Squash/rebase del padre cambia su identidad histórica y puede reintroducir commits/diffs heredados en el hijo; evitarlo en esta tanda sin una preparación adicional. No se retargeteó ahora porque los padres aún no están en main. No se hizo push forzado ni rebase.

## Qué falta para cerrar F0 y configuración del titular

- **F0-04:** integrar en App Router sesiones frescas/revocación, admisión persistente/rate limits y transporte confirmado de metadatos tanto en email como Google. Probar alta directa sin invitación, rotación, OTP, reset, colisiones de métodos y aislamiento A/B. La caché del SDK debe resolverse con mecanismo soportado y prueba real; un boolean aparentemente correcto no basta.
- **F0-05:** crear DB Neon de prueba aislada; elegir/justificar ORM o SQL/driver/pooling; esquema y migraciones reproducibles, propiedades/relaciones entre titulares, transacciones, idempotencia/concurrencia, decimal y recuperación. No alterar neon_auth manualmente ni usar datos reales.
- **F0-06:** checks obligatorios y protección efectiva sin contratar plan ni cambiar visibilidad; comprobar que un fallo realmente bloquea merge después de incorporar CI. Las pruebas de una tabla temporal no completan integración DB de producto.
- **F0-07:** confirmar uso personal no comercial de Vercel con el titular, límites/consumo de sus cuentas y entrega SMTP real. Muestras públicas y condiciones documentadas no bastan para cerrar ese gate.
- **F0-08/09:** aceptar ADR/orden temporal y conectar contratos/motor a persistencia y autorización según alcance del incremento; no considerar que UI/métricas o transacciones existen por pasar funciones puras. Mantener los límites de los CA parciales al revisar puerta F0.

**Neon, preparar ahora:** proyecto Free exclusivo y rama vacía de test, sin clonar datos privados ni activar pago. Habilitar Auth de esa rama, guardar Auth Base URL y URL DB solo en entorno privado. Configurar orígenes exactos de prueba. Al disponer de receptor HTTPS seguro y admisión persistente, habilitar `user.before_create` con firma/JWKS de la rama y comprobar rechazo directo sin código antes de ofrecer altas. No apuntar un webhook a los Maps del spike. [Contrato oficial de webhooks](https://neon.com/docs/auth/guides/webhooks).

**Email/reset en Neon:** email/contraseña, Verify at Sign-up con código y revocación al restablecer contraseña; probar reenvío, caducidad, reutilización y dos sesiones. No dar acceso antes de verificación/admisión. [Verificación](https://neon.com/docs/auth/guides/email-verification), [reset](https://neon.com/docs/auth/guides/password-reset).

**Google:** desarrollo puede usar credenciales compartidas; antes de uso real crear cliente Web propio en Google Auth Platform, configurar Branding/Audience y usuarios de prueba. Copiar de Neon el redirect exacto **`{NEON_AUTH_BASE_URL}/callback/google`** de cada rama; no confundirlo con callbackURL final de la app. Client ID/Secret únicamente en Neon/almacén seguro, jamás NEXT_PUBLIC. [Guía Neon](https://neon.com/docs/auth/guides/setup-oauth), [Google OAuth web](https://developers.google.com/identity/protocols/oauth2/web-server).

**SMTP:** elegir remitente gratuito verificable que controle el titular; configurar host, TLS/puerto, usuario/credencial y remitente en Neon. Verificar DNS/DKIM cuando corresponda y cuotas del proveedor, sin comprar dominio/plan. Probar entrega de OTP/reset a buzones de test, expiración/reenvío y agotamiento de cuota. El compartido sirve para desarrollo; producción requiere demostrar entrega fiable con configuración propia. No activar send.otp/send.magic_link webhooks sin haber implementado su entrega, porque sustituyen el envío predeterminado. [Checklist Neon](https://neon.com/docs/auth/production-checklist), [personalización de email](https://neon.com/docs/auth/guides/customize-emails).

**Acción no ejecutada por revisión automática:** se rechazó `npm run probe` de Neon por posible uso de configuración del entorno/contacto real con proveedor. Se continuó con instalación/compilación/tests sintéticos, sin esa sonda. Cualquier validación real posterior requiere autorización puntual y entorno de prueba; no se ha contado como prueba pasada ni impide integrar únicamente los artefactos experimentales si el titular los acepta.

## Inventario exacto de archivos revisados

Se comparó cada head con su base real, no con el número de ticket ni con una rama creada. Los lockfiles se verificaron mediante instalación limpia, resolución/versiones/licencias y auditoría; no se interpreta su diff generado como lógica de negocio.

**PR #1 — 7 archivos.** `.github/workflows/f0-visual.yml`, `docs/design/fintrack-visual-spec.md`, `docs/design/verify-visual-spec.mjs`, `docs/planning/05-plan-de-implementacion.md`, `docs/planning/06-riesgos-y-pendientes.md`, `docs/planning/10-informe-f0-02.md`, `docs/planning/README.md`.

**PR #2 — 28 archivos.** `.editorconfig`, `.env.example`, `.gitattributes`, `.gitignore`, `.npmrc`, `.nvmrc`, `.prettierignore`, `.prettierrc.json`, `README.md`, `THIRD_PARTY_NOTICES.md`, `components.json`, `docs/evidence/f0-03/escritorio-1440.png`, `docs/evidence/f0-03/movil-390.png`, `docs/planning/05-plan-de-implementacion.md`, `docs/planning/11-informe-f0-03.md`, `docs/planning/README.md`, `eslint.config.mjs`, `next.config.ts`, `package-lock.json`, `package.json`, `postcss.config.mjs`, `src/app/globals.css`, `src/app/icon.svg`, `src/app/layout.tsx`, `src/app/page.tsx`, `src/components/ui/card.tsx`, `src/lib/utils.ts`, `tsconfig.json`.

**PR #3 — 18 archivos.** `.github/workflows/f0-auth-spike.yml`, `docs/planning/05-plan-de-implementacion.md`, `docs/planning/06-riesgos-y-pendientes.md`, `docs/planning/12-informe-f0-04.md`, `docs/planning/README.md`, `spikes/neon-auth/.env.example`, `spikes/neon-auth/.gitignore`, `spikes/neon-auth/README.md`, `spikes/neon-auth/admission.mjs`, `spikes/neon-auth/package-lock.json`, `spikes/neon-auth/package.json`, `spikes/neon-auth/probe.mjs`, `spikes/neon-auth/sdk-contract.ts`, `spikes/neon-auth/tests/admission.test.mjs`, `spikes/neon-auth/tests/sdk.test.mjs`, `spikes/neon-auth/tests/webhook.test.mjs`, `spikes/neon-auth/tsconfig.json`, `spikes/neon-auth/webhook.mjs`.

**PR #4 — 13 archivos.** `.github/workflows/f0-ci.yml`, `.prettierignore`, `README.md`, `docs/testing.md`, `eslint.config.mjs`, `package-lock.json`, `package.json`, `playwright.config.ts`, `tests/e2e/scaffold.spec.ts`, `tests/integration/postgres.test.mjs`, `tests/support/test-database.mjs`, `tests/unit/test-database.test.mjs`, `tsconfig.json`.

**PR #5 — 6 archivos.** `.github/workflows/f0-provider-evidence.yml`, `docs/evidence/f0-07-probe.json`, `docs/planning/13-informe-f0-07.md`, `scripts/probe-f0-07.mjs`, `scripts/probe-f0-07.test.mjs`, `scripts/verify-f0-07.mjs`.

**PR #6 — 12 archivos.** `.github/workflows/f0-contracts.yml`, `docs/adr/0001-contratos-dominio-seguridad.md`, `spikes/foundation-contracts/.gitignore`, `spikes/foundation-contracts/README.md`, `spikes/foundation-contracts/dates.ts`, `spikes/foundation-contracts/money.ts`, `spikes/foundation-contracts/ownership.ts`, `spikes/foundation-contracts/package-lock.json`, `spikes/foundation-contracts/package.json`, `spikes/foundation-contracts/tests/contracts.test.ts`, `spikes/foundation-contracts/tests/timezones.mjs`, `spikes/foundation-contracts/tsconfig.json`.

**PR #7 — 5 archivos.** `docs/adr/0002-prototipo-checkpoints.md`, `spikes/foundation-contracts/README.md`, `spikes/foundation-contracts/checkpoints.ts`, `spikes/foundation-contracts/tests/checkpoints.test.ts`, `spikes/foundation-contracts/tests/timezones.mjs`.

**PR #8 — 3 archivos.** `docs/planning/README.md`, `docs/planning/14-seguimiento-f0.md`, `docs/planning/15-auditoria-integracion-f0.md`.
