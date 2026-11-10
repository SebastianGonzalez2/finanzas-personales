# Guía operativa: cómo trabajar con Codex sin depender de un chat de planificación

**Alcance:** organización del trabajo humano + Codex/OpenCode. No altera decisiones de producto (vigente v9.49 y posteriores). **Lectura mínima:** `AGENTS.md`, sección del ticket en [plan técnico](05-plan-de-implementacion.md) y fila del ticket en [matriz de modelos](10-modelos-por-ticket.md). Consultar [criterios de aceptación](03-criterios-de-aceptacion.md), [riesgos](06-riesgos-y-pendientes.md) y [handoff](07-handoff-codex.md) **solo en las secciones pertinentes**. No cargar toda la carpeta `docs/planning` por defecto.

## Regla principal

**Una conversación principal de Codex por ticket o unidad de trabajo revisable (normalmente un PR pequeño).** **Nombres y trazabilidad obligatorios:** seguir [09-convenciones-git.md](09-convenciones-git.md) y [plantilla de PR](../../.github/PULL_REQUEST_TEMPLATE.md): rama `codex/F0-01-revision-inicial`, commit `docs(F0-01): documentar estado inicial`, PR `[F0-01] Revisión inicial del repositorio`. El ID debe coincidir con el ticket; buscarlo recupera los cambios relacionados. Una rama no es un commit ni prueba de tarea completada. Mantener la conversación para aclaraciones, errores, pruebas y correcciones de **ese mismo ticket**. Crear una nueva cuando haya cambiado el objetivo o el ticket haya sido aceptado y cerrado. No un chat por requisito de producto si el requisito es grande; dividir en tickets F0-01, F0-02, etc. No mezclar tareas de módulos independientes en un chat de implementación gigantesco.

Los **archivos y commits de Git**, no la memoria de la conversación, son la fuente persistente de avance. Al iniciar un ticket, leer solo su contexto relevante; `AGENTS.md` define el procedimiento mínimo. Para ruta MIX, Codex continúa sobre la misma rama/commits creados con OpenCode.

## Nombre visible del chat de Codex

**Norma para todos los tickets:** título **`[ID] Descripción breve`**, p. ej. `[F0-01] Revisión inicial`, `[F0-02] Diseño visual`, `[F0-03] Configurar Next.js`, `[F1-03] Registrar movimientos`. El ID debe ser **idéntico** al de la rama, commit y PR. Al iniciar un nuevo chat:
1. Escribir **en la primera línea del primer mensaje** el título sugerido `[F0-01] Revisión inicial`.
2. Seguir debajo con el prompt de ese ticket. No abrir un chat nuevo para cambiar solo el nombre.
3. Si Codex generó un título sin ID, **renombrarlo desde la UI cuando esté disponible** o, en CLI, con `/rename [F0-01] Revisión inicial`. La extensión de VS Code puede no ofrecer rename según versión; entonces usar primera línea del prompt y comprobar el resultado. No asumir que un texto en `AGENTS.md` puede alterar el título de un chat ya existente.
4. Si el chat actual ya se llama «Revisar estado inicial del repositorio», renombrarlo a `[F0-01] Revisión inicial` cuando la superficie lo permita, **sin reiniciar ni perder su trabajo**.

Este convenio se documenta además en `09-convenciones-git.md`. Los títulos de chat se tratan como referencias de navegación, **no como prueba de implementación**.

## Entorno recomendado al comenzar

- Abrir **Codex en el ordenador**, elegir el proyecto local `finanzas-personales`, confirmar ruta, rama y remoto de GitHub. No editar otro proyecto.
- **Modelo:** consultar la **fila del ticket** en `10-modelos-por-ticket.md` para decidir OC/MIX/CX y modelo/esfuerzo. Seleccionar manualmente un modelo disponible en la herramienta elegida; reservar esfuerzo High para contabilidad, seguridad, arquitectura, migraciones y concurrencia. No asumir que un nombre del documento esté disponible en el selector.
- **Permisos:** empezar por **Ask for approval**, que permite leer/escribir dentro de workspace y comandos normales pero solicita aprobación al necesitar acceso externo o escalado. Si resulta excesivo para tareas rutinarias de bajo riesgo, considerar **Approve for me**, con evaluación automática de solicitudes permitidas; **nunca confundirlo con revisión humana del código**. No dejar **Full access** activo de forma general.
- **Aislamiento:** crear nueva **rama** de trabajo o **worktree** desde `main` para cada ticket. Evitar desarrollar directamente sobre `main`. Antes de cambiar ramas, comprobar `git status` y proteger cualquier trabajo local.
- Plan mode para tareas de alto riesgo (autenticación, dinero, migraciones, seguridad). La propuesta puede revisarse antes de implementar. Para tickets sencillos y bien definidos, Codex puede implementar de forma autónoma dentro del alcance acordado.
- No almacenar secretos en archivos rastreados ni activar planes pagos; autorizaciones externas se revisan explícitamente.

## Ciclo fijo de cada ticket

1. **Abrir** Codex sobre el mismo repositorio y sincronizar cuidadosamente con `origin/main`, sin perder cambios locales.
2. **Elegir el ticket solicitado** o el próximo pendiente de `05-plan-de-implementacion.md` según dependencias; verificar la ruta OC/MIX/CX en `10-modelos-por-ticket.md`. Crear rama/worktree aislada.
3. **Dar alcance concreto:** ticket, RF/CA, qué está fuera del ticket, archivos de referencia, tests esperados. Codex revisa `AGENTS.md` y documentación.
4. **Propuesta corta** si es cambio riesgoso. Revisar solución propuesta y límites antes de aceptar.
5. **Implementación:** Codex modifica archivos necesarios, ejecuta tests/lint/typecheck/build, observa errores, corrige y vuelve a probar.
6. **Revisión:** usuario verifica explicación, archivos cambiados, que no aparezcan servicios pagos/credenciales, comportamiento de UI y **resultado real de pruebas**. Usar vista de diff o `/review` si disponible.
7. **Si falta algo:** pedir corrección **en el mismo chat**, no iniciar una tarea distinta. Codex debe mostrar nuevo diff y nuevos resultados.
8. **Cerrar:** commit y PR si el entorno/GitHub lo permite, revisar/merge controlado a `main`; traer el nuevo `main` antes de próximo ticket. Si no hay integración para abrir PR, el agente debe dejar cambios en rama con commits y explicar cómo abrirlo, **no hacer push forzado o merge improvisado**.
9. **Actualizar trazabilidad:** ticket/PR, RF/CA cubiertos, evidencias, tests, riesgos pendientes, decisión técnica o ADR si aplica. No marcar «terminado» sin evidencia.
10. **Nuevo chat** de Codex para el siguiente ticket. Puede pedir a Codex que lea plan y determine el siguiente pendiente, pero verificar que sea el correcto.

## Prompt inicial: F0-01 (primera vez)

```text
[F0-01] Revisión inicial

Estamos desarrollando el repositorio SebastianGonzalez2/finanzas-personales.
Abrí y revisá AGENTS.md y docs/planning/README.md, 05-plan-de-implementacion.md,
06-riesgos-y-pendientes.md y 07-handoff-codex.md. El documento de decisiones
v9.49 y las posteriores prevalecen sobre las históricas.

Trabajá SOLO el ticket F0-01: inventario del repositorio y preparación segura.
Primero verificá ruta, git status, rama, origin/main y diferencias local-remoto.
No borres ni sobrescribas trabajo local. Inspeccioná qué archivos existen
realmente, si docs/design/fintrack-visual-spec.md está localmente y qué falta.

Entregame un informe claro de:
1) estado del repositorio y de Git;
2) componentes ya existentes versus solo documentación;
3) riesgos técnicos prioritarios y qué conexiones externas requerirían mi acción;
4) siguiente ticket exacto y condiciones para iniciarlo.

No implementes todavía otros tickets, no despliegues, no configures servicios
pagos y no modifiques main. Si precisás escribir un informe, hacelo en una rama
de trabajo separada y ejecutá los chequeos que correspondan.
```

## Prompt para un ticket de implementación ordinario

```text
[F?-??] Descripción breve del ticket

Leé AGENTS.md y la fila [F?-??] de docs/planning/10-modelos-por-ticket.md.
Trabajá SOLO [F?-??] de
docs/planning/05-plan-de-implementacion.md, usando los requisitos RF-...
y criterios CA-... de docs/planning. Comprobá git status y sincronización
sin borrar cambios locales; abrí rama/worktree de este ticket desde main.

Primero indicá en pocas líneas los archivos afectados y riesgos principales.
Implementá la solución completa dentro de ese alcance, incluyendo
validaciones de servidor, pruebas de caso feliz/error/aislamiento (si aplica),
lint, typecheck y build. Corregí errores que introduzcas, sin cambiar
funcionalidades ya cerradas ni ampliar alcance sin autorización.

Al final mostrá: resumen de cambios, diff/archivos, comandos y resultados
exactos de tests, RF/CA cubiertos, riesgos que siguen abiertos y cómo
revisar visualmente. Prepará commit y PR acotados si es posible. No
hagas merge ni deploy en producción sin mi aprobación expresa.
```

## Prompt para revisar antes de aceptar

```text
Revisá este ticket/PR como auditor. Compará cambios con su RF, CA e
invariantes contables. Identificá bugs, problemas de autorización,
duplicación monetaria, falta de tests y desviaciones del alcance. No
alteres código todavía. Entregá observaciones ordenadas por severidad
y un veredicto: aceptable / requiere correcciones, con evidencia.
```

## Prompt cuando falla un test

```text
Seguimos en el mismo ticket. Investigá la causa del fallo que aparece en
[comando/salida]. No lo escondas ni desactives el test. Arreglá la causa
sin cambiar alcance, ejecutá nuevamente pruebas pertinentes y
mostrame exactamente qué cambió.
```

## Cómo elegir permisos

| Modo | Para qué sirve | Recomendación |
| --- | --- | --- |
| Ask for approval | Edición/comandos habituales del workspace; solicitud explícita para escaladas. | **Predeterminado** en primeras fases. |
| Approve for me | Un revisor automático decide ciertas solicitudes de permiso; no equivale a revisar PR. | Opcional después, con tickets seguros y aislados. |
| Full access | Permisos amplios para archivos, red y comandos; depende de la superficie. | **No usar como predeterminado**, especialmente con secretos, GitHub y dinero. |

**Nunca aprobar ciegamente** comandos destructivos (`rm -rf`, `git reset --hard`, push forzado), accesos a carpetas ajenas, migraciones destructivas o cambios de servicios; solicitar explicación y alternativa segura. Solicitudes para instalar dependencias públicas verificadas son distintas de habilitar facturación.

## Control de modelos/intensidad

**Consultar la matriz actual por ticket** en [10-modelos-por-ticket.md](10-modelos-por-ticket.md), que recomienda el modelo, nivel de razonamiento y necesidad de revisión independiente para cada tarea. El titular selecciona el modelo manualmente en Codex; no se cambia automáticamente por el nombre del ticket. Si falla una evaluación, no se sacrifica calidad para ahorrar uso.


- Seguir **la fila correspondiente del ticket**, no aplicar Sol High a toda una fase por defecto. Para OC usar OpenCode gratuito; para MIX delegar su tramo a OpenCode y cerrar en Codex con la misma rama; para CX usar Codex desde el inicio.
- Elegir intensidad según la matriz y el **riesgo real**: High para decisiones monetarias, RLS, concurrencia, migraciones, backups o seguridad; Medium para UI, documentación y cambios acotados. Si el selector no tiene el modelo citado, elegir el disponible más adecuado y documentar el cambio.
- No sacrificar pruebas ni calidad por minimizar tokens; medir el ahorro por ticket aceptado, no por respuesta.

## ¿Cuándo abrir un chat nuevo?

| Situación | Acción |
| --- | --- |
| Mismo ticket, error, refactor solicitado, review feedback | **Continuar el chat existente.** |
| Ticket aceptado, siguiente F0-02/F0-03/etc. | **Nuevo chat, misma base de documentos.** |
| Pregunta corta no relacionada mientras Codex trabaja | Side chat si disponible; no contaminar conversación principal. |
| Chat excesivamente largo del mismo ticket | Compactar si existe, o trasladar estado por commit y abrir nuevo chat del mismo ticket. |
| Corrección urgente de otro módulo | Chat + rama/worktree independiente, no mezclar cambios no revisados. |
| Tres tareas pequeñas tan acopladas que generan un PR único pequeño | Puede ser un chat si se explicita único alcance y tests. |
| Tarea grande con varios flujos independientes | Dividir en tickets/PRs; evitar chat gigantesco. |

## Cómo evaluar entregas sin ser experto

No hace falta entender cada línea de código, pero pedir evidencia objetiva:
- Que indique **qué cambió** en pantalla/funcionamiento, sin prometer lo que no implementó.
- Qué **pruebas exactas** ejecutó, cuáles pasaron, cuáles fallaron y por qué.
- Mostrar **capturas** o demo navegable local en cambios de UI.
- Confirmar que **no toca dinero real**, no activó servicios pagos y no publicó secretos.
- Si maneja dinero, demostrar con un ejemplo numérico del CA correspondiente.
- Revisar **Git diff**, rama y estado de PR; no dar por implementada una tarea solo porque Codex escribió «listo».

## Cierre de una fase

Consultar el gate correspondiente en `05-plan-de-implementacion.md`. Codex recopila los PRs/tickets terminados y ejecuta regresión; si falta seguridad, integridad o proveedor probado, el gate **no está cumplido**. Pedir una revisión de fase en chat separado si conviene, sin construir funcionalidades nuevas durante esa revisión.

## Fuentes sobre Codex y permisos

- https://developers.openai.com/blog/mastering-codex-remote-for-engineering
- https://developers.openai.com/pt-BR/docs/sandboxing
- https://developers.openai.com/api/docs/guides/agents-api/sessions/approvals
- https://developers.openai.com/api/docs/guides/code-generation

Esta guía no significa que Codex haya iniciado F0: su función es estandarizar cómo dirigirlo y revisar su trabajo.
