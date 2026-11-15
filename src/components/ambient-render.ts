// Decisión del fondo ambiental Glaciar (guía §4.4–4.5), sin dependencias del
// navegador para poder probarla. Se evalúa siempre en el cliente, al cargar:
// nunca depende de dónde se compiló la aplicación.
//
// - «accelerated»: WebGL con GPU. Las ondas y la luz del medio se animan como
//   en el prototipo aprobado, salvo con movimiento reducido.
// - «software»: WebGL rasterizado en CPU (SwiftShader en Chromium sin GPU o en
//   CI, llvmpipe, WARP, aceleración desactivada). Animar recalcula cada vidrio
//   en CPU en cada cuadro, así que se dibuja un único fotograma fijo de las
//   mismas ondas: el aspecto aprobado, sin costo continuo.
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
  if (support === "unavailable") return "css";
  return support === "accelerated" && !reducedMotion ? "animated" : "still";
}
