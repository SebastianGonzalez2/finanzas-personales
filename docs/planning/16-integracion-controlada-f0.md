# F0-INTEGRATE — Integración controlada y estado vigente

**Corte:** 2026-11-07, America/Montevideo. Sustituye el estado operativo de los informes históricos 14 y 15; conserva sus hallazgos y límites. Integración expresamente autorizada por el titular, con revisión del diff, dependencias y checks de cada head. No declara completa F0.

## Fusiones comprobadas antes de entregar PR #8

| Orden | PR / ticket | Commit de merge en main | Resultado y evidencia |
| --- | --- | --- | --- |
| 1 | [#1 / F0-02](https://github.com/SebastianGonzalez2/finanzas-personales/pull/1) | `93ede16b55bbeccade9fb1b90d6adedf8e7c1b03` | Especificación visual; comprobación de enlaces y contraste. No UI funcional. |
| 2 | [#2 / F0-03](https://github.com/SebastianGonzalez2/finanzas-personales/pull/2) | `6c3ea0ffd4b6e7cd84d833eccf21dcbfb32c59f8` | Scaffold; merge commit con dos padres comprobados. Check/build y E2E revalidados con F0-06. |
| 3 | [#4 / F0-06](https://github.com/SebastianGonzalez2/finanzas-personales/pull/4) | `3e24d830db1d02d9b447096c8a002271fb8d0122` | Base cambiada a main tras #2 y main incorporado sin fuerza. Mismos 13 archivos del alcance auditado. Check, 3 unidades, 2 E2E y CI PostgreSQL pasan. [CI](https://github.com/SebastianGonzalez2/finanzas-personales/actions/runs/42434500100). |
| 4 | [#6 / F0-09](https://github.com/SebastianGonzalez2/finanzas-personales/pull/6) | `1bb536a848d394a071905f532dc8f4865778010b` | Merge commit con dos padres; contratos/tipos y 9 casos, 27 ejecuciones en tres husos. [CI contratos](https://github.com/SebastianGonzalez2/finanzas-personales/actions/runs/42434733201). |
| 5 | [#7 / F0-08](https://github.com/SebastianGonzalez2/finanzas-personales/pull/7) | `74b744d1026a4c5ce035ad54f219369e11c4dca1` | Base cambiada a main tras #6; cinco archivos del alcance auditado. Tipos, 16 casos/48 ejecuciones pasan. [CI contratos](https://github.com/SebastianGonzalez2/finanzas-personales/actions/runs/42434936234). |
| 6 | [#3 / F0-04 parcial](https://github.com/SebastianGonzalez2/finanzas-personales/pull/3) | `62014c83c577753cac4ca310a5663f63e7db8a72` | Investigación/spike; 27 pruebas sintéticas y tipos pasan. Sin sonda Neon ni credenciales. [CI Auth](https://github.com/SebastianGonzalez2/finanzas-personales/actions/runs/42435098031). F0-04 sigue abierto. |
| 7 | [#5 / F0-07 parcial](https://github.com/SebastianGonzalez2/finanzas-personales/pull/5) | `5c68c8e436d45f11fcd3a1db862aa41fc775f1f6` | Evidencia histórica conservada y 9 pruebas offline pasan; sin nuevos HTTP ni SMTP. [CI proveedores](https://github.com/SebastianGonzalez2/finanzas-personales/actions/runs/42435399647). Verificaciones reales pendientes. |
| 8 | [#8 / F0-COORD](https://github.com/SebastianGonzalez2/finanzas-personales/pull/8) | Consultar el merge registrado por GitHub en este PR | Este documento se prepara después de los siete merges anteriores y antes del propio. Su integración exige CI verde del head actualizado. No anticipa su SHA ni su resultado. |

Las ramas se conservaron. Los borradores #4/#7/#3/#5 se habilitaron tras comprobar sus pruebas y alcance. Los merges incorporaron main sin rebase ni push forzado; no se perdió trabajo del checkout original F0-04. No hubo despliegues, servicios pagos ni datos reales. La demora de actualización de metadatos de #5 se resolvió comprobando que el head del PR coincidiera con la referencia remota antes de fusionar.

## Confirmación posterior a #8 y pruebas sobre main

Los ocho PR quedaron fusionados en el orden autorizado. #8 produjo `de0eec2187d2982f7cfe9da7fe52ee236462bee2`; ese es el SHA de main contra el que se ejecutaron las verificaciones finales. La tabla anterior conserva el corte previo al propio merge de #8. Esta confirmación documental se entrega por separado para revisión; no está incluida en la autorización de fusionar exclusivamente #1–#8.

| Verificación final | Resultado real |
| --- | --- |
| `npm run check` | Formato, lint, tipos y build pasan. |
| `npm run test:unit` / `npm run test:e2e` | 3/3 unidades y 2/2 Chromium, escritorio y viewport móvil. |
| Contratos: tipos, tests y tres husos | 16/16 casos; 48/48 ejecuciones adicionales en Montevideo, Kiritimati y Los Ángeles. |
| Spike Auth: tipos y tests | 27/27 sintéticas; caché/peer siguen pendientes para uso real. Ninguna sonda Neon. |
| Documentación visual / proveedores offline | 51 enlaces/54 contrastes y 9/9 tests; sin nuevos HTTP ni SMTP. |
| PostgreSQL 17.6 desechable en GitHub Actions | 1/1 integración real, sin DB financiera. No ejecutada localmente por ausencia de PostgreSQL/Docker. |
| Workflows de main | Los cinco workflows y sus seis jobs pasan sobre ese SHA. |

Evidencia: [CI app/DB](https://github.com/SebastianGonzalez2/finanzas-personales/actions/runs/42436136455), [contratos](https://github.com/SebastianGonzalez2/finanzas-personales/actions/runs/42436136454), [Auth](https://github.com/SebastianGonzalez2/finanzas-personales/actions/runs/42436136472), [visual](https://github.com/SebastianGonzalez2/finanzas-personales/actions/runs/42436136447), [proveedores](https://github.com/SebastianGonzalez2/finanzas-personales/actions/runs/42436136482). Deployments registrados por GitHub: cero. El checkout original permanece en F0-04/a3401bd; las pruebas se hicieron en un worktree aislado exactamente igual a origin/main.

## Protección de main verificada por API

La cuenta permitió configurar protección en este repositorio privado sin cambiar plan, visibilidad ni facturación. Lectura posterior confirmó `protected: true`, `strict: true`, administradores sujetos a las reglas, sin force push ni borrado y resolución de conversaciones obligatoria. Se exige PR; el mínimo de reviews aprobatorias es **0**, no una segunda aprobación humana obligatoria.

Checks obligatorios vinculados a GitHub Actions (app 15368): `F0 quality`, `F0 database`, `F0 visual documentation`, `F0 contracts`, `F0 auth spike` y `F0 provider evidence`. Los tres últimos se añadieron conforme sus workflows llegaron a main. Se observó #6 bloqueado mientras sus checks estaban pendientes y habilitado después de pasar. No se intentó fusionar un head fallido para probar la protección. El fallo centinela histórico de F0-06 demuestra propagación de error al check, no ese intento de merge.

No hace falta intervención adicional del titular para activar esta protección ya aplicada. Un administrador puede cambiar la configuración posteriormente; no equivale a una garantía inmutable. Detalles de pruebas y límites: [testing](../testing.md).

## Estado real por ticket

| Ticket | Estado tras las entregas integradas | Límite o siguiente trabajo |
| --- | --- | --- |
| F0-01 | Informe previo fuera de estos ocho PR | Su aceptación/incorporación no se verificó aquí; no se repitió. |
| F0-02 | Especificación visual integrada | No certifica UI final ni CA-066 completo. |
| F0-03 | Scaffold integrado | Sin auth, persistencia ni módulos financieros de aplicación. |
| F0-04 | Investigación integrada, implementación/validación real pendiente | Neon aislado, admisión persistente, sesiones frescas y pruebas email/Google/OTP/reset/aislamiento reales. |
| F0-05 | No iniciado; pendiente entorno Neon de prueba | Elegir driver/SQL/ORM con compatibilidad y licencia, esquema, migraciones y pruebas de dos usuarios. PostgreSQL temporal de CI no sustituye este ticket. |
| F0-06 | CI integrado y protección activa | Cobertura actual de scaffold/spikes; no acredita seguridad de una aplicación financiera aún inexistente. No se realizó intento negativo de merge sobre main protegido. |
| F0-07 | Investigación/evidencia offline integrada, validación real pendiente | SMTP, cuentas/cuotas/costo y adecuación del plan de hosting al uso previsto. |
| F0-08 | Prototipo puro integrado después de F0-09 | Parte bancaria I-10/CA-015; faltan persistencia, concurrencia/idempotencia de aplicación, estadísticas y UI. |
| F0-09 | Contratos/ADR integrados | Aislamiento y admisión son contratos preparatorios; falta demostrar implementación real en F0-04/F0-05. |

Referencias: RF-004/RNF-01/02/03/12, CA-001/006/013/014/015/066 e I-10/11/12 según alcance de cada informe, no aceptación funcional global. R-01/02/13/19 siguen abiertos; la evidencia preparatoria no cierra los riesgos financieros ni los de proveedores. Migraciones y cambios de datos reales: ninguno.

## Neon de prueba: configuración que falta

1. El titular debe crear un proyecto Free exclusivo y una rama/base vacía para pruebas, sin copiar datos privados ni activar tarjeta, upgrades o servicios pagos. Guardar URL de conexión de prueba y `NEON_AUTH_BASE_URL` de esa rama en configuración local privada ignorada; no en Git, chats ni logs.
2. Habilitar Neon Auth para ese entorno, email/password, verificación al registrarse con código y revocación de sesiones al restablecer contraseña; configurar orígenes exactos de desarrollo. Verificar las opciones reales del panel antes de declarar aplicado. La aplicación actual no tiene rutas ni UI de Auth.
3. Google: las credenciales compartidas de Neon sirven para el primer desarrollo cuando estén disponibles. Para credenciales propias, crear cliente OAuth Web con Branding/Audience/usuarios de prueba y copiar exactamente el redirect mostrado por Neon (`{NEON_AUTH_BASE_URL}/callback/google`), distinto del callback de la aplicación. Guardar Client ID/Secret en Neon, nunca `NEXT_PUBLIC_*` ni Git.
4. Usar buzones de prueba para código y reset. El correo compartido de Neon puede servir para desarrollo; F0-07 requiere comprobar SMTP propio gratuito con remitente verificado, host/puerto TLS/credenciales y DNS/DKIM cuando corresponda. Comprobar entrega, expiración, reenvío, reutilización, cuotas y fallos sin comprar dominio/plan. No habilitar hooks `send.otp`/`send.magic_link` antes de implementar su envío: sustituyen la entrega predeterminada.

Fuentes para contrastar con el panel: [OAuth](https://neon.com/docs/auth/guides/setup-oauth), [checklist de Auth](https://neon.com/docs/auth/production-checklist), [webhooks](https://neon.com/docs/auth/guides/webhooks). No se realizó esta configuración durante la integración.

## Completar F0-04 y comenzar F0-05

F0-04 debe resolver o aislar el problema reproducido del SDK 0.8.2: `disableCookieCache` booleano conserva la caché, mientras el string fuerza consulta upstream en el transporte simulado. Esto no valida sesiones frescas contra Neon real. También sigue pendiente la advertencia peer fetch 1.3.2/1.3.3. Implementar admisión persistente y límites de intentos en servidor, sesión fresca y metadatos para email/Google; las Maps del spike no son backend. Probar bloqueo de alta directa por Neon mediante `user.before_create` HTTPS, firma Ed25519 sobre cuerpo crudo/JWKS de la rama y fallo cerrado. Ejecutar registro invitado/no invitado, OTP, reset/revocación, OAuth, sesión y dos usuarios reales de prueba con evidencia saneada, antes de cerrar CA-001/006.

F0-05 puede comenzar al disponer de la conexión Neon aislada y fixtures sintéticos A/B: justificar driver/pooling y SQL u ORM compatible/licenciado; acordar persistencia de admisión con F0-04; implementar esquema/migraciones con relaciones y propietario, NUMERIC exacto, atomicidad, idempotencia y concurrencia. No editar manualmente el esquema gestionado `neon_auth`. No necesita esperar UI financiera, pero no puede declarar aislamiento real sin integrar/verificar Auth. Cerrar estos puntos y proveedores antes de declarar F0 terminada o avanzar el gate de uso real.
