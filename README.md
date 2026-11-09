# Finanzas personales

> **Decisión vigente v9.49 (2026-11-08):** la autenticación es **Better Auth autogestionado + Google OAuth exclusivo + lista privada de usuarios autorizados**. El ADR 0004 sustituye la arquitectura histórica de Neon Auth administrado. [Decisión vigente](docs/adr/0004-google-only-allowlist-auth.md).

Base Next.js App Router, TypeScript estricto, Tailwind CSS y shadcn/ui. F0-05 aporta persistencia financiera con RLS. F0-04 aporta acceso Google-only, deshabilitado por defecto y comprobado localmente con dos cuentas reales en Neon development. [Evidencia y SQL](docs/planning/25-google-only-f0-04.md) · [Guía local y callback](docs/development-google-auth.md).

## Requisitos y arranque

Entorno de referencia: **Node.js 24.19.0 LTS** (`.nvmrc`) y **npm 11.17.0** (`packageManager`). Los rangos de `engines` y `.npmrc` rechazan otras versiones mayores. Con un gestor de Node, seleccionar primero la versión de `.nvmrc`.

```sh
npm ci
npm run dev
```

Abrir [http://127.0.0.1:3000](http://127.0.0.1:3000). El servidor escucha solo en loopback. Para cambiar el puerto: `npm run dev -- --port 3001`.

La pantalla de acceso puede iniciarse sin credenciales. Para revisar el Resumen con una cuenta autorizada, seguir la [guía de Google-only](docs/development-google-auth.md) y usar `npm run dev:google` en `http://localhost:3000/auth/sign-in`. Después de iniciar sesión, la aplicación abre `/resumen`. Usar `localhost` para OAuth. [.env.example](.env.example) enumera las variables privadas de servidor. No guardar secretos en Git ni en variables `NEXT_PUBLIC_*`.

## Comandos

| Comando                          | Uso                                                                                              |
| -------------------------------- | ------------------------------------------------------------------------------------------------ |
| `npm ci`                         | Instalar exactamente el lockfile; usar también en futuras verificaciones/CI.                     |
| `npm run dev`                    | Desarrollo local con recarga y Webpack.                                                          |
| `npm run build`                  | Compilar la aplicación para producción, sin desplegar.                                           |
| `npm start`                      | Servir el build local en loopback.                                                               |
| `npm run typecheck`              | Generar tipos de rutas y ejecutar TypeScript sin emitir código; funciona antes del primer build. |
| `npm run lint`                   | ESLint: Next Core Web Vitals + TypeScript, sin warnings permitidos.                              |
| `npm run lint:fix`               | Aplicar correcciones automáticas de ESLint.                                                      |
| `npm run format`                 | Aplicar Prettier; preserva documentación histórica y plantilla de PR.                            |
| `npm run format:check`           | Verificar formato sin modificar archivos.                                                        |
| `npm run check`                  | Formato, lint, typecheck y build, en ese orden.                                                  |
| `npm test` / `npm run test:unit` | Pruebas unitarias con Node test runner.                                                          |
| `npm run test:integration`       | PostgreSQL real desechable; falla si falta el entorno aislado documentado.                       |
| `npm run test:e2e`               | Playwright Chromium contra build local, escritorio y móvil.                                      |

**F0-06** incorpora scripts de test y CI: ver [comandos, PostgreSQL desechable, checks y límites](docs/testing.md). Para E2E, instalar Chromium con `npx playwright install chromium` y ejecutar primero `npm run build`. Los spikes de proveedores/contratos se verifican por separado con sus propios comandos y workflows; no son auth ni motor de producción. La prueba DB temporal no acredita aislamiento de la aplicación. La evidencia original del scaffold permanece en [el informe F0-03](docs/planning/11-informe-f0-03.md).

## Estructura

**F0-NEON:** [configurar el entorno development existente](docs/development-neon.md)
y ejecutar `npm run probe:neon` (solo lectura, sin migraciones). El conector Neon
no configura automáticamente las credenciales del proceso local. Estado y
límites: [informe](docs/planning/17-informe-f0-neon.md).

```text
src/app/                 Rutas, layout, CSS global, portada e icono
src/components/ui/       Código fuente local de shadcn/ui
src/lib/                 Utilidad cn para clases Tailwind
tests/                   Unidad, integración PostgreSQL desechable y E2E
components.json          Configuración de shadcn/ui y alias @/*
docs/product/            Decisiones del producto v9.49 (autoridad funcional)
docs/planning/           Tickets, RF/RNF, CA, invariantes y riesgos
```

La instalación se hizo manualmente según las guías oficiales para conservar `AGENTS.md` y la documentación existente. Card proviene del [registro oficial shadcn/ui](https://ui.shadcn.com/r/styles/new-york-v4/card.json), con `cn` local (`clsx` + `tailwind-merge`); ver [aviso y licencia](THIRD_PARTY_NOTICES.md). No requiere instalar toda la CLI de shadcn como dependencia de la aplicación. Agregar solo componentes que se utilicen y revisar sus dependencias antes de incorporarlos.

## Versiones y decisiones

- Next.js y su plugin oficial de ESLint 16.4.5, React/React DOM 19.3.1, Tailwind y su plugin PostCSS 4.3.5: versiones exactas y lockfile de npm v3. No actualizar con `latest` de forma automática.
- TypeScript 5.9.3: dentro del rango soportado por `typescript-eslint` (`>=4.8.4 <6.1.0`), frente a TypeScript 7 publicado pero fuera de ese rango al verificar este ticket.
- ESLint 10.14.0 usa configuración plana con reglas recomendadas de JavaScript, TypeScript, React Hooks y el plugin oficial Next/Core Web Vitals. Se usa el plugin directamente (ruta documentada por Next) porque el preset completo incluye plugins cuyos peers aún no admiten ESLint 10; ESLint 9 ya está fuera de soporte. Prettier y `eslint-config-prettier` separan formato y reglas de calidad.
- Override de `minimatch` a 11.0.5 por [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249), que afecta a las versiones 7–10 transitivas de herramientas de desarrollo. Se verifica con instalación limpia, lint y build; revisar y retirar el override cuando las dependencias originales incorporen el parche. Licencia BlueOak-1.0.0, permisiva; las demás dependencias directas son MIT o Apache-2.0.
- Fuente de sistema y CSS local: el build no descarga fuentes. El Resumen aplica el tema oscuro, los tokens y la composición responsive de la [guía visual](docs/design/fintrack-visual-spec.md).
- Webpack explícito en desarrollo y build: Turbopack falló en este Windows al lanzar el proceso de PostCSS, incluso fuera del sandbox. Next documenta `--webpack` como alternativa soportada; no se ocultan errores de lint o TypeScript. `agentRules: false` evita que `next dev` modifique el `AGENTS.md` existente.
- Better Auth 1.7.18 (MIT), pg 8.23.1 y Kysely 0.29.8 (MIT): adaptador PostgreSQL incorporado de Auth con esquema y transacciones explícitos. Finanzas conserva SQL y contratos F0-05; no se migra a otro ORM. Auth, allowlist y ledger nuevos requieren aprobación de su SQL antes de escribir en Neon.

Las versiones se cambian deliberadamente junto con `package-lock.json`, revisando compatibilidad, licencia y checks. `npm ci` reproduce el árbol de dependencias para cada plataforma soportada; no garantiza un build binariamente idéntico entre sistemas.

`.gitattributes` fija LF para los archivos de texto, también en Windows, para mantener el formato y el lockfile al volver a clonar. El lockfile conserva los metadatos de licencia de dependencias transitivas (incluidos libvips/LGPL, Lightning CSS/MPL y caniuse-lite/CC-BY); no se versionan sus binarios ni se modifican esas bibliotecas.

## Alcance y trazabilidad

F0-03 implementó el stack aprobado en [producto §12.1, decisión 4A](docs/product/decisiones-producto.md). F1-01 incorpora el Resumen fijo y la navegación a Mi cuenta con estados vacíos, para RF-052 y CA-066 en esta fase. Los saldos por moneda empiezan en F1-02. [Plan de implementación](docs/planning/05-plan-de-implementacion.md) · [Captura de escritorio](docs/evidence/f1-01/escritorio-1484.png) · [Captura móvil](docs/evidence/f1-01/movil-390.png).

El titular aprobó el cierre técnico de F0 para integrar sus fundamentos en `main`. La prueba de acceso entre dispositivos en HTTPS y la comprobación del consumo del despliegue quedan como condiciones de publicación. [Plan de implementación](docs/planning/05-plan-de-implementacion.md) · [Convenciones de trabajo](AGENTS.md).

Fuentes oficiales consultadas para esta implementación: [Next.js](https://nextjs.org/docs/app/getting-started/installation), [ESLint con Next.js](https://nextjs.org/docs/app/api-reference/config/eslint), [Tailwind con Next.js](https://tailwindcss.com/docs/installation/framework-guides/nextjs), [shadcn/ui](https://ui.shadcn.com/docs/installation/manual) y [Node LTS](https://nodejs.org/en/about/previous-releases).
