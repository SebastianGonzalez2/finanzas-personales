# F6-03 · PWA, responsive y accesibilidad

Entrega de implementación de [F6-03](05-plan-de-implementacion.md) para RF-051/052 y CA-065/066. Rama `codex/F6-03-pwa-accesibilidad`, creada desde `codex/F6-02-auditoria-seguridad` porque F6-01 (PR #59) y F6-02 (PR #60) siguen abiertos y no están en `main`. Codex continúa en esta rama y estos commits.

No se afirma conformidad WCAG 2.2 AA. Se usó como referencia práctica y la evidencia es la de este documento.

## 1. Qué cambió en la etapa A

| Área | Cambio | Archivos |
| --- | --- | --- |
| Manifest | `id`, `description`, `lang`, `dir`, `orientation`, `background_color`, `theme_color`, `categories` e íconos PNG 192, 512 y maskable. Se conservan `start_url: "/"`, `display: "standalone"` y el SVG. Sin `scope`, atajos ni `share_target`, como exige la prueba unitaria de F6-02. | `src/app/manifest.ts` |
| Íconos | Mismo símbolo que `icon.svg` generado con `next/og`. Rutas públicas y sin datos: `/pwa-icons/{icon-192,icon-512,icon-maskable-512}.png` y `/apple-icon`. No se agregó nada a `public/`. | `src/app/pwa-icon.tsx`, `src/app/pwa-icons/[name]/route.tsx`, `src/app/apple-icon.tsx` |
| Metadatos | `viewport.themeColor`, `colorScheme`, `appleWebApp`, `applicationName`. | `src/app/layout.tsx` |
| Sin conexión | Aviso global (`aria-live`, sin `role="status"` para no duplicar los estados de cada pantalla). Informa la pérdida y el regreso de la red. No persiste, no cola ni reintenta solo. | `src/components/connection-status.tsx` |
| Fallo de red en formularios | Mensaje específico si `navigator.onLine` es falso («Sin conexión… tus datos siguen en el formulario… reintentá el mismo envío»). Aplicado a movimiento, edición, selección masiva, catálogos, saldos, categorías, moneda, tasa manual y favoritos. Mensaje base y lógica de idempotencia sin cambios. | `src/components/connection.ts` y los formularios afectados |
| Pérdida del formulario | Con la red caída, `router.refresh()` degradaba a recarga completa y descartaba el formulario (hallazgo CA-065 de F6-01). Ahora el refresco tras el fallo solo se hace con red. Con un envío sin confirmar se avisa antes de recargar (`beforeunload`). | `movement-form.tsx`, `financial-command.ts` |
| Validación | `aria-invalid` automático en el control que rechaza la validación nativa y limpieza al corregirlo; borde y contorno rojos (no solo color). | `src/components/form-validation.tsx`, `globals.css` |
| Menú móvil | `aria-expanded` sincronizado y cierre al pulsar el fondo (Escape y retorno del foco ya los daba `<dialog>`). | `src/components/finance-shell.tsx` |
| Contraste y táctil | Texto de aviso `amber-600`/`red-600` (≈3,4:1) pasa a `amber-400`/`red-400`. Tokens `--muted` y `--accent` faltaban y dejaban sin efecto `bg-accent`, `hover:bg-accent` y `bg-muted/60`. `summary` y vínculos de estadísticas llegan a ≈44 px. Etiquetas de gráficos de 10 y 11 px pasan a 12 px. `prefers-reduced-motion`. | `globals.css`, `notices.tsx`, `statistics-charts.tsx` y otros |
| Pruebas | Ver sección 3. | `tests/unit/pwa-accessibility-f6-03.test.mjs`, `tests/e2e/pwa-f6-03.spec.ts`, `tests/e2e-finance/accessibility-f6-03.spec.mjs` |
| Pruebas existentes | `security-f6-02.spec.mjs`: se incluyen los íconos nuevos entre los archivos públicos y `\bC:\\` evita un falso positivo (ver sección 4). `playwright.config.ts`: variable opcional `PLAYWRIGHT_CHANNEL` (`chrome`, `msedge`) para usar un navegador instalado. Sin la variable no cambia nada. | |

## 2. No se tocó

Lógica monetaria, servicios financieros, idempotencia, autorización, sesiones, cookies, RLS, endpoints, migraciones, `public/card-push-worker.js` ni caché alguna. No hay IndexedDB, `localStorage`, `sessionStorage`, Cache API ni cola de operaciones; la prueba unitaria lo comprueba sobre todo `src/`.

## 3. Evidencia local

Windows, Node 24.19.0, Chrome y Edge instalados (Playwright sin binario descargado), PostgreSQL 17.5 embebido y desechable en `127.0.0.1:55432` con las credenciales públicas de `docs/testing.md`. Datos sintéticos.

| Prueba | Resultado |
| --- | --- |
| `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm run build` | Pasan |
| `npm run test:unit` | 152/152 (7 nuevas) |
| `npm run test:integration` (PostgreSQL desechable) | 131/131, sin omisiones |
| Playwright de acceso, Chrome, 1440×900 y 390×844 | 36/36 (18 nuevas: manifest e íconos, banner sin conexión y reconexión, `aria-invalid`, desborde en 320, 390, 768, 1024 y 1440 px con texto al 200 %, foco visible, sin almacenamiento) |
| Playwright de acceso, Edge | 36/36 |
| Playwright de finanzas, Chrome, ambos viewports, suite completa | 93 de 94 en la primera pasada. El fallo era el falso positivo de la sección 4. Tras corregirlo, `security-f6-02` pasa 10/10 |
| Playwright de finanzas, Edge, `accessibility-f6-03` y `regression` | 18/18 |
| `accessibility-f6-03` (Chrome y Edge) | Menú móvil con teclado, Escape, clic en el fondo, foco devuelto y cierre al pasar a escritorio. 14 pantallas a 360, 768 y 1440 px con un solo `h1`, controles con nombre, sin desborde con texto largo sin espacios ni controles menores de 24 px. Formulario: `aria-invalid`, alerta «Sin conexión», valores conservados, sin «Gasto registrado.» ni saldo cambiado, y éxito solo tras el 201 del reintento explícito |
| Verificación de la prueba | Con el refresco sin proteger (comportamiento anterior), la prueba sin conexión falla; con la protección pasa |

No ejecutado: Firefox y WebKit (no instalados), lector de pantalla real, PWA instalada en iOS/Android, GitHub Actions. Las pantallas se revisaron con aserciones y no con inspección visual humana.

## 4. Hallazgo sobre una prueba de F6-02

El chequeo de filtraciones de errores en `security-f6-02.spec.mjs` buscaba `C:\\` sin límite de palabra y sin distinguir mayúsculas. La carga RSC de la 404 contiene `\nc:\"$Sreact.suspense\"`, y los dos componentes cliente nuevos desplazaron los identificadores hasta que apareció esa secuencia. No es una ruta de Windows. Se cambió a `\bC:\\`. Codex debe confirmar que el cambio no debilita el control.

## 5. Handoff de la etapa A

1. **CA-065 integral.** Ya está probado en el navegador: sin red no se informa éxito, el formulario sigue en memoria, el reintento usa el mismo cuerpo y se informa éxito solo tras la respuesta. Falta validar la idempotencia del reintento con un envío que sí llegó al servidor (ya cubierta en `regression`) combinada con la nueva ruta de mensajes, y revisar que `beforeunload` no estorbe flujos legítimos.
2. **Caché privada y service worker.** No se tocó nada. Revisar que la instalación como PWA no altere `Cache-Control` ni el comportamiento de sesión, y que las rutas `/pwa-icons/*` (dinámicas, con caché pública larga de `ImageResponse`) sean aceptables junto al inventario de F6-02. Las rutas se sirven sin cookies; no se usó `generateStaticParams` porque F6-02 lo prohíbe.
3. **Instalación real.** Probar en iOS Safari y Android Chrome. En modo instalado sin red el navegador mostrará su propia pantalla de error al recargar; sin caché de datos privados esa limitación es intencional. El aviso y la advertencia de recarga la mitigan solo mientras la pestaña sigue abierta.
4. **Lector de pantalla y contraste.** Verificar con NVDA/VoiceOver los avisos (`aria-live` del banner, `role="alert"` de cada formulario) y la ausencia de anuncios dobles. Los errores del servidor siguen siendo un único mensaje por formulario, no por campo: asociarlos con `aria-describedby` exigiría cambiar contratos de error de la API, fuera de esta etapa.
5. **Revisión visual humana** del banner inferior fijo, los controles de 44 px y los gráficos con etiquetas de 12 px a 360 px.
6. **Dependencias de integración.** F6-01 (#59) y F6-02 (#60) siguen abiertos. Esta rama contiene ambos; el PR debe integrarse después de ellos.

## 6. Etapa B · CA-065 y privacidad

La Etapa B continúa desde `fade555` en el [PR #61](https://github.com/SebastianGonzalez2/finanzas-personales/pull/61). Se reprodujo un defecto con Chrome y PostgreSQL 17.6 desechable. El servidor había confirmado el gasto con HTTP 201, pero se perdió la respuesta y también falló la lectura RSC con `navigator.onLine` en `true`. El refresco automático navegó fuera del formulario y eliminó los datos del envío.

El formulario conserva el cuerpo y la clave de idempotencia en memoria hasta recibir confirmación. Tras un fallo de transporte, muestra el error y habilita el reintento sin refrescar. El aviso nativo de salida cubre los envíos en curso o inciertos de este formulario y del hook financiero compartido. En Chrome instalado se canceló una recarga desde ese aviso y se conservó el formulario. La prueba automatizada verifica que el aviso deja de aplicarse tras confirmar el guardado. La pérdida deliberada de la página descarta el formulario en memoria.

| Escenario | Resultado observado |
| --- | --- |
| Desconexión antes del POST | Chrome devuelve `ERR_INTERNET_DISCONNECTED`. La UI conserva el formulario y no anuncia éxito. Otra sesión del titular ve UYU 10.000,00. El reintento explícito recibe 201 y el saldo pasa a UYU 9.500,00. |
| Respuesta perdida después del commit | La primera respuesta 201 se pierde con `ERR_CONNECTION_RESET`. La UI conserva el formulario, muestra el error y mantiene el saldo previo. Una segunda sesión ve el débito real y una entrada de historial. El reintento usa el mismo cuerpo y clave, recibe 200 con el mismo ID y deja un solo movimiento y UYU 9.500,00. |
| PWA instalada en Chrome para Windows | Perfil temporal y cuentas sintéticas. Chrome reportó cero errores de instalación. Se lanzó en modo `standalone` y se comprobó el reintento tras desconectar. Con el worker activo, se cerró la sesión de A, se recorrió el historial de navegación y se entró como B en el mismo perfil. B vio su propio movimiento. Recargar sin red dio el error de red del navegador. Cache Storage, IndexedDB, localStorage y sessionStorage quedaron vacíos. Se retiró la instalación temporal. |

La matriz HTTP verifica `private` y `no-store` en las páginas privadas, respuestas RSC y prefetch. Las APIs financieras usan `private, no-store`. La prueba de cambio de titular incluye reproducción de la cookie revocada (401). Manifest, worker e íconos, incluido `/apple-icon`, se sirven como recursos públicos sin datos de cuenta ni `Set-Cookie`. Los PNG de `next/og` tienen caché pública y se generan solo con nombre, tamaño y arte fijo. El worker mantiene los eventos `push` y `notificationclick`, con texto genérico y apertura de `/avisos`; la página valida la sesión. La matriz conserva la detección de trazas y rutas absolutas de Windows, incluida la variante serializada, y distingue el separador de ruta de la comilla escapada de un identificador RSC.

La prueba en Chrome instalado incluyó la caché de navegación atrás/adelante habilitada. Las páginas abiertas conservan en memoria su vista mientras el documento siga abierto. La recarga y el cambio de sesión recorren la autorización del servidor. El registro y la preferencia push se probaron con suscripción sintética y el worker real. [Caché atrás/adelante en Chrome](https://developer.chrome.com/docs/web-platform/bfcache-ccns) y [protocolo PWA de Chrome](https://chromedevtools.github.io/devtools-protocol/tot/PWA/).

## 7. Etapa B · CA-066

Se revisaron capturas con datos sintéticos a 360 px y en escritorio. El aviso de conexión pasó al flujo de la página para dejar visibles los controles cuando reciben foco. Su anuncio informa el estado de conexión. La alerta del formulario explica el fallo y el reintento. El menú conserva el diálogo nativo y sus controles de teclado.

En Estadísticas, el escalado del SVG reducía las etiquetas a unos 5 px a 360 px. Los dos gráficos usan ancho mínimo en función de su eje y una región desplazable con teclado y nombre accesible. La regresión mide la escala real del texto (al menos 12 px) y verifica el desplazamiento con flechas. Las tablas de datos desplegables también tienen una región de desplazamiento con nombre. Se revisaron teclado, foco visible, retorno de foco, salto al contenido y al título, semántica del árbol de accesibilidad, contraste de estados, validación nativa y alertas.

Capturas del build de producción con datos sintéticos. [Menú a 360 px](../evidence/f6-03/mobile-menu.png), [aviso de desconexión](../evidence/f6-03/mobile-offline-banner.png), [error y reintento](../evidence/f6-03/mobile-offline-retry.png), [gráfico a 360 px](../evidence/f6-03/mobile-charts.png) e [historial en Chrome instalado](../evidence/f6-03/standalone-history.png).

Para repetir la revisión, abrir `/resumen` con datos sintéticos a 360 px. Recorrer menú y formulario con Tab, Enter y Escape. Desconectar desde DevTools al enviar un gasto, verificar el error y reintentar al reconectar. En `/estadisticas`, enfocar el gráfico mensual, moverlo con las flechas y abrir «Ver datos». En escritorio, activar «Saltar al contenido» y navegar a Historial por el menú para verificar el foco en el título.

## 8. Verificación local

| Prueba | Resultado |
| --- | --- |
| Formato, lint, typecheck y build de producción | Aprobados |
| `npm run test:unit` | 152/152 |
| `npm run test:integration` | 131/131 con PostgreSQL 17.6 desechable |
| `npm run test:e2e` | 36/36 en Chrome y 36/36 en Edge |
| `npm run test:e2e:finance` en Chrome, suite completa | 98 aprobadas, 10 variantes móviles de la matriz HTTP se omiten por diseño y se ejecutan en escritorio |
| Finanzas en Edge (accesibilidad, regresión, seguridad, push y estadísticas) | 36 aprobadas, 10 variantes móviles de la matriz HTTP se omiten por diseño y se ejecutan en escritorio |
| PWA instalada en Chrome | Instalación, modo standalone, aviso de recarga con envío incierto, reconexión, reintento y privacidad A/B aprobados |

La primera ejecución de integración falló porque un paquete local de PostgreSQL carecía de la zona UTC. La repetición con binarios completos aprobó. Las primeras pasadas E2E se usaron para reproducir la pérdida de respuesta y ajustar la instrumentación del diálogo y la medición de texto subpíxel.

## 9. Estado y límites

CA-065 y CA-066 tienen validación local en escritorio y viewport móvil Chromium. Quedan pendientes la instalación y la prueba de reconexión en iPhone y Android, Firefox/WebKit, la escucha con lector de pantalla real y la entrega push de un proveedor. El árbol de accesibilidad se revisó en navegador; el orden y la duplicación de anuncios requieren una sesión de escucha. El ADR 0004 exige validar Google OAuth con cuentas reales y HTTPS antes de usar datos financieros reales.

La Etapa B no requiere migraciones. Los PR #59 y #60 siguen abiertos y #61 conserva la base en F6-02. Retargetear a `main` y repetir CI cuando se integren ambos. Siguiente ticket del plan: F6-04, prueba de recuperación de respaldos (CA-062/063).
