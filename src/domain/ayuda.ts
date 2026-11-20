// F6-06 / SIMP-03: contenido estático de la sección Ayuda, dedicado a gastos.
// Basado en las funciones implementadas; sin funciones futuras.

export type AyudaLink = { href: string; label: string };

export type AyudaEntry = {
  question: string;
  answer: string;
  links?: readonly AyudaLink[];
};

export type AyudaGroup = {
  id: string;
  title: string;
  entries: readonly AyudaEntry[];
};

export const ayudaGroups: readonly AyudaGroup[] = [
  {
    id: "primeros-pasos",
    title: "Primeros pasos",
    entries: [
      {
        question: "¿Por dónde empiezo con la cuenta vacía?",
        answer:
          "Iniciá sesión con tu cuenta Google autorizada: la aplicación abre en Resumen. Tocá «Registrar gasto» para cargar el primero: importe, moneda, fecha, categoría y concepto. No hace falta configurar saldos ni cuentas bancarias.",
        links: [
          { href: "/resumen", label: "Resumen" },
          { href: "/historial", label: "Historial" },
        ],
      },
      {
        question: "¿Para qué sirve la aplicación?",
        answer:
          "Para registrar tus gastos y entender en qué se va el dinero: totales por mes, comparación con el mes anterior, categorías, presupuestos, gastos recurrentes y compras en cuotas. No maneja saldos, ingresos ni cuentas bancarias.",
        links: [{ href: "/resumen", label: "Resumen" }],
      },
      {
        question: "¿La aplicación se conecta a mi banco?",
        answer:
          "No. Los gastos se registran manualmente: no hay conexión bancaria ni conciliación automática. Si la conexión a internet se corta al guardar, la aplicación te avisa para que reintentes.",
        links: [{ href: "/resumen", label: "Resumen" }],
      },
      {
        question: "¿Qué muestro en cada sección?",
        answer:
          "Resumen junta el total del mes, las categorías, la evolución, los últimos gastos y los presupuestos. Historial guarda todos los gastos con filtros. Estadísticas analiza períodos. Presupuestos, Recurrentes, Categorías, Etiquetas, Comercios y contactos, Informes, Avisos y Mi cuenta completan el resto.",
        links: [{ href: "/avisos", label: "Avisos" }],
      },
      {
        question: "¿Para qué sirve el selector UYU / USD / EUR de arriba?",
        answer:
          "Elige la moneda en la que se muestran los totales del Resumen y de Estadísticas. No convierte ni mueve tu dinero: los gastos conservan su moneda original y la conversión usa la cotización de su fecha.",
        links: [
          { href: "/resumen", label: "Resumen" },
          { href: "/estadisticas", label: "Estadísticas" },
        ],
      },
    ],
  },
  {
    id: "gastos",
    title: "Gastos",
    entries: [
      {
        question: "¿Cómo registro un gasto?",
        answer:
          "Con «Registrar gasto» (arriba o en la barra inferior en el móvil) se abre el formulario en Resumen: importe sin separador de miles, moneda, fecha y concepto. Categoría, etiquetas, comercio y nota son opcionales.",
        links: [{ href: "/resumen", label: "Resumen" }],
      },
      {
        question: "¿Puedo registrar gastos en dólares o euros?",
        answer:
          "Sí. Elegí la moneda al registrar el gasto. Los totales convertidos usan la cotización de la fecha de cada gasto y se muestran en la moneda que elijas arriba.",
        links: [{ href: "/estadisticas", label: "Estadísticas" }],
      },
      {
        question: "¿Dónde quedan los comercios que escribo?",
        answer:
          "Se guardan en «Comercios y contactos» y se autocompletan en los formularios. Ahí también podés revisar los registros y fusionar duplicados.",
        links: [{ href: "/catalogo", label: "Comercios y contactos" }],
      },
      {
        question: "¿Cómo busco un gasto?",
        answer:
          "En Historial buscá por texto y filtrá por período, moneda, categoría, comercio, etiquetas, importe o estado. Podés guardar filtros para reutilizarlos.",
        links: [{ href: "/historial", label: "Historial" }],
      },
    ],
  },
  {
    id: "cuotas",
    title: "Cuotas",
    entries: [
      {
        question: "¿Cómo registro una compra en cuotas?",
        answer:
          "En el formulario de gasto marcá «En cuotas» e indicá la cantidad, el importe de cada cuota y el mes de la primera. La compra no se cuenta entera: cada cuota se suma una sola vez en su mes.",
        links: [{ href: "/resumen", label: "Resumen" }],
      },
      {
        question: "¿Puedo corregir el plan de cuotas?",
        answer:
          "Sí. En el detalle del gasto, «Corregir plan de cuotas» ajusta el importe de cada cuota, la cantidad y el mes de la primera cuota.",
        links: [{ href: "/historial", label: "Historial" }],
      },
      {
        question: "¿Dónde veo las cuotas de un mes?",
        answer:
          "En Resumen, debajo de los indicadores, la lista «Cuotas incluidas en los gastos del mes» muestra cada cuota y a qué compra pertenece. Los meses futuros se muestran como proyección.",
        links: [{ href: "/resumen", label: "Resumen" }],
      },
    ],
  },
  {
    id: "presupuestos",
    title: "Presupuestos",
    entries: [
      {
        question: "¿Cómo creo un presupuesto?",
        answer:
          "En Presupuestos, asigná un límite por categoría y moneda. El límite rige desde el mes en que lo creás y se usa en los avisos de consumo.",
        links: [{ href: "/presupuestos", label: "Presupuestos" }],
      },
      {
        question: "¿Puedo cambiar el límite de un solo mes?",
        answer:
          "Sí. En la fila de la categoría, «Cambiar el límite solo un mes» ajusta ese mes sin tocar los siguientes; el cambio general rige desde el mes en que lo guardás.",
        links: [{ href: "/presupuestos", label: "Presupuestos" }],
      },
      {
        question: "¿Qué pasa cuando me acerco al límite?",
        answer:
          "Avisos marca el avance de consumo por categoría y el exceso al llegar al 100 %. Si quitás el presupuesto, los gastos de esa categoría quedan sin límite.",
        links: [
          { href: "/avisos", label: "Avisos" },
          { href: "/presupuestos", label: "Presupuestos" },
        ],
      },
    ],
  },
  {
    id: "recurrentes",
    title: "Recurrentes",
    entries: [
      {
        question: "¿Para qué sirven los recurrentes?",
        answer:
          "Para gastos que se repiten, como el alquiler o una suscripción: definí concepto, categoría, moneda, frecuencia, comienzo, finalización opcional y vencimiento (día del mes).",
        links: [{ href: "/recurrentes", label: "Recurrentes" }],
      },
      {
        question: "¿Cómo registro que un recibo ya ocurrió?",
        answer:
          "En cada serie, liquidás el período: cargá el importe pagado y la fecha. El gasto queda registrado y vinculado a la serie; nada se registra solo.",
        links: [{ href: "/recurrentes", label: "Recurrentes" }],
      },
      {
        question: "¿Puedo pausar o terminar una serie?",
        answer:
          "Sí. Podés pausar y reanudar la serie, o finalizarla; mientras está pausada, los períodos previos se gestionan desde la serie. Los estados son activa, pausada y finalizada.",
        links: [{ href: "/recurrentes", label: "Recurrentes" }],
      },
      {
        question: "¿Dónde veo los próximos vencimientos?",
        answer:
          "En Resumen, «Próximos pagos» lista los recurrentes con fecha cierta de los próximos días, y Avisos agrupa los vencimientos y los presupuestos cerca del límite.",
        links: [
          { href: "/resumen", label: "Resumen" },
          { href: "/avisos", label: "Avisos" },
        ],
      },
    ],
  },
  {
    id: "categorias",
    title: "Categorías y etiquetas",
    entries: [
      {
        question: "¿Cómo organizo mis categorías?",
        answer:
          "En Categorías administrás el catálogo y sus subcategorías. Al archivar una categoría se oculta, junto con sus subcategorías, de los formularios; los gastos existentes conservan su categoría.",
        links: [{ href: "/categorias", label: "Categorías" }],
      },
      {
        question: "¿Qué son las etiquetas?",
        answer:
          "Son marcas libres para clasificar gastos dentro de una categoría. Se administran en «Etiquetas» y se eligen al registrar un gasto.",
        links: [
          { href: "/etiquetas", label: "Etiquetas" },
          { href: "/historial", label: "Historial" },
        ],
      },
      {
        question: "¿Cómo cambio la categoría de varios gastos a la vez?",
        answer:
          "En Historial podés guardar filtros y aplicar cambios de categoría en bloque sobre los gastos filtrados, revisando el resultado antes de confirmar.",
        links: [{ href: "/historial", label: "Historial" }],
      },
    ],
  },
  {
    id: "estadisticas",
    title: "Estadísticas",
    entries: [
      {
        question: "¿Qué puedo ver en Estadísticas?",
        answer:
          "El total de gastos del período frente al anterior, la evolución por mes, los gastos por categoría y la evolución anual por categoría. Podés marcar gráficos como favoritos para tenerlos a mano.",
        links: [{ href: "/estadisticas", label: "Estadísticas" }],
      },
      {
        question: "¿Cómo afino el análisis?",
        answer:
          "Elegí el período, la moneda y filtros por categoría o etiqueta. Desde un gráfico podés entrar al detalle: subcategorías y gastos que lo componen.",
        links: [{ href: "/estadisticas", label: "Estadísticas" }],
      },
      {
        question: "¿El Resumen cambia con estos análisis?",
        answer:
          "No. El Resumen muestra el mes elegido; el análisis por períodos y comparaciones libres está en Estadísticas.",
        links: [
          { href: "/resumen", label: "Resumen" },
          { href: "/estadisticas", label: "Estadísticas" },
        ],
      },
    ],
  },
  {
    id: "correcciones",
    title: "Correcciones",
    entries: [
      {
        question: "Me equivoqué en el importe de un gasto recién guardado",
        answer:
          "En Resumen, después de guardar, podés corregir el importe con el formulario de corrección o deshacer el gasto. El cambio queda identificado como corrección o anulación.",
        links: [{ href: "/resumen", label: "Resumen" }],
      },
      {
        question: "¿Dónde reviso el detalle de un gasto?",
        answer:
          "Desde Historial o desde Últimos gastos abrí el gasto: el detalle muestra sus datos completos y las acciones disponibles, como corregir el importe o revisar el plan de cuotas.",
        links: [{ href: "/historial", label: "Historial" }],
      },
    ],
  },
  {
    id: "copias",
    title: "Copias de seguridad e informes",
    entries: [
      {
        question: "¿Cómo descargo una copia de seguridad?",
        answer:
          "En Mi cuenta, «Copias de seguridad» → «Descargar copia de seguridad», con protección por contraseña opcional. El archivo contiene tus datos: guardalo en un lugar privado y seguro.",
        links: [{ href: "/account", label: "Mi cuenta" }],
      },
      {
        question: "¿Cómo restauro una copia?",
        answer:
          "En Mi cuenta, «Restaurar copia de seguridad»: elegí un archivo de copia compatible, revisá la vista previa y confirmá. La restauración reemplaza el contenido de tu cuenta.",
        links: [{ href: "/account", label: "Mi cuenta" }],
      },
      {
        question: "¿Cómo exporto un informe?",
        answer:
          "En Informes, elegí el período y el formato (PDF, Excel o CSV). El informe resume el período y compara dos tramos dentro de él.",
        links: [{ href: "/informes", label: "Informes" }],
      },
    ],
  },
  {
    id: "cuenta",
    title: "Cuenta y privacidad",
    entries: [
      {
        question: "¿Cómo cierro sesión?",
        answer:
          "En Mi cuenta, tocá «Cerrar sesión». Tu acceso está vinculado a tu cuenta Google autorizada.",
        links: [{ href: "/account", label: "Mi cuenta" }],
      },
      {
        question: "¿Quién puede entrar a la aplicación?",
        answer:
          "Solo cuentas Google incluidas en la lista privada de personas autorizadas. Nadie más puede registrarse ni ver tus datos.",
        links: [{ href: "/account", label: "Mi cuenta" }],
      },
      {
        question: "¿Dónde están mis datos?",
        answer:
          "En la base de la aplicación, asociados a tu cuenta: no se guardan datos financieros en tu dispositivo y la aplicación funciona en línea. Podés descargar una copia desde Mi cuenta.",
        links: [
          { href: "/account", label: "Mi cuenta" },
          { href: "/resumen", label: "Resumen" },
        ],
      },
      {
        question: "¿Cómo elimino mi cuenta y sus datos?",
        answer:
          "En Mi cuenta, «Eliminar cuenta»: la confirmación pide escribir una frase específica y muestra una prueba firmada de la operación. Al confirmar se eliminan tus datos y volvés a la pantalla de acceso.",
        links: [{ href: "/account", label: "Mi cuenta" }],
      },
    ],
  },
] as const;

export function normalizeAyudaText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

export type FilteredAyudaGroup = {
  id: string;
  title: string;
  entries: AyudaEntry[];
};

export function filterAyudaGroups(
  query: string,
  groups: readonly AyudaGroup[],
): FilteredAyudaGroup[] {
  const tokens = normalizeAyudaText(query).split(/\s+/).filter(Boolean);
  return groups.flatMap((group) => {
    const entries =
      tokens.length === 0
        ? [...group.entries]
        : group.entries.filter((entry) => {
            const haystack = normalizeAyudaText(
              `${group.title} ${entry.question} ${entry.answer}`,
            );
            return tokens.every((token) => haystack.includes(token));
          });
    return entries.length > 0
      ? [{ id: group.id, title: group.title, entries }]
      : [];
  });
}

export function countAyudaEntries(
  groups: readonly { entries: readonly unknown[] }[],
): number {
  return groups.reduce((total, group) => total + group.entries.length, 0);
}
