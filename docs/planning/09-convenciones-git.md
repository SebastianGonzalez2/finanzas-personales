# Convenciones obligatorias de Git, commits y Pull Requests

**Estado:** norma de trabajo para Codex desde 2026-11-07. **No cambia requisitos de producto.** Complementa `AGENTS.md`, `05-plan-de-implementacion.md` y `08-guia-operativa-codex.md`.

## Objetivo

Que una búsqueda por identificador de ticket, por ejemplo **`F0-01`**, permita encontrar su rama, commits, PR, criterios de aceptación y pruebas. Usar **el mismo ID canónico** de `05-plan-de-implementacion.md` en todos esos elementos. No inventar que un ticket está terminado si solo se creó una rama.

## 0. Títulos de conversaciones de Codex

**Formato obligatorio:** `[<TICKET>] <Nombre breve y específico>`. Usar el **mismo ID** de ticket para título de chat, rama, mensaje de commit y Pull Request. Ejemplos:

| Chat de Codex | Rama | Commit | Pull Request |
|---|---|---|---|
| `[F0-01] Revisión inicial` | `codex/F0-01-revision-inicial` | `docs(F0-01): documentar inventario` | `[F0-01] Revisión inicial del repositorio` |
| `[F0-03] Configurar Next.js` | `codex/F0-03-scaffold-nextjs` | `chore(F0-03): crear base Next.js` | `[F0-03] Estructura inicial de Next.js` |
| `[F1-03] Registrar movimientos` | `codex/F1-03-registro-movimientos` | `feat(F1-03): registrar movimientos` | `[F1-03] Registro manual de movimientos` |

**En el primer prompt del nuevo chat**, colocar `[F0-01] Revisión inicial` como primera línea para orientar el título que Codex genere automáticamente. **Verificar título visible en la lista de chats**; si falta el ID, renombrarlo manualmente desde la interfaz cuando esa función esté disponible, o con `/rename` en Codex CLI. Según la versión, la extensión de VS Code puede no ofrecer renombrado de hilos. Una instrucción de `AGENTS.md` **no puede garantizar** cambiar el título de un chat existente sin función disponible en el cliente. No reabrir/recrear un chat solo por su título; conservar conversaciones de un mismo ticket.

## 1. Identificadores

- Ticket de desarrollo: `F{fase}-{número de dos dígitos}`, p. ej. `F0-01`, `F1-03`, `F2-05`.
- Un PR debe apuntar a un ticket principal. Un ticket grande puede dividirse en subtareas `F2-03a`, `F2-03b` **solo si se documenta la división en el plan** antes de su ejecución; preferible ampliar el backlog con IDs específicos para evitar ambigüedad.
- Mantenimiento que no pertenece a un ticket funcional: prefijo `PLAN` (planificación/documentación), `OPS` (proceso/herramientas) o `HOTFIX` (incidencia), acompañado de motivo explícito. No usar `F0-01` artificialmente para cambios que no corresponden al ticket.
- Crear un ID no significa que sus requisitos RF/CA estén cubiertos; informar cobertura real.

## 2. Rama de trabajo

**Formato:** `codex/<TICKET>-<resumen-en-kebab-case>`.

Ejemplos:
- `codex/F0-01-revision-inicial`
- `codex/F0-03-scaffold-nextjs`
- `codex/F1-03-registro-movimientos`
- `codex/F2-03-cuotas-tarjeta`

Se acepta `feature/<TICKET>-...` o `fix/<TICKET>-...` si el entorno lo crea, pero **elegir un único patrón habitual por proyecto: `codex/`**. El nombre de rama **no es el mensaje del commit**. Una rama local o worktree no necesariamente existe aún en el remoto.

## 3. Mensajes de commits

**Formato obligatorio para nuevos commits de implementación:**

```text
<tipo>(<TICKET>): <acción específica en infinitivo>
```

Tipos permitidos:
- `feat`: funcionalidad o capacidad nueva.
- `fix`: corrección.
- `test`: pruebas.
- `docs`: documentación.
- `refactor`: refactor sin cambio funcional.
- `chore`: herramientas, dependencias, mantenimiento.
- `perf`: rendimiento.
- `ci`: pipeline/CI.

Ejemplos:
```text
docs(F0-01): documentar el inventario del repositorio
chore(F0-03): configurar Next.js y TypeScript
test(F1-03): cubrir alta de gastos con saldo insuficiente
feat(F1-03): registrar gastos reales en moneda original
fix(F2-03): evitar duplicar cuotas en estadísticas
docs(OPS): definir convenciones de Git y PR
```

**Reglas:** asunto corto (idealmente <=72 caracteres), en español, acción concreta y sin `wip`, `cambios`, `update`, `fix stuff` o `final` genéricos. Commits pequeños, autocontenidos, que pasen checks pertinentes y sean fáciles de revertir. Los commits de una PR comparten el ID de su ticket. No poner credenciales ni información financiera privada en títulos/descripciones. No forzar reescritura del historial previo para normalizar nombres: la norma rige **de ahora en adelante**.

**Cuerpo de commit** (si cambia dinero/estado, hay migración, seguridad o una corrección no obvia):

```text
Motivo: <problema y contexto>
Cambio: <decisión técnica y alcance>
Pruebas: <comando y resultado observado o "no ejecutadas" con motivo>
Refs: RF-..., CA-...
```

Para commits triviales puede bastar el asunto. No falsear resultados de pruebas.

## 4. Título del Pull Request

**Formato obligatorio:**

```text
[<TICKET>] <Descripción concreta de la entrega>
```

Ejemplos:
```text
[F0-01] Revisión inicial del repositorio
[F0-03] Estructura inicial de Next.js y pruebas
[F1-03] Registro manual de ingresos y gastos
[F2-03] Compras en cuotas y distribución mensual
[OPS] Estandarizar convenciones de Git y revisión
```

Una PR = una unidad revisable y un objetivo principal. Si el título no refleja lo que realmente cambia, se corrige antes de fusionar. No abrir PR de funciones que no estén en el ticket.

## 5. Descripción de cada Pull Request

La plantilla automática está en `.github/PULL_REQUEST_TEMPLATE.md` y debe completarse con hechos reales, no copiar encabezados vacíos.

Campos mínimos:
1. **Ticket y tipo de cambio** (F0-01, etc.).
2. **Objetivo/por qué**.
3. **Qué se hizo** (2–5 puntos) y **qué quedó fuera**.
4. **RF/CA** afectados, con referencias a docs; **No aplica** justificado si es trabajo infra/solo docs.
5. **Pruebas ejecutadas y resultado** (comandos exactos y pass/fail; si no se ejecutaron, explicar por qué).
6. **Cómo revisar** (pasos reproducibles o capturas para UI).
7. **Riesgos, migraciones, servicios externos y permisos**.
8. **Checklist de seguridad:** sin secretos, sin cambios de pagos, aislamiento cuando aplique, sin gastos inventados.
9. **Siguiente ticket** y dependencias si corresponde.

Dejar enlaces a pruebas/evidencia o rutas locales cuando sean verificables. No atribuir a un usuario aprobaciones que no expresó.

## 6. Trazabilidad y búsqueda

- Buscar `F0-01` en **conversaciones de Codex**, ramas, commits y PR; en GitHub también puede buscarse por mensaje de commit y título de PR. Buscar `RF-008` o `CA-015` en descripciones cuando se necesite trazabilidad por requerimiento/criterio.
- Actualizar una tabla de avance en el plan o un registro de tickets solo **cuando exista evidencia de entrega**. Estado sugerido: `pendiente`, `en curso`, `en revisión`, `aceptado`, `bloqueado`.
- Cada PR debe enlazar o referenciar el ticket, RF/CA y notas de riesgo reales. No requiere instalar servicios externos de gestión de tareas.
- Se puede usar una GitHub Issue por ticket si el equipo lo considera útil; **no es requisito** para aplicar estas convenciones.

## 7. Protocolo de cierre del ticket

1. Codex muestra rama actual, diff y commits.
2. Comprueba que título y descripción de PR usan `[F?-??]` y que commits tienen `tipo(F?-??): ...`.
3. Ejecuta y comunica tests exactos, con errores si existen; revisa secretos, permisos, migraciones y cambios financieros.
4. Revisión humana de diff/PR; si hay comentarios, corregir dentro del mismo ticket.
5. Mergear solamente tras aprobación humana o autorización explícita del usuario; no forzar push ni merge por cuenta propia.
6. Traer el nuevo `main` de forma segura y recién después iniciar otro ticket en rama/chat nuevo.
7. Actualizar estado del ticket por evidencia, no por el mero nombre de rama o commit.

## Diferencia entre rama, commit y PR

- **Rama:** línea aislada de trabajo (ej. `codex/F0-01-revision-inicial`), local o remota.
- **Commit:** cambio concreto guardado en el historial, con SHA y mensaje (ej. `docs(F0-01): documentar estado...`).
- **Pull Request:** solicitud de incorporar una rama a otra, con título/explicación, diff, checks y revisión.

**No basta con que Codex cree una rama para marcar el ticket como completo**. Consultar también resultados y PR.

## Prompt corto para cualquier chat de Codex

```text
Seguí AGENTS.md y docs/planning/09-convenciones-git.md.
Usá el ID real de ticket en rama, commits y Pull Request:
rama codex/F?-??-nombre; commits tipo(F?-??): acción;
PR [F?-??] Título. Completá la plantilla del PR, con
RF/CA, pruebas ejecutadas, riesgos y fuera de alcance.
No mezcles tickets ni marques completado sin evidencias.
```
