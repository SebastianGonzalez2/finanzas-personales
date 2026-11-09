# F0-01 — Revisión inicial del repositorio

> Registro histórico del inventario de arranque. El estado actual del proyecto se
> consulta en el [plan de implementación](05-plan-de-implementacion.md) y la
> decisión de autenticación vigente en el [ADR 0004](../adr/0004-google-only-allowlist-auth.md).

**Fecha:** 2026-11-07 (America/Montevideo).

**Alcance:** inventario, sincronización segura y evaluación inicial; sin implementar F0-02 ni otros tickets.

**Base remota inspeccionada:** `origin/main`, commit `b02c49ed0313ce7f0c3118f7aabe46eaf9951bc7`.

**Rama de trabajo:** `codex/f0-01-revision-inicial`.

## 1. Estado de Git y sincronización

- Workspace: raíz local del repositorio `finanzas-personales`.
- Remoto de fetch/push: `https://github.com/SebastianGonzalez2/finanzas-personales.git`.
- Estado inicial: rama `main` en `d7f444de750479397510d2c68c9581851535f22a`, igual a la referencia local antigua de `origin/main`.
- Había trabajo local sin seguimiento: `docs/design/fintrack-visual-spec.md`. No había modificaciones ni cambios staged en archivos rastreados.
- `git fetch origin` actualizó `origin/main` a `b02c49e`. La comparación devolvió **0 commits exclusivos locales y 138 remotos**. El checkout antiguo carecía de `AGENTS.md` y `docs/planning/`.
- Se creó la rama de trabajo con `git switch --no-track -c codex/f0-01-revision-inicial origin/main`. Antes del informe, `HEAD...origin/main` devolvió **0 / 0**.
- La rama local `main` se conserva en `d7f444d`, 138 commits detrás. La sincronización se hizo en la rama del ticket; no se adelantó ni se editó `main`.
- Ramas locales observadas después: `main` y la rama del ticket. La única rama remota observada tras fetch es `origin/main`; `origin/HEAD` apunta a ella. El refspec de fetch incluye todas las ramas de origin.
- No se utilizó reset, clean, stash, merge, rebase ni push forzado. No se borró ni sobrescribió trabajo local.

**Integridad de la guía local:** SHA-256 antes y después del cambio de rama:

```text
9D7BBEC9AF7D96A9037260421C1517CFAA24E620C429885C6D04244FE9E8E1EE
```

**Salvedad de aceptación:** el árbol de trabajo no está completamente limpio: la guía preexistente permanece sin seguimiento. Este informe es el único archivo nuevo de F0-01. No se incorpora la guía al ticket ni se borra para aparentar un Git limpio; su revisión y versionado corresponden a F0-02.

## 2. Inventario real

La base `b02c49e` contiene **12 archivos rastreados**, todos de documentación o referencia:

| Grupo | Archivos existentes |
| --- | --- |
| Instrucciones | `AGENTS.md` |
| Referencia visual | `docs/fintrack-original.jpeg` |
| Decisiones | `docs/product/decisiones-producto.md`, versión **9.48** |
| Planificación | `docs/planning/README.md` y los ocho documentos `01` a `08` |
| Material local adicional | `docs/design/fintrack-visual-spec.md`, preexistente y sin seguimiento |

También existe el directorio local `.playwright-mcp/`, vacío al inspeccionarlo. Su presencia no prueba que haya una configuración o suite de navegador operativa.

**No existen en este checkout:** `package.json`, lockfile, código `src/` o `app/`, componentes React/shadcn, configuración Next.js/TypeScript/Tailwind, README de ejecución en raíz, `.gitignore`, `.env.example`, archivos de entorno, migraciones/esquema DB, tests, workflows `.github/` o configuración de despliegue. El inventario incluyó archivos ocultos, sin seguimiento e ignorados; no aparecieron archivos ignorados adicionales.

Por tanto, dashboard, bancos, tarjetas, fondos, autenticación, API y persistencia son **capacidades documentadas**, sin implementación encontrada. Las estructuras de carpetas y tablas del plan son propuestas, no componentes construidos. No se inspeccionaron paneles externos: este inventario no demuestra que fuera del repositorio no existan cuentas o recursos de proveedores.

Se leyó `AGENTS.md` y toda la documentación de planificación `README.md`, `01`…`08`. Se consultó el registro del producto v9.48 para autoridad, diseño, exclusiones, reembolsos, identidad y cierre funcional (§12.1). Las notas históricas de §12 no reemplazan las confirmaciones posteriores.

## 3. Referencia visual local

- **La guía existe**, es legible y no figura en el árbol remoto `b02c49e`.
- Se abrió visualmente el JPEG de **1600 × 1197 px**: interfaz oscura de escritorio con sidebar, header, tres indicadores, pestañas, cuatro columnas y tarjetas. La composición general coincide con la descripción textual local.
- La guía incluye dimensiones aproximadas, paleta, tipografía estimada, espaciados, iconografía, componentes y variantes visibles. Reconoce que fuente exacta, escala CSS y comportamientos no se pueden deducir del JPEG.
- No se repitieron las mediciones de píxeles o colores: las cifras de la guía todavía requieren validación en F0-02.
- Faltan reglas concretas de responsive, teclado/foco, carga, error, vacío y otros estados no visibles en la captura. La lista de piezas reutilizables es documentación, no código de componentes.

**Discrepancia a conciliar en F0-02:** las reglas iniciales de la guía piden mantener exactamente la estructura y no agregar elementos visuales sin autorización; el producto §2 permite adaptar etiquetas, contenido, botones y destinos a las funciones aprobadas y exige móvil/escritorio. Se registra aquí la diferencia, sin cambiar silenciosamente la guía. Mandan las decisiones explícitas v9.48: mantener la estética, interfaz en español, no agregar inversiones u otras funciones excluidas y no usar «Fintrack» como nombre/logo definitivo (§1). El marco gris exterior queda fuera de la aplicación.

R-18 queda **parcialmente aclarado**: se confirmó existencia e integridad local, pero falta una guía conciliada y versionada. No se declara resuelto.

## 4. Herramientas y dependencias

Comandos ejecutados en este entorno:

| Comando | Resultado |
| --- | --- |
| `git --version` | `2.54.0.windows.1` |
| `node --version` | `v24.19.0` |
| `npm --version` | `11.17.0` |
| `corepack --version` | `0.35.0` |

La presencia de estas herramientas no valida compatibilidad ni reproducibilidad de una aplicación inexistente. No se instalaron paquetes, se ejecutaron generadores ni se seleccionaron versiones.

**Stack confirmado documentalmente:** Next.js App Router, TypeScript, Tailwind CSS, shadcn/ui, Neon PostgreSQL, Neon Auth y Vercel. No hay dependencias declaradas ni lockfile que permitan verificar cuáles están instaladas para el proyecto.

**Decisiones pendientes en sus tickets:** versiones compatibles de Node/Next/React y SDK Auth; driver/ORM/migraciones/pooling; representación decimal y redondeo; validación; frameworks de tests y CI. No se elige una biblioteca por anticipado en F0-01. Gráficos, PWA y herramientas de exportación requieren evaluación cuando correspondan.

## 5. Riesgos y verificaciones prioritarias

Las siguientes son prioridades del plan, **no capacidades verificadas en esta revisión**:

| Prioridad / tickets | Riesgos | Evidencia que falta |
| --- | --- | --- |
| Antes de construir UI: F0-02 | R-18 | Conciliar guía local con producto, completar reglas y versionar; referencia RF-052, CA-066. |
| Base reproducible: F0-03 / F0-06 | R-17 / R-19 | Fijar versiones y lockfile; ignorar secretos antes de introducir credenciales; comprobar dev/lint/typecheck/build y CI. |
| Acceso real: F0-04 | R-01 / R-02 | SDK oficial compatible; invitación aplicada en servidor a correo y Google; OTP, recuperación, expiración, sesiones y entrega SMTP. RF-001…004; CA-001…006. No asumir plugins arbitrarios de Better Auth autogestionado. |
| Datos: F0-05 / F0-09 | R-12 / R-13 / R-16 | DB de prueba aislada, migraciones, propiedad de relaciones, pruebas negativas A/B, transacciones, idempotencia, decimales exactos y fechas de calendario. I-11/I-12; RNF-01…04/09/15. |
| Viabilidad antes de publicar: F0-07 | R-03 / R-11 / R-19 | Consultar fuentes oficiales vigentes sobre uso permitido/cupos/costos y probar cobertura de cotizaciones UYU/USD/EUR. No se verificaron términos ni precios actuales aquí. |
| Núcleo monetario: F0-08 y fases siguientes | R-04 / R-05 / R-06 / R-07 | Probar checkpoints inalterables, sin doble gasto por pagar tarjeta, sin salida bancaria por reservar ahorro y reembolso separado entre meses. CA-015/021/028/038; I-02/I-03/I-08/I-10. |

Backups/restauración (R-14), offline (R-15), pausa de ahorro (R-08) y excepciones bancarias/préstamos (R-09/R-10) siguen pendientes para sus fases. Que una regla esté funcionalmente cerrada no implica que su implementación sea segura o esté probada.

**Acciones futuras del titular:** habilitar acceso a un proyecto/branch Neon de prueba y configuración Auth; configurar Google OAuth y callbacks; proporcionar un mecanismo SMTP/remitente admisible; autorizar acceso a Vercel cuando corresponda. Primero debe precisarse el mecanismo, los permisos y los límites en cada ticket. No se necesitan esas conexiones para F0-02. No se buscaron ni imprimieron secretos, ni se conectaron proveedores en esta revisión.

## 6. Verificaciones realizadas y límites

- Git: `git status --short --branch`, `git branch --show-current`, `git remote -v`, `git branch -a -vv`, `git log`, `git rev-parse`, `git rev-list --left-right --count HEAD...origin/main`, `git diff --stat` y `git diff --cached --stat`.
- Sincronización: `git fetch origin` y creación de rama desde `origin/main`. El primer fetch falló por permiso de escritura de `.git/FETCH_HEAD`; al repetir con autorización terminó correctamente. No fue un conflicto de archivos.
- Inventario: `git ls-files`, `git ls-tree -r --name-only origin/main`, `rg --files --hidden` excluyendo `.git`, listados locales y consultas de archivos ignorados/sin seguimiento.
- Documentación: lectura de los archivos indicados, consulta de reglas vigentes del producto, apertura del JPEG y SHA-256 de la guía antes/después.
- Revisión del informe: `git diff --cached --check`, revisión de la lista de cambios y comprobación de que `main` y el hash de la guía se mantienen. Los espacios finales detectados inicialmente en la cabecera se corrigieron antes del commit.
- **Lint, typecheck, tests, build y servidor de desarrollo: no ejecutados.** No hay proyecto, scripts ni suites para correrlos. No se informa ningún CA funcional aprobado.
- No se comprobaron configuración de GitHub branch protection, ejecuciones remotas de CI, recursos Neon/Vercel, SMTP, OAuth, conexiones DB, costos vigentes ni despliegues externos. No se afirma su inexistencia.
- No se modificaron código, especificación visual, decisiones funcionales ni estados del registro de riesgos. El único documento agregado por este ticket es este informe.

## 7. Siguiente ticket y condición de cierre

**Siguiente: F0-02 — recuperar, conciliar y versionar la especificación visual.** Utilizar la guía existente y el JPEG; no hace falta reconstruirla desde cero. Completar responsive/estados/accesibilidad como propuestas de diseño trazables, resolver la discrepancia registrada y preservar las funciones aprobadas. Trabajar en una rama propia desde la base revisada, conservando el archivo local hasta incorporarlo deliberadamente.

La revisión/inventario F0-01 tiene evidencia. La condición literal de **Git completamente limpio** del plan queda pendiente por el material local preexistente, que se conserva para F0-02; no se fuerza su cierre eliminando ni incluyendo trabajo ajeno. La puerta global de F0 sigue abierta y no autoriza F1 ni producción. F0-03 viene después; no fue iniciado.
