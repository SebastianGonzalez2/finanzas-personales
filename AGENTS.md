# AGENTS.md — instrucciones del repositorio para agentes de programación

## Arranque mínimo y contexto por demanda

1. Antes de tocar archivos o datos, revisar `git status`, rama, remoto y diferencias frente a `origin/main`. Proteger cambios locales; nunca descartarlos ni sobrescribirlos.
2. Identificar el **ticket exacto** en `docs/planning/05-plan-de-implementacion.md`. Leer solo su sección, RF/CA/invariantes vinculados y la documentación relacionada con los archivos afectados. Buscar por ID/término antes de abrir documentos extensos.
3. Buscar **solo la fila del ticket y la leyenda OC/MIX/CX** en `docs/planning/10-modelos-por-ticket.md` (no cargar las 56 filas por defecto). Seleccionar el modelo manualmente entre los disponibles. En MIX, Codex continúa en **la misma rama y commits** de OpenCode, sin repetir trabajo válido.
4. Leer **por necesidad**, no de forma indiscriminada: `docs/product/decisiones-producto.md` (solo apartados aplicables; prevalece la decisión vigente v9.49 y posteriores), `docs/planning/03-criterios-de-aceptacion.md`, `06-riesgos-y-pendientes.md`, `07-handoff-codex.md`, `08-guia-operativa-codex.md`, `09-convenciones-git.md`, ADR y contratos específicos. `docs/planning/README.md` sirve de índice cuando no se encuentra una referencia.
5. **No** leer automáticamente todos los `docs/planning/0*.md`, el historial completo de decisiones, todos los ADR o toda la base de código. No volver a leer contenido sin cambios que ya esté disponible en el contexto. Si falta información esencial, buscarla y leerla; ahorrar contexto nunca justifica suponer requisitos.

## Arquitectura y decisiones vigentes

Next.js + TypeScript + Tailwind CSS + shadcn/ui; Vercel; Neon PostgreSQL; **Better Auth propio en Next.js con Google OAuth exclusivamente y allowlist privada**. Neon Auth administrado, su webhook, contraseñas, OTP e invitación grupal se descartaron por v9.49. Para cambios de autenticación, sesiones, roles, RLS, esquemas o acceso, consultar `docs/adr/0004-google-only-allowlist-auth.md` y las decisiones aplicables. No fusionar el código histórico del PR #12. F0 fue integrado; la validación HTTPS entre dispositivos con cuentas Google reales sigue siendo requisito antes de utilizar datos financieros reales.

## Reglas irrenunciables de seguridad y contabilidad

- Verificar **sesión y propietario en servidor** en lecturas, escrituras y relaciones; RLS por titular y pruebas A/B cuando corresponda. Nunca exponer datos de otros usuarios.
- Importes decimales exactos; transacciones atómicas, idempotencia, auditoría, versionado y pruebas de concurrencia según impacto. No inventar movimientos para cuadrar saldos ni reescribir checkpoints confirmados por correcciones históricas.
- Pagar una tarjeta reduce deuda y banco, **no duplica el gasto**. Los fondos virtuales no generan efectos bancarios. Capital de préstamo no equivale a ingreso/gasto ordinario.
- Reembolso acreditado en febrero por compra de enero: registrar **reembolso separado en febrero**; no reducir artificialmente compras ni presupuesto de febrero (v9.42).
- Fuera del alcance vigente: operaciones financieras offline, integración bancaria, OCR, voz, efectivo, inversiones o comprobantes, salvo modificación explícita y documentada del producto.
- No enviar secretos, `.env*`, credenciales, datos financieros reales, backups, cookies ni tokens a Git, logs, prompts de proveedores externos o herramientas gratuitas. Usar datos sintéticos.

## Git, permisos y migraciones

- Un ticket = un ID coherente en chat, rama `codex/<ID>-nombre`, commits `tipo(<ID>): acción` y PR `[<ID>] título`. Mantenimiento transversal: `OPS` o `PLAN`. Para detalles de convención, consultar `docs/planning/09-convenciones-git.md`.
- Rama/worktree aislado. Los commits, push, tests y PR rutinarios están permitidos cuando el entorno tenga autorización; **no hacer merge a main**, push forzado, borrado de trabajo ajeno ni deploy en producción sin autorización expresa.
- Neon **development**: se permite inspección de solo lectura y pruebas aisladas. Antes de aplicar SQL al esquema compartido, cumplir ADR 0004: presentar **SQL exacto, destino, impacto y SHA-256**, y obtener aprobación específica. No modificar Neon **production** ni ejecutar SQL destructivo sin autorización.
- No activar servicios pagos ni facturación, ni ampliar dependencias sin necesidad y revisión de compatibilidad/licencia.

## Implementación y entrega eficiente

Implementar únicamente el ticket y sus criterios; reutilizar patrones existentes. Ejecutar pruebas pertinentes y regresión por impacto, incluidas DB real desechable y navegador cuando aplique. No desactivar tests, no atribuir resultados no observados ni omitir revisión de permisos/efectos por ahorrar tokens. Corregir fallos del propio alcance; escalar bloqueos críticos.

Dejar commit y PR con la plantilla `.github/PULL_REQUEST_TEMPLATE.md`: RF/CA, pruebas realizadas, limitaciones, riesgos, migraciones, revisión visual y siguiente ticket. Resumir la entrega sin volver a enumerar documentación leída. **Prioridad: integridad y seguridad antes que rapidez o ahorro de cuota.**
