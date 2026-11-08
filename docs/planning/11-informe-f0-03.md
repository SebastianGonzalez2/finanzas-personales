# F0-03 — Esqueleto web reproducible

**Fecha:** 2026-11-07. **Estado:** implementación para revisión humana; no merge ni despliegue.
**Ticket:** [F0-03](05-plan-de-implementacion.md). **Rama:** `codex/F0-03-scaffold-nextjs`.

## Estado inicial y alcance

El árbol inicial estaba limpio en `codex/F0-02-diseno-visual`, commit `43754b2`, un commit por delante de `origin/main`. Se ejecutó `git fetch origin` y se creó la rama F0-03 desde `origin/main` (`56df8bc`). La rama y el commit de F0-02 se conservaron sin reescribir ni incorporar su entrega a esta PR. Su guía visual se consultó antes de cambiar de rama; no se presenta como aceptada o fusionada.

Se leyeron AGENTS, los documentos `docs/planning/0*.md`, requisitos, CA, modelo e invariantes, y producto v9.48, especialmente §§1–2 y §12.1 (decisión 4A). El chat se renombró mediante la aplicación a `[F0-03] Esqueleto Next.js`.

La entrega incluye App Router bajo `src/app`, TypeScript estricto y alias `@/*`, Tailwind 4 con PostCSS, Card de shadcn/ui y utilidad `cn`, ESLint, Prettier, scripts, README, ejemplo de entorno sin credenciales y lockfile npm v3. La portada es estática, en español, oscura y explícita sobre el estado de desarrollo; no contiene saldos ni formularios financieros. El nombre descriptivo provisional es «Finanzas personales», no la marca de la referencia.

No se agregan auth, SDK de Neon, DB, migraciones, dominio monetario, dashboard, PWA, CI ni frameworks de tests: corresponden a F0-04…09/F1/F6. No existen lecturas ni escrituras privadas que permitan comprobar aislamiento entre usuarios en este ticket.

## Trazabilidad

| Referencia | Cobertura real |
| --- | --- |
| F0-03 | Esqueleto instalado, dev server inicia, typecheck/lint/build pasan. |
| RF-052, RNF-07/08 | Preparación parcial: español, jerarquía de encabezados, foco y legibilidad responsive en la portada. No cierre funcional. |
| CA-066 | Comprobación parcial de portada y teclado; navegación principal/validaciones todavía no existen. No se marca aceptado. |
| RF-001…004, CA-001…006 | No implementados; dependencias F0-04/F0-05/F0-06. |
| I-01…I-12, RNF-02/03/04 | Sin operaciones monetarias ni persistencia: no aplica ejecución en este ticket; no se afirma que estén implementados o probados. |
| Producto §12.1, 1A/4A | Incremento acotado y stack confirmado; sin nuevas decisiones funcionales. |

## Decisiones técnicas y compatibilidad

- Node **24.19.0 LTS**, npm **11.17.0**, Next y plugin oficial ESLint **16.4.5**, React/React DOM **19.3.1**, Tailwind/plugin PostCSS **4.3.5**. Versiones directas exactas, `save-exact`, `engine-strict` y `.nvmrc`; `engines` limita a Node 24/npm 11. Los paquetes opcionales nativos pueden variar según plataforma.
- TypeScript **5.9.3** queda dentro del soporte declarado por `typescript-eslint` **8.72.1** (`>=4.8.4 <6.1.0`). No usar TS 7 solamente por ser el último publicado.
- ESLint **10.14.0** con reglas recomendadas JS, TS, React Hooks y Next/Core Web Vitals vía plugin directo oficial. El preset completo de Next incluía peers React/import/a11y que no declaraban ESLint 10; ESLint 9.39.5 estaba marcado fuera de soporte. La configuración final instala sin forzar ni ignorar peers. No equivale a tener un auditor automático de accesibilidad.
- Override `minimatch` **11.0.5** para corregir GHSA-g3hv-75wg-m249 en tooling transitivo. Actualiza una versión mayor transitiva; se comprobó instalación limpia, resolución del árbol, reglas de lint y build. Mantenerlo revisable y retirarlo cuando el upstream incorpore el parche. `npm audit` final: cero avisos conocidos, no garantía de ausencia absoluta de vulnerabilidades.
- Card se obtuvo del registro oficial `new-york-v4`; solo se adaptó el import de `cn` y el formato. `clsx` y `tailwind-merge` resuelven composición y conflictos de clases; no instalar la CLI completa ni primitivas que Card no usa. Se preservó licencia MIT en `THIRD_PARTY_NOTICES.md`. Dependencias directas MIT/Apache-2.0; minimatch BlueOak-1.0.0 permisiva. Sin herramientas de pago.
- El inventario del lockfile también identifica dependencias transitivas de Next/Tailwind: libvips/Sharp con LGPL-3.0-or-later, Lightning CSS con MPL-2.0 y caniuse-lite con CC-BY-4.0. Se conservan sus metadatos y licencias en la instalación; no se modifican ni se incorporan binarios a Git. No se presenta todo el árbol como MIT. `.gitattributes` fija LF y marca capturas como binarias para que clonar en Windows no rompa formato/checksum por `core.autocrlf`.
- Desarrollo y build usan **Webpack** explícito. `next build` con Turbopack falló dos veces en este Windows al iniciar el worker de PostCSS (`node process exited before we could connect`, código 0), tanto en sandbox como fuera. El fallo no se atribuye con certeza al sandbox. `--webpack` es la alternativa oficial probada; no se desactivaron comprobaciones de tipos ni lint.
- `agentRules: false` evita la modificación automática del AGENTS existente por Next 16.4.5. Al reiniciar dev se retiró únicamente el bloque autogenerado; `git diff -- AGENTS.md` quedó vacío.
- No hay descargas de fuentes, servicios de analytics de la aplicación ni peticiones externas desde la portada. Se usó `NEXT_TELEMETRY_DISABLED=1` en las últimas verificaciones locales; no es una credencial ni una variable necesaria para arrancar la app.

Fuentes oficiales verificadas: [Next instalación](https://nextjs.org/docs/app/getting-started/installation), [plugin ESLint directo](https://nextjs.org/docs/app/api-reference/config/eslint), [Tailwind](https://tailwindcss.com/docs/installation/framework-guides/nextjs), [shadcn instalación](https://ui.shadcn.com/docs/installation/manual), [Card](https://ui.shadcn.com/r/styles/new-york-v4/card.json), [Node LTS](https://nodejs.org/en/about/previous-releases), [soporte ESLint](https://eslint.org/version-support/) y [aviso minimatch](https://github.com/advisories/GHSA-g3hv-75wg-m249). También se consultó la documentación de `agentRules` incluida en el paquete Next instalado y los metadatos/peers/licencias del registro público npm.

## Verificaciones ejecutadas

Entorno Windows, Node 24.19.0/npm 11.17.0. Sin credenciales de proveedores ni datos reales.

| Comando / comprobación | Resultado observado |
| --- | --- |
| `npm ci --fetch-retries=0 --fetch-timeout=30000` | Instalación limpia de 200 paquetes; cero vulnerabilidades reportadas. SHA256 del lockfile conservado: `F8C41FEE59C738BBA283A6E834E4709DFF414E21BC536441D8E042A8FDEDB0B6`. |
| `npm ls --depth=0` | Árbol final sin peers inválidos ni paquetes extraneous tras `npm ci`. |
| `npm run format:check` | Pasó. Documentación histórica/AGENTS/plantilla excluidos del formateo. |
| `npm run lint` | Pasó, cero warnings. |
| `npm exec -- eslint --print-config src/app/page.tsx` | Reglas Next, TS y React Hooks presentes; no hay configuración vacía accidental. |
| `npm run typecheck` | Pasó antes de un build exitoso, con `next typegen` y `tsc --noEmit`. |
| `npm run build` / `npm run check` | Pasaron con Webpack; rutas estáticas `/`, `/_not-found`, `/icon.svg`. |
| `npm run dev` | Inició con Webpack; HTTP 200 para `/`. |
| `npm start -- --port 3001` | Build servido localmente; revisión de navegador sobre ese build. |
| `npm audit --json` | Cero vulnerabilidades conocidas en el árbol final. |
| `git check-ignore` | `.env.local`, `.env.production`, `.vercel`, dependencias y tipos generados ignorados; `.env.example` queda versionable. |
| `git diff --check` y revisión del diff | Sin errores de whitespace; sin datos bancarios, secretos, migraciones ni cambios de AGENTS. |

Los intentos iniciales de instalación con el preset ESLint completo dieron conflictos/avisos y la auditoría inicial reportó vulnerabilidades moderadas en minimatch. Se regeneraron solo los archivos generados `node_modules` y `package-lock.json`, verificando antes las rutas absolutas dentro del workspace. La configuración final no usa `--force` ni `--legacy-peer-deps`.

No se ejecutaron suites unitarias, integración DB ni E2E de negocio: no existen todavía y se configuran en F0-06. Tampoco se probó en dispositivos físicos, Safari/iOS o Firefox. No hay aplicación previa con funcionalidades que ejecutar como regresión; se preservó la documentación de origen.

## Revisión visual y reproducción

Playwright/Chromium contra el build local: **1440×900**, **390×844** y **320×700**. En esos anchos, `scrollWidth` coincide con el viewport y no hay elementos del contenido fuera del ancho. Título y `lang="es"` correctos, un `h1`, CSS Tailwind aplicado (Card flex, borde 1 px, fondo RGB 19/19/19), fuente del sistema. No hubo errores de consola ni recursos externos en esa navegación.

Teclado: Tab muestra «Saltar al contenido», con foco visible; Enter lleva a `main#contenido`. El enlace visible tiene padding y altura mínima de 44 px. No existen otros controles de producto ni formularios que validar. Esta revisión no certifica WCAG de la aplicación futura.

Capturas del build:

- [Escritorio 1440 px](../evidence/f0-03/escritorio-1440.png).
- [Móvil 390 px](../evidence/f0-03/movil-390.png).

Para repetir: `npm ci`, `npm run check`, `npm run dev` y abrir `http://127.0.0.1:3000`. Para revisar el build: `npm start -- --port 3001`. Reducir a 390/320 px y probar Tab/Enter desde una recarga. La portada no ofrece altas ni movimientos.

## Riesgos pendientes y siguiente ticket

R-17 queda mitigado parcialmente para las dependencias de este scaffold, sujeto al mantenimiento del override. R-01/R-02/R-03/R-12/R-13/R-19 y los gates de F0 siguen pendientes; no se validan auth, SMTP, coste de proveedores, precisión monetaria ni aislamiento por tener un scaffold. R-18 no se cierra: no se implementó el dashboard y la entrega de diseño F0-02 continúa independiente.

No hubo migraciones, cambios financieros, activación de facturación, recursos cloud, merge ni despliegue. El estado de F0-03 es **en revisión**, no aceptación humana ni cierre de la fase F0.

**Siguiente ticket según el plan: F0-04**, investigar/probar Neon Auth, sesiones, Google, OTP, recuperación e invitación en ambos métodos. Requiere entorno/cuentas de prueba y conexiones autorizadas; no se inicia en este cambio.
