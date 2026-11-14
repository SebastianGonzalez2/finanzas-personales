# Matriz por ticket: Codex + OpenCode para ahorrar cuota
**Actualización:** 2026-11-10 · **Fuente:** [plan de implementación](05-plan-de-implementacion.md) y [convenciones Git](09-convenciones-git.md). **Tipo:** recomendación operativa; no modifica reglas financieras, autorización, ADR ni criterios de aceptación.

## Objetivo y reglas
Optimizar la **cuota del Codex de suscripción**, no solo los tokens de una llamada. Mantener exactitud contable, aislamiento de titulares, idempotencia y tests reales. No se afirma que un modelo gratuito iguale a Codex: son asignaciones **orientativas por riesgo**, aún no validadas con benchmarks sobre este repositorio.

- **OC (OpenCode completo):** entregar el ticket con OpenCode gratis; Codex es respaldo, no paso obligatorio. Se exige la misma calidad, CI y revisión de cambios.
- **MIX (mixto):** OpenCode produce la parte delimitada en la tabla en una rama; Codex continúa **sobre el mismo diff/commits** para la parte crítica, corrige y prepara PR. No repetir la implementación desde cero.
- **CX (Codex):** abordar con Codex desde el inicio; el ahorro usando modelos gratuitos no compensa el riesgo de errores difíciles de detectar.
- **GLM:** `GLM-5.3-Flash Free` en OpenCode, primera opción para UI, formularios, documentación y flujos de presentación.
- **DS:** `DeepSeek V4.1 Flash Free` en OpenCode, primera opción experimental para scaffold, tests no críticos y refactor acotado.
- **Codex recomendado:** `Sol High` / `Sol Medium` / `Terra Medium` solo **si aparece en el selector**. En la ruta OC es modelo de respaldo; en MIX cierra la parte indicada; en CX desarrolla todo el ticket. La matriz conserva una sugerencia de modelo e intensidad para **todos los tickets**.
- **Revisión opcional:** si figura Astra, una **segunda revisión del diff y CA** (sin rehacer la tarea), no una exigencia de usar Astra para toda la implementación. Si no está disponible, revisión independiente con Sol High.

**Disponibilidad y privacidad:** OpenCode indica que GLM-5.3-Flash Free y DeepSeek V4.1 Flash Free son gratuitos **por tiempo limitado** y, según su documentación vigente, sus proveedores tienen política de no retención ni entrenamiento. La disponibilidad, los límites y estas condiciones pueden cambiar; verificar `/models` y términos antes de cada tanda. El código de un repositorio privado **sigue siendo sensible**: nunca enviar `.env*`, credenciales, tokens, datos financieros reales, dumps, cookies ni logs privados a un proveedor. Preferir fixtures sintéticos. Los modelos gratuitos alojados externamente **no consumen la cuota de Codex**, pero no son ilimitados; los modelos pagos del mismo catálogo sí pueden facturar.

Documentación: [OpenCode y selección de modelos](https://opencode.ai/docs/models) · [Catálogo y modelos gratuitos](https://opencode.ai/docs/console/models).

## Procedimiento económico por ticket
1. Leer `AGENTS.md`, el ticket y **solo los documentos pertinentes además de los obligatorios del repositorio**. No pegar documentación larga en prompts; pasar referencias a archivos.
2. Asegurar `main` actualizado y trabajar en **rama/worktree aislado por ticket**. Para MIX, pasar de OpenCode a Codex en la **misma rama** y con el mismo ID/PR; no ejecutar ambos simultáneamente sobre el mismo worktree.
3. Ejecutar el tramo asignado a OpenCode gratis. Si falla repetidamente, faltan herramientas o aparecen cambios monetarios/seguridad inesperados, **escalar pronto a Codex** en vez de consumir horas en correcciones ciegas.
4. En MIX/CX, usar Codex con **el mínimo contexto relevante**: cambios de la rama, RF/CA, archivos tocados y pruebas fallidas. Sol Medium para trabajo acotado; Sol High para dinero, RLS, concurrencia, migraciones y privacidad.
5. Exigir `npm run check`, pruebas relevantes de unidad/integración/E2E y GitHub Actions según impacto. **No suprimir tests** ni declarar que pasaron cuando no se ejecutaron. Revisar permisos y efectos financieros.
6. Commits, push y PR separados por ticket; no merge automático sin permiso expreso. **Nunca ejecutar migraciones en Neon development sin la autorización de SQL/hash exigida por el ADR 0004**; no escribir en production ni desplegar con datos reales.
7. Registrar para 3–5 tickets: cuota de Codex, número de intentos, fallos de CI, correcciones y tiempo humano. **Revaluar la matriz por evidencia**, no por publicidad o benchmarks genéricos.

### Criterio de ahorro
- **Alto:** OC (mayoría del trabajo con OpenCode gratis, Codex solo de respaldo).
- **Medio:** MIX (ahorro parcial por delegar UI, documentación o tests iniciales).
- **Bajo / no recomendado:** CX (el costo de fallar reglas de dinero/seguridad pesa más que el ahorro de cuota).

## Matriz completa

### F0 — Preparación

| Ticket | Objetivo | Ruta | Primera pasada gratis con OpenCode | Codex: modelo/esfuerzo y cierre | Revisión opcional |
|---|---|---|---|---|---|
| F0-01 | Inventario Git y repositorio | **OC** | **DeepSeek V4.1 Flash Free**: Examinar estructura y preparar informe | **Sol Medium** — Respaldo si no pasa las pruebas | — |
| F0-02 | Especificación visual | **OC** | **GLM-5.3-Flash Free**: Revisar referencia y redactar guía visual; no inventar funciones | **Terra Medium** — Respaldo si no pasa las pruebas | — |
| F0-03 | Scaffold Next.js | **OC** | **DeepSeek V4.1 Flash Free**: Montar configuración, scripts y tests iniciales; validar build | **Sol Medium** — Respaldo si no pasa las pruebas | — |
| F0-04 | Google OAuth, sesiones y allowlist | **CX** | No delegar núcleo monetario, permisos o esquema | **Sol High** — Implementación crítica y pruebas | Astra Medium |
| F0-05 | Neon, aislamiento y esquema inicial | **CX** | No delegar núcleo monetario, permisos o esquema | **Sol High** — Implementación crítica y pruebas | Astra Medium |
| F0-06 | CI y herramientas de test | **OC** | **DeepSeek V4.1 Flash Free**: Workflows, runners, scripts y tests de humo; comprobar CI | **Sol Medium** — Respaldo si no pasa las pruebas | — |
| F0-07 | Viabilidad Vercel/Neon y costes | **OC** | **GLM-5.3-Flash Free**: Investigar proveedores, contrastar fuentes oficiales y documentar | **Sol Medium** — Respaldo si no pasa las pruebas | — |
| F0-08 | Prototipo de efectos y checkpoints | **CX** | No delegar núcleo monetario, permisos o esquema | **Sol High** — Implementación crítica y pruebas | Astra High |
| F0-09 | Convenciones de arquitectura y amenazas | **CX** | No delegar núcleo monetario, permisos o esquema | **Sol High** — Implementación crítica y pruebas | — |

### F1 — Núcleo bancario

| Ticket | Objetivo | Ruta | Primera pasada gratis con OpenCode | Codex: modelo/esfuerzo y cierre | Revisión opcional |
|---|---|---|---|---|---|
| F1-01 | Layout y navegación responsive | **OC** | **GLM-5.3-Flash Free**: Pantallas, navegación, estados vacíos y verificación móvil | **Terra Medium** — Respaldo si no pasa las pruebas | — |
| F1-02 | Saldos y monedas independientes | **CX** | No delegar núcleo monetario, permisos o esquema | **Sol High** — Implementación crítica y pruebas | — |
| F1-03 | Formulario de ingresos/gastos | **MIX** | **GLM-5.3-Flash Free**: UI, validaciones de presentación y test visual | **Sol Medium** — Validar servidor, propietario y efecto financiero | — |
| F1-04 | Motor contable e idempotencia | **CX** | No delegar núcleo monetario, permisos o esquema | **Sol High** — Implementación crítica y pruebas | Astra High |
| F1-05 | Checkpoints y conciliación | **CX** | No delegar núcleo monetario, permisos o esquema | **Sol High** — Implementación crítica y pruebas | Astra High |
| F1-06 | Transferencias y cambio de moneda | **MIX** | **DeepSeek V4.1 Flash Free**: Preparar casos de prueba para montos de ambos lados | **Sol High** — Implementar transferencias y exactitud monetaria | — |
| F1-07 | Historial, filtros, edición/anulación | **MIX** | **GLM-5.3-Flash Free**: Filtros, búsqueda, paginación de UI y estados visuales | **Sol Medium** — Auditar edición, anulación y permisos | — |
| F1-08 | Regresión e aislamiento A/B | **MIX** | **DeepSeek V4.1 Flash Free**: Proponer matriz de pruebas y fixtures sintéticos | **Sol High** — Cerrar regresiones reales, permisos y concurrencia | Astra Medium |

### F2 — Tarjetas, préstamos y reembolsos

| Ticket | Objetivo | Ruta | Primera pasada gratis con OpenCode | Codex: modelo/esfuerzo y cierre | Revisión opcional |
|---|---|---|---|---|---|
| F2-01 | Catálogo de tarjetas | **MIX** | **GLM-5.3-Flash Free**: Formularios, listado y archivo en UI | **Sol Medium** — Validar deuda/saldo, propietario, RLS y persistencia | — |
| F2-02 | Compras y pagos de crédito | **CX** | No delegar núcleo monetario, permisos o esquema | **Sol High** — Implementación crítica y pruebas | Astra High |
| F2-03 | Compras en cuotas | **MIX** | **GLM-5.3-Flash Free**: Campos, calendario visual y errores de formulario | **Sol High** — Implementar cuotas contables, correcciones y auditoría | Astra High |
| F2-04 | Ciclos, mínimos y resúmenes | **MIX** | **GLM-5.3-Flash Free**: Vistas del resumen, fechas y alertas visuales | **Sol High** — Implementar reglas de ciclos, cifras oficiales y reconciliación | — |
| F2-05 | Compra con dos medios | **MIX** | **DeepSeek V4.1 Flash Free**: UI de reparto y fixtures de categorías/cuotas | **Sol High** — Garantizar débito, crédito y cuotas sin duplicación | Astra Medium |
| F2-06 | Deudas y préstamos | **MIX** | **GLM-5.3-Flash Free**: Formularios y vista de calendario de obligaciones | **Sol High** — Implementar capital, intereses, cuotas y saldos reales | — |
| F2-07 | Préstamos en otra moneda | **CX** | No delegar núcleo monetario, permisos o esquema | **Sol High** — Implementación crítica y pruebas | — |
| F2-08 | Gastos de terceros y compartidos | **MIX** | **GLM-5.3-Flash Free**: UI de participantes, reparto y estado de cobros | **Sol High** — Implementar derechos/obligaciones y pagos individuales | — |
| F2-09 | Devoluciones y saldo a favor | **CX** | No delegar núcleo monetario, permisos o esquema | **Sol High** — Implementación crítica y pruebas | Astra High |
| F2-10 | Consistencia, autorización y concurrencia | **MIX** | **DeepSeek V4.1 Flash Free**: Inventariar invariantes; generar fixtures y tests iniciales | **Sol High** — Auditar y ejecutar pruebas de DB real, locks, RLS y concurrencia | Astra High |

### F3 — Fondos y presupuestos

| Ticket | Objetivo | Ruta | Primera pasada gratis con OpenCode | Codex: modelo/esfuerzo y cierre | Revisión opcional |
|---|---|---|---|---|---|
| F3-01 | Fondos de ahorro virtual | **MIX** | **GLM-5.3-Flash Free**: UI de fondos y estados, sin operar dinero | **Sol High** — Validar reservas por titular, RLS y saldo disponible | — |
| F3-02 | Disponible libre y reservas atómicas | **CX** | No delegar núcleo monetario, permisos o esquema | **Sol High** — Implementación crítica y pruebas | Astra Medium |
| F3-03 | Aportes mensuales programados | **MIX** | **DeepSeek V4.1 Flash Free**: Casos extremos de calendario y tests puros de fechas | **Sol High** — Implementar transacciones, estado pendiente y reintentos | — |
| F3-04 | Metas, pausa y reactivación | **MIX** | **GLM-5.3-Flash Free**: Edición visual de metas, fechas y mensajes | **Sol High** — Implementar aportes exactos, pausas y estado persistente | — |
| F3-05 | Cubrir gastos con fondos | **CX** | No delegar núcleo monetario, permisos o esquema | **Sol High** — Implementación crítica y pruebas | Astra Medium |
| F3-06 | Presupuestos mensuales | **MIX** | **GLM-5.3-Flash Free**: Editor de límites, categorías y pantalla de presupuesto | **Sol High** — Implementar cálculo, cuotas, historial y servidor | — |
| F3-07 | Avisos por umbrales | **MIX** | **GLM-5.3-Flash Free**: Mensajes, estados y componentes de alertas | **Sol Medium** — Implementar umbrales/deduplicación y tests concurrentes | — |

### F4 — Recurrencias

| Ticket | Objetivo | Ruta | Primera pasada gratis con OpenCode | Codex: modelo/esfuerzo y cierre | Revisión opcional |
|---|---|---|---|---|---|
| F4-01 | Definir recurrencias | **MIX** | **DeepSeek V4.1 Flash Free**: Casos de frecuencia, fin de mes y pruebas puras | **Sol High** — Persistir recurrencias, validar fechas y permisos | — |
| F4-02 | Confirmación real de pagos/cobros | **CX** | No delegar núcleo monetario, permisos o esquema | **Sol High** — Implementación crítica y pruebas | — |
| F4-03 | Pausar y omitir períodos | **MIX** | **GLM-5.3-Flash Free**: Controles de pausa/omisión y vistas de estado | **Sol Medium** — Proteger histórico y estado de períodos por titular | — |
| F4-04 | Recurrencias compartidas | **CX** | No delegar núcleo monetario, permisos o esquema | **Sol High** — Implementación crítica y pruebas | Astra Medium |
| F4-05 | Centro de avisos y push opcional | **MIX** | **GLM-5.3-Flash Free**: Interfaz, preferencias y textos de notificación | **Sol High** — Asegurar permisos, deduplicación y emisión push | — |
| F4-06 | Regresión de calendario y horarios | **MIX** | **DeepSeek V4.1 Flash Free**: Matriz de fechas, TZ, omisiones y reintentos; tests base | **Sol High** — Validar idempotencia, concurrencia y regresión real | — |

### F5 — Catálogos y analítica

| Ticket | Objetivo | Ruta | Primera pasada gratis con OpenCode | Codex: modelo/esfuerzo y cierre | Revisión opcional |
|---|---|---|---|---|---|
| F5-01 | Categorías y subcategorías | **MIX** | **GLM-5.3-Flash Free**: Formularios, selectores y navegación del catálogo | **Sol Medium** — Implementar permisos, archivo y referencias históricas | — |
| F5-02 | División monetaria por categorías | **CX** | No delegar núcleo monetario, permisos o esquema | **Sol High** — Implementación crítica y pruebas | — |
| F5-03 | Comercios y contactos | **MIX** | **GLM-5.3-Flash Free**: Autocompletar, vistas de archivo/restauración | **Sol Medium** — Garantizar fusión segura y referencias históricas | — |
| F5-04 | Filtros guardados y edición masiva | **MIX** | **GLM-5.3-Flash Free**: UX de filtros y selección múltiple | **Sol Medium** — Asegurar permisos y atomicidad de cambios masivos | — |
| F5-05 | Estadísticas y visualizaciones | **MIX** | **DeepSeek V4.1 Flash Free**: Charts, componentes, pruebas de presentación | **Sol High** — Verificar cálculos exactos, filtros y consistencia histórica | — |
| F5-06 | Cotizaciones y valores históricos | **CX** | No delegar núcleo monetario, permisos o esquema | **Sol High** — Implementación crítica y pruebas | Astra Medium |
| F5-07 | Exportar e importar datos | **MIX** | **GLM-5.3-Flash Free**: Diseño de informe, formatos y UI de exportación | **Sol High** — Hacer exportación privada, cifrado, backup y restore seguros | Astra High |
| F5-08 | Borrado de cuenta y retención | **CX** | No delegar núcleo monetario, permisos o esquema | **Sol High** — Implementación crítica y pruebas | Astra Medium |
| F5-09 | Reembolsos posteriores y cashback | **CX** | No delegar núcleo monetario, permisos o esquema | **Sol High** — Implementación crítica y pruebas | Astra High |

### F6 — Integración y lanzamiento

| Ticket | Objetivo | Ruta | Primera pasada gratis con OpenCode | Codex: modelo/esfuerzo y cierre | Revisión opcional |
|---|---|---|---|---|---|
| F6-01 | Auditar 67 criterios de aceptación | **MIX** | **DeepSeek V4.1 Flash Free**: Armar matriz CA, rastrear tests y marcar vacíos preliminares | **Sol High** — Comprobar evidencia y cerrar criterios, sin inventar resultados | Astra Medium |
| F6-02 | Auditar privacidad y permisos | **CX** | No delegar núcleo monetario, permisos o esquema | **Sol High** — Implementación crítica y pruebas | Astra High |
| F6-03 | PWA, responsive y accesibilidad | **MIX** | **GLM-5.3-Flash Free**: Accesibilidad visual, teclado, contraste y UX de errores | **Sol High** — Auditar cache privada, online-only, sesiones y tests | — |
| F6-04 | Backup, restore y desastre controlado | **CX** | No delegar núcleo monetario, permisos o esquema | **Sol High** — Implementación crítica y pruebas | Astra High |
| F6-05 | Políticas, cuotas y costes | **OC** | **GLM-5.3-Flash Free**: Auditar documentación oficial de proveedores y límites vigentes | **Sol Medium** — Respaldo si no pasa las pruebas | — |
| F6-06 | Guía de usuario | **OC** | **GLM-5.3-Flash Free**: Redactar onboarding basado en pantallas y funciones reales | **Terra Medium** — Respaldo si no pasa las pruebas | — |
| F6-07 | Cierre de riesgos y aprobación real | **CX** | No delegar núcleo monetario, permisos o esquema | **Sol High** — Implementación crítica y pruebas | Astra High |

### UI — Identidad visual ([guía](../design/ui-identidad-visual.md))

| Ticket | Objetivo | Ruta | Primera pasada gratis con OpenCode | Codex: modelo/esfuerzo y cierre | Revisión opcional |
|---|---|---|---|---|---|
| UI-01 | Exploración y diseño aprobado | **CX** | Ya entregado (prototipo y guía) | **Sol Medium** — Solo correcciones de revisión | — |
| UI-02 | Base del sistema de diseño y shell | **MIX** | **GLM-5.3-Flash Free**: Tokens, tipografía, componentes base y estilos del shell | **Sol High** — Shell, navegación, sesión/rutas protegidas, e2e y rendimiento del fondo | Astra Medium |
| UI-03 | Resumen con datos reales | **MIX** | **GLM-5.3-Flash Free**: Maquetación de tarjetas y gráficos | **Sol High** — Conectar datos reales sin alterar importes ni duplicar cómputos | Astra High |
| UI-04 | Historial con nuevo estilo | **MIX** | **GLM-5.3-Flash Free**: Tabla, filtros y versión móvil | **Sol Medium** — Filtros guardados, selección masiva y e2e | — |
| UI-05 | Resto de pantallas y formularios | **OC** | **GLM-5.3-Flash Free**: Aplicar componentes por pantalla | **Sol Medium** — Respaldo si no pasan las pruebas | — |
| UI-06 | Tutorial con flechas y Ayuda | **OC** | **GLM-5.3-Flash Free**: Pasos, textos y pregunta de Ayuda | **Terra Medium** — Respaldo si no pasan las pruebas | — |

## Ejemplo inmediato: F2-10 (próximo ticket de F2)
**Ruta MIX — DeepSeek V4.1 Flash Free → Codex Sol High.** OpenCode, **sin conexión a Neon ni credenciales**, lee los contratos, enumera riesgos y agrega pruebas iniciales con datos sintéticos para: pagos parciales, reintentos, saldos indebidos, owner A/B y carreras de concurrencia. Codex continúa en **la misma rama**, revisa assertions y efectos, completa los casos de locks/atomicidad/RLS, corrige la implementación si falla, ejecuta el conjunto completo de pruebas y publica PR. Usar Astra High para revisión independiente de la PR si está disponible; no confundir tests verdes con prueba de seguridad formal.

**Estado al crear esta matriz:** F2-04 a F2-09 se fusionaron a `main` por PR #27–#32. Se verificó por lectura que Neon `development` sigue con migraciones hasta `0009`: los SQL `0010` a `0014` permanecen **pendientes de autorización/aplicación**. Fusionar código no migra la base ni despliega la app. F2-10 y la puerta de aceptación de F2 siguen sin cerrarse por el mero hecho de fusionar esas PR.

## Plantillas mínimas de uso

**OC (copiar en OpenCode; cambiar ID):**
```text
[ID] Ejecutá el ticket ID de docs/planning/05-plan-de-implementacion.md.
Seguí AGENTS.md, RF/CA e invariantes. Usá solo datos sintéticos.
Rama aislada, implementación y pruebas, commits y PR. Nunca tocar Neon
production, migraciones no autorizadas, secretos ni servicios pagos.
Si aparece lógica monetaria o de autorización delicada, detené ese
tramo, dejá diff/tests y explicá qué debe cerrar Codex.
```

**MIX, segunda pasada (copiar en Codex):**
```text
[ID] Retomá la rama del ticket ID preparada con OpenCode, SIN rehacer
el trabajo ya válido. Revisá diff, RF/CA, invariantes y pruebas existentes.
Completá únicamente lógica crítica de [alcance señalado en la matriz],
endurecé permisos/contabilidad y ejecutá regresión relevante. Corregí
fallos, commit/push y PR. No merge ni migraciones no autorizadas.
```

## Limitaciones de esta recomendación
El selector de modelos no se modifica solo por editar este documento. Una tarea clasificada OC puede requerir Codex si el modelo gratuito no tiene acceso a herramientas o falla pruebas. **No existe garantía de ahorro porcentual ni de equivalencia de calidad**. Los pasos de autorización de Neon, las revisiones de seguridad y las pruebas del gate **no se omiten para ahorrar tokens**.
