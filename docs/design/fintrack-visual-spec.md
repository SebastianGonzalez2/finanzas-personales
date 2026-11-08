# Especificación visual de FinTrack

[Captura de referencia](../fintrack-original.jpeg)

**Ticket:** F0-02 · **Fecha:** 2026-11-07 · **Estado:** especificación para revisión; sin UI implementada.

## 1. Autoridad y uso

Prevalece el [producto v9.48](../product/decisiones-producto.md), en especial §§1–2, 11 y 12.1, sobre esta guía y sobre cualquier detalle de la captura. Los [RF/RNF](../planning/01-alcance-y-requisitos.md), [CA](../planning/03-criterios-de-aceptacion.md) e [invariantes](../planning/02-modelo-de-dominio-y-datos.md) delimitan el comportamiento. Entrega documental de [F0-02](../planning/05-plan-de-implementacion.md); implementar layout pertenece a F1-01 y las funciones a sus tickets.

Esta guía distingue tres niveles:

- **Confirmado por producto:** estética oscura, sidebar, header, tres indicadores, pestañas, referencia de cuatro columnas, español, dashboard fijo, estadísticas separadas y responsive. No cambiar estas decisiones al implementar.
- **Convención de F0-02 para revisión:** tokens CSS, fuente de sistema, breakpoints, rutas sugeridas, correspondencia concreta de columnas y estados no visibles. Son decisiones de diseño derivadas para eliminar ambigüedad, no nuevas aprobaciones funcionales atribuidas al usuario. Tras aceptar este ticket constituyen la base de implementación; cualquier ajuste posterior se documenta con evidencia visual.
- **Observación del JPEG:** el apéndice A conserva las medidas y descripciones de la guía local. Sus textos en inglés, colores de poco contraste, importes y controles no son requisitos funcionales ni datos para sembrar la app.

Se resuelve la discrepancia de F0-01: máxima fidelidad estética permite adaptar etiquetas, contenido, botones y destinos a lo aprobado (§2 del producto). Se sustituyen las reglas locales que exigían copiar toda la estructura en cualquier ancho y prohibían elementos necesarios para los flujos aprobados. El marco gris queda fuera de la app. No copiar el nombre/logo Fintrack, avatares, correo ni datos de la captura; nombre definitivo pendiente. Usar «Finanzas personales» como título descriptivo provisional, sin inventar una marca.

**Límites:** dashboard sin arrastrar, reordenar, añadir, ocultar widgets ni ocultar importes. Favoritos solamente en Estadísticas (v9.44); sin botón de ojo/asteriscos (v9.46). No copiar Inversiones, Efectivo, Compartir o avatares colaborativos, importar extractos, adjuntar comprobantes, micrófono/IA, clonar movimientos ni crear operaciones offline. Ningún control visible debe prometer una función aún no implementada en el incremento en revisión.

## 2. Tokens de implementación

Valores en CSS px a escala 100%; usar rem para tipografía y medidas escalables (base 16 px), nunca fijar el zoom. El apéndice contiene mediciones del JPEG; estos tokens normalizan aproximaciones sin cambiar su lenguaje visual. Un solo tema oscuro en este alcance; no añadir selector de tema.

### 2.1 Color y contraste

| Token semántico | Valor | Uso |
| --- | --- | --- |
| `canvas` / `surface` | `#131313` | Fondo principal y tarjeta |
| `sidebar` / `well` | `#0F0F0F` | Lateral y fondo de columna |
| `input` | `#161616` | Entrada, selector y buscador |
| `hover` | `#181818` | Hover de fila/acción neutra |
| `selected` | `#1E1E1E` | Destino o pestaña activa |
| `border-subtle` | `#262626` | División decorativa y contorno de tarjetas |
| `border-control` | `#707070` | Límite identificable de inputs, checkbox y radio |
| `text-primary` | `#FFFFFF` | Títulos, valores y acción principal |
| `text-secondary` | `#A3A3A3` | Cuerpo secundario, fecha, nota, placeholder |
| `text-muted` | `#949494` | Metadatos menos prominentes, nunca invisibles |
| `primary` / `primary-hover` / `primary-pressed` | `#3558D4` / `#3B5FDC` / `#2D4FC5` | Botón con texto blanco; azul de la referencia ajustado para lectura |
| `focus` / `info` | `#C0CEFF` / `#9AAFFF` | Anillo de foco / enlace e información |
| `success` | `#4ADE80` sobre `#13271B` | Confirmación, cobro/pago completo |
| `warning` | `#FBBF24` sobre `#2C2312` | Pendiente, parcial, estimación advertida |
| `danger` | `#F87171` sobre `#301919` | Error, vencido, acción destructiva |
| `neutral` | `#D4D4D4` sobre `#232323` | Calculado, anulado, archivado |
| `violet` | `#C4A0FF` sobre `#251B34` | Fondo/meta, sin atribuir estado de pago |
| `track` | `#28282A` | Pista de progreso |
| `chart-blue` / `chart-green` | `#8196FF` / `#22C55E` | Serie ingreso / consumo |
| `chart-violet` / `chart-orange` | `#A970FF` / `#FB713F` | Series de fondos y acentos de saldo |

No derivar texto legible de los píxeles antialias del JPEG. El borde tenue de una tarjeta puede ser decorativo; el borde necesario para identificar un input usa `border-control`. No usar el degradado azul medido como fondo arbitrario de texto blanco: la variante principal es sólida y comprobable. Gráficos usan los tokens de serie sobre `track` o `surface`, con texto y patrones/marcadores además del color; las barras oscuras del JPEG no representan datos en la app.

Objetivo RNF-07: todo texto informativo de estos tokens alcanza al menos 4,5:1 con su fondo especificado; contornos funcionales, foco y series esenciales al menos 3:1 frente a superficies adyacentes. Referencias oficiales: [W3C contraste de texto](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html) y [contraste no textual](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html). El cálculo de pares sólidos no certifica la accesibilidad de una UI todavía inexistente: comprobar composición, overlays y estados al implementar.

### 2.2 Tipografía y cifras

Fuente inicial: `system-ui, -apple-system, "Segoe UI", sans-serif`, sin descarga externa ni nueva dependencia. La familia exacta del JPEG no está identificada. No reproducir el logotipo serif; tampoco instalar una fuente para imitarlo. Pesos de implementación 400, 500, 600 y 700, sin valores intermedios supuestamente medidos.

| Rol | Tamaño / interlínea | Peso | Regla |
| --- | --- | --- | --- |
| Cifra KPI | 42 / 48 (móvil 32 / 40) | 600 | Moneda siempre visible; puede bajar a 32 en escritorio si no cabe |
| Título de página | 20 / 28 | 600 | Un `h1` por pantalla |
| Título sección | 18 / 24 | 600 | `h2`, columnas con `h3` |
| Importe tarjeta | 26 / 32 (móvil 24 / 32) | 600 | No truncar ni abreviar el valor |
| Cuerpo, campo, navegación | 16 / 24 | 400; activo 600 | Input móvil mínimo 16 |
| Etiqueta/control compacto | 14 / 20 | 500 | No usar todo mayúsculas en etiquetas largas |
| Metadatos, estado, fecha | 12 / 16 | 400; badge 500 | No usar para importe principal ni etiqueta de campo |

Importes con cifras tabulares (`tabular-nums`), alineados a la derecha en tablas y a la izquierda en tarjetas. Formato visual español Uruguay: `UYU 10.000,00`, `USD 100,00`, `EUR 50,00`; dos decimales visibles en valores monetarios de UI, sin perder precisión original almacenada. No usar `$` sin código; signo menos matemático para salida en historial y tipo explícito «Gasto», «Pago de tarjeta», «Capital cobrado», etc. KPI de gastos muestra magnitud positiva con etiqueta. Entrada admite coma o punto decimal según §6; formatear no autoriza convertir por `number` binario.

Sin saldo inicial: «Sin configurar», no `0,00`. Cero confirmado/resultado real vacío del período: `UYU 0,00` con su contexto. Datos ausentes o conversión faltante: «No disponible», nunca un cero inventado. Fechas `07/11/2026`, período «Noviembre de 2026»; en metadatos se puede usar «7 nov 2026». Una fecha bancaria confirmada no se sustituye por fecha de última consulta.

### 2.3 Espacio, forma y capas

Escala: 4, 8, 12, 16, 24, 28, 32, 48 px. Excepciones deliberadas de referencia: separación de KPI 14 px y sidebar 308 px. Padding KPI 24; tarjetas interiores 16; columna 8; formulario 24 escritorio/16 móvil; separación etiqueta-campo 8, campos 16, grupos 24. Bordes 1 px sólidos.

Radios: KPI 18; columna 16; tarjeta 12; control 8; badge 4; avatar personal opcional 8; chip contador 6. No encerrar toda la app en el panel redondeado con margen gris. Sin sombras en tarjetas; overlay `0 16px 48px #00000066`, scrim negro al 60%. Capas: contenido 0, sidebar/header 10, menú/popover 20, scrim/modal/drawer 40/50, avisos temporales 60. Solo el overlay superior recibe interacción; ningún aviso debe tapar el control enfocado.

Controles de altura y área interactiva mínima **44 × 44 px** como convención del proyecto, incluso si el icono mide 16/20. Botón normal: padding 12 horizontal, gap icono-texto 8, fuente 14/20; ancho según texto. Deshabilitado: fondo `hover`, texto `text-muted`, borde `border-control`, sin disminuir opacidad global; retirar eventos y mantener motivo visible. No reducir el área táctil para copiar botones pequeños del JPEG. Transiciones de color/opacidad de 120 ms, apertura de panel de 160 ms; sin animar saldos ni barras como si fueran movimientos reales. Con movimiento reducido del sistema: sin desplazamiento ni animación no esencial.

## 3. Shell y responsive

Aplicación al 100% del viewport, altura mínima `100dvh` con fallback `100vh`. Desplazamiento vertical del documento; sidebar escritorio puede tener scroll propio si no cabe en altura. Header en flujo (no fijarlo sobre contenido); no añadir barras fijas al pie. El contenido admite `min-width: 0`; ninguna tarjeta obliga al documento a desplazarse horizontalmente.

### 3.1 Anchos y reordenación fija

| Viewport CSS | Navegación / padding principal | Indicadores | Tablero / formularios |
| --- | --- | --- | --- |
| 320–767 px | Drawer cerrado por defecto; header mínimo 64 alto, puede crecer; padding 16 | Una columna; gap 14 | Una columna, gap 16; formulario una columna |
| 768–1023 px | Drawer; padding 24 | Tres columnas iguales | Dos columnas, gap 8; formulario dos columnas solo campos cortos |
| 1024–1439 px | Sidebar 260; padding 24 | Tres columnas iguales | Dos columnas, gap 8 |
| Desde 1440 px | Sidebar 308; padding 28 | Tres columnas iguales | Cuatro columnas iguales, gap 8 |

A partir de 1920 px, ancho máximo del contenido principal 1536 px centrado dentro del espacio restante; sidebar permanece al borde izquierdo. Cada track usa `minmax(0, 1fr)`. A 1484 px: 308 de sidebar + 56 de padding + 1120 de contenido; referencia de KPI `(1120 − 28)/3 = 364 px`, y columnas `(1120 − 24)/4 = 274 px`. No fijar alturas de tarjetas: KPI mínimo 209, columna con altura por contenido. A 768 px hay 692 px de ancho útil tras padding y gaps para los tres KPI; permitir contexto en varias líneas e importe de 32 px para evitar desbordes.

Orden DOM/lectura invariable: enlace «Saltar al contenido», navegación, header, título/contexto, avisos persistentes si existen, indicadores 1–3, navegación de secciones, columnas 1–4. En dos columnas se muestran 1/2 y debajo 3/4; en móvil 1, 2, 3, 4. No usar masonry, arrastre ni scroll horizontal de columnas. Las tarjetas pueden crecer y las columnas quedar desiguales sin reordenar elementos.

Header escritorio: breadcrumb «Finanzas › Resumen», acceso a búsqueda de Movimientos (ancho hasta 304), Notificaciones y «Registrar movimiento». Sin Exportar global ni Compartir. Bajo 1440, buscar se reduce a icono con nombre accesible «Buscar movimientos»; bajo 1024 añadir botón «Abrir navegación». En móvil breadcrumb corto «Resumen», iconos de búsqueda/notificaciones en primera fila, «Registrar movimiento» en segunda fila a todo ancho si hace falta. El título de página y selector de moneda van debajo; a menos de 768 se apilan. El selector jamás desplaza fuera del ancho el título o el importe.

Drawer: ancho `min(308px, 100vw − 32px)`, alto `100dvh`, scrim, título «Navegación», botón «Cerrar navegación». Al abrir, foco al cierre/primer destino; Tab se mantiene dentro, Escape cierra y devuelve foco al disparador; seleccionar destino cierra. Fondo inerte mientras está abierto. No conservar un sidebar invisible con enlaces enfocables. Al cambiar a escritorio, cerrar drawer, retirar bloqueo e inercia y mover foco al destino equivalente si estaba dentro.

### 3.2 Sidebar y destinos

Padding 16 en variante 260 y 22 en variante 308; filas 44 mínimo, icono lineal 20, gap 12. Secciones separadas 24; etiquetas 14/20. Activo: superficie `selected`, texto blanco, peso 600, marca vertical `focus` de 2 px y `aria-current="page"`. Hover `hover`; foco según §7. Grupos siempre visibles en este diseño; sin árbol colapsable ni duplicación de «Cuentas». Cuenta personal y Configuración al final por `margin-top: auto`, sin posición absoluta ni retrato de muestra.

| Grupo / orden | Etiqueta → destino sugerido | RF / fase |
| --- | --- | --- |
| Inicio | Resumen → `/resumen`; Estadísticas → `/estadisticas` | RF-044/045, F1-01/F5 |
| Actividad | Movimientos → `/movimientos`; Recurrentes → `/recurrentes` | RF-011/033, F1/F4 |
| Finanzas | Bancos → `/bancos`; Tarjetas → `/tarjetas`; Deudas por pagar → `/deudas`; Dinero por cobrar → `/por-cobrar` | RF-005/014/022, F1/F2 |
| Organización | Fondos de ahorro → `/fondos`; Presupuestos → `/presupuestos` | RF-026/031, F3 |
| Cuenta | Configuración → `/configuracion`; perfil y Cerrar sesión | RF-003/039/041/049, F0/F5 |

Rutas propuestas para coherencia, sin crear archivos ni comprometer APIs en F0-02. Categorías, etiquetas, comercios, contactos y respaldos se acceden desde Configuración o el flujo aprobado correspondiente; no crear nuevos módulos por un icono de ejemplo. Notificaciones es acceso de header (RF-037/038). En entregas incrementales ocultar destinos no implementados; preservar orden relativo y zonas vacías explicativas del dashboard. Sin enlaces `#` que aparenten funcionar. Buscar abre Movimientos y su filtro de texto; no agregar buscador global ni atajo `⌘K` inoperante. «Ingresos»/«Gastos» son filtros del historial, no copias del mismo registro.

## 4. Dashboard fijo: contenido y ejemplo

### 4.1 Composición operativa

Título «Resumen financiero», subtítulo «Noviembre de 2026 · Datos registrados», mes actual del titular y selector «Moneda de visualización» UYU/USD/EUR. USD por defecto hasta elección; la elección se recuerda por cuenta entre sesiones/dispositivos (RF-046, v9.46), sin modificar importes originales. Períodos históricos/filtros profundos pertenecen a Estadísticas/Movimientos, sin sumar herramientas complejas al dashboard.

| Posición fija | Contenido | Datos y límite |
| --- | --- | --- |
| Indicador 1, acento naranja | **Dinero disponible**; debajo «Saldo bancario registrado» y «Reservado y comprometido» | Cifra protagonista libre de reservas/compromisos aplicables; desglose por moneda y estado. No llamar «saldo real verificado» a una proyección |
| Indicador 2, acento azul | **Ingresos del mes**; comparación con mes anterior si hay datos comparables | Solo ingresos ordinarios realmente acreditados; sin capital prestado ni cobros ajenos |
| Indicador 3, acento verde | **Gastos del mes**; «X% de los ingresos» si denominador válido | Compras/consumo propio imputado al mes; sin pagos de tarjeta como nuevo gasto ni reintegros de otro mes restados |
| Franja «Mis finanzas» | Resumen (activo), Presupuestos, Movimientos, Fondos | Enlaces estilizados como pestañas hacia sus pantallas; `aria-current`, sin simular tabpanel si cambia ruta |
| Columna 1 | **Recurrentes** | Período actual, próximos compromisos con fecha cierta primero, luego fecha ascendente; empates por identificador estable; no mover banco al mostrarlos |
| Columna 2 | **Gastos recientes** | Últimos gastos registrados, fecha descendente y desempate estable; consumo propio explícito |
| Columna 3 | **Fondos de ahorro** | Nombre ascendente y desempate estable; reservado, moneda, meta/fecha si existen; no duplicar «Metas» como otro saldo |
| Columna 4 | **Ingresos recientes** | Acreditaciones reales, fecha descendente y desempate estable; esperado de recurrente no suma aquí |

Por columna mostrar hasta tres tarjetas y enlace «Ver todos» al módulo; contador indica total de registros que cumplen el criterio, no siempre `3`. El enlace permanece cuando el contador es mayor que lo mostrado. Una columna sin datos mantiene su posición y estado vacío, sin crear ejemplos de muestra. Incrementos previos al módulo muestran «Disponible en una próxima etapa» sin CTA falso. Ocultar funcionalidad no construida no habilita al usuario a personalizar el dashboard.

Cada indicador tiene etiqueta, cifra completa, contexto/estado y minigráfico derivado si hay datos. El gráfico de puntos del saldo puede representar la evolución registrada del disponible con resumen textual; no fabricar puntos históricos ni rellenar series faltantes. Barras de ingreso corresponden al período indicado. Si no hay historial suficiente: «Sin datos para comparar», sin flecha/porcentaje/minigráfico decorativo que parezca dato real. Relación gastos/ingresos con ingreso 0: «Sin ingresos registrados para calcular porcentaje»; si supera 100%, texto real (p. ej. 125%) y barra al 100% con indicación «Supera ingresos». No interpretar verde como «finanzas saludables».

Los consolidados equivalentes se rotulan «Equivalente en USD», con fecha/fuente de tasa accesibles en detalle y originales por moneda. Si falta una tasa, mostrar «Total consolidado no disponible» y las posiciones nativas disponibles, sin sumar parcialmente como total completo. Una diferencia de conciliación aparece en aviso persistente con moneda, fecha y «Revisar conciliación»; no convertirla en gasto, no alterar ancla confirmada. Importe confirmado se acompaña de «Confirmado manualmente el …»; cálculo posterior, de «Calculado desde saldo confirmado el …».

### 4.2 Wireframes de referencia de implementación

Ejemplo de escritorio con cuatro columnas (ancho ≥1440); el aviso es condicional y no reordena módulos:

```text
Navegación      | Finanzas › Resumen    Buscar movimientos   Avisos  Registrar movimiento
               | Resumen financiero                         Moneda de visualización: UYU
               | Noviembre de 2026 · Datos registrados
               | [Aviso de conciliación, solo si existe · Revisar conciliación]
               | Dinero disponible   | Ingresos del mes    | Gastos del mes
               | saldo / reservas    | comparación válida | proporción / contexto
               | Mis finanzas · [Resumen] · Presupuestos · Movimientos · Fondos
               | Recurrentes | Gastos recientes | Fondos de ahorro | Ingresos recientes
               | hasta 3     | hasta 3          | hasta 3          | hasta 3
               | Ver todos   | Ver todos        | Ver todos        | Ver todos
```

Ejemplo móvil 390 px: header adaptable, título, moneda, aviso si existe, tres KPI apilados, enlaces en varias líneas y cuatro secciones verticales con el mismo orden. No esconder información tras un carrusel ni disminuir el tamaño de toda la interfaz. Para columnas muy largas el límite de tres tarjetas conserva acceso al resto en su módulo.

Ejemplo financiero sintético, no fixture de cuenta: Banco UYU 10.000,00; fondo UYU 3.000,00; sin otros compromisos → disponible UYU 7.000,00. Reservar no es gasto. Compra Ropa enero UYU 2.000,00 y devolución febrero UYU 500,00: detalle de febrero muestra «Devolución recibida · compra de enero» por separado; compras Ropa febrero y presupuesto febrero no se reducen. No usar ninguno de los nombres/importes del JPEG como registros iniciales.

## 5. Componentes y variantes

Todas las piezas usan tokens del §2; no duplicar estilos por módulo. Son contratos visuales para componentes futuros, sin instalar dependencias adicionales. shadcn/ui y Tailwind se adaptarán al contrato en sus tickets; no asumir que sus estilos por defecto reproducen esta guía.

| Componente | Anatomía y variantes | Interacción / contenido largo |
| --- | --- | --- |
| Botón | Principal azul; secundario `selected` con texto blanco; discreto transparente; destructivo texto/borde `danger` | Hover/pressed del §2; foco visible; deshabilitado con motivo cercano. Cargando conserva ancho, spinner y verbo «Guardando…»; no doble envío |
| IconButton | Área 44, icono 20; normal/activo/deshabilitado | Nombre accesible contextual («Más opciones de …»); tooltip en foco/hover, no único nombre |
| KPI | Padding 24, radio 18, borde tenue, icono 20, título 14, cifra y metadatos | Sin menú de tres puntos para personalizar; enlace «Ver detalle» solo con destino real |
| Tarjeta movimiento | Categoría opcional + badge, concepto, importe/moneda, separador, fecha y nota | «Sin categorizar» válido. Enlace de detalle separado de acciones; sin botones anidados en enlace. Concepto puede envolver, nota completa en detalle |
| Tarjeta fondo | Nombre, moneda, reservado, meta opcional, barra y fecha opcionales, estado | Sin meta, no mostrar porcentaje ni saldo objetivo ficticio. Meta 0 no divide por cero. Aporte pendiente persistente con acción manual |
| Columna | Título 16/24, contador, pila gap 8, enlace «Ver todos» | Sin menú/asa para arrastrar. Sin altura que corte pie o anule zoom |
| Badge | Texto 12/16, padding 4×8, radio 4; icono 12 opcional | Nunca solo color; «Estimado», «Confirmado manualmente», «Parcial», «Anulado», etc. |
| Progreso | Pista 6 en fondo/meta, 16 en indicador; relleno 0–100% | Valor y denominador textuales. Calcular proporción exacta de los datos; no copiar proporciones inconsistentes del JPEG |
| Aviso persistente | Icono 20, título, texto, acción; info/advertencia/error | Conciliación y aporte pendiente no desaparecen por cerrar un toast; solo se resuelven por acción válida |
| Aviso temporal | Resultado de guardado y «Deshacer» cuando aplique (CA-014) | Región de estado anunciada; 10 s, pausa con hover/foco, sin robar foco. Tras expirar, anulación sigue disponible en detalle con confirmación |
| Búsqueda y filtros | Etiqueta, input con lupa; filtros con valor y «Limpiar filtros» | Enter aplica búsqueda; consultas paginadas por titular. Chips muestran filtros activos; resultado vacío no borra historial |
| Tabla/lista historial | Cabecera, fecha, tipo/concepto, moneda/importe, estado, acciones; paginación | Escritorio tabla semántica; móvil lista de tarjetas con las mismas etiquetas/acciones, un único conjunto accesible. No scroll horizontal global |
| Menú/popover | `surface`, borde funcional, padding 8, opciones ≥44 alto | Teclado, Escape, retorno de foco; se recoloca al borde del viewport, jamás corta opciones |
| Tooltip | Texto de ayuda breve, fondo `selected`, texto blanco | Visible con foco/hover, descartable; dato financiero o instrucción imprescindible también visible en detalle |

**Estados de registro y origen son dimensiones independientes:** «Confirmado manualmente» describe origen de un saldo, «Pagado» describe una obligación. No mostrar «Pagado» para un gasto solo por estar guardado. «Pendiente de acreditación» no suma a Bancos; «Vencido» requiere fecha cierta pasada y deuda/período todavía impago. «Parcial» muestra pagado y restante por moneda; «Anulado» conserva traza y vínculo, sin desaparecer como borrado de historia. Fondo con meta alcanzada: «Meta alcanzada · Aportes automáticos pausados»; fecha objetivo pasada sin alcanzar: aviso informativo, sin pausar aportes por ese motivo. Ver CA-018/023/024/039/040/050.

## 6. Formularios y flujos

### 6.1 Contenedor y campos comunes

Formulario normal en diálogo de hasta 640 px, margen exterior 24 y altura máxima `calc(100dvh − 48px)`, con cuerpo desplazable. A menos de 768: pantalla completa con padding 16 y botón «Cerrar» de 44 px. Flujo complejo, historial y formularios multimoneda usan página completa con contenido hasta 960 px para evitar diálogos anidados. Footer con Cancelar y acción descriptiva; en móvil botones a todo ancho apilados, primaria primero. No fijar footer si oculta campos al abrir teclado; respetar safe area y mantener campo/error enfocado visible.

Siempre título, descripción breve, etiqueta visible, indicación «(opcional)» cuando corresponda, ayuda, control y error debajo. Placeholder es ejemplo, nunca etiqueta ni dato guardado. Inputs mínimo 44 alto, padding 12, radio 8. Textarea mínimo 96, redimensionable vertical; select con moneda/valor visible. Checkbox/radio: marca de 20 dentro de área 44, etiqueta clicable. Switch solo para opciones aprobadas con efecto claro; cambios monetarios exigen guardar/confirmar. Obligatorio no depende de asterisco sin explicación.

Default borde `border-control`; hover mantiene contraste; foco anillo `focus` de 2 px separado 2 px; error borde `danger`, icono y texto («Ingresá un importe mayor que cero»). `aria-invalid` y asociación de ayuda/error; deshabilitado conserva información y explica causa. Validar al salir del campo y al enviar, no mostrar errores en formulario nuevo intacto. Al enviar inválido: resumen enlazado de errores y foco al primer campo inválido; preservar entradas. Campos de importe como texto con teclado decimal, sin flechas de input numérico.

Entrada decimal sin separadores de miles: ayuda «Ej.: 1500,50; también podés usar punto decimal». Admitir `1500,50` o `1500.50`; rechazar mezcla/separadores repetidos como `1.500,50` con mensaje específico, sin convertirla silenciosamente. El importe normal debe ser positivo; tipo de operación determina signo. Precisión/límites contables se validan con política exacta del servidor (F0-09); no redondear ni truncar la entrada para hacerla válida. UI formatea valor de lectura según §2.2 tras confirmación.

Fecha explícita con formato/ayuda y alternativa de escritura accesible al calendario; nunca cambiar día/período por conversión de huso. Autocompletado muestra sugerencias del titular y «Sin coincidencias»; categoría opcional incluye «Sin categorizar» y «Crear categoría» (RF-039). Creación inline conserva formulario, vuelve al selector y no guarda movimiento (CA-051). No encadenar modales inaccesibles.

### 6.2 Registro básico y progresión

«Registrar movimiento» ofrece Ingreso y Gasto en ese orden de lectura, con etiqueta del tipo seleccionado; no engloba pagos de deuda como gasto. Formulario básico en orden: tipo, concepto (obligatorio para gasto), importe y moneda (misma fila en escritorio, apilados móvil), fecha real, categoría/subcategoría opcionales, medio de pago/origen bancario aplicable, nota opcional, resumen de efecto, Cancelar y «Registrar gasto»/«Registrar ingreso». No exigir datos de tarjeta a un ingreso normal. El contrato de obligatoriedad específico de ingresos se aplica según RF/CA, sin inventar un bloqueo nuevo por analogía con gasto.

Cuotas, varios medios, categorías repartidas, gasto compartido, comercio y etiquetas se revelan cuando el usuario activa la opción correspondiente y solo en la fase que las implemente. No campos de descuento, adjuntos ni IA. Cambiar tipo o medio con datos dependientes pide confirmación antes de descartar esas entradas; nunca crea/elimina un movimiento ya persistido. Nuevos registros parten vacíos; sin acción de clonar uno previo.

Ejemplo sintético de resumen de gasto débito: «Se descontarán UYU 1.500,00 de Bancos UYU y se registrará un gasto de UYU 1.500,00». Antes de guardar, resumen refleja los datos actuales y no cambia saldos. Error de insuficiencia: explicar importe faltante y ofrecer fondos de la misma moneda únicamente cuando ese flujo esté implementado/autorizado; sin reservas parciales silenciosas. Éxito solo tras respuesta persistida del servidor.

### 6.3 Contratos específicos por módulo aprobado

| Flujo | Información y confirmación indispensables |
| --- | --- |
| Saldo inicial / actualización real | Moneda, saldo real y fecha; distinguir inicial/ajuste de ingreso. Mostrar calculado, confirmado y diferencia; «No se creará un gasto o ingreso para explicar la diferencia». Acción «Confirmar saldo real» |
| Corrección histórica | Valores anteriores/nuevos y período afectado; aviso de conciliación si hay ancla posterior; conservar saldo/fecha confirmados, sin prometer recálculo del ancla (CA-015) |
| Transferir / cambiar moneda | Origen y destino, dos importes reales si distintas monedas y fecha. Resumen de ambos efectos; nunca cotización informativa como movimiento ejecutado |
| Compra a crédito / pago de tarjeta | Separar «Registrar compra» de «Registrar pago». Pago: tarjeta, moneda de deuda, importe cancelado e importe/banco realmente debitados por línea; total parcial/completo, comisión real separada cuando exista. «Este pago no crea otro gasto» |
| Resumen oficial distinto | Estimado, oficial y diferencia por moneda/ciclo; «Revisar mis compras», «Actualizar deuda real», «Revisar más tarde». Cargar resumen no ajusta banco/deuda automáticamente |
| Cuotas / varios medios | Cantidad, cuota y primer período de porción crédito; mostrar suma/total coherentes y un único gasto lógico. Mostrar error junto a reparto si no coincide exactamente |
| Fondos | Moneda única, reservado, meta/fecha opcionales, aportes opcionales; explicar reserva virtual. Aporte insuficiente «Pendiente por saldo insuficiente» con acción manual, sin reintento automático al aparecer saldo |
| Presupuesto | Categoría/subcategoría, moneda, límite mensual; distinguir edición desde mes actual y excepción solo de un mes; consumo visible, alertas 80/100 sin bloquear gasto |
| Préstamo / cobro / pago | Principal/saldo, persona y moneda; cobro/pago parcial con restante. En moneda distinta mostrar ambos importes reales y posición cancelada. Capital no se presenta como ingreso/gasto ordinario |
| Reembolso | Desde compra original, importe acreditado, moneda, fecha real y destino banco/tarjeta. Vincular compra y aviso «No modifica compras ni presupuesto de otro mes»; no confundir con Deshacer ni cashback |
| Recurrencia | Frecuencia, primer período, fin opcional, importe esperado; confirmado real por período, parcial/completo/omitido/pausado distinguibles. «Confirmar pago/cobro real» no «Pago automático» |
| Exportar / respaldo / restaurar | Exportar solo desde Estadísticas con período/filtros; copia financiera separada desde Configuración. Contraseña opcional de copia distinta de login; validar archivo antes de confirmación de reemplazo |

### 6.4 Acceso, configuración inicial y confirmaciones

Acceso usa los mismos tokens en tarjeta de hasta 440 px centrada, padding 24 (16 móvil), sin sidebar ni cifras de muestra. Iniciar sesión: correo/contraseña y «Continuar con Google»; alta: invitación obligatoria para ambos métodos, campos según proveedor; email con contraseña requiere pantalla de código numérico (un campo accesible admite pegar código), reenvío/expiración/error y recuperación de contraseña. No fijar longitud de código, temporizadores, políticas ni capacidades del proveedor sin spike F0-04. No revelar existencia de un correo; no imprimir códigos/invitación en mensajes de error. Error de sesión deja acceso a reautenticación sin mostrar información de otra cuenta.

Onboarding salteable: «Monedas» → «Saldos iniciales» → «Tarjetas», indicador «Paso 1 de 3», Atrás, Continuar, «Omitir este paso» y «Omitir configuración». Al completar u omitir, entrar a Resumen; no crear saldos/ingresos/deudas por defecto. Mostrar qué pasos se guardaron; volver atrás no duplica registros. Otros módulos tienen enlaces de configuración posteriores, sin extender asistente.

Confirmación de anulación: concepto/fecha/importe/moneda, efecto exacto y acción «Anular registro»; conservar auditoría. Deshacer guardado usa el mismo resultado financiero y nunca cancela una compra en el banco. Restauración: archivo validado, alcance de reemplazo, advertencia de pérdida de cambios posteriores, opción de descargar copia actual, Cancelar y «Reemplazar mis datos financieros». Borrar cuenta: confirmación explícita y exportación previa opcional; sin casillas premarcadas ni mensajes ambiguos. No introducir borrado de historial al cambiar filtros.

## 7. Estados transversales, accesibilidad y datos largos

| Estado | Presentación | Acción / foco / regla |
| --- | --- | --- |
| Carga inicial | Skeleton de geometría del contenido; texto «Cargando…», `aria-busy` | Sin números falsos, sin destellos; si se prolonga, mantener mensaje legible y acción de reintento ante error |
| Actualizando | Conservar datos identificados «Actualizando datos…» y fecha de consulta previa | No presentarlos como confirmación bancaria nueva; reemplazar solo con respuesta válida |
| Cuenta vacía | «Todavía no configuraste tus saldos» + «Configurar saldo inicial» | Dashboard accesible; secciones con CTA pertinente solo si está implementado |
| Lista vacía | «No hay movimientos registrados» | Registrar; no poblar con datos de captura |
| Sin resultados de filtro | «No hay resultados con estos filtros» | «Limpiar filtros»; preservar historial y valores seleccionados |
| Envío | Botón «Guardando…», formulario ocupado | Evitar doble envío y avisar si se intenta cerrar mientras se desconoce resultado |
| Éxito persistido | «Gasto registrado» + acceso a detalle/Deshacer | Anuncio `role=status`, sin mover foco al aviso; actualizar solo cifras confirmadas por servidor |
| Error validación / negocio | Mensaje cercano, importe/moneda/contexto necesario; resumen de errores | No borrar entradas ni efectuar cambios parciales; foco al campo relevante |
| Error de carga | «No pudimos cargar tus datos» y «Reintentar» | No reemplazar saldo por cero ni mostrar stack/consulta/tokens |
| Conexión perdida antes de enviar | Banner «Sin conexión. Conectate para registrar cambios» | Bloquear mutaciones; sin cola offline ni saldo modificado localmente |
| Respuesta de envío desconocida | «No pudimos confirmar si se guardó. Verificá el estado o reintentá» | Resolver/reintentar misma operación idempotente; jamás generar segundo registro ni declarar fracaso definitivo sin verificar |
| Sesión vencida / sin permiso | «Tu sesión venció. Volvé a iniciar sesión» / «No tenés acceso a este recurso» | No filtrar datos ajenos, saldos ni existencia de objetos por error; limpiar vistas privadas al cerrar/cambiar cuenta |
| Conflicto de edición | «Los datos cambiaron. Revisalos antes de confirmar» | Recargar y revisar diferencias; no sobrescribir silenciosamente ni confirmar efecto antiguo |
| Anulado / archivado | Badge neutral y explicación de historial | Mantener vínculo/traza; archivo de persona no oculta deuda pendiente |

Errores críticos dinámicos se anuncian con `role=alert` sin repetir en bucle; carga/éxito informativos con región de estado. Controles deshabilitados incluyen motivo visible próximo; no depender de tooltip inaccesible. Una pérdida de red no autoriza guardar borradores financieros persistentes localmente. Mantener entradas solo en memoria durante el flujo, sin prometer recuperación tras login ni volcar datos a URL/logs.

Usar landmarks (`nav`, `header`, `main`) y títulos jerárquicos. Tab y Shift+Tab siguen orden DOM; Enter activa enlaces/botones, Espacio botones/checkbox, Escape cierra overlay. Foco visible en todos los controles, sin quedar debajo de un panel; al cerrar diálogo vuelve al disparador y tras navegar va al encabezado principal. Opciones de selector/menú usan el patrón de teclado accesible del componente. No convertir toda una tarjeta con múltiples acciones en un único botón ambiguo. SVG decorativo oculto al lector; icono con significado tiene alternativa textual.

Textos largos: conceptos/nombres envuelven; para cadenas sin espacios usar `overflow-wrap: anywhere`. Nota puede resumirse a dos líneas en tarjeta si detalle ofrece texto completo; importe, moneda, error y estado necesario nunca con elipsis. Tablas pueden pasar a tarjetas sin perder información. Aumentar altura antes de reducir fuente por debajo de escala; importe extremo puede partir código y cifra en líneas distintas manteniendo agrupación comprensible. No tapar contenido con teclado virtual. Comprobar [reflow a 320 CSS px](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html), zoom 200%/400%, contraste y lectura sin color al implementar. No se declara conformidad WCAG por esta especificación.

## 8. Estadísticas y visualización sin personalizar el dashboard

Estadísticas es una pantalla separada: h1, «Mis favoritos» / «Todas las estadísticas», selector de moneda y filtros de período, moneda original, categoría, método/tarjeta según RF-043/045/046. Con favoritos abre «Mis favoritos»; sin ellos muestra invitación y «Explorar estadísticas». Añadir/quitar favorito es personal y persistente, con nombre accesible («Añadir … a favoritos»), sin modificar movimientos ni disposición del dashboard. Resumen inteligente solo si el usuario lo marca, siempre disponible en catálogo.

Tarjeta de gráfico con título, período/unidad, leyenda, gráfico y «Ver datos» equivalente en tabla/lista. Series sin datos se marcan como faltantes, sin interpolar hechos financieros desconocidos. Tooltip accesible por foco y puntero, con importe original, equivalente y tasa/fecha/fuente cuando aplique. Drilldown categoría → subcategoría → movimientos, con ruta de regreso y filtros preservados; no ejecutar mutaciones al explorar. Comparaciones indican base y períodos; base cero o muestra insuficiente produce texto explicativo, no porcentaje infinito ni tendencia inventada. Gráfico esencial usa colores del §2 y marcadores/patrones distinguibles; contraste y significado requieren QA real en F5/F6. No se elige librería de gráficos en F0-02.

## 9. Trazabilidad y verificación futura

Esta entrega cubre la **especificación** pedida por F0-02. RF/CA quedan diseñados, no aprobados por pruebas de ejecución de una aplicación.

| Guía | Referencias | Evidencia de implementación pendiente |
| --- | --- | --- |
| §§2–3, 5 y 7 | RF-051/052; RNF-07/08; CA-066 | F1-01 y F6: capturas, teclado, lector, contraste y reflow |
| §§1, 3–4 y 8 | RF-044/045/046/050; CA-059/060/064 | F5: favoritos por cuenta, tasas históricas, catálogo separado |
| §§2.2, 4 y 6 | RF-005/008/012/013/026; CA-007/011/015/018/038; I-01/03/10 | F1/F3: saldos, reservas, discrepancia sin alterar ancla |
| §§4–6 | RF-015/021/023/047; CA-021/028/031/032; I-02/04/08 | F2/F5: pago sin doble gasto, capital y reintegro separado |
| §§6–7 | RF-004/010/051; RNF-01/02/03/06; CA-001/014/016/065; I-11/12 | Servidor: permisos, decimales, atomicidad, idempotencia; UI no es protección |
| §6.4 | RF-001/002/003; CA-002/003/004/005 | F0-04: viabilidad real de invitación, OTP/Google/recuperación |

Matriz mínima para revisar la UI cuando exista (todos los siguientes casos están **pendientes de ejecución**, sin marcar CA como pasado):

| Caso | Anchos / datos sintéticos | Resultado esperado |
| --- | --- | --- |
| Referencia escritorio | 1484×1103 CSS px, escala 1, recorte del JPEG `(58,47)` a `(1542,1150)` | Ejes/jerarquía/sidebar308/contenido1120/tres KPI/cuatro columnas; comparar zonas homólogas, excluyendo contenido adaptado |
| Breakpoints | 320, 390, 767, 768, 1023, 1024, 1439, 1440, 1920 px | Columnas y navegación según tabla; nada cortado, sin scroll horizontal de página |
| Altura/zoom | 390×844, 768×1024, 1024×768, 1440×900; zoom 200%/400% | Menús, teclado virtual, cierre, acciones y errores alcanzables; reflow |
| Datos largos | Concepto sin espacios de 120 caracteres, importe `UYU 999.999.999,99`, tres monedas | Valor completo, texto envolvente, sin solapamientos |
| Sin información | Cuenta sin configurar, saldo cero confirmado, período vacío, tasa faltante, ingresos cero | Estados diferentes, sin saldos/porcentajes ficticios |
| Integridad visual | CA-015/021/028/038 con ejemplos de los CA | Diferencia visible, pago separado, reintegro separado, reserva virtual |
| Navegación accesible | Solo teclado, lector, sin color, movimiento reducido | Foco visible y restituido, roles/nombres correctos, avisos comprensibles |
| Formulario/error | Inválido, sin saldo, doble clic, desconexión antes/después de envío, conflicto | Entradas preservadas en flujo, éxito solo persistido, reintento sin duplicación |
| Estados/temas | Normal, hover, pressed, foco, deshabilitado, cargando, vacío, error | Tokens y contraste calculados con fondos reales de cada componente |

Playwright se usará cuando exista aplicación en F1-01: fijar viewport/escala, datos sintéticos, idioma, reloj/período y esperar fuentes/carga para capturas repetibles; conservar evidencia en rutas permitidas. Comparar proporciones de regiones adaptadas y registrar diferencias justificadas de accesibilidad/idioma/producto, sin exigir igualdad píxel por píxel con el JPEG. F0-03 aporta scaffold; no se ejecuta en este ticket. R-18 queda documentado y parcialmente mitigado, con reproducción móvil/escritorio todavía sin verificar.

## Apéndice A. Observaciones conservadas de la referencia

El contenido siguiente procede de la guía local preexistente, conservado como evidencia descriptiva. Las medidas del JPEG no son tamaños CSS obligatorios. Donde diga «medido» se conserva la atribución original; F0-02 revalidó dimensiones y muestras puntuales, no todas las coordenadas ni cada color. Las reglas operativas anteriores prevalecen. «Reutilizable» aquí significa silueta visual observada, no aprobación de cada función retratada.

### A.1 Estructura y dimensiones observadas

La imagen mide **1600 × 1197 px**. El panel de FinTrack ocupa aproximadamente **1484 × 1103 px**, desde `(58, 47)` hasta `(1542, 1150)`. Está centrado sobre un fondo gris uniforme, con márgenes de unos **58 px a los lados y 47 px arriba y abajo**. La composición es de escritorio y el tablero muestra cuatro columnas en paralelo.

Las coordenadas parten de la esquina superior izquierda del JPEG. Las cajas indican el contorno visible aproximado, con un margen de 1–2 px por suavizado y compresión. Los colores marcados como **medidos** son muestras del JPEG decodificado. Los tamaños tipográficos, radios y pesos son **estimaciones**.

| Región | Posición aproximada `(x, y)` | Tamaño visible |
|---|---:|---:|
| Panel exterior | `(58, 47)` | `1484 × 1103 px` |
| Sidebar | `(58, 47)` | `308 × 1103 px` |
| Header del área principal | `(366, 47)` | `1176 × 63 px` |
| Área útil del contenido | `(392, 110)` | `1120 px` de ancho |
| Título y subtítulo | `(392, 133)` | bloque de unos `352 × 47 px` |
| Fila de indicadores | `(392, 205)` | `1120 × 209 px` |
| Franja de `My Finances` | `(392, 432)` | `1120 × 78 px` |
| Tablero | `(392, 529)` | `1120 × 593 px` |

La divisoria vertical del sidebar cae en `x ≈ 365`. El contenido principal empieza unos **26 px** después y deja **30 px** hasta el borde derecho del panel. Título, indicadores, separadores y tablero comparten los mismos ejes laterales. El tablero termina unos **28 px** antes del borde inferior. El panel exterior tiene esquinas de aproximadamente **17–18 px** de radio.

#### Sidebar

- **Marca.** El símbolo radial y la palabra `fintrack` empiezan cerca de `(82, 69)`. El botón de doble chevrón está a la derecha, en `(312, 66)`, y mide unos `30 × 27 px`.
- **Navegación superior.** `Dashboard` está seleccionado dentro de una superficie de `262 × 37 px`, en `(80, 118)`. `Analytics` aparece debajo, directamente sobre el fondo. Los iconos principales se alinean cerca de `x = 91` y las etiquetas cerca de `x = 120`.
- **Transactions.** El encabezado está cerca de `y = 231`. `All Transactions` precede a `Income`, `Expenses` y `Pending`, que llevan una sangría de unos **26 px** y se conectan mediante una línea vertical con ramificaciones curvas. Los números `12`, `8` y `6` se distinguen con contraste muy bajo en el extremo derecho. `Recurring Bills` vuelve al eje de los elementos principales.
- **Accounts.** La captura muestra dos encabezados con el mismo nombre. El primero agrupa `Cards & Bank`, `Savings`, `Investments` y `Goals`, con iconos en cuadrados de unos `25 × 25 px`. El segundo agrupa `Savings Goals` y `Budget Limits`, con iconos lineales. `Cards & Bank` también lleva un punto naranja cerca de `(337, 533)`.
- **Zona inferior.** Hay un tramo amplio de fondo libre entre `Budget Limits` y `Help Center`. `Help Center` y `Settings` quedan por encima de una divisoria en `y ≈ 1047`. La tarjeta de perfil está en `(80, 1071)`, mide unos `262 × 57 px` y contiene un retrato cuadrado redondeado de unos `37 × 37 px`, nombre y correo en dos líneas.

#### Header y encabezado del tablero

El header principal es una sola fila centrada verticalmente alrededor de `y = 78`. A la izquierda, `Finance › Overview` empieza en `x ≈ 392`, con un icono delante de cada etiqueta y mayor contraste en `Overview`. A la derecha, el buscador ocupa aproximadamente **303 × 35 px** desde `(875, 60)`. Tiene lupa, placeholder y una tecla `⌘K` en un recuadro al extremo derecho. Le siguen una divisoria vertical corta, `Export`, `Share` y el botón azul `Add Transaction`, de unos **137 × 37 px**.

Debajo se alinean `Financial overview` y `April 2026 income, expenses, savings and goals`. En el extremo derecho hay tres avatares circulares superpuestos y un círculo oscuro con `+2`, de unos **23–24 px** cada uno. En la captura, esa agrupación queda a la altura del título y el subtítulo.

### A.2 Indicadores y tablero observados

#### Fila de indicadores

| Tarjeta | Caja aproximada | Composición visible |
|---|---:|---|
| `Balance overview` | `(392, 205)`, `364 × 209 px` | Icono naranja, etiqueta, chip `↑ 8.2%`, `$24,580`, `Total Balance` y gráfico de puntos |
| `Monthly income` | `(770, 205)`, `364 × 209 px` | Icono azul, etiqueta, menú de tres puntos, `$6,450`, `+3.1% vs last month` y gráfico de barras |
| `Spending` | `(1148, 205)`, `364 × 209 px` | Icono verde, etiqueta, flecha diagonal en botón circular, `$3,920`, `61% of income spent` y barra de progreso |

Las tres tarjetas tienen **14 px de separación**, radio cercano a **18 px** y aproximadamente **23–24 px** de padding lateral. Las etiquetas empiezan en `y ≈ 228`, las cifras grandes en `y ≈ 276` y los textos secundarios en `y ≈ 327`. Los gráficos ocupan el tramo inferior.

- **Balance.** Matriz horizontal de puntos pequeños, de unos **3–4 px**, con una base de grises oscuros. Los puntos se apilan a distintas alturas y un grupo naranja aparece cerca del centro. Los extremos pierden contraste. La huella visible es de unos **320 × 36 px**.
- **Ingresos.** Barras muy finas, de unos **2 px**, con base común alrededor de `y = 396`. El tramo inicial contiene barras grises cortas. Las azules se concentran hacia la derecha y alcanzan unos **43 px** de alto en el pico. Los últimos trazos vuelven a gris oscuro.
- **Gastos.** Pista de unos **317 × 17 px**, desde `(1171, 373)`, con relleno verde hasta `x ≈ 1365`, coherente con el `61%` mostrado. Cerca del inicio del relleno hay un cuadrado blanco redondeado de unos **12 px**. El extremo del relleno cae casi recto sobre la pista oscura.

Los gráficos se presentan sin ejes, marcas de escala ni leyendas visibles.

#### Selector y acciones

La franja tiene líneas horizontales en `y ≈ 432` y `y ≈ 509`. A la izquierda se lee `My Finances`, seguido de un separador corto y las pestañas `Summary`, `Budget Board`, `Transactions` y `Goals`, cada una con icono. `Budget Board` es la activa y ocupa un fondo sólido de unos **152 × 43 px** desde `(669, 450)`. A la derecha están `Filter` y `2026`, botones delineados de unos **89 × 43 px** y **92 × 43 px**, separados por **11 px**.

#### Columnas y tarjetas

| Columna | `x` exterior | Ancho exterior | Ancho de tarjeta interior | Comienzo de las tarjetas en `y` |
|---|---:|---:|---:|---:|
| `Bills & Fixed` | `392` | `272 px` | `256 px` | `571`, `754`, `938` |
| `Daily Spending` | `671` | `274 px` | `258 px` | `571`, `754`, `938` |
| `Savings Goals` | `951` | `277 px` | `260 px` | `571`, `763`, `956` |
| `Income` | `1235` | `277 px` | `261 px` | `571`, `754`, `938` |

Las columnas arrancan en `y ≈ 529`, dejan **7–8 px** entre sí y terminan cerca de `y = 1122`. El encabezado de cada una tiene unos **42 px** de alto e incluye el mismo icono lineal de bandeja, título, contador `3` en una pequeña cápsula y menú de tres puntos alineado a la derecha. Las tarjetas se separan **7–8 px** del contorno de la columna.

- **Tarjeta de movimiento.** Mide unos **176–177 px** de alto. La primera fila tiene icono de categoría, etiqueta y estado alineado a la derecha. En la primera tarjeta, `HOUSING` y `Paid` están cerca de `y = 596`, `Rent of October` en `y ≈ 630` y `$1,250.00` en `y ≈ 657`. La línea del pie cae en `y ≈ 701`, con fecha e icono de calendario a la izquierda y una nota breve a la derecha. El padding horizontal interior es de **14–15 px**.
- **Tarjeta de objetivo.** Comparte la fila de categoría y estado. En la línea de importe, el monto actual aparece grande y claro y el total aparece más pequeño y gris, sobre la misma línea. Debajo hay una pista de unos **231 × 6 px**. Las dos primeras tarjetas miden aproximadamente **186 px** de alto y muestran fecha objetivo y saldo restante. La de `New Laptop` mide unos **158 px** y termina después de la barra verde, sin pie visible.
- **Longitudes visibles de progreso.** Las barras de objetivos ocupan aproximadamente **80%**, **40%** y **87%** de su pista. Estas proporciones surgen de medir el relleno visible. Las relaciones de los importes impresos son **84%**, **42%** y **91%**, respectivamente.

### A.3 Paleta observada

#### Colores medidos en el JPEG

| Superficie o elemento | Muestra medida |
|---|---|
| Fondo exterior | `#414141`, valor dominante en la muestra |
| Sidebar | `#0F0F0F`, dominante en una zona libre |
| Header, fondo principal y fondo de tarjetas | `#131313` |
| Fondo de columna | alrededor de `#0F0F0F` |
| Fondo activo de `Dashboard` y `Budget Board` | `#181818` y `#1E1E1E` |
| Interior del buscador | `#161616` |
| Divisoria del sidebar, borde de indicador y separador de tarjeta | `#232323`, `#222222` y `#262626` en los puntos muestreados |
| Texto de la cifra principal | `#FFFFFF` en el interior de varios trazos |
| Botón azul | `#6B86F7` cerca del borde superior, `#4B6BFE` más abajo y `#1F4EFE` cerca del borde inferior, sobre la misma vertical |
| Relleno de gastos y pista | `#19A248` y `#28282A` |
| Rellenos de objetivos | `#7E39EC` violeta, `#F34008` naranja rojizo y `#15A44C` verde |
| Punto naranja del sidebar | `#E65806` |

#### Colores estimados por apariencia

- El texto secundario va de un gris medio claro en subtítulos y navegación a un gris más apagado en categorías, nombres de movimientos y notas. En las muestras de trazos del subtítulo aparecen valores alrededor de `#949494–#A0A0A0`, y en el nombre de la primera tarjeta aparecen valores alrededor de `#6F6F6F–#797979`. El antialiasing produce varios grises dentro de una misma palabra.
- Las etiquetas de estado usan **verde** para `Paid`, `Cleared`, `Deposited` y `Almost There`, **violeta** para `On Track`, **ámbar** para `Pending` e `In Progress`, y **rojo** o **ámbar** en distintas apariciones de `Overdue`. El fondo es oscuro y puede estar teñido. `Paid`, por ejemplo, tiene una muestra de fondo `#232323`, mientras que `On Track` tiene una muestra `#201827`.
- Los acentos más saturados quedan concentrados en el botón principal, los iconos de indicadores, las barras, el punto naranja del sidebar y los iconos de cuentas. Los avatares añaden tonos pastel, rosados, azules y cálidos.

### A.4 Tipografía, espaciado y contornos observados

La interfaz usa una **sans serif de apariencia neutra**, con contraformas abiertas y cifras gruesas en las jerarquías principales. El logotipo `fintrack` tiene un tratamiento serif diferenciado. La familia exacta no se distingue con certeza.

| Uso | Tamaño aparente | Peso aparente |
|---|---:|---:|
| Cifras de indicadores | `42–44 px` | `600–650` |
| Importes de tarjetas | `24–26 px` | `600–700` |
| `Financial overview` y `My Finances` | `19–20 px` | `500–650` |
| Navegación lateral y nombres de movimientos | `16–17 px` | `400–500` |
| Etiquetas de indicador, subtítulo y pestañas | `15–17 px` | `400–500` |
| Encabezados de columna | `15–16 px` | `600` aprox. |
| Categorías, estados y controles compactos | `13–14 px` | `400–550` |
| Fechas, notas, contadores y correo | `11–13 px` | `400–500` |

Como referencia, los **píxeles visibles de los glifos** ocupan unos **15 px de alto** en `Financial overview`, **39 px** en `$24,580`, **22 px** en `$1,250.00` y **9 px** en `Due Oct`. Esas alturas dependen de los caracteres y del umbral de contraste usado para medirlos.

Los bordes se leen como líneas de **1 px**, con transiciones de hasta **2 px** en algunos tramos del JPEG. Los radios aparentes bajan de **17–18 px** en el panel y los indicadores a **14–16 px** en las columnas, **10–12 px** en las tarjetas interiores y **7–9 px** en los controles medianos. Los chips de estado tienen esquinas más discretas, de unos **3–5 px**. El contorno oscuro y la diferencia de luminosidad entre superficies aportan la mayor parte de la separación visual. El botón azul también muestra un borde luminoso arriba y un halo oscuro leve.

### A.5 Iconografía y piezas observadas

Los iconos de navegación y acciones son mayormente lineales, con trazos claros de alrededor de **1,5–2 px**. Miden unos **18–20 px** en el sidebar, **15–18 px** en el header y las pestañas, y **12–15 px** en categorías y pies. Se distinguen casa, calendario, reloj, marcador, engranaje, lupa, filtro, chevrón, flecha diagonal y varios símbolos de bandeja o cartera. Los tres indicadores usan pictogramas compactos con color propio. Los iconos de cuentas usan fondos redondeados blanco, azul, naranja y verde.

| Pieza reutilizable | Variantes visibles |
|---|---|
| Fila de navegación | Normal, activa, anidada, con contador, con punto indicador y con icono sobre fondo de color |
| Encabezado de grupo lateral | Etiqueta con chevrón |
| Control compacto de header | Buscador con tecla, acción de icono y texto, botón principal, botón delineado y botón de solo icono |
| Grupo de avatares y tarjeta de perfil | Círculos superpuestos con contador y retrato cuadrado con dos líneas de texto |
| Tarjeta de indicador | Encabezado con icono, cifra y contexto, con variante de chip, menú o flecha, y gráfico inferior |
| Pestaña del tablero | Normal y activa |
| Columna de tablero | Icono, título, contador, menú y pila de tarjetas |
| Tarjeta de movimiento | Categoría, estado, descripción, importe, separador y pie |
| Tarjeta de objetivo | Importe compuesto, progreso y variante con o sin pie visible |
| Elementos compactos | Chips de estado, contadores, pistas de progreso y marcadores de inicio |

### A.6 Detalles sensibles y límites de la captura

- **Contraste entre superficies oscuras.** La diferencia entre `#0F0F0F`, `#131313` y los bordes cercanos a `#232323` es pequeña. También importan los elementos de contraste muy bajo, como los contadores del árbol lateral. La compresión dificulta separar el color original de los píxeles de transición.
- **Gráficos y acentos.** La distribución de puntos, alturas de barras, cambios de color, terminaciones de pista y pequeños marcadores blancos forman parte de la referencia. La captura permite medir su huella y su silueta, pero deja indeterminados los datos de los minigráficos y la regla que relaciona los importes de objetivos con la longitud de sus barras.
- **Texto e iconos.** Se pueden estimar tamaños, pesos, siluetas y alineaciones. La fuente exacta, el interletrado, las alturas de línea, la biblioteca de iconos, los archivos de avatar y los parámetros precisos de degradados o sombras quedan indeterminados.
- **Escala y comportamiento.** Los píxeles del JPEG no permiten deducir el tamaño CSS original, el zoom, la densidad de pantalla o si hubo reescalado. Tampoco se ven otros anchos de pantalla, reglas de desplazamiento, estados de foco o hover, menús abiertos ni el comportamiento de los controles.
- **Variaciones del contenido.** La captura combina un subtítulo de abril de 2026 con varias fechas de octubre, repite `Accounts` y muestra `Overdue` en rojo y en ámbar. Son diferencias visibles. Su origen y sus reglas quedan fuera de lo que puede establecerse con esta imagen.
