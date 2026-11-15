# UI-05 — Plan visual de las pantallas restantes (Glaciar)

**Ticket:** UI-05-DESIGN · **Fecha:** 2026-11-15 · **Estado:** propuesta **pendiente de aprobación del usuario**. Nada de este documento está aprobado hasta su revisión; lo aprobado sigue siendo la [guía visual](ui-identidad-visual.md).

**Alcance:** análisis, diseño y prototipos aislados. No cambia pantallas reales, tokens, fondo, navegación, cálculos, APIs, autenticación, permisos, esquema ni datos.

## 0. Cómo revisar

| Qué | Dónde |
|---|---|
| Prototipos navegables | `http://localhost:3000/prototipos/ui-05` con `npm run dev:google -- --test-login` y sesión Google. Índice con todas las pantallas y sus estados; en cada pantalla, la barra «Prototipo UI-05 · Datos ficticios» cambia de estado (`?estado=`). |
| Capturas 1440 px y 375 px | [`docs/design/ui-05/capturas/`](ui-05/capturas/) y la [página índice local](ui-05/index.html) (se abre con doble clic, sin servidor). |
| Regenerar capturas | `scripts/capture-ui05-prototypes.mjs` (ver cabecera): usa solo el PostgreSQL local desechable de [testing](../testing.md#postgresql-desechable) y las sesiones sintéticas del arnés e2e; sin Google ni Neon. Con `--todos` captura todos los estados. |

**Restricciones de los prototipos:** cada página exige primero sesión y titular en servidor (F6-02: sin sesión, 307 al acceso como el resto de la app) y después solo se muestra en `next dev` local (`_proto/access.ts`: con sesión, cualquier build de producción o despliegue de Vercel responde 404); datos ficticios; ningún botón guarda ni navega a datos reales (Resumen e Historial del menú llevan al prototipo UI-01). El selector de moneda y «Registrar movimiento» del shell no tienen efecto.

**Limitación de las capturas:** se tomaron en Chromium sin GPU y con movimiento reducido, por lo que el fondo es la **capa CSS de respaldo** (regla §4.4 de la guía), no las ondas WebGL. En un equipo con GPU el fondo es el mismo de Resumen e Historial. Al ser capturas de página completa, la capa fija del fondo cubre solo la primera pantalla (por eso se ve un corte de tono más abajo) y la barra flotante móvil aparece al pie; en el navegador ambos acompañan el desplazamiento.

## 1. Inventario de pantallas (derivado del código)

Todas las páginas ya están dentro del shell Glaciar de UI-02 (`FinanceShell`), pero su contenido sigue con el estilo anterior (`Card` + utilidades sueltas, títulos `text-2xl`, formularios con `border` genérico).

| Pantalla | Ruta real | Funcionalidad existente | Componentes actuales | Estados | Complejidad | Riesgo de alterar función |
|---|---|---|---|---|---|---|
| Tarjetas | `/tarjetas` | Catálogo débito/crédito por moneda (deuda, saldo a favor, límite), compras en cuotas por tarjeta, operaciones de crédito (compra, pago, actualizar deuda), alta/edición/archivo, archivadas, avisos de ciclo | `card-catalog` (611 l.), `card-cycle-alerts`, `credit-operation-form` (1081 l.), `installment-*` | normal, vacío, error de carga, «se actualizará la base», guardando/reintentar | Alta | Alta: formularios de crédito con efectos bancarios |
| Resumen de tarjeta | `/tarjetas/[cardId]/resumen` | Ciclo elegido (anterior/siguiente/mes), resumen por moneda (cierre, vencimiento, deuda, estimación, oficial, mínimo, pagos, remanente, diferencia), revisión de compras cerca del cierre, pago del ciclo, fechas excepcionales, calendario habitual, reintegro de saldo a favor | `card-cycle-detail` (650 l.), `refund-form` (`ReturnCreditForm`) | normal, 404, pago abierto (`?accion=pago`), diferencia pendiente, mínimo cubierto | Alta | Alta: pagos, asignaciones y reglas v9.11–v9.21 |
| Fondos de ahorro | `/fondos` | Disponible libre por moneda, equivalencia del total reservado, fondos con meta/fecha/estado, reservar/liberar/traspasar con confirmación, comprometido con tarjeta, aportaciones programadas e historial, cerrar fondo | `savings-fund-catalog` (938 l.), `fund-contributions` (501 l.), `fund-target-notice` | normal, vacío, error, meta alcanzada, pausado, cerrado, pendiente | Alta | Media-alta: dos pasos Revisar → Confirmar |
| Presupuestos | `/presupuestos` | Mes (solo el actual editable), límite por categoría y moneda, subcategorías, consumo con estado, «solo un mes», quitar, cotización manual | `budget-catalog` (819 l.) | normal, vacío, error, otro mes (solo lectura), falta cotización | Media | Media |
| Estadísticas | `/estadisticas` | Mis favoritos / Todas, filtros (período, moneda de visualización y original, tipo, categoría, medio, tarjeta, etiquetas, comparación), 7 módulos (`statisticsChartIds`), profundización categoría → subcategoría → movimientos, tablas de saldos/patrimonio y recurrentes, favoritos | `statistics-dashboard` (607 l.), `statistics-charts` (662 l.), `statistics-tables` (443 l.), `statistics-filters`, `statistics-favorite-button` | favoritos, todas, sin favoritos, sin datos, error, conversión no disponible | Alta | Media: solo lectura, pero muchos datos y accesibilidad de gráficos |
| Informes | `/informes` | Exportar período en CSV/Excel/PDF, contenido del informe (`REPORT_SECTIONS`) | `informes-panel` | normal, generando, error | Baja | Baja |
| Recurrentes | `/recurrentes` | Series gasto/ingreso (frecuencia, vencimiento, compartida), pausar/reanudar, día de vencimiento, seguimiento por período (pagado, parcial, omitido), registrar/vincular/desvincular movimientos, distribuir pagos, alta | `recurrence-form`, `recurrence-lifecycle-form`, `recurrence-settlement-form` (678 l.), `recurring-share-fields`, página de 422 l. | normal, vacío, error, pausada, finalizada | Alta | Alta: vínculos con movimientos reales |
| Deudas y préstamos | `/deudas` | Deudas por pagar / Dinero por cobrar, estado (pendiente, saldada, pendiente de conciliación), alta de obligación (4 orígenes) | página + `loan-form` (411 l.) | normal, vacío por columna, error | Media | Media: capital ≠ ingreso/gasto |
| Detalle de obligación | `/deudas/[id]` | Pendiente, contacto, estado, cuota, vencimiento, gasto de origen, registrar operación (pago, cobro, intereses, actualizar pendiente), historial | página (205 l.) + `loan-form`, `loan-operation-detail` | normal, 404, conciliación | Media | Media-alta |
| Beneficios bancarios | `/beneficios` | Registro de cashback/bonificación (Bancos o abono en tarjeta) con revisión y confirmación, lista y anulación | `bank-benefit-form` (352 l.) | normal, vacío, error, base no actualizada | Media | Media |
| Categorías | `/categorias` | Gastos/Ingresos con subcategorías, crear, archivar/restaurar | `category-catalog` | normal, error | Baja | Baja |
| Comercios y contactos | `/catalogo` | Catálogo privado, agregar, archivar, unificar duplicados con vista previa, gastos por comercio del mes | `name-catalog` (349 l.) + página | normal, vacío, error | Media | Baja-media |
| Etiquetas | `/etiquetas` (desde Historial) | Crear, renombrar, archivar/restaurar | `tag-catalog` | normal, vacío, no disponible | Baja | Baja |
| Avisos | `/avisos` | Tarjetas, deudas, recurrentes, presupuestos (80/100 %), metas de fondos, aportaciones, push opcional, resueltos | página (263 l.), `due-notices`, `notices`, `card-push-preference` | normal, sin avisos, error | Media | Baja: push con estados del navegador |
| Ayuda | `/ayuda` | 16 secciones de preguntas (`domain/ayuda.ts`) sin buscador ni filtros (M-03), repetir tutorial | `ayuda-faq` | normal | Baja | Baja (UI-06 cambia el tutorial) |
| Mi cuenta | `/account` | Cuenta Google conectada y cierre de sesión, descargar copia (con contraseña opcional), verificar y restaurar copia, eliminar cuenta | `google-access`, `account-backup` (292 l.), `account-deletion` | normal, restaurar, eliminar, errores | Media | Alta: acciones destructivas |

No se encontraron más pantallas pendientes: `/historial/[source]/[id]` pertenece a Historial (UI-04) y `/auth/sign-in` ya tiene el fondo de UI-02.

## 2. Componentes reutilizables (ya aprobados)

| Pieza aprobada | Origen | Uso en UI-05 |
|---|---|---|
| Shell, riel, barra móvil, cajón, barra superior, fondo | UI-02 (`finance-shell`, `globals.css`) | Sin cambios en todas |
| Encabezado `.f-pagehead` + `.c-eyebrow` + `.f-title` | Resumen/Historial | Todas (eyebrow = grupo del menú) |
| `.lab-panel` y su cabecera con icono | `glaciar-summary` | Paneles de lectura |
| `.lab-stepper` (mes) | Resumen | Presupuestos, ciclo de tarjeta |
| `.b-card` tarjetas dibujadas | Resumen | Catálogo de tarjetas |
| `.b-notice` (info/advertencia/crítico) | Resumen | Avisos, diferencias, errores |
| `.lab-tag` / `.lab-meter` / `BudgetList` | Resumen | Estados, presupuestos, ciclo |
| `ProgressRing`, `CategoryDonut`, `CashflowChart`, `ChartLegend`, tabla equivalente | Resumen | Fondos, Estadísticas |
| `.lab-kind`, `.lab-chip(s)`, `.lab-link` | Historial/Resumen | Listas, filtros activos |
| `Field`, `Input`, `Select`, `Textarea`, `SearchField`, `Segmented`, `Button` | `components/ui` | Todos los formularios |
| Colores de datos y estados | Guía §3 | Gráficos y estados (siempre con texto/icono) |

## 3. Propuesta visual por módulo

Patrón común (**P-01**): encabezado con eyebrow del grupo, título, descripción breve y acción principal a la derecha; fila de indicadores cuando la pantalla tiene cifras clave; rejilla de 12 columnas como Resumen (8+4 o 7+5 en escritorio, una columna en móvil); formularios en vidrio nivel 3 abiertos **en la página** (como hoy), no en modales; errores y vacíos con el mismo componente en todos los módulos.

- **Tarjetas (A):** tarjetas dibujadas (2 columnas) con emisor, tipo, deuda por moneda, límite o saldo a favor, avance del ciclo, cierre/vencimiento y acciones «Resúmenes y ciclos», «Registrar pago» y menú «Más acciones» (compra, actualizar deuda, editar). Columna lateral con avisos de tarjetas y archivadas; compras en cuotas en panel propio. Alta/edición: monedas como segmentado y una sección por moneda.
- **Resumen de tarjeta (B):** indicadores (cierre, vencimiento, avance, compras por revisar) + un panel por moneda con «Remanente estimado» grande, lista de cifras del resumen, diferencia como aviso y acciones. Revisión de compras en tabla (filas apiladas en móvil). Fechas excepcionales, calendario y reintegro en acordeón. Pago en formulario de dos pasos.
- **Fondos (C):** fila de indicadores (equivalencia del total reservado + disponible libre por moneda), fondos en tarjetas con anillo de meta, reservado grande, comprometido con tarjeta y programación; lateral con aportaciones (línea de tiempo con acciones) y fondos cerrados. Operaciones con resumen «Antes/Después» y lista «Qué cambia al confirmar».
- **Presupuestos (C):** stepper del mes + «Crear presupuesto»; barras por categoría con subcategorías sangradas, estado con icono y texto, excepción del mes visible bajo la barra y menú por fila; cotización manual en el lateral. Alta con alcance «Límite habitual / Solo este mes».
- **Estadísticas (D):** pestañas «Mis favoritos / Todas» como segmentado; barra de filtros densa (4 visibles + «Más filtros») con chips de filtros activos; cada módulo es un panel con estrella de favorito; indicadores con variación (texto + icono), flujo espejado y anillo reutilizados de Resumen; medios de pago e ingresos por categoría en barras horizontales; recurrentes en barra de proporción; histórico en tabla. Profundización con migas y tabla de movimientos paginada.
- **Informes (D):** formulario (fechas + formato como tarjetas elegibles) y lateral con el contenido real del informe en acordeón.
- **Recurrentes (E):** lista + detalle: lista de series con tipo, frecuencia, importe y estado del período actual; panel de la serie elegida con datos, acciones de serie y línea de tiempo por período con «Completar pago / Vincular / Omitir». Registrar pago con resumen del restante.
- **Deudas (F):** dos columnas «Deudas por pagar» y «Dinero por cobrar» con filas (importe, estado, vencimiento). Detalle: indicadores (pendiente, cuota, vencimiento, estado), operación en dos pasos con efectos (capital vs. intereses) e historial en línea de tiempo.
- **Beneficios (F):** formulario con destino elegible y paso de confirmación con efectos; lista de beneficios (anulados tachados).
- **Catálogos (G):** Categorías en árbol (gastos con color fijo de datos, ingresos, archivadas); Comercios con alta en línea, lista con tipo y alias, unificación con vista previa y tabla «Gastos por comercio»; Etiquetas como chips con acciones.
- **Avisos (H):** grupos por módulo en paneles con contador, avisos con tono e icono y acción directa; lateral con deudas, recurrentes, avisos al celular y resueltos.
- **Ayuda (H):** sin buscador ni filtros (M-03): secciones en acordeón en dos columnas equilibradas, «Volver a ver tutorial» como acción del encabezado.
- **Mi cuenta (H):** cuenta conectada, copias de seguridad en acordeón (restaurar con aviso y casilla de confirmación) y zona de peligro diferenciada para eliminar la cuenta.

## 4. Prototipos creados

`src/app/prototipos/ui-05/`: `page.tsx` (índice), `[pantalla]/page.tsx` (16 pantallas), `_proto/screens.ts` (registro de pantallas, estados y subticket), `_proto/shell*.tsx` y `nav.tsx` (shell con las piezas reales), `_proto/kit.tsx` (piezas comunes propuestas), `_proto/proto.css` (estilos nuevos, solo `.ui05*`), `_proto/screens/*.tsx` (módulos). Capturas: los 54 estados de las 16 pantallas más el índice, a 1440 y 375 px (110 JPEG, 8,4 MB), página completa.

## 5. Decisiones nuevas propuestas (pendientes de aprobación)

| ID | Propuesta | Tipo | Motivo |
|---|---|---|---|
| P-01 | Kit de pantalla común: `PageHead`, `Kpi`, `EmptyState`, `ErrorState`, `FormPanel`, `Review` + `Effects`, filas, línea de tiempo, acordeón, menú «Más acciones», zona de peligro. Pasaría a `src/components/glaciar/` y `src/app/glaciar-screens.css` (todo bajo `@layer components`). | Componente **global nuevo** (no modifica los existentes) | Coherencia entre 16 pantallas y PR más chicos (**aplicada en UI-05A**) |
| P-02 | Eyebrow = grupo del menú (General, Planificación, Crédito, Catálogos, Tu cuenta) | Visual | Orientación, igual que la fecha en Resumen |
| P-03 | Paso de confirmación con «Qué cambia al confirmar» (efectos en Bancos, deuda, gastos) | Visual sobre textos existentes | Seguridad financiera: hace visible que un pago de tarjeta no duplica gasto, que el capital no es gasto, etc. |
| P-04 | Menú «Más acciones» (`<details>`) en tarjetas y filas de presupuesto | Interacción nueva | Evitar 5 botones por tarjeta (**aplicada en UI-05A**) |
| P-05 | Fila de contadores de estado en Presupuestos (en rango / cerca / excedido / sin calcular) | **Dato derivado nuevo** (conteo de estados existentes) | Lectura rápida; se puede omitir |
| P-06 | Recurrentes en lista + detalle (hoy cada serie se expande completa en una lista larga) | Reorganización | Menos saturación; mismas acciones (**aplicada en UI-05E**) |
| P-07 | Estadísticas: filtro «Moneda de visualización» movido a «Más filtros» y por defecto la moneda del selector superior | **Cambio de comportamiento: decidir** | Hoy convive con el selector global (v9.46); conserva la opción «Por moneda original» |
| P-08 | Descripciones nuevas en encabezados sin texto actual (Recurrentes, Deudas, Avisos, Etiquetas) | Textos | Coherencia; textos editables |
| P-09 | Estados vacío con acción principal y texto explicativo en todos los módulos | Visual + textos | Hoy son frases sueltas |
| P-10 | Botón destructivo (`ui05-btn-danger`) para archivar/eliminar/restaurar copia | Variante nueva de botón | Diferenciar acciones irreversibles (**aplicada en UI-05A**) |

Los prototipos muestran algunas cifras derivadas solo como ejemplo (p. ej. «faltan N días», conteos): al implementar, **solo se muestran datos que la app ya calcula**; lo demás se consulta o se omite.

## 6. Distribución recomendada en subtickets

La provisional de 5 tickets se divide en 8: Tarjetas y Resumen de ciclo concentran los formularios de mayor riesgo (≈ 2.300 líneas de componentes) y Recurrentes sola supera las 1.100 líneas. Orden: **A primero** (crea el kit); luego B–H en cualquier orden, de a uno por rama/PR.

| Ticket | Pantallas | Reutiliza | Implementa | Dependencias | Riesgos | Pruebas | Criterios de aceptación | Agente · esfuerzo |
|---|---|---|---|---|---|---|---|---|
| **UI-05A** Kit y Tarjetas | `/tarjetas` | Shell, `.b-card`, `.b-notice`, `components/ui` | Kit P-01 (+ prueba de CSS sin prefijo como el HOTFIX), catálogo, alta/edición, menú P-04 | UI-04 integrado; aprobación de P-01/P-04/P-10 | Romper formularios de crédito; selectores e2e | `cards`, `credit-operations`, `credit-installments`, `mixed-purchases`, `accessibility-f6-03`, unitarias, revisión 1440/375 | Importes y acciones idénticos; teclado y foco; estados vacío/error; sin almacenamiento; ningún cambio en APIs | **Opus · alto**: fija el kit que heredan todos |
| **UI-05B** Resumen de ciclo | `/tarjetas/[cardId]/resumen` | Kit, stepper, `.lab-meter` | Paneles por moneda, revisión, pago en dos pasos | A | Asignación de pagos, fechas excepcionales, reintegros | `card-cycles`, `refunds`, `card-push`, regresión | Mismas cifras y reglas v9.11–v9.21; pago no duplica gasto | **Codex (Sol High) · alto**: flujos de dinero |
| **UI-05C** Fondos y Presupuestos | `/fondos`, `/presupuestos` | Kit, `ProgressRing`, `BudgetList`, stepper | Tarjetas de fondo, aportaciones, filas de presupuesto | A; P-05 | Dos pasos de reservas; excepciones del mes | `savings-funds`, `fund-targets`, `fund-coverage`, `scheduled-contributions`, `budgets`, `notices` | Fondos sin efecto bancario; presupuestos sin arrastre | **Sonnet · medio** |
| **UI-05D** Estadísticas e Informes | `/estadisticas`, `/informes` | Kit, `CashflowChart`, `CategoryDonut`, `ChartLegend` | Barra de filtros, paneles con favorito, barras horizontales, migas | A; P-07 | Accesibilidad de gráficos; paleta de datos; favoritos | `statistics`, `exports`, unitarias de estadísticas | Gráficos con tooltip por teclado y tabla equivalente; paleta validada; favoritos sin cambios | **Opus · alto**: visualización compleja |
| **UI-05E** Recurrentes | `/recurrentes` | Kit, `.lab-kind`, línea de tiempo | Lista + detalle (P-06), formularios de período | A; P-06 | Vínculos con movimientos; períodos compartidos | `recurrences`, `recurrence-settlements`, `recurring-shares`, `recurrence-*` unitarias | Mismas acciones y estados de período | **Codex (Sol Medium) · medio-alto** |
| **UI-05F** Deudas y Beneficios | `/deudas`, `/deudas/[id]`, `/beneficios` | Kit, línea de tiempo | Columnas, detalle, confirmación con efectos | A | Capital vs. intereses; anulación | `loans`, `shared-expenses`, `bank-benefits` | Capital no es ingreso/gasto; beneficio una sola vez | **Sonnet · medio** |
| **UI-05G** Catálogos | `/categorias`, `/catalogo`, `/etiquetas` | Kit, chips | Árbol, unificación | A | Archivar/restaurar | `categories`, `catalog`, `classification` | Archivados ocultos en formularios, visibles en historial | **Sonnet · bajo-medio** |
| **UI-05H** Avisos, Ayuda y Mi cuenta | `/avisos`, `/ayuda`, `/account` | Kit, `.b-notice`, acordeón | Grupos de avisos, zona de peligro | A; coordinar con UI-06 (Ayuda/tutorial) | Restaurar/eliminar cuenta; push | `notices`, `card-push`, `account-deletion`, `ayuda`, `tutorial`, `security-f6-02` | Confirmaciones destructivas intactas; push con todos sus estados | **Sonnet · medio** (Opus si se cambia el flujo de borrado) |

Todos: solo presentación, `npm run check`, unitarias, e2e financieros en CI, revisión visual en 1440 y 375 px, `prefers-reduced-motion` y foco visible. Al terminar UI-05H se pueden retirar los prototipos `ui-05` (junto con `/prototipos/ui` en UI-06).

## 7. Verificación de esta entrega

- `tsc --noEmit`, ESLint y Prettier sobre los archivos nuevos; 240 pruebas unitarias (incluye F6-02 «toda página exige sesión» y el CSS de vidrio).
- `next build` en una copia aislada y `next start`: **sin sesión, 307 al acceso** (igual que `/resumen`; lo exige la e2e F6-02) y **con sesión sintética, 404** en `/prototipos/ui-05`, `/prototipos/ui-05/tarjetas` y `?estado=` (una página real, `/fondos`, responde 200). La primera versión decidía el 404 en el layout y la e2e F6-02 falló en CI; se corrigió moviendo la guarda a cada página, después de la verificación de sesión.
- Capturas con `next dev` + sesión sintética sobre PostgreSQL 17.6 local desechable: las 108 vistas cargaron con sesión válida y sin errores; revisión visual del agente de Tarjetas, Estadísticas, Fondos, Recurrentes, Presupuestos y Mi cuenta (se corrigieron hueco de paneles plegables, variación de ingresos con flecha errónea, acciones de tarjeta en 375 px y aviso apilado).
- No se ejecutaron e2e financieros (no hubo cambios en pantallas reales) ni pruebas con lector de pantalla.

## 8. Riesgos y dependencias

- **Selectores e2e:** cambiar el marcado obliga a ajustar selectores sin reducir cobertura (como en UI-02/UI-04). Preferir roles y nombres accesibles.
- **Rendimiento del vidrio:** más paneles con `backdrop-filter` en pantallas largas (Estadísticas, Avisos); medir en móvil de gama baja y usar vidrio 3 en tablas y formularios.
- **Textos legales y de efectos:** los textos que explican efectos contables ya existen; no reescribirlos al rediseñar.
- **UI-06** cambia el tutorial y agrega una pregunta en Ayuda: coordinar con UI-05H.
- **Cifras derivadas:** cualquier dato que la app no calcule hoy (§5) requiere aprobación o se omite.

## 9. Pendiente de aprobación del usuario

1. Aprobar o ajustar la propuesta visual de cada pantalla (capturas y prototipos).
2. Decidir P-01 a P-10, en especial **P-05** (contadores), **P-06** (lista + detalle en Recurrentes) y **P-07** (moneda de visualización en Estadísticas).
3. Aprobar la división en 8 subtickets (o fusionar G y H si se prefieren menos PR).
4. Confirmar los agentes y esfuerzos recomendados.
