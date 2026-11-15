// Decisión del fondo ambiental Glaciar (guía §4.4–4.5), sin dependencias del
// navegador para poder probarla. Se evalúa siempre en el cliente, al cargar:
// nunca depende de dónde se compiló la aplicación.
//
// - «accelerated»: WebGL con GPU. Las ondas y la luz del medio se animan como
//   en el prototipo aprobado; con movimiento reducido queda un fotograma fijo
//   de las mismas ondas.
// - «software»: WebGL rasterizado en CPU (SwiftShader en Chromium sin GPU o en
//   CI, llvmpipe, WARP, aceleración desactivada). Ni siquiera un fotograma es
//   barato: crear el contexto y compilar el shader bloquean ~300 ms el hilo
//   principal en cada carga (medido en Chromium sin GPU), y animar recalcula
//   cada vidrio en CPU. Queda la capa CSS estática.
// - «unavailable»: sin WebGL; queda la capa CSS estática.
export type WebglSupport = "accelerated" | "software" | "unavailable";

/** Cómo se dibujan las ondas: animadas, fotograma fijo o solo la capa CSS. */
export type AmbientRender = "animated" | "still" | "css";

// Rasterizadores por software que no siempre declaran la penalización de
// rendimiento (SwiftShader en Chromium sin GPU, llvmpipe/softpipe en Linux,
// «Microsoft Basic Render Driver» en Windows).
const softwareRenderer = /swiftshader|llvmpipe|softpipe|software|basic render/i;

export function classifyWebgl({
  context,
  withoutCaveat,
  renderer,
}: {
  /** Se pudo crear un contexto WebGL. */
  context: boolean;
  /** También se pudo crear con `failIfMajorPerformanceCaveat`. */
  withoutCaveat: boolean;
  /** `UNMASKED_RENDERER_WEBGL`, o vacío si el navegador no lo expone. */
  renderer: string;
}): WebglSupport {
  if (!context) return "unavailable";
  return withoutCaveat && !softwareRenderer.test(renderer)
    ? "accelerated"
    : "software";
}

export function ambientRender(
  support: WebglSupport,
  reducedMotion: boolean,
): AmbientRender {
  if (support !== "accelerated") return "css";
  return reducedMotion ? "still" : "animated";
}

/** El nombre del renderizador ya delata WebGL por software. */
export function softwareByName(renderer: string) {
  return softwareRenderer.test(renderer);
}
