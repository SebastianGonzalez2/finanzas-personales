# Instrucciones del repositorio para Codex y agentes de programación

## Inicio obligatorio

Antes de modificar código o datos:

1. Comprobar `git status`, rama, remoto y diferencias local/`origin/main`; **nunca eliminar trabajo local**.
2. Leer `docs/planning/README.md`, `docs/planning/07-handoff-codex.md` y los demás `docs/planning/0*.md`.
3. Consultar `docs/product/decisiones-producto.md` (decisión más reciente **v9.49**; v9.48 se conserva como historia) para reglas confirmadas y precedencia histórica; decisiones posteriores prevalecen sobre anteriores.
4. Referenciar RF, CA, fase/ticket e invariantes al hacer un cambio; **no afirmar implementación que no existe**.

## Arquitectura confirmada

Next.js + TypeScript + Tailwind CSS + shadcn/ui, Vercel, Neon PostgreSQL y **Better Auth autogestionado en Next.js con Google OAuth exclusivamente**. Acceso limitado a una **lista privada de cuentas Google autorizadas**; **Neon Auth administrado, webhook e invitación grupal quedan descartados** por la decisión v9.49. ADR obligatorio: `docs/adr/0004-google-only-allowlist-auth.md`. Construcción incremental y probada. Comenzar **F0**, no implementar toda la aplicación en una sola PR. Bibliotecas y ORM adicionales requieren justificación técnica y validación de compatibilidad/licencia; preferir fuentes oficiales. No activar facturación ni instalar servicios pagos sin consentimiento.

**Prioridad vigente F0-04:** refactorizar autenticación Google-only y comprobar la lista de autorizados antes de crear usuarios o habilitar sesiones; probar revocación, sesiones reales y separación entre titulares. **No fusionar PR #12 tal como está** (código histórico del webhook Neon). No reactivar altas de Neon Managed Auth. F0 sigue abierta. Las referencias a contraseña, OTP, SMTP de acceso, código grupal o Neon Auth en documentación anterior son históricas y se consideran sustituidas por ADR 0004, no obligaciones del producto.

## Seguridad e integridad financiera

- Verificar sesión y propietario en **servidor** para cada lectura/escritura y relación; no exponer datos de otros usuarios.
- Importes exactos (no float binario JS final), transacciones atómicas, idempotencia, auditoría, estados explícitos y pruebas de regresión.
- **Nunca inventar movimientos bancarios ni gastos** para compensar diferencias de saldo. Las anclas confirmadas manualmente no se reescriben por corregir eventos anteriores.
- Pagar tarjeta reduce banco y deuda pero **no duplica gasto**; ahorro virtual no sale del banco; capital de préstamo no es ingreso/gasto ordinario.
- Refund de compra de enero acreditado en febrero: reembolso separado en febrero, **no** reduce compras de febrero ni presupuesto del mes; regla v9.42.
- Sin operaciones financieras offline ni integración bancaria, OCR, IA por voz, efectivo, inversiones o archivos de comprobantes.
- No poner tokens, contraseñas, claves API, backups reales ni datos personales financieros en Git o logs.

## Nombre de conversaciones de Codex: obligatorio por ticket

Para cada nuevo chat/hilo de Codex, **el título debe empezar por el ID canónico del ticket** y una descripción corta: `[F0-01] Revisión inicial`, `[F0-03] Configurar Next.js`, `[F1-03] Registrar movimientos`. Usar **exactamente** el mismo ID que la rama, los commits y la PR. **Primera línea del primer mensaje**: `[F0-01] Revisión inicial`; después poner el objetivo y criterios. Si el título autogenerado omite el ID, **renombrarlo con la función de la aplicación, si existe**, o manualmente; en CLI puede emplearse `/rename`. **Las instrucciones de repositorio no garantizan poder cambiar automáticamente el título de la UI**, por lo que verificar que aparezca correctamente. Para continuar el mismo ticket, mantener el chat; cambiar de ticket implica abrir otro chat. Ver `docs/planning/09-convenciones-git.md`.

## Convención obligatoria de Git y trazabilidad

Seguir `docs/planning/09-convenciones-git.md` para **todos los tickets nuevos**:
- Rama: `codex/F0-01-revision-inicial` (o mismo ID y descripción de ticket).
- Mensajes de commit: `docs(F0-01): documentar estado inicial`, `feat(F1-03): registrar ingresos y gastos`; **tipo(ID): acción concreta**, y caso excepcional `docs(OPS): ...` para proceso general.
- Título de Pull Request: `[F0-01] Revisión inicial del repositorio`.
- Descripción: completar `.github/PULL_REQUEST_TEMPLATE.md` con objetivo, alcance, **RF/CA**, pruebas realmente ejecutadas, riesgos, revisión manual y siguiente ticket.
- Identificador **idéntico** en rama/commits/PR; nunca confundir crear una rama con completar una tarea. No reescribir commits históricos por esta convención.
- No hacer merge ni desplegar automáticamente sin aprobación humana o consentimiento explícito para esa acción.

## Entregables por PR

Cambios de alcance pequeño, ramas por ticket, tests ejecutados con resultados, revisión de permisos, migraciones, UX móvil/escritorio y nota de límites. No marcar un riesgo «resuelto» por suposición. Si existe un bloqueo real de auth/SMTP/costo/conciliación, registrarlo y elevarlo antes de desplegar. Ver `docs/planning/05-plan-de-implementacion.md` y `06-riesgos-y-pendientes.md`.

**Prioridad:** precisión, seguridad y simplicidad frente a velocidad aparente.
