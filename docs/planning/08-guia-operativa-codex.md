# Guía operativa: cómo trabajar con Codex sin depender de un chat de planificación

**Alcance:** organización del trabajo humano + Codex. **No** agrega requisitos de producto ni cambia las decisiones v9.48. Consultar siempre [plan técnico](05-plan-de-implementacion.md), [criterios de aceptación](03-criterios-de-aceptacion.md), [riesgos](06-riesgos-y-pendientes.md), [handoff](07-handoff-codex.md) y `/AGENTS.md`.

## Regla principal

**Una conversación principal de Codex por ticket o unidad de trabajo revisable (normalmente un PR pequeño).** Mantener la conversación para aclaraciones, errores, pruebas y correcciones de **ese mismo ticket**. Crear una nueva cuando haya cambiado el objetivo o el ticket haya sido aceptado y cerrado. No un chat por requisito de producto si el requisito es grande; dividir en tickets F0-01, F0-02, etc. No mezclar tareas de módulos independientes en un chat de implementación gigantesco.

Los **archivos y commits de Git**, no la memoria de la conversación, son la fuente persistente de avance. Codex debe leer documentación del repositorio al inicio de cada nuevo chat.

## Entorno recomendado al comenzar

- Abrir **Codex en el ordenador**, elegir el proyecto local `finanzas-personales`, confirmar ruta, rama y remoto de GitHub. No editar otro proyecto.
- **Modelo:** seleccionar el modelo de programación general más capaz disponible, preferentemente GPT-6.1 Sol si figura en el selector; si no, usar el más capaz disponible. **Reasoning effort: High** para contabilidad, seguridad, arquitectura y migraciones; **Medium** para tareas pequeñas con criterios claros. No confundir nombres de modelos de API con disponibilidad exacta del selector de Codex.
- **Permisos:** empezar por **Ask for approval**, que permite leer/escribir dentro de workspace y comandos normales pero solicita aprobación al necesitar acceso externo o escalado. Si resulta excesivo para tareas rutinarias de bajo riesgo, considerar **Approve for me**, con evaluación automática de solicitudes permitidas; **nunca confundirlo con revisión humana del código**. No dejar **Full access** activo de forma general.
- **Aislamiento:** crear nueva **rama** de trabajo o **worktree** desde `main` para cada ticket. Evitar desarrollar directamente sobre `main`. Antes de cambiar ramas, comprobar `git status` y proteger cualquier trabajo local.
- Plan mode para tareas de alto riesgo (autenticación, dinero, migraciones, seguridad). La propuesta puede revisarse antes de implementar. Para tickets sencillos y bien definidos, Codex puede implementar de forma autónoma dentro del alcance acordado.
- No almacenar secretos en archivos rastreados ni activar planes pagos; autorizaciones externas se revisan explícitamente.

## Ciclo fijo de cada ticket

1. **Abrir** Codex sobre el mismo repositorio y sincronizar cuidadosamente con `origin/main`, sin perder cambios locales.
2. **Elegir el próximo ticket sin cerrar** de `05-plan-de-implementacion.md` respetando dependencias, empezando en **F0-01**. Crear rama/worktree aislada.
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
Estamos desarrollando el repositorio SebastianGonzalez2/finanzas-personales.
Abrí y revisá AGENTS.md y docs/planning/README.md, 05-plan-de-implementacion.md,
06-riesgos-y-pendientes.md y 07-handoff-codex.md. El documento de decisiones
v9.48 sigue siendo la fuente de verdad.

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
Leé AGENTS.md y docs/planning/README.md. Trabajá SOLO [F?-??] de
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

- Elegir un modelo avanzado disponible en Codex; los nombres exactos y disponibilidad cambian.
- High para F0 autenticación/seguridad, F1 motor contable y checkpoints, F2 cuotas y tarjetas, F3 fondos, migraciones y revisiones críticas.
- Medium para redacción de tests unitarios de bajo riesgo, edición de UI puntual, estilos, documentación o cambios pequeños.
- Intensidad máxima rara vez necesaria sin evaluación; el criterio de éxito son **tests y revisión del diff**, no solamente más razonamiento.

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
