# F0-02 — Consolidación de la especificación visual

**Fecha:** 2026-11-07 (America/Montevideo).
**Estado:** entrega documental para revisión humana; sin merge, despliegue ni inicio de F0-03.
**Rama:** `codex/F0-02-diseno-visual`; chat `[F0-02] Diseño visual`.

## Base y preservación del trabajo local

Se revisaron `AGENTS.md`, README de planificación, documentos `01`…`09`, informe local F0-01 y decisiones del producto v9.48, especialmente §§1–2, 11, 12.1 y decisiones v9.42/v9.44/v9.46. La convención `09-convenciones-git.md` no existía en el checkout inicial; apareció al actualizar la referencia remota y se leyó antes de editar.

Estado inicial: rama `codex/f0-01-revision-inicial`, commit `d4f7d85`, sin cambios rastreados y con `docs/design/fintrack-visual-spec.md` sin seguimiento. `origin` apunta a `https://github.com/SebastianGonzalez2/finanzas-personales.git`. Tras `git fetch origin`, `origin/main` quedó en `56df8bc`; comparación con rama inicial: 1 commit exclusivo local y 10 remotos. Se creó F0-02 directamente desde esa base remota, sin incorporar el informe F0-01 al nuevo PR ni reescribir su rama. Comparación tras crear rama: `0 / 0`.

SHA-256 de la guía preexistente, igual antes y después del cambio de rama:

```text
9D7BBEC9AF7D96A9037260421C1517CFAA24E620C429885C6D04244FE9E8E1EE
```

Se revisó y completó ese archivo de forma deliberada. El apéndice A conserva el contenido descriptivo previo de dimensiones, componentes y paleta; se sustituyeron las reglas iniciales incompatibles con el producto. El informe/commit F0-01 sigue en su rama original. No se usaron reset, clean, stash, rebase, merge ni push forzado. La rama local `main` no se modifica.

## Entrega y discrepancias resueltas

La [guía consolidada](../design/fintrack-visual-spec.md) contiene:

- Separación explícita de decisiones confirmadas, convenciones de diseño propuestas por F0-02 y observaciones del JPEG.
- Tokens de color, tipografía de sistema, cifras/monedas, espaciados, radios, capas y variantes de componentes; foco y colores funcionales con contraste calculable.
- Shell responsive con breakpoints 320/768/1024/1440/1920, navegación por fases, drawer accesible y dashboard fijo con tres indicadores/cuatro columnas; ejemplos de escritorio/móvil y casos monetarios sintéticos.
- Formularios básicos y complejos, validación, acceso/onboarding salteable, confirmaciones y estados de carga, vacío, error, guardado desconocido, offline y conflicto.
- Trazabilidad RF/RNF/CA/invariantes y matriz de QA futura de móvil, escritorio, zoom, teclado, lector y datos largos.

| Discrepancia / incertidumbre | Resolución documental |
| --- | --- |
| Regla local «mantener exactamente» y «no agregar elementos ausentes» | Producto §2 permite adaptar contenidos/destinos a funciones aprobadas y exige responsive. La estética se conserva y la adaptación concreta queda identificada para revisión |
| Captura con inversiones, compartir, avatares, marca y datos ajenos | No se trasladan al producto. Nombre definitivo pendiente; sin colaboración por inferencia |
| Balance total como protagonista del ejemplo | Dinero disponible protagonista y saldo bancario/reservas separados según producto; no confundir reserva con salida bancaria |
| Tablero/favoritos personalizables por analogía | Dashboard fijo (v9.44), favoritos solo en Estadísticas; sin ocultar cifras (v9.46) |
| Estados/barras/cifras con contraste o proporciones inconsistentes en JPEG | Tokens accesibles y proporciones calculadas desde datos exactos; apéndice conserva observaciones sin convertirlas en reglas contables |
| Fuente, móvil, campos y estados no visibles | Convenciones explícitas de F0-02, no presunta medición ni aprobación histórica del usuario |

## Verificaciones y evidencia

Abrir [imagen original](../fintrack-original.jpeg) y comparar con apéndice A. Se inspeccionó visualmente el JPEG completo. Con `System.Drawing.Bitmap` se confirmó **1600 × 1197 px** y muestras `(x,y)` del JPEG decodificado: exterior `(10,10)` `#414141`; sidebar `(70,400)` `#0F0F0F`; principal `(380,400)` `#131313`; divisoria `(365,500)` `#232323`; pista `(1400,380)` `#28282A`. Las demás medidas del apéndice siguen siendo observaciones heredadas/aproximadas, no todas remuestreadas. Los tokens operativos se distinguen de esos colores medidos.

Comando PowerShell reproducible para dimensiones y muestra (el JPEG solo se lee):

```powershell
Add-Type -AssemblyName System.Drawing
$referenceBitmap = [System.Drawing.Bitmap]::new((Join-Path (Get-Location) 'docs/fintrack-original.jpeg'))
"Dimensiones: $($referenceBitmap.Width)x$($referenceBitmap.Height)"
$referenceBitmap.GetPixel(70,400)
$referenceBitmap.Dispose()
```

Verificador documental [verify-visual-spec.mjs](../design/verify-visual-spec.mjs), con Node y sin paquetes externos: extrae los colores de la tabla de tokens (no los duplica), comprueba contraste sRGB de los pares operativos de texto, estado, foco, controles y gráficos, y existencia de enlaces locales en los cinco documentos de esta entrega. Los enlaces web de accesibilidad se consultaron en W3C; el script no comprueba disponibilidad remota ni certifica componentes renderizados.

| Comando / revisión | Resultado / alcance |
| --- | --- |
| `git status --short --branch`, `git remote -v`, `git rev-list --left-right --count HEAD...origin/main`, `git diff --stat`, `git diff --cached --stat` | Inventario y comparación realizados antes de modificar; trabajo local preservado |
| `git fetch origin` | Correcto; base actualizada a `56df8bc` |
| `git switch --no-track -c codex/F0-02-diseno-visual origin/main` | Correcto al repetir con permisos: primer intento falló por sandbox al crear `.git/index.lock`, sin cambio de rama |
| `Get-FileHash docs/design/fintrack-visual-spec.md -Algorithm SHA256` | Hash original conservado al cambiar de rama; el contenido cambia después por esta revisión autorizada |
| Apertura visual del JPEG y `System.Drawing.Bitmap` | Imagen leída, dimensiones y muestras anteriores confirmadas |
| `node --check docs/design/verify-visual-spec.mjs` | Pasó: sintaxis válida, salida vacía y código 0 |
| `node docs/design/verify-visual-spec.mjs` | Pasó: 35 enlaces locales en cinco documentos y 54 pares de contraste. Mínimos observados: texto 5,446:1 y no textual 3,366:1 (umbrales evaluados sin redondear) |
| `git diff --check` / `git diff --cached --check` | Pasaron: sin errores de whitespace antes/después de preparar los seis archivos de F0-02 |
| Revisión manual del diff, referencias y alcance | Sin cambios de producto/código de aplicación/DB; sin secretos nuevos ni datos financieros reales; ejemplos sintéticos identificados |
| Lint, typecheck, tests funcionales, build, Playwright y accesibilidad de UI | No ejecutados: no existen aplicación, `package.json`, scripts ni UI navegable. No se marca CA funcional como pasado |

El primer pase del verificador detectó que su parser no admitía dos nombres de token compartiendo un color (`canvas`/`surface` y `sidebar`/`well`); se corrigió el soporte de alias y se repitió con los resultados anteriores. No se omitió ningún par fallido. La revisión de diseño también aclaró el anillo de foco para mantener contraste frente al botón azul en hover.

## Cobertura real, permisos y límites

F0-02 entrega especificación, principalmente RF-052, RF-044, RF-051, RNF-07/08/13 y diseño de CA-066/059/065. Se incorporan salvaguardas visuales de CA-007/015/018/021/028/038/060 y I-01/02/03/04/08/10/11/12. **Ninguno de esos CA se considera implementado o probado funcionalmente.** La matriz detallada está en §9 de la guía.

Solo se añaden/modifican documentos y su verificador local. No hay cambios de permisos de aplicación, endpoints, datos, migraciones, dependencias ni servicios. La UI futura no sustituye validación de sesión/propietario en servidor. No se conectó Neon/SMTP/Google/Vercel ni se activó facturación. Publicar esta documentación mediante PR no autoriza deploy. El código de verificación usa aritmética de color, no contabilidad monetaria.

R-18 se mitiga parcialmente por recuperación y consolidación documental. Fuente exacta/escala CSS de la imagen no recuperables; composición concreta y tokens nuevos quedan sujetos a revisión humana. Capturas comparativas y pruebas reales móvil/escritorio/accesibilidad siguen pendientes en F1-01/F6. R-01/02/03/04/05/06/11/12/13/14/15 no se cierran por redactar esta guía; la puerta global F0 continúa abierta.

## Revisión y siguiente ticket

Revisar primero §1 de la guía (autoridad y límites), luego tokens y responsive (§§2–3), correspondencia de dashboard (§4), formularios/estados (§§5–7), Estadísticas y matriz (§§8–9). Comparar apéndice A con JPEG distinguiendo reglas operativas de observaciones. Ejecutar desde raíz `node docs/design/verify-visual-spec.mjs` y revisar el diff del PR `[F0-02] Consolidar la especificación visual` contra `main`. Convención de commit: `docs(F0-02): consolidar la especificación visual`.

**Siguiente sugerido: F0-03**, scaffold Next.js App Router + TypeScript + Tailwind + shadcn/ui, herramientas/scripts y lockfile; deberá verificar versiones compatibles y obtener dev/typecheck/lint/build. Depende de revisión/aceptación de esta entrega y aprobación explícita para avanzar. **No iniciado** en F0-02. No hacer merge ni despliegue sin autorización del titular.
