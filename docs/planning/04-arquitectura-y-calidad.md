# Arquitectura, seguridad, dependencias y calidad

**Naturaleza:** propuesta de arquitectura para implementar el stack confirmado en tanda 12. No hay infraestructura configurada ni aplicación ejecutada todavía.  
**Decisiones confirmadas:** Next.js, TypeScript, Tailwind CSS, shadcn/ui, Vercel, Neon PostgreSQL y **Better Auth autogestionado (solo Google + lista privada de autorizados)**. Ver [ADR 0004](../adr/0004-google-only-allowlist-auth.md). El resto de herramientas y patrones debe justificarse y verificarse en F0.

## 1. Arquitectura objetivo (monolito modular web)

```text
Navegador / PWA (móvil y escritorio)
  ├─ Next.js App Router: vistas, formularios, diseño responsive y gráficos
  ├─ Client components solo para interacción/visualización
  └─ acciones de usuario → servidor Next.js (Route Handlers / Server Actions)
       ├─ Better Auth propio: Google OAuth, allowlist, sesión y titular
       ├─ validación de entrada y permisos por objeto
       ├─ servicios de dominio: Bancos, Tarjetas, Deudas, Fondos, Recurrencias...
       ├─ transacciones atómicas con validación de invariantes
       └─ Neon PostgreSQL: datos, eventos, auditoría, cotizaciones
Fuentes externas: datosUruguay → Frankfurter (cotizaciones de referencia)
Complementos voluntarios: Web Push solamente para vencimiento de tarjetas
Hosting: Vercel (condicionado a términos/uso personal no comercial)
```

**No crear un backend Express independiente** (opción 4A, tanda 12) ni delegar lógica monetaria al navegador. Next.js ofrece handlers y componentes de servidor; las rutas mutadoras deben tener validación de negocio, identidad, permisos y transacción real.

## 2. Estructura de código sugerida

```text
/
├─ AGENTS.md                       # instrucciones y autoridad del repositorio
├─ docs/
│  ├─ fintrack-original.jpeg        # referencia original de UI
│  ├─ product/decisiones-producto.md
│  └─ planning/                    # este paquete
├─ src/
│  ├─ app/                         # routing, páginas, layouts, endpoints
│  ├─ components/ui/               # shadcn/ui y componentes compartidos
│  ├─ features/
│  │  ├─ bank-balances/
│  │  ├─ transactions/
│  │  ├─ cards/
│  │  ├─ loans/
│  │  ├─ savings/
│  │  ├─ budgets/
│  │  ├─ recurring/
│  │  ├─ notifications/
│  │  └─ analytics/
│  ├─ domain/                      # invariantes, cálculos puros, estados, decimal
│  ├─ server/                      # aplicación, validación y autorización
│  ├─ db/                          # esquema, acceso, migraciones, transacciones
│  └─ lib/                         # formateo, utilidades y tipos
├─ tests/
│  ├─ unit/
│  ├─ integration/
│  ├─ e2e/
│  └─ fixtures/
└─ .github/workflows/             # CI: lint/typecheck/tests/build
```

Estructura **propuesta, no obligatoria**; no crear carpetas vacías ni instalar bibliotecas que todavía no se utilizan. Evitar dependencias circulares: UI → aplicación → dominio → persistencia; el dominio no importa React ni APIs de Neon.

## 3. Decisiones técnicas por validar en F0

| ID | Punto | Criterio de elección |
|---|---|---|
| T-01 | Versión estable Next.js/Node/React | Revisar documentación oficial y compatibility matrix; fijar versiones y lockfile; sin `latest` flotante en CI. |
| T-02 | Better Auth propio y Google OAuth | Verificar versión compatible con Next.js/App Router, rutas OAuth y hooks de rechazo de alta, allowlist privada, sesión/revocación real, tablas propias y callback exacto; **sin Neon Auth administrado ni email/OTP**. |
| T-03 | Acceso a Neon PostgreSQL | Elegir driver oficial y gestor de migraciones/ORM según necesidad de transacciones, límites serverless, pooling y tests. |
| T-04 | Validación y decimales | Seleccionar esquema declarativo y biblioteca decimal mantenidas; comprobar parseo estricto, precisión y serialización. |
| T-05 | Testing | Unitario (p. ej. Vitest), integración con DB real de prueba y E2E (p. ej. Playwright); seleccionar y fijar versiones. |
| T-06 | Gráficos | Elegir biblioteca React mantenida, accesible, con drilldown, exportación y rendimiento, sin exponer datos personales a servicios externos. |
| T-07 | UI y diseño | Verificar si existe local `docs/design/fintrack-visual-spec.md`; remoto no verificado. Reconstruir guía visual desde `docs/fintrack-original.jpeg` si falta, sin inventar funcionalidades de la imagen. |
| T-08 | PWA | Manifest, iconos, instalación y caché de assets; **no** escritura offline ni respuestas financieras privadas persistentes como actuales. |
| T-09 | Automatismos de calendario | Mecanismo idempotente compatible con límites gratuitos; no programar tareas antes de demostrar que no generan gastos o ingresos ficticios. |
| T-10 | Notificaciones y OAuth | **No** se necesita SMTP/OTP/recuperación de contraseña para login Google-only. Verificar Google OAuth propio, Vercel Hobby y push opcional para tarjetas; cualquier otro correo futuro requerirá justificación separada. |
| T-11 | Costo y licencia | Confirmar que despliegue y uso previsto entran en planes gratis **sin activar facturación**. |
| T-12 | Backups cifrados | Cifrado estándar autenticado + KDF robusta y revisión; protección contra zip bombs, payloads excesivos, importación maliciosa. |

**Fuentes oficiales a revisar al implementar (consultadas en fase de planificación, noviembre de 2026):**
- Next.js App Router e instalación: https://nextjs.org/docs/app/getting-started/installation
- Vercel Hobby y condiciones no comerciales: https://vercel.com/docs/plans/hobby
- Neon actual (Backend/Managed Better Auth): https://neon.com/blog/neon-backend-is-ga
- Skill oficial de Neon para agentes: https://neon.com/docs/ai/ai-rules-neon-auth
- Neon Auth e interoperabilidad Better Auth: https://neon.com/blog/neon-auth-branchable-identity-in-your-database

**Cambio arquitectónico aprobado v9.49:** Google-only + allowlist; el análisis de Neon Managed Auth/webhook que figura debajo es **histórico**, no implementar ese flujo. El PR #12 no se fusiona como está; migrar o reemplazar el código de Auth en un incremento revisado. El esquema `finance` de F0-05 y los controles RLS se conservan. **Better Auth propio necesita migraciones separadas autorizadas**, no escritura sobre `neon_auth`.

**Importante:** fuentes y precios cambian. Las guías oficiales de Neon indican que **Managed Better Auth no equivale a un despliegue autogestionado de Better Auth con plugins de servidor arbitrarios**. Probar el mecanismo de invitación **antes** de asumir que bastará un hook de un plugin de Better Auth. No inferir automáticamente nombres de funciones SDK ni credenciales.

## 4. Autorización y privacidad

1. El servidor comprueba sesión con SDK oficial **en cada operación financiera**, exportación, filtro, copia o restauración. No confiar en `owner_id` enviado por cliente, ni en etiquetas de ruta o UI.
2. Usuario autenticado se obtiene en servidor; todo `SELECT/UPDATE/DELETE/INSERT` financiero usa ámbito de titular y comprobaciones de propiedad de recursos vinculados. Usar RLS en PostgreSQL si la integración oficial, claves y claims se validan correctamente; **RLS nunca sustituye los tests de acceso cruzado**.
3. Validar relaciones cruzadas: una categoría, tarjeta, fondo, comercio, contacto, deuda y etiqueta referenciados **deben pertenecer al mismo titular** que el evento.
4. Gestión de sesiones/cookies: usar cookies `HttpOnly`, `Secure` en producción, política SameSite adecuada y protección CSRF según mecanismo oficial elegido; no almacenar tokens de sesión en localStorage de forma improvisada.
5. No exponer claves de Neon ni secrets como `NEXT_PUBLIC_*`; usar variables de entorno del servidor y archivos `.env.example` **sin valores reales**. `.env*` privados fuera de Git.
6. Restaurar backups y borrar cuenta son operaciones de alto riesgo: confirmación explícita, reautenticación si el flujo oficial la admite, validación de alcance e integridad, operaciones atómicas.
7. Comprobar **allowlist de Google en servidor antes de crear la cuenta**, verificar identidad Google estable y correo verificado; probar rechazo de no autorizados y revocación efectiva de sesiones. Sin código grupal ni correo/contraseña (v9.49).
8. Limitar el tratamiento de datos personales: nombre de comercio/persona solamente ingresado por usuario, sin contactar terceros automáticamente. No almacenar contraseñas de la app, contraseñas de backup, PIN bancarios ni números completos de tarjetas innecesarios.
9. Registro de errores: no enviar importes, saldos, conceptos, tokens, identificadores de contactos ni copias de seguridad a logs de terceros salvo análisis explícito y consentido. No registrar contenido sensible completo en errores/analytics.
10. Evitar cachear respuestas financieras de usuario en rutas estáticas o CDN compartido; aplicar control de caché privado/no-store cuando corresponda. Testear cierre de sesión y cambio de cuenta en mismo navegador.

## 5. Integridad de datos y concurrencia

- Usar `NUMERIC` y biblioteca decimal exacta; no calcular saldos finales con coma flotante JS. Una compra multi-medio afecta cada efecto una sola vez.
- Operaciones complejas en **transacción PostgreSQL**: compra, crédito, cuotas, reservas, préstamos, aportes, cobros, edición masiva, restauración.
- Elegir estrategia de locks/optimistic concurrency por `version`; probar **dos pestañas y dos dispositivos** modificando mismo fondo/saldo/deuda.
- Idempotencia ante reintentos de servidor/client con clave única por operación lógica y cuenta; manejar respuesta de operación ya registrada mostrando resultado anterior sin repetir débito.
- Estados de pago parciales no permiten saldo negativo de deuda, reservas no disponibles o asignaciones que superan el valor real, salvo los casos explícitos de saldo a favor de tarjeta modelado **separadamente**.
- No editar en silencio un checkpoint bancario de fecha pasada; conservar diferencia auditable y actualizar proyecciones bajo sus anclas confirmadas.
- Fechas y zonas: guardar instante real en UTC cuando importe; para fechas de vencimiento, día de calendario y período de referencia usar representación de fecha local **sin desplazar mes accidentalmente por UTC**. La PWA debe funcionar también si el titular viaja de huso horario.

## 6. PWA y experiencia visual

- UI en español, móvil primero, referencia visual oscura `docs/fintrack-original.jpeg`, con claridad tipográfica y jerarquía de información; componente accesible y profesional.
- Dashboard **fijo** (tanda 8, 5B); no controles de orden arbitrario ni botón de ocultar importes (tanda 10, 4B).
- Acciones principales visibles: registrar movimiento, actualizar saldo real, tarjetas, deudas, fondos y estadísticas.
- Los formularios normales son simples. Funciones complejas (cuotas, repartos, varios métodos, cotizaciones) se revelan solo cuando el usuario las activa.
- Estados de carga, error, vacío, pendiente, estimado, confirmado, conciliación y operación anulada claramente distinguibles. No confirmar «Guardado» por una solicitud sin respuesta persistida.
- PWA instalable sin tienda, funcional online, **sin escritura offline**. Si falla conexión, ofrecer reintento seguro con la misma clave de idempotencia, no guardar cola local financiera por detrás.
- Gráficos intuitivos con alternativas textuales/tabulares; no depender solo de colores para representar aumento o deuda.
- Mensajes de privacidad: una copia de seguridad no se almacena automáticamente en la nube de un tercero solo por descargarse.

## 7. CI/CD, ramas y ambientes

- Rama principal protegida por revisión si las capacidades del repositorio lo permiten; crear **rama de trabajo por fase o feature y PR**; **no realizar cambios masivos en `main` desde Codex sin revisión**.
- CI mínima: instalación reproducible desde lockfile, análisis estático, TypeScript strict, lint, unitarios, integración con DB de prueba aislada, E2E críticos cuando haya UI, build; nunca imprimir secretos en CI.
- Migraciones versionadas con estrategia forward/rollback o plan de recuperación, aplicada primero a DB de pruebas; prohibido editar manualmente Neon Auth interno sin respaldo/guía del proveedor.
- Ambientes: local (credenciales dummy o test), preview no conectado a datos personales de producción y producción. No copiar datos reales de titulares a entornos preview por defecto.
- Deploy a Vercel solo tras validar sus límites/términos actuales para el uso previsto. **Hobby tiene restricciones de uso personal no comercial**; si el uso real excede condiciones gratuitas, no activar pago ni desplegar contraviniendo términos.
- Monitorizar límites/errores de proveedores mediante sus vistas gratuitas; estimar tamaño y consultas, nunca prometer coste cero ilimitado.

## 8. Política de dependencias y skills

La única biblioteca UI expresamente aprobada es shadcn/ui/Tailwind en el stack elegido; las demás se eligen en fase F0 con razones. Preferir bibliotecas mantenidas, con licencia permisiva, compatibles con Next.js y con apoyo de pruebas. No crear un mosaico de plugins para reemplazar dominio contable determinista.

**Skill sugerido para Codex:** skill oficial **Neon Postgres** (consultar https://neon.com/docs/ai/ai-rules-neon-auth). Instalar **en el entorno del proyecto cuando Codex tenga acceso local y usuario/administrador autorice la conexión**; instalación típica que documenta Neon: `npx skills add neondatabase/agent-skills -s neon-postgres` o la inicialización oficial de Neon. Verificar que la fuente sea la oficial, revisar archivos instalados y **no introducir credenciales reales en Git**. Este documento no pretende haber instalado ni conectado un skill/Neon.

No hace falta obligatoriamente Figma, una suite paga de documentación, una plataforma de QA externa ni nuevas cuentas para escribir criterios de aceptación o desarrollar MVP. GitHub + archivos Markdown + pruebas en código bastan; herramientas adicionales, solo si aportan valor verificable.

## 9. Definition of Done técnico

- [ ] Función respeta RF/CA y referencias de producto.
- [ ] Permisos y tenant ownership probados, incluso con IDs de otros usuarios.
- [ ] Operación monetaria atómica, idempotente y con auditoría.
- [ ] Tests unitarios/integración/E2E pertinentes, comandos reproducibles en PR.
- [ ] Mensajes de validación, errores, estados vacíos y accesibilidad.
- [ ] No se modificaron checkpoints históricos confirmados silenciosamente.
- [ ] No hay secretos, datos privados ni servicios pagos en commit.
- [ ] Se revisaron cambios en ingresos/gastos de compra/refund/período; casos CA-028 y CA-015 pasan cuando corresponda.
- [ ] Migración y compatibilidad de DB documentadas.
- [ ] Capturas de pantalla/comparación visual para cambios de UI críticos y revisión manual.
- [ ] Una breve nota de implementación, pruebas ejecutadas, limitaciones honestas y siguientes dependencias.

**Los checks anteriores son objetivos de ejecución; al redactar este documento NO se han realizado ni marcado como completos.**
