# Plan de implementación por fases y entregables para Codex

**Decisión vigente v9.49.** Better Auth autogestionado ofrece acceso solo con Google y lista privada. El PR #14 contiene la implementación vigente. El PR #12 registra la arquitectura anterior. [ADR 0004](../adr/0004-google-only-allowlist-auth.md).

**Cierre técnico de F0 — 2026-11-08.** El titular aprobó el cierre y la integración en `main`. Los fundamentos incluyen el scaffold, CI protegido, los contratos y prototipos monetarios, persistencia con RLS y OAuth Google probado en development. La prueba HTTPS desde otro dispositivo y la medición de consumo se retoman antes del uso con datos financieros reales. [F0-04](25-google-only-f0-04.md) · [F0-05](20-revision-f0-05.md) · [F0-07](13-informe-f0-07.md).

**Tipo:** backlog técnico priorizado, **no cronograma ni compromiso de fechas**.  
**Base:** requisito funcional aprobado v9.48, [requisitos](01-alcance-y-requisitos.md), [modelo/invariantes](02-modelo-de-dominio-y-datos.md) y [criterios](03-criterios-de-aceptacion.md).  
**Regla de cierre:** una fase termina con artefactos, pruebas y revisión; no con «la pantalla parece funcionar». Las fases pueden subdividirse en PR pequeños.

## Lectura rápida del camino crítico

```text
F0 Fundamentos + proveedores/costo + diseño/auditoría
  → F1 Bancos, movimientos y checkpoints (núcleo contable)
  → F2 Tarjetas, cuotas, deudas y cobros
  → F3 Fondos y presupuestos (dependen de F1/F2)
  → F4 Recurrencias y compartidos (dependen de F1/F2)
  → F5 Estadísticas, personalización y backups (con datos integrados)
  → F6 Calidad integral, PWA y despliegue controlado
```

**Se conserva todo el producto aprobado**: F0/F1 no es el producto final. No añadir objetivos anuales, archivos adjuntos ni conexión bancaria porque estén «pendientes» en una plantilla externa.

## F0 — Preparación, seguridad y spike técnico

**F0-NEON (ticket de apoyo solicitado por el titular):** prepara el entorno
existente para F0-04/F0-05, sin cerrar sus CA. Ver [evidencia vigente](17-informe-f0-neon.md).
Se verificó development/Better Auth por API/SQL y sonda pública; conexiones
locales pooled/direct pasan en READ ONLY. No sustituye migraciones ni pruebas reales A/B.

**Seguimiento F0-04 — 2026-11-08.** Google OAuth y Neon development se probaron con A/B, rechazo antes del alta, cierre de sesión, revocación y consultas manipuladas. La evidencia del spike anterior se conserva como investigación histórica. [Evidencia vigente](25-google-only-f0-04.md) · [Informe anterior](12-informe-f0-04.md).

**Objetivo:** base reproducible sin secretos, proveedor de identidad y persistencia validados, modelo claro, herramienta de QA y diseño visual recuperado.

**Seguimiento F0-05 — 2026-11-08:** [implementación y evidencia real](19-informe-f0-05.md)
en [PR #11](https://github.com/SebastianGonzalez2/finanzas-personales/pull/11),
sin fusionar. SQL exacto autorizado por el titular, aplicado únicamente en
development; reejecución sin cambios, 48 verificaciones directas y 48 pooled de
aislamiento/precisión/rollback pasan; mismo SQL desde cero en CI PostgreSQL.
`neon_auth` no modificado. Aceptación técnica de persistencia F0-05 verificada;
revisión humana pendiente. Sesiones/API/invitaciones F0-04 y puerta F0 abiertas.
Las menciones anteriores de F0-05 pendiente son históricas.

Revisión posterior: [defecto de confirmación corregido y PostgreSQL CI 10/10](20-revision-f0-05.md).
El párrafo anterior conserva el estado de entrega original. La revisión técnica
no cierra Auth, F0 ni autoriza despliegues o F1.

| Ticket | Implementación / investigación | Evidencia de aceptación |
|---|---|---|
| F0-01 | Confirmar estado actual del repositorio; comprobar `main`, árbol, ramas, `AGENTS.md` y documentos; inspeccionar imagen de UI. | Informe de inventario y Git limpio; no sobrescribir trabajo local de Codex sin comparar. |
| F0-02 | Verificar si existe localmente `docs/design/fintrack-visual-spec.md`; si no, reconstruir desde imagen con reglas de UI y no inventar funcionalidades. | Guía visual de componentes, tipografía, espaciado, colores, responsive, estados y ejemplos versionada. |
| F0-03 | Crear esqueleto Next.js App Router + TypeScript + Tailwind + shadcn/ui, ESLint/formatter, scripts, README y lockfile reproducible. | Dev server inicia; typecheck/lint/build pasan localmente. |
| F0-04 | **Implementar Better Auth autogestionado en Next.js, solo Google OAuth, allowlist cerrada y sesiones verificadas**; adaptar la rama histórica de F0-04 sin integrar su webhook de Neon Managed Auth. | Alta autorizada/rechazo no autorizado ANTES de creación, cierre/revocación, dos titulares A/B reales, RLS + API, callback/credenciales y migraciones propias autorizadas. No requiere OTP/SMTP/contraseñas. |
| F0-05 | Crear DB de prueba aislada Neon, escoger ORM/migraciones/driver/pooling/decimal, esquema inicial y aislamiento por titular. | Migración reproducible; usuario A no puede consultar datos de B; esquema de `neon_auth` no alterado manualmente. |
| F0-06 | Configurar CI mínima y frameworks de tests: unidad, integración DB real de test, E2E de navegador. | PR que falla intencionalmente test impide merge; comandos de test documentados. |
| F0-07 | Verificar viabilidad de Vercel Hobby no comercial, límites Neon Free, Google OAuth propio y cotizaciones. **SMTP de login no corresponde** tras v9.49. | Registro verificable de términos/cupos; ningún servicio pago activado; plan alternativo requiere aprobación. |
| F0-08 | Diseñar/implementar prototipo de **motor de efectos + checkpoints históricos** con pruebas de CA-015 e I-10. | Correcciones previas a conciliación **no** modifican saldo posterior confirmado; inconsistencia auditada y visible. |
| F0-09 | Decidir convenciones de módulos, IDs, timestamps, decimales, transacciones y eventos; amenazas de seguridad. | ADR breve (Architecture Decision Record) con pruebas de monedas y permisos. |

**Seguimiento F0-02 — 2026-11-07:** entrega documental en revisión en la rama `codex/F0-02-diseno-visual`. [Guía consolidada](../design/fintrack-visual-spec.md) y [verificaciones/límites](10-informe-f0-02.md): referencia preservada, responsive, componentes, formularios y estados especificados. No hay UI ni CA funcional aprobado. Aceptación humana pendiente; siguiente ticket propuesto F0-03, sin iniciarlo ni autorizar merge/despliegue.

**Puerta F0.** El cierre técnico reúne evidencia del stack, guardas de acceso, límites de proveedores y reglas monetarias del prototipo. El uso con datos financieros reales requiere las verificaciones de publicación del ADR 0004 y el cierre de riesgos aplicables. [ADR 0004](../adr/0004-google-only-allowlist-auth.md) · [Riesgos](06-riesgos-y-pendientes.md).

**Seguimiento F0-03 — 2026-11-07:** esqueleto Next.js/TypeScript/Tailwind/shadcn con lockfile y herramientas de formato/lint, **en revisión** en `codex/F0-03-scaffold-nextjs`. Ver [implementación, checks y límites](11-informe-f0-03.md). Dev server, instalación limpia, typecheck/lint/build y revisión de portada en Chromium móvil/escritorio ejecutados; no implica auth, DB, CI, cierre de CA funcionales ni puerta F0. Siguiente ticket: F0-04.

## F1 — Núcleo financiero y movimientos

| Ticket | Entrega | RF/CA principal |
|---|---|---|
| F1-01 | Layout, navegación básica, dashboard fijo inicial y estados vacíos; responsive y estilos de referencia. | RF-052; CA-066 |
| F1-02 | Saldos agregados independientes UYU/USD/EUR, inicialización y fechas de referencia. | RF-005; CA-007 |
| F1-03 | Formulario ingreso/gasto normal con categoría opcional, concepto, nota, fecha, moneda y medio básico. | RF-006/007; CA-008…010 |
| F1-04 | Engine de eventos monetarios, validación decimal exacta, transacciones DB, idempotency key y reversión auditada. | RF-010; CA-013/014/016 |
| F1-05 | Ajuste manual de saldo y checkpoints por fecha/moneda; conciliación tras corrección histórica. | RF-008/012; CA-011/015 |
| F1-06 | Transferencia entre saldos y cambio de moneda usando importes reales de ambos lados. | RF-009; CA-012 |
| F1-07 | Historial permanente paginado, búsqueda/filtros base y edición/anulación segura. | RF-011; CA-017 |
| F1-08 | Tests de regresión y aislamiento para dos cuentas y dos sesiones, [reporte de verificación](32-regresion-aislamiento-f1-08.md). | RNF-01/02/04/12; CA-001/006 |

**Demo F1:** una persona puede iniciar sesión, cargar saldo, registrar compras/ingresos, corregir, conciliar y consultar historial desde móvil. No se ofrece «versión completa» por faltar tarjetas, fondos, recurrencias y estadísticas.

## F2 — Tarjetas, cuotas, deudas y dinero por cobrar

| Ticket | Entrega | RF/CA principal |
|---|---|---|
| F2-01 | Catálogo de tarjetas débito/crédito, tipos, monedas, deuda/saldo a favor y límites opcionales. [Contrato del catálogo](33-catalogo-tarjetas-f2-01.md). | RF-014; configuración de RF-017; base de CA-020 |
| F2-02 | Compra con tarjeta de crédito y pago de resumen, deuda inicial, parcial y total sin doble gasto. [Contrato de compras y pagos](34-operaciones-credito-f2-02.md). | RF-015/017/018; CA-020/021/024 |
| F2-03 | Cuotas iguales, mes inicial, cargo real al emisor, reporte mensual, cancelación/edición con auditoría. [Contrato y revisión](35-cuotas-tarjeta-f2-03.md). | RF-016; CA-022 |
| F2-04 | Ciclos de cierre, mínimos/resumen oficial, estimaciones, alertas, fechas excepcionales y reconciliación de ciclo. [Contrato y revisión](36-ciclos-tarjeta-f2-04.md). | RF-017/037; CA-023 |
| F2-05 | Compra con dos medios y porción crédito financiada en cuotas; categorías repartidas. | RF-019/040; CA-025/026 |
| F2-06 | Deudas y préstamos simples/cuotas, pago/cobro, entrega/recepción de capital, intereses de deuda reales, actualización pendiente. | RF-022/023; CA-030…032 |
| F2-07 | Pago/cobro de préstamo en otra moneda según montos reales acordados. | RF-024; CA-033/034 |
| F2-08 | Gasto pagado por tercero y gasto pagado para varios amigos con derechos por cobrar individualizados. | RF-025; CA-035/036. [Implementación y migración](39-gastos-compartidos-f2-08.md). |
| F2-09 | Devoluciones reales en débito/crédito, cuotas, saldo a favor y compras/medios divididos. [Contrato y revisión](40-devoluciones-f2-09.md). | RF-021/047; CA-028/029/037 |
| F2-10 | Tests de consistencia ante pagos parciales, reintentos, saldos negativos indebidos, autorización y concurrencia. | I-02/I-04/I-05/I-06/I-11/I-12 |

**Puerta F2:** pruebas de **no duplicación** y trazabilidad obligatorias, en especial pago de resumen vs compra, cuotas, importe del comercio en otra moneda, devolución posterior y dinero de terceros.

## F3 — Ahorros virtuales y presupuestos mensuales

| Ticket | Entrega | RF/CA |
|---|---|---|
| F3-01 | Fondos con nombre/moneda/estado, reservar/liberar/traspasar internamente sin tocar Bancos. | RF-026/027; CA-038. [Implementación y migración](42-fondos-ahorro-f3-01.md). |
| F3-02 | Disponible libre vs saldo bancario real: garantía atómica de fondos no reservados. | RF-026/030; CA-041. [Implementación](43-disponible-libre-f3-02.md). |
| F3-03 | Aportes programados mensuales, primera ejecución siguiente mes, día inexistente → último del mes, insuficiencia → pendiente, sin reintento automático. | RF-028; CA-039. [Implementación](44-aportes-programados-f3-03.md). |
| F3-04 | Metas monetarias opcionales y fechas, última aportación exacta, pausa automática por meta, reactivación expresa, fondos cerrables con advertencia. | RF-029; CA-040/050 |
| F3-05 | Cubrir gasto con uno o más fondos y disponible; tarjeta de crédito usa reserva **al pagar** deuda, no al comprar. | RF-030; CA-041. [Implementación](46-cobertura-fondos-f3-05.md). |
| F3-06 | Presupuestos categoría/subcategoría por moneda y mes, jerarquía, cuotas, edición con historial y excepción temporal. | RF-031/032; CA-042/043. [Implementación y migración](45-presupuestos-f3-06.md). |
| F3-07 | Avisos internos de presupuestos 80%/100%, metas/fondos y validación de concurrencia. | RF-032/038; CA-042/050. [Implementación y migración](46-avisos-internos-f3-07.md). |

**Puerta F3:** reserva virtual no genera gasto ni débito; ninguna compra gasta más del disponible autorizado; un límite excepcional de diciembre no modifica enero ni meses históricos.

## F4 — Recurrencias, anticipación y compartidos

| Ticket | Entrega | RF/CA |
|---|---|---|
| F4-01 | Definición de ingreso/gasto recurrente, frecuencia, primer período, día flexible, fecha final, referencia y estados. | RF-033; CA-044 |
| F4-02 | Seguimiento y confirmación manual real, pagos en meses distintos, varios depósitos por sueldo, importes variables y finales. | RF-034; CA-045/046 |
| F4-03 | Omitir mes/período, pausar/reanudar serie y períodos independientes; ediciones futuras sin cambiar pasado. | RF-035; CA-047 |
| F4-04 | Recurrente compartido con persona/contacto y desglose real al pagarse; cobros parciales posteriores. | RF-036; CA-048 |
| F4-05 | Centro de avisos, tres días de antelación si fecha conocida, push solo tarjetas cuando el usuario lo activa, antirruido. | RF-037/038; CA-049 |
| F4-06 | Tests de calendarios (febrero, fin de año, husos horarios), reintentos, meses omitidos, pagos tardíos y facturas sin importe definitivo. [Pruebas](48-regresion-f4-06.md). | I-09; CA-044…049 |

## F5 — Catálogos, analítica, exportaciones y mantenimiento

| Ticket | Entrega | RF/CA |
|---|---|---|
| F5-01 | Categorías/subcategorías por titular, creación desde formularios, archivo y protección de historial. | RF-039; CA-051 |
| F5-02 | División de ingreso y gasto por categorías e importes exactos; etiquetas independientes. | RF-040/042; CA-052/056 |
| F5-03 | Comercios/contactos autocompletables, archivo/restauración, fusión manual de comercios. | RF-041; CA-053…055 |
| F5-04 | Filtros guardados, operaciones de categorización masiva seguras y búsqueda eficiente. | RF-043; CA-057/058 |
| F5-05 | Estadísticas con métricas, comparaciones, favoritos, histórico por fecha, filtros y drilldown; mantener dashboard fijo. | RF-044/045/050; CA-059/064 |
| F5-06 | Cotizaciones UYU/USD/EUR con fuente/fallback, tipo histórico reproducible; selector persistente. | RF-046; CA-060 |
| F5-07 | Informes PDF/Excel/CSV del período y restauración/copia completa de cuenta, con cifrado opcional e integridad. | RF-048/049; CA-061…063 |
| F5-08 | Eliminación de cuenta y revisión de privacidad/ciclo de retención. | RF-049; CA-063 |
| F5-09 | Distinguir reembolsos de compras de otros meses y cashback, sin cambios ficticios a presupuesto. | RF-047/053; CA-028/067 |

**La analítica se implementa desde el inicio de manera básica para probar invariantes**, pero su catálogo completo de gráficos se concentra aquí; no posponer los tests contables hasta F5.

## F6 — Integración, seguridad, accesibilidad y preparación del uso real

| Ticket | Entrega | Validación |
|---|---|---|
| F6-01 | Revisión de 67 CA con resultados y evidencias; priorizar regresión de casos monetarios críticos. | Informe CA-001…067 con estado real. |
| F6-02 | Revisión de permisos multiusuario, APIs de administración, PWA, cookies, RLS y exportaciones; pruebas negativas. | Sin fuga entre cuentas; secretos ausentes de artefactos/logs. |
| F6-03 | PWA/manifest/online-only, UX responsive, teclado/lectores, contraste, validaciones y estados de error. | CA-065/066 en móvil y escritorio. |
| F6-04 | Plan de backups/restauración cifrada, versión de esquema y prueba de desastre controlada. | CA-062/063 pasando. |
| F6-05 | Revisión de políticas Hobby, Neon, SMTP, dominio, cuotas, límites, recuperación y alertas; **sin activar gasto**. | Validación documentada de uso permitido y sostenible con límites. |
| F6-06 | Guía corta para usuario final: crear cuenta, ingresar saldos, registrar gasto, tarjetas, fondos, correcciones, respaldos, limitaciones. | Prueba manual de onboarding de cuenta vacía. |
| F6-07 | Cierre de puntos técnicos de `06-riesgos-y-pendientes.md` y aprobación de uso real; no prometer conciliación bancaria automática. | Registro de riesgos residuales y checklist final con evidencia. |

## UI — Identidad visual (Ambient Glow + Glassmorphism)

Diseño aprobado por el usuario el 2026-11-14: [guía visual definitiva](../design/ui-identidad-visual.md) (paleta Glaciar). **Solo presentación:** ningún ticket UI cambia cálculos, reglas contables, APIs, autenticación, permisos, esquema ni datos; si una pieza necesita un dato inexistente, se consulta o se omite. Orden: UI-01 integrado en `main` → UI-02 → UI-03 y UI-04 (independientes entre sí) → UI-05 → UI-06. Un ticket por chat/rama/PR; merge solo con autorización expresa.

| Ticket | Entrega | Validación |
|---|---|---|
| UI-01 | Exploración de tres variantes, combinación elegida, paletas, tutorial con flechas y [guía definitiva](../design/ui-identidad-visual.md). Prototipo aislado con datos ficticios en `/prototipos/ui/final` (no se publica en producción). | Diseño aprobado por el usuario; `npm run check` y unitarias pasando; sin cambios en la app real. |
| UI-02 | Base del sistema de diseño y shell: tokens Glaciar en `globals.css` (`@theme`), Plus Jakarta Sans en el layout raíz, superficies de vidrio y controles base en `components/ui` (botón, campo, select, segmentado, etiquetas, panel), fondo ambiental (ondas arriba/abajo + luz media) en `FinanceShell`, riel de escritorio, barra flotante móvil y barra superior con el selector real de moneda de visualización y «Registrar movimiento». Pantalla de acceso con el mismo fondo. | Todas las rutas cargan con el shell nuevo; e2e existentes pasan (ajustar selectores sin reducir cobertura); teclado y foco; 375 px y 1440 px; `prefers-reduced-motion`; pruebas F6-02. |
| UI-03 | Resumen con datos reales según la guía: Disponible libre con pestañas por moneda y acciones existentes (cambio de moneda, confirmar saldo), ingresos/gastos con variación solo si hay dato del mes anterior, flujo espejado, anillo de categorías, tarjetas, avisos, fondos, presupuestos, próximos pagos y movimientos recientes. | Importes idénticos a la versión anterior; sin doble cómputo (pagos de tarjeta, fondos, préstamos); estados vacío/error; CA del resumen y e2e financieros. |
| UI-04 | Historial: buscador, filtros, «Más filtros», filtros guardados, chips, selección masiva, tabla ordenable y versión móvil en filas, con el nuevo estilo. | CA de historial (F1-07, F5-04); e2e; teclado; móvil. |
| UI-05 | Resto de pantallas y formularios (Tarjetas, Fondos, Presupuestos, Recurrentes, Deudas, Beneficios, Estadísticas, Informes, Catálogos, Avisos, Ayuda, Mi cuenta). Puede dividirse en UI-05a/UI-05b si el PR crece. | Revisión visual por pantalla en móvil y escritorio; e2e y unitarias; gráficos con la paleta de datos validada. |
| UI-06 | Tutorial con flechas (8 pasos de la guía, §5) en lugar del contenido actual de F6-06, conservando su excepción de almacenamiento y la repetición desde Ayuda; pregunta nueva de Ayuda sobre la moneda de visualización; retirar el prototipo `/prototipos/ui` si ya no aporta. | `tests/unit/tutorial.test.mjs` actualizado; teclado, Escape y foco; móvil. |

**Seguimiento UI-05-DESIGN — 2026-11-15:** rama `codex/UI-05-DESIGN-plan-visual`; inventario, propuesta visual, prototipos aislados (`/prototipos/ui-05`, solo `next dev` local) y capturas en el [plan visual de UI-05](../design/ui-05-plan-visual.md). Propone dividir UI-05 en UI-05A…UI-05H. Pendiente: aprobación del usuario; no se implementó ninguna pantalla real.

**Seguimiento UI-04 — 2026-11-14:** rama `codex/UI-04-historial-glaciar`; Historial con la barra, tabla, chips y filas móviles del prototipo sobre la búsqueda real del servidor (GET `/historial`, sin cambios de consultas, APIs ni esquema). Decisiones en la [guía visual §4.9](../design/ui-identidad-visual.md#4-reglas-técnicas-aprendidas-en-el-prototipo). Pendiente: revisión visual del usuario y e2e financieros en CI.

**Seguimiento UI-01 — 2026-11-14:** rama `codex/UI-01-exploracion-ambient-glow`; prototipo y guía listos para revisión. Pendiente: aprobación del PR e integración en `main` antes de iniciar UI-02.

**Seguimiento UI-02 — 2026-11-14:** rama `codex/UI-02-sistema-diseno-shell`; tokens Glaciar, Plus Jakarta Sans, controles base (`components/ui`), fondo ambiental, riel/cajón/barra móvil y barra superior con el selector real de moneda (se retiró el selector duplicado de la tarjeta de equivalencias de Resumen) y acceso a «Registrar movimiento» (abre el formulario existente). Pendiente: revisión del PR, e2e financieros en CI y revisión visual con sesión real.

## Estrategia de PR y tickets

**Tamaño recomendado:** un PR entrega una capacidad vertical pequeña y probada, no varios módulos contables a la vez. **Convención obligatoria:** ver [nombres de rama, commits y PR](09-convenciones-git.md). Usar una rama `codex/F1-03-registro-movimientos`, commits `feat(F1-03): registrar gastos e ingresos`, PR `[F1-03] Registro manual de movimientos`, y completar [plantilla automática de PR](../../.github/PULL_REQUEST_TEMPLATE.md) con RF/CA, pruebas, riesgos y alcance. **El mismo ID aparece en los tres elementos**. Otros prefijos de rama solo si se documentan expresamente; no mezclar tickets en un PR. No reescribir el historial existente. Cada ticket referencia RF, CA, fuente de producto, migración y UI afectada.

**Plantilla de ticket:**

```markdown
### [F?-??] Título
**Objetivo**:
**RF / CA**:
**Dependencias**:
**Fuera del alcance de este ticket**:
**Modelo y migraciones**:
**Endpoint/acción de servidor y permisos**:
**UI estados normal/vacío/error**:
**Invariantes contables**:
**Pruebas unitarias/integración/E2E**:
**Riesgos**:
**Evidencia para revisión**:
```

**Plantilla de cierre de PR:**

```markdown
- [ ] Alcance exacto del ticket implementado
- [ ] RF/CA indicados con pruebas ejecutadas y resultados
- [ ] Un usuario no puede leer/modificar recursos de otro
- [ ] Sin duplicación monetaria, con atomicidad/idempotencia
- [ ] Migración y reversión/recuperación documentadas
- [ ] UI usable en móvil y escritorio
- [ ] Typecheck, lint, unitarios, integración y build pertinentes
- [ ] Sin secretos/servicios pagos/datos personales de prueba en Git
- [ ] Evidencia capturas o reproducción manual y limitaciones conocidas
- [ ] Documentos y estado de riesgos actualizados
```

## Orden operativo para el primer PR

1. **Leer** `AGENTS.md`, `docs/planning/README.md` y `docs/product/decisiones-producto.md`.
2. Inventariar `main`, branches, design local y el hecho de que el remoto inicialmente contenía solo documentación.
3. **Histórico, sustituido por v9.49:** para el trabajo vigente comprobar Better Auth autogestionado con Next.js, Google OAuth y allowlist con hook previo a alta; registrar viabilidad y pruebas en `docs/planning/06-riesgos-y-pendientes.md`.
4. Proponer decisión técnica mínima de ORM/decimal/CI y justificación; **no pedir decisión de producto salvo verdadero bloqueo**.
5. Construir esqueleto Next.js con TypeScript/Tailwind/shadcn/ui, scripts y tests base en una **rama**.
6. Crear PR con lo probado y lo pendiente; no desplegar con secretos ni habilitar pagos; el usuario conserva control de conexiones y aprobación de costes.
7. **Solo después de que F0 esté suficientemente verificado**, construir F1 de forma incremental.

## Condiciones de parada

**Detener y documentar, no improvisar**, cuando: (a) costo obligatorio o uso no permitido de plan gratis; (b) autenticación o invitaciones inseguras; (c) operación contable produciría gasto/ingreso inventado; (d) pérdida de integridad por edición histórica/migración; (e) falta de dato real para un ajuste financiero; (f) riesgo de exponer datos de otro usuario o credenciales.

**No generar tiempos ni cronogramas artificiosos**. La prioridad es una aplicación fiable y usable, no aparentar avance.
