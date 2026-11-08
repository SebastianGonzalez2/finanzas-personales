# F0-04 — Experimento aislado de Neon Auth

Investigación ejecutable, **sin aplicación web ni rutas públicas**. El procedimiento del titular, opciones y limitaciones están en [el informe](../../docs/planning/12-informe-f0-04.md). No usar estos módulos como autenticación de producción.

Desde esta carpeta, con Node 24.19.x y npm 11.17.x:

```powershell
npm ci --ignore-scripts --no-audit --no-fund
npm test
npm run typecheck
```

Las pruebas ejecutan el SDK instalado con transporte simulado y fixtures sintéticos. No requieren credenciales, no llaman a Neon, no envían correos y no ejecutan `checkSdkContract`: esa función solo verifica tipos. Next/React son pares para comprobar el contrato del adaptador App Router, con las mismas versiones del scaffold F0-03. No se creó otro frontend.

`admission.mjs` demuestra una política de invitación con estado en memoria: código grupal reutilizable, permisos temporales por email/método, rotación, revocación y reintentos. `webhook.mjs` verifica firmas de prueba según el contrato público. El estado se pierde al reiniciar: faltan transacciones compartidas, límites de intentos, limpieza y manejo de fallos de alta para su integración. No conectarlo a un túnel ni a Neon tal como está.

Sonda **de solo lectura** contra la rama `development` existente y verificada
del proyecto autorizado; ver [configuración unificada F0-NEON](../../docs/development-neon.md).
No crear otra rama ni usar production. Lee el `.env.local` de la raíz (IDs y URL
preparados por F0-NEON). No carga un archivo de entorno propio del spike.

```powershell
npm run probe
```

Sin URL termina con código 2 (`PENDIENTE`). Con URL comprueba únicamente sesión anónima y disponibilidad de una clave pública Ed25519; no valida Google, OTP, recuperación ni invitaciones reales. Nunca imprime sesiones, emails ni claves. JWKS no demuestra un webhook habilitado. F0-NEON añade al contrato Next una lectura HTTP con `disableCookieCache=true` sin casts; la prueba del proxy HTTP del SDK consulta upstream incluso con caché firmada. Sigue pendiente App Router/revocación real.

Dependencias: `@neon/auth` 0.8.2 (Apache-2.0), Next 16.4.5/React 19.3.1 (MIT), TypeScript 5.9.3 (Apache-2.0), tipos de Node/React (MIT). Lockfile versionado. La instalación muestra una advertencia de peer transitivo entre `@better-auth/oauth-provider` 1.7.18 y `@better-fetch/fetch` 1.3.2/1.3.3; no se ocultó ni se aplicó un override sin comprobarlo. Ver el riesgo de compatibilidad en el informe.
