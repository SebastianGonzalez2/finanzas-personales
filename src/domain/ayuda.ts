// F6-06: contenido estático de la sección Ayuda. Basado en las funciones
// implementadas; sin funciones futuras ni instrucciones que no existan.

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
          "Iniciá sesión con tu cuenta Google autorizada: la aplicación abre en Resumen. En la tarjeta «Disponible libre», tocá «Configurar» en cada moneda (UYU, USD, EUR) para cargar el saldo real de tus bancos y su fecha. Después podés registrar tu primer gasto o ingreso en Historial.",
        links: [
          { href: "/resumen", label: "Resumen" },
          { href: "/historial", label: "Historial" },
        ],
      },
      {
        question: "¿Por qué no puedo registrar movimientos todavía?",
        answer:
          "El formulario de Historial se habilita cuando existe un saldo inicial configurado en «Disponible libre» para la moneda que querés usar. Configuralo en Resumen y volvé a Historial.",
        links: [{ href: "/resumen", label: "Resumen" }],
      },
      {
        question: "¿Qué significa «Disponible libre»?",
        answer:
          "Es el dinero de tus bancos que queda libre por moneda, después de descontar las reservas de fondos de ahorro y la deuda de las tarjetas de crédito. Se configura y actualiza desde Resumen.",
        links: [{ href: "/resumen", label: "Resumen" }],
      },
      {
        question: "¿La aplicación se conecta a mi banco?",
        answer:
          "No. Los saldos y los movimientos se registran manualmente: no hay conexión bancaria ni conciliación automática. Si la conexión a internet se corta al guardar, la aplicación te avisa para que reintentes.",
        links: [{ href: "/resumen", label: "Resumen" }],
      },
      {
        question: "¿Qué muestro en cada sección?",
        answer:
          "Resumen junta saldos, indicadores del mes, cuotas y movimientos recientes. Historial guarda todos los movimientos con filtros. Estadísticas analiza períodos. Presupuestos, Fondos de ahorro, Tarjetas, Deudas y préstamos, Beneficios bancarios, Recurrentes, Comercios y contactos, Categorías, Informes, Avisos y Mi cuenta completan el resto.",
        links: [{ href: "/avisos", label: "Avisos" }],
      },
    ],
  },
  {
    id: "bancos",
    title: "Bancos y saldos",
    entries: [
      {
        question: "¿Cómo cargo el saldo inicial de un banco?",
        answer:
          "En Resumen, sección «Disponible libre», tocá «Configurar» en la moneda correspondiente: escribí el importe que muestra tu banco y la fecha del saldo. Desde esa fecha la aplicación calcula la disponibilidad con tus movimientos.",
        links: [{ href: "/resumen", label: "Resumen" }],
      },
      {
        question: "¿Cómo actualizo el saldo cuando no coincide?",
        answer:
          "En la misma fila de Resumen usá «Actualizar saldo real de Bancos»: cargá el importe y la fecha que informa el banco. La aplicación registra el ajuste, recalcula desde esa fecha y guarda el historial de diferencias.",
        links: [{ href: "/resumen", label: "Resumen" }],
      },
      {
        question: "¿Qué es confirmar un saldo?",
        answer:
          "Confirmar guarda un punto de control (checkpoint) con el saldo real y su fecha. Es la referencia que usa la aplicación para revisar diferencias anteriores; los puntos confirmados no se reescriben y quedan en el historial de la moneda.",
        links: [{ href: "/resumen", label: "Resumen" }],
      },
      {
        question: "¿Qué monedas puedo usar?",
        answer:
          "UYU, USD y EUR. Cada saldo, movimiento, presupuesto y fondo se registra en una de esas monedas.",
        links: [{ href: "/resumen", label: "Resumen" }],
      },
      {
        question: "¿Cómo paso dinero de una moneda a otra?",
        answer:
          "En Historial, «+ Nueva transacción» con tipo «Cambio de moneda»: cargá los dos importes reales, el que sale y el que entra. No se cuenta como gasto ni como ingreso.",
        links: [{ href: "/historial", label: "Historial" }],
      },
    ],
  },
  {
    id: "movimientos",
    title: "Movimientos",
    entries: [
      {
        question: "¿Cómo registro un gasto o un ingreso?",
        answer:
          "En Historial, «+ Nueva transacción»: elegí el tipo (Gasto o Ingreso), el medio bancario (débito, transferencia o acreditación), el importe sin separador de miles, la moneda y la fecha. El gasto pide concepto y acepta comercio, categoría, etiquetas y nota opcionales.",
        links: [{ href: "/historial", label: "Historial" }],
      },
      {
        question: "¿Cómo registro una compra con tarjeta de crédito?",
        answer:
          "En Historial usá «Compra con tarjeta de crédito»; también está disponible en Tarjetas. Elegí la tarjeta, el importe y, si corresponde, la cantidad de cuotas.",
        links: [
          { href: "/historial", label: "Historial" },
          { href: "/tarjetas", label: "Tarjetas" },
        ],
      },
      {
        question: "¿Qué es una compra mixta?",
        answer:
          "Una compra pagada en parte con débito y en parte con crédito (pago único o cuotas). Se registra desde el detalle del movimiento en Historial, donde se cargan los dos importes reales.",
        links: [{ href: "/historial", label: "Historial" }],
      },
      {
        question: "¿Qué es un gasto con otras personas?",
        answer:
          "En Historial, «Gasto con otras personas»: registrás el gasto compartido, tu parte y la de los demás, con fecha prevista de devolución opcional.",
        links: [{ href: "/historial", label: "Historial" }],
      },
      {
        question: "¿Cómo indico que un gasto sale de un fondo de ahorro?",
        answer:
          "Al registrar un gasto, el formulario muestra tus fondos con reserva disponible: indicá qué parte del importe sale de la reserva del fondo y el resto baja del disponible libre.",
        links: [{ href: "/fondos", label: "Fondos de ahorro" }],
      },
      {
        question: "¿Dónde quedan los comercios que escribo?",
        answer:
          "Se guardan en «Comercios y contactos» y se autocompletan en los formularios. Ahí también podés revisar los registros y fusionar duplicados.",
        links: [{ href: "/catalogo", label: "Comercios y contactos" }],
      },
    ],
  },
  {
    id: "tarjetas",
    title: "Tarjetas",
    entries: [
      {
        question: "¿Qué tarjetas puedo cargar?",
        answer:
          "Tarjetas de crédito y de débito, con nombre y monedas. Los días habituales de cierre y vencimiento son opcionales y alimentan los avisos del ciclo.",
        links: [{ href: "/tarjetas", label: "Tarjetas" }],
      },
      {
        question: "¿Cómo pago la tarjeta?",
        answer:
          "Desde Tarjetas, registrá el pago con la fecha en que el banco lo debita: la deuda de la tarjeta baja y el saldo de Bancos se debita. Pagar no duplica el gasto: la compra ya se registró cuando la hiciste.",
        links: [{ href: "/tarjetas", label: "Tarjetas" }],
      },
      {
        question: "¿Dónde reviso el ciclo de la tarjeta?",
        answer:
          "Tarjetas muestra el resumen de cada ciclo con las compras, cuotas y pagos identificadas. Los cierres próximos aparecen como avisos.",
        links: [
          { href: "/tarjetas", label: "Tarjetas" },
          { href: "/avisos", label: "Avisos" },
        ],
      },
    ],
  },
  {
    id: "cuotas",
    title: "Cuotas",
    entries: [
      {
        question: "¿Cómo funciona un plan de cuotas?",
        answer:
          "Indicás la cantidad de cuotas, el importe de cada una y el mes de la primera. Cada cuota se registra como gasto en su mes; el compromiso futuro se muestra aparte y no duplica gastos.",
        links: [{ href: "/historial", label: "Historial" }],
      },
      {
        question: "El emisor canceló cuotas, ¿qué hago?",
        answer:
          "En el plan de cuotas, «Registrar cancelación de cuotas»: elegí la primera cuota que el emisor confirmó como cancelada y se retiran esa cuota y las siguientes. Si además cambió el saldo que informa el emisor, actualizá la deuda en Tarjetas.",
        links: [
          { href: "/tarjetas", label: "Tarjetas" },
          { href: "/historial", label: "Historial" },
        ],
      },
      {
        question: "¿Puedo corregir el plan de cuotas?",
        answer:
          "Sí. En el plan, «Corregir plan de cuotas» ajusta el importe de cada cuota, la cantidad y el mes de la primera cuota.",
        links: [{ href: "/historial", label: "Historial" }],
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
          "Avisos marca el avance de consumo por categoría y el exceso al llegar al 100%. Si quitás el presupuesto, los gastos de esa categoría quedan sin límite.",
        links: [
          { href: "/avisos", label: "Avisos" },
          { href: "/presupuestos", label: "Presupuestos" },
        ],
      },
    ],
  },
  {
    id: "fondos",
    title: "Fondos de ahorro",
    entries: [
      {
        question: "¿Qué es un fondo de ahorro?",
        answer:
          "Una reserva de tu «Disponible libre» con nombre, moneda y una meta opcional con fecha. La reserva baja tu disponible libre pero no genera movimientos bancarios.",
        links: [{ href: "/fondos", label: "Fondos de ahorro" }],
      },
      {
        question: "¿Cómo reservo o libero dinero?",
        answer:
          "En Fondos, «Reservar» aparta un importe en el fondo, «Liberar» lo devuelve al disponible libre y la transferencia lo mueve a otro fondo. Cada operación se revisa antes de confirmar.",
        links: [{ href: "/fondos", label: "Fondos de ahorro" }],
      },
      {
        question: "¿Qué son las aportaciones programadas?",
        answer:
          "Son reservas automáticas: una porción del disponible libre o de cada gasto se destina al fondo según la frecuencia que elijas. Las metas vencidas, alcanzadas y las aportaciones pendientes generan avisos.",
        links: [
          { href: "/fondos", label: "Fondos de ahorro" },
          { href: "/avisos", label: "Avisos" },
        ],
      },
      {
        question: "¿Cómo cierro un fondo?",
        answer:
          "Cuando ya no lo necesitás, cerralo desde Fondos: se descartan las aportaciones pendientes y la reserva vuelve a estar disponible. Los fondos cerrados quedan listados con su historial.",
        links: [{ href: "/fondos", label: "Fondos de ahorro" }],
      },
    ],
  },
  {
    id: "prestamos",
    title: "Deudas y préstamos",
    entries: [
      {
        question: "¿Cómo registro un préstamo?",
        answer:
          "En Deudas y préstamos podés registrar que recibiste un préstamo, que prestaste dinero, o cargar una deuda o un dinero por cobrar que ya existía. Cargá persona o entidad, moneda, importe y, si lo tenés, contacto, vencimiento y cuota habitual.",
        links: [{ href: "/deudas", label: "Deudas y préstamos" }],
      },
      {
        question: "¿El capital de un préstamo es ingreso o gasto?",
        answer:
          "No. Recibir o prestar capital no se cuenta como ingreso ni como gasto ordinario: la aplicación lo trata como deuda o crédito por cobrar. Los intereses y cargos sí se registran cuando los pagás o los cobrás.",
        links: [{ href: "/deudas", label: "Deudas y préstamos" }],
      },
      {
        question: "¿Cómo registro un pago o un cobro?",
        answer:
          "En la deuda, «Registrar pago» o «Registrar cobro»: separá el capital amortizado de los intereses y cargos pagados, y podés indicar intereses devengados que siguen pendientes.",
        links: [{ href: "/deudas", label: "Deudas y préstamos" }],
      },
      {
        question: "¿Cómo me avisan los vencimientos?",
        answer:
          "Los vencimientos conocidos aparecen en Avisos con la antelación en días que elijas al registrar la deuda.",
        links: [
          { href: "/avisos", label: "Avisos" },
          { href: "/deudas", label: "Deudas y préstamos" },
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
          "Para conceptos que se repiten, como alquiler o sueldo: definí gasto o ingreso, concepto, categoría, moneda, frecuencia, comienzo, finalización opcional y vencimiento (día del mes).",
        links: [{ href: "/recurrentes", label: "Recurrentes" }],
      },
      {
        question: "¿Cómo registro que un recibo ya ocurrió?",
        answer:
          "En cada serie, liquidás el período: cargá el importe pagado o cobrado, la fecha y el medio (banco o tarjeta). El movimiento queda registrado y vinculado a la serie.",
        links: [{ href: "/recurrentes", label: "Recurrentes" }],
      },
      {
        question: "¿Puedo pausar o terminar una serie?",
        answer:
          "Sí. Podés pausar y reanudar la serie, o finalizarla; mientras está pausada, los períodos previos se gestionan desde la serie. Los estados son activa, pausada y finalizada.",
        links: [{ href: "/recurrentes", label: "Recurrentes" }],
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
          "En Categorías administrás el catálogo y sus subcategorías. Al archivar una categoría se oculta, junto con sus subcategorías, de los formularios; los movimientos existentes conservan su categoría.",
        links: [{ href: "/categorias", label: "Categorías" }],
      },
      {
        question: "¿Qué son las etiquetas?",
        answer:
          "Son marcas libres para clasificar movimientos dentro de una categoría. Se administran en «Etiquetas» y se eligen al registrar un movimiento.",
        links: [
          { href: "/etiquetas", label: "Etiquetas" },
          { href: "/historial", label: "Historial" },
        ],
      },
      {
        question: "¿Cómo cambio la categoría de varios movimientos a la vez?",
        answer:
          "En Historial podés guardar filtros y aplicar cambios de categoría en bloque sobre los movimientos filtrados, revisando el resultado antes de confirmar.",
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
          "Métricas del período (ingresos, gastos, resultado y devoluciones acreditadas), comparaciones por categoría y por medio, el flujo histórico y gráficos por fecha. Podés marcar gráficos como favoritos para tenerlos a mano.",
        links: [{ href: "/estadisticas", label: "Estadísticas" }],
      },
      {
        question: "¿Cómo afino el análisis?",
        answer:
          "Elegí el período, la moneda y filtros por categoría o medio. Desde un gráfico podés entrar al detalle: subcategorías y movimientos que lo componen.",
        links: [{ href: "/estadisticas", label: "Estadísticas" }],
      },
      {
        question: "¿El Resumen cambia con estos análisis?",
        answer:
          "No. El Resumen mantiene sus indicadores fijos del mes; el análisis por períodos y comparaciones está en Estadísticas.",
        links: [
          { href: "/resumen", label: "Resumen" },
          { href: "/estadisticas", label: "Estadísticas" },
        ],
      },
    ],
  },
  {
    id: "devoluciones",
    title: "Devoluciones y reembolsos",
    entries: [
      {
        question: "¿Cómo registro la devolución de una compra?",
        answer:
          "En Historial, «Registrar devolución»: podés partir de una solicitud previa o registrarla sin solicitud, indicando a qué compra se aplica y el importe recibido.",
        links: [{ href: "/historial", label: "Historial" }],
      },
      {
        question: "¿Cómo afecta al mes de la compra?",
        answer:
          "No lo modifica. La devolución se registra en el mes en que se acredita, separada de la compra original: las compras y el presupuesto del mes de la compra quedan como estaban.",
        links: [{ href: "/resumen", label: "Resumen" }],
      },
      {
        question: "¿Dónde veo las devoluciones del mes?",
        answer:
          "En Resumen figuran «Devoluciones recibidas en el mes» y en Estadísticas la métrica de devoluciones acreditadas del período.",
        links: [
          { href: "/resumen", label: "Resumen" },
          { href: "/estadisticas", label: "Estadísticas" },
        ],
      },
    ],
  },
  {
    id: "beneficios",
    title: "Beneficios bancarios",
    entries: [
      {
        question: "¿Qué es un beneficio bancario?",
        answer:
          "Cashback y bonificaciones que acredita el banco y que no están ligados a una compra concreta. Se registran en Beneficios bancarios con la tarjeta y la moneda correspondientes.",
        links: [{ href: "/beneficios", label: "Beneficios bancarios" }],
      },
      {
        question: "¿Y si el banco me devolvió el importe de una compra?",
        answer:
          "Eso es una devolución: registrala en Historial como devolución, no como beneficio bancario.",
        links: [
          { href: "/historial", label: "Historial" },
          { href: "/beneficios", label: "Beneficios bancarios" },
        ],
      },
    ],
  },
  {
    id: "correcciones",
    title: "Correcciones",
    entries: [
      {
        question: "Me equivoqué en el importe de un movimiento recién guardado",
        answer:
          "En Historial, después de guardar, podés corregir el importe con el formulario de corrección. El cambio solo actualiza el registro en la aplicación y queda identificado como corrección.",
        links: [{ href: "/historial", label: "Historial" }],
      },
      {
        question: "¿Puedo editar un saldo confirmado?",
        answer:
          "No se reescribe un punto de saldo confirmado. Si el saldo real cambió, usá «Actualizar saldo real de Bancos» en Resumen: el ajuste se registra desde la fecha que indiques y las diferencias quedan en el historial de la moneda.",
        links: [{ href: "/resumen", label: "Resumen" }],
      },
      {
        question: "¿Dónde reviso el detalle de un movimiento?",
        answer:
          "Desde Historial abrí el movimiento: el detalle muestra sus datos completos y sus acciones disponibles, como corregir el importe, revisar el plan de cuotas o registrar una compra mixta.",
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
          "En Mi cuenta, «Copias de seguridad» → «Descargar copia de seguridad», con protección por contraseña opcional. El archivo contiene tus datos financieros: guardalo en un lugar privado y seguro.",
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
