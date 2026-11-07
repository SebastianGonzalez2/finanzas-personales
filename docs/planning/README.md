# Plan maestro de implementación — Finanzas personales

**Estado:** planificación funcional cerrada (decisiones del producto v9.48); documentación de ingeniería preparatoria, **no código implementado**.  
**Fecha:** 2026-11-07.  
**Repositorio:** `SebastianGonzalez2/finanzas-personales`, rama `main`.  
**Fuente del producto:** [registro histórico completo](../product/decisiones-producto.md).  
**Referencia visual:** [Fintrack original](../fintrack-original.jpeg).

## Objetivo

Construir una aplicación personal de finanzas en **español**, responsive y PWA, fácil de usar en móvil y escritorio, con cuentas aisladas, movimientos manuales, saldos bancarios agregados por moneda y seguimiento financiero avanzado **sin integraciones bancarias ni cargos obligatorios**. El proyecto conserva los flujos aprobados en doce tandas de decisiones y su historial previo.

## Documentos para Codex

| Orden | Archivo | Para qué sirve |
| --- | --- | --- |
| 0 | [Decisiones del producto](../product/decisiones-producto.md) | Decisiones reales del usuario, excepciones y trazabilidad; v9.48. |
| 1 | [Alcance y requisitos](01-alcance-y-requisitos.md) | IDs funcionales/no funcionales, prioridades y exclusiones. |
| 2 | [Modelo de datos y reglas](02-modelo-de-dominio-y-datos.md) | Entidades propuestas, reglas contables, invariantes, transacciones y estados. |
| 3 | [Criterios de aceptación](03-criterios-de-aceptacion.md) | Escenarios verificables por módulo y controles de no regresión. |
| 4 | [Arquitectura, seguridad y calidad](04-arquitectura-y-calidad.md) | Stack acordado, estructura propuesta, permisos, pruebas y despliegue. |
| 5 | [Plan de implementación](05-plan-de-implementacion.md) | Fases, épicas, dependencias y Definition of Done. |
| 6 | [Riesgos y verificaciones](06-riesgos-y-pendientes.md) | Puntos técnicos que requieren prueba; sin nuevas rondas funcionales. |
| 7 | [Handoff para Codex](07-handoff-codex.md) | Instrucciones listas para entregar a Codex y primer incremento de trabajo. |

**Instrucciones persistentes para agentes:** [`/AGENTS.md`](../../AGENTS.md).

## Autoridad y resolución de conflictos

1. Mandan las **decisiones explícitamente confirmadas**, dando prioridad a la **versión más reciente** cuando una regla posterior rectifica otra anterior. Ejemplo crítico: reembolso de compra de enero recibido en febrero **NO modifica** las compras ni el presupuesto de Ropa de febrero (v9.42, §9.6.1).
2. Este paquete transforma decisiones en **criterios implementables**, pero sus diagramas, nombres de tablas, orden de tareas y opciones de bibliotecas son **propuestas de ingeniería**, no nuevas funciones aprobadas.
3. Si un documento de esta carpeta contradice una decisión del usuario en el historial, **detener la interpretación, abrir un registro de discrepancia y corregir el documento**; no elegir silenciosamente.
4. Las «tareas abiertas» históricas de §12 del registro contienen algunas notas ya superadas por decisiones posteriores. **No usarlas como único backlog**; consultar la regla actual y `06-riesgos-y-pendientes.md`.
5. No modificar el alcance ni añadir automatizaciones/servicios pagos sin aprobación. Ante lagunas técnicas, optar por un flujo explícito, no destructivo, auditable y probado, o marcar el caso como no soportado hasta implementar el tratamiento correcto.

## Fases y límite de versiones

- **F0 — Basamento:** documentación, stack, autenticación de prueba, CI, seguridad, esquema/migraciones y tests.
- **F1 — Núcleo:** cuentas, bancos por moneda, ingresos/gastos, transferencias, conciliación manual e historial.
- **F2 — Tarjetas y deudas:** débito, crédito, cierre/cuotas/pagos, préstamos y derechos de cobro.
- **F3 — Ahorro y presupuestos:** fondos virtuales, reservas, reglas de aportes y límites por categoría.
- **F4 — Recurrencias y casos compartidos:** ingresos/gastos periódicos, pagos parciales, reparto, recordatorios.
- **F5 — Analítica y utilidades:** estadísticas profundas, conversiones históricas, etiquetas, comercios, exportaciones, respaldo.
- **F6 — Integración y preparación del lanzamiento:** PWA, pruebas completas, accesibilidad, seguridad, coste, UX final y manual de operación.

**Todas las funciones aprobadas permanecen en el alcance global**; el orden permite probar prototipos internos que **no** constituyen una versión final completa. La primera liberación de uso real no se declara lista solo por terminar F1.

## Reglas innegociables

- Un gasto bancario real afecta el banco **una vez**; pagar una deuda de tarjeta no vuelve a contar la compra como gasto.
- Mover dinero entre fondos virtuales no cambia el dinero bancario ni genera gasto.
- Recuperar capital prestado no es ingreso ordinario; dar o recibir capital prestado no es gasto/ingreso de consumo.
- Cada movimiento mantiene importe/moneda originales. Tipos de cambio de consulta **no** son conversiones bancarias ejecutadas.
- Un reembolso de compra anterior se acredita al dinero real **en la fecha de recepción**, figura por separado y **no reduce el total de compras ni el consumo de presupuesto de otro mes**.
- No escribir transacciones offline, no conectarse a bancos, no importar extractos ni automatizar compras o pagos desde un calendario.
- Garantizar separación por usuario **del lado del servidor**; ocultar un elemento en UI no constituye protección.
- Cero cargos obligatorios y sin activar facturación por cuenta propia; validar planes y términos vigentes en F0.

## Estado de disposición

**Funcional:** cerrado para preparar implementación. **Técnico:** se puede comenzar **F0**, con validación de Neon Auth/SMTP, Google OAuth, plan Vercel, reconciliación y reproducción visual como controles previos a usar datos reales. El repositorio remoto, al crear esta documentación, contenía `docs/` y **no** un código de aplicación comprobado. No representar estas tareas como ejecutadas.

**Entrega de cada fase:** documentación de decisiones técnicas + migraciones aplicables + pruebas automatizadas + tests manuales reproducibles + demostración navegable + revisión de seguridad/costes + actualización de trazabilidad. Se avanza por evidencias, no por una estimación cronológica.
