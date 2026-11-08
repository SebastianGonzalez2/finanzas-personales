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

Sonda opcional **de solo lectura**, después de crear una rama de test:

```powershell
Copy-Item .env.example .env.local
# Editar .env.local con la Auth Base URL de la rama de prueba.
npm run probe
```

Sin URL termina con código 2 (`PENDIENTE`). Con URL comprueba únicamente sesión anónima y disponibilidad de una clave pública Ed25519; no valida Google, OTP, recuperación ni invitaciones reales. Nunca imprime sesiones, emails ni claves.

Dependencias: `@neon/auth` 0.8.2 (Apache-2.0), Next 16.4.5/React 19.3.1 (MIT), TypeScript 5.9.3 (Apache-2.0), tipos de Node/React (MIT). Lockfile versionado. La instalación muestra una advertencia de peer transitivo entre `@better-auth/oauth-provider` 1.7.18 y `@better-fetch/fetch` 1.3.2/1.3.3; no se ocultó ni se aplicó un override sin comprobarlo. Ver el riesgo de compatibilidad en el informe.
