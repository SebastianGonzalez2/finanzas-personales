# Handoff operativo a Codex

> **Decisión vigente v9.49 (2026-11-08):** la autenticación es **Better Auth autogestionado + Google OAuth exclusivo + lista privada de usuarios autorizados**. No implementar Neon Auth administrado, webhook, contraseña/OTP, SMTP de acceso ni código compartido de invitación. Referencia obligatoria: [ADR 0004](../adr/0004-google-only-allowlist-auth.md). Los pasos históricos de autenticación que figuran abajo quedan sustituidos; F0-04 sigue abierto.


**Estado:** instrucción preparada para iniciar **F0**, no orden de construir toda la app en un único cambio.  
**Fuente de autoridad:** `AGENTS.md` en raíz, `docs/planning/README.md`, `docs/product/decisiones-producto.md` **v9.48**, otros documentos de `docs/planning/`.

## Lo que deberá encontrar Codex

- Repositorio: `SebastianGonzalez2/finanzas-personales`.
- Rama remota de referencia: `main`.
- Al cerrar la planificación el remoto tenía `docs/fintrack-original.jpeg` y documentación del producto, **sin código de aplicación verificado**.
- Esta carpeta contiene decisiones, especificación de requisitos, modelo conceptual, criterios de aceptación y fases.
- La antigua guía visual local `docs/design/fintrack-visual-spec.md` **no estaba verificada en GitHub remoto**; Codex debe inspeccionar su workspace, no suponer que existe.
- No hay pruebas, servicio Neon ni aplicación desplegada verificados en esta documentación.

## Prompt de arranque listo para copiar en Codex

> Actuá como ingeniero principal responsable de implementar de forma incremental, segura y testeada una aplicación de finanzas personales en español. Repositorio GitHub: `SebastianGonzalez2/finanzas-personales`.
>
> **PRIMER PASO OBLIGATORIO:** antes de tocar código, ejecutar `git status`, comprobar rama/remoto y sincronizar cuidadosamente con `origin/main` **sin descartar modificaciones locales**. Revisar todos estos archivos por orden:
>
> 1. `AGENTS.md`;
> 2. `docs/planning/README.md`;
> 3. `docs/planning/01-alcance-y-requisitos.md`;
> 4. `docs/planning/02-modelo-de-dominio-y-datos.md`;
> 5. `docs/planning/03-criterios-de-aceptacion.md`;
> 6. `docs/planning/04-arquitectura-y-calidad.md`;
> 7. `docs/planning/05-plan-de-implementacion.md`;
> 8. `docs/planning/06-riesgos-y-pendientes.md`;
> 9. `docs/product/decisiones-producto.md` (historial de decisiones, versión 9.48).
>
> **DECISIONES FUNCIONALES CERRADAS:** No reformular producto ni agregar funciones por tu cuenta. Las decisiones más nuevas reemplazan anteriores, especialmente devolución de enero acreditada en febrero (v9.42): aparece como devolución en febrero separada, **NO** reduce compras ni presupuesto de febrero. Los saldos bancarios confirmados manualmente son checkpoints que **no se reescriben** por corregir gastos anteriores. Los gastos de tarjeta no se cuentan de nuevo al pagar resumen. Los fondos son reservas virtuales. Capital prestado/cobrado no equivale a ingreso o gasto.
>
> **STACK CONFIRMADO:** Next.js (App Router) + TypeScript + Tailwind CSS + shadcn/ui; Vercel + Neon PostgreSQL + Neon Auth. No asumas versiones o SDKs obsoletos; consulta documentación oficial actual y fija dependencias con lockfile. Neon Auth es Managed Better Auth, no asumir instalación de plugins custom de Better Auth autogestionado sin soporte verificado. Verifica Vercel Hobby y Neon Free, sin activar pago. El usuario autorizó incorporar herramientas/skills gratuitos útiles; el skill oficial de Neon Postgres se puede evaluar/instalar desde fuente oficial cuando tengas acceso local, pero no conviertas su instalación en una razón para modificar alcance o guardar credenciales en Git.
>
> **TU TRABAJO AHORA ES SOLO F0**: (a) inventariar repositorio, (b) verificar la especificación visual local o documentarla desde `docs/fintrack-original.jpeg`, (c) evaluar SDK/auth/OTP/Google/código de invitación, costos y límites, (d) elegir y justificar ORM/decimal/tests según necesidades reales, (e) proponer/crear scaffold reproducible con Next.js/Tailwind/shadcn, CI básico, esquema DB de prueba y pruebas básicas si la verificación técnica lo permite, (f) documentar riesgos/ADR y abrir un PR pequeño. F0 es preparación, **no** autorización para desarrollar de golpe todos los módulos o desplegar en producción.
>
> **CALIDAD EXIGIDA:** separar servidor/dominio/UI, validar permisos del dueño en servidor para toda operación, auditoría y decimal exacto, transacciones atómicas e idempotencia. No usar datos bancarios reales como fixtures. Las decisiones técnicas no confirmadas se documentan como propuestas y no se atribuyen al usuario. Muestra qué tests corriste y sus resultados. Si no tenés credenciales de proveedores, **no las inventes**: usa mocks/DB de prueba donde sea seguro, documenta exactamente qué conexión o acción explícita necesita el dueño.
>
> **ENTREGABLE DE ESTA PRIMERA INTERACCIÓN:** informe breve de estado del repo, diferencias local-remoto, decisiones técnicas propuestas, riesgos efectivos, comandos de verificación y un plan de PRs para F0. Si el repo está listo y existe entorno, implementa en una rama **solo el primer PR pequeño** con scaffold y tests; no modifiques `main` directamente. No afirmes que algo está probado/desplegado si no lo comprobaste.
>
> **AL FINAL:** lista archivos cambiados, comandos/tests ejecutados, fallas conocidas, verificaciones pendientes, requisitos RF/CA cubiertos y siguiente ticket recomendado. No iniciar F1 hasta que F0 pase los controles de seguridad/costo/compatibilidad que correspondan.

## Cómo usar este handoff

1. Abrir Codex sobre el repositorio local.
2. Actualizar/reconciliar cuidadosamente `origin/main`, porque el historial de decisiones creció y la carpeta `docs/planning/` se creó desde GitHub.
3. Copiar el prompt anterior o pedir: «Leé `AGENTS.md` y `docs/planning/07-handoff-codex.md`, ejecutá F0-01…F0-09 de forma incremental, sin tocar `main` y sin activar proveedores pagos».
4. Revisar la propuesta del primer PR, especialmente las dependencias y la integración de Neon Auth.
5. Conectar/autorizar Neon, Google OAuth, SMTP o Vercel **solo** cuando Codex indique el mecanismo real que necesita y el usuario pueda verificar límites y permisos.
6. Una vez cubierto F0, continuar con F1 y sus CA. Cada fase tiene una demostración y condición de cierre en `05-plan-de-implementacion.md`.

## Lo que Codex NO debe hacer

- Crear un backend Express paralelo porque le resulte más familiar; el stack elegido es Next.js integrado.
- Crear un gasto o ingreso para que cuadren bancos sin conocer el hecho real.
- Tratar el saldo bancario total como dinero libre cuando existan reservas.
- Usar UI clonada de una captura para añadir funciones descartadas (cash, inversiones, widgets, importación bancaria).
- Instalar paquetes al azar, depender de servicios pagos o exponer datos a IA/SaaS de terceros.
- Asumir que instalación de plugin/skill equivale a autenticación o migración realizada.
- Borrar trabajo local, sobrescribir documentos nuevos o forzar pushes.
- Hacer un único commit gigante con toda la app; evitar la falta de tests.
- Reabrir consultas funcionales hipotéticas ya cerradas en v9.48.
- Marcar F0/CA como «completado» sin pruebas y evidencia.

## Checklist del primer PR

- [ ] Inventario completo del repositorio/branch (se conoce qué existe).
- [ ] Guía visual original revisada y material local conciliado.
- [ ] Stack real instalado y lockfile reproducible, Node compatible documentado.
- [ ] `dev`, `lint`, `typecheck`, `test`, `build` funcionan o documentan faltantes reales.
- [ ] Variables de entorno de ejemplo sin secrets; `.env` ignorado.
- [ ] SDK Neon Auth verificado o «bloqueado por conexión» explícitamente explicado.
- [ ] Prueba de aislamiento por usuario al introducir DB/auth o plan detallado si aún no se pudo conectar.
- [ ] Se elige estrategia decimal, transacción e idempotencia con breve justificación.
- [ ] No hay gastos reales, datos privados ni pago habilitado.
- [ ] PR acotado, referenciando F0 y RF/CA previstos, con resultados de tests honestos.

## Qué sigue después de F0

El siguiente paquete de tickets es **F1-01…F1-08** en el [plan](05-plan-de-implementacion.md). Allí empieza a aparecer funcionalidad bancaria real. Antes de cada incremento, respetar criterios de aceptación CA y comprobar si toca un caso financiero cruzado (crédito, compartidos, reservas y devolución). Al acabar las fases, revisar que **todas** las funciones confirmadas estén incluidas, no solo las más sencillas.

**Este documento es de planificación. No se ha ejecutado Codex, no se han instalado dependencias y no se ha desplegado aplicación al crearlo.**
