# Instrucciones del repositorio para Codex y agentes de programación

## Inicio obligatorio

Antes de modificar código o datos:

1. Comprobar `git status`, rama, remoto y diferencias local/`origin/main`; **nunca eliminar trabajo local**.
2. Leer `docs/planning/README.md`, `docs/planning/07-handoff-codex.md` y los demás `docs/planning/0*.md`.
3. Consultar `docs/product/decisiones-producto.md` (versión funcional cerrada **v9.48**) para reglas confirmadas y precedencia histórica; decisiones posteriores prevalecen sobre anteriores.
4. Referenciar RF, CA, fase/ticket e invariantes al hacer un cambio; **no afirmar implementación que no existe**.

## Arquitectura confirmada

Next.js + TypeScript + Tailwind CSS + shadcn/ui, Vercel, Neon PostgreSQL y Neon Auth. Construcción incremental y probada. Comenzar **F0**, no implementar toda la aplicación en una sola PR. Bibliotecas y ORM adicionales requieren justificación técnica y validación de compatibilidad/licencia; preferir fuentes oficiales. No activar facturación ni instalar servicios pagos sin consentimiento.

## Seguridad e integridad financiera

- Verificar sesión y propietario en **servidor** para cada lectura/escritura y relación; no exponer datos de otros usuarios.
- Importes exactos (no float binario JS final), transacciones atómicas, idempotencia, auditoría, estados explícitos y pruebas de regresión.
- **Nunca inventar movimientos bancarios ni gastos** para compensar diferencias de saldo. Las anclas confirmadas manualmente no se reescriben por corregir eventos anteriores.
- Pagar tarjeta reduce banco y deuda pero **no duplica gasto**; ahorro virtual no sale del banco; capital de préstamo no es ingreso/gasto ordinario.
- Refund de compra de enero acreditado en febrero: reembolso separado en febrero, **no** reduce compras de febrero ni presupuesto del mes; regla v9.42.
- Sin operaciones financieras offline ni integración bancaria, OCR, IA por voz, efectivo, inversiones o archivos de comprobantes.
- No poner tokens, contraseñas, claves API, backups reales ni datos personales financieros en Git o logs.

## Entregables por PR

Cambios de alcance pequeño, ramas por ticket, tests ejecutados con resultados, revisión de permisos, migraciones, UX móvil/escritorio y nota de límites. No marcar un riesgo «resuelto» por suposición. Si existe un bloqueo real de auth/SMTP/costo/conciliación, registrarlo y elevarlo antes de desplegar. Ver `docs/planning/05-plan-de-implementacion.md` y `06-riesgos-y-pendientes.md`.

**Prioridad:** precisión, seguridad y simplicidad frente a velocidad aparente.
