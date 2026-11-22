"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import {
  ambientRender,
  classifyWebgl,
  softwareByName,
  type AmbientRender,
  type WebglSupport,
} from "./ambient-render";

// UI-02 — Fondo ambiental Glaciar (guía §2–§4, prototipo UI-01 retirado en UI-06):
// ondas de luz WebGL arriba y al final de la página y, en el medio, luz difusa
// tenue que deriva despacio. Siempre hay una capa CSS estática debajo del
// lienzo (sin WebGL, mientras carga o con el contexto perdido). El shader se
// dibuja a la mitad de la resolución, a ~22 fps como máximo, y se detiene con
// la pestaña oculta o fuera de la vista. Con GPU y `prefers-reduced-motion`
// queda un fotograma fijo de las mismas ondas; con WebGL por software o sin
// WebGL, la capa CSS (ver `ambient-render.ts`). Solo decoración:
// `aria-hidden`, sin datos ni almacenamiento.

const vertex = `attribute vec2 a_pos;void main(){gl_Position=vec4(a_pos,0.0,1.0);}`;

const fragment = `
precision mediump float;
uniform vec2 u_res;
uniform float u_time;
uniform vec3 u_base;
uniform vec3 u_c0;
uniform vec3 u_c1;
uniform vec3 u_c2;
uniform vec3 u_c3;
uniform float u_gain;
uniform float u_flip;
uniform float u_seed;
uniform float u_offset;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p);vec2 f=fract(p);vec2 u=f*f*(3.0-2.0*f);
return mix(mix(hash(i),hash(i+vec2(1.0,0.0)),u.x),mix(hash(i+vec2(0.0,1.0)),hash(i+vec2(1.0,1.0)),u.x),u.y);}
float fbm(vec2 p){float v=0.0;float a=0.5;for(int i=0;i<4;i++){v+=a*noise(p);p*=2.02;a*=0.5;}return v;}
void main(){
  vec2 uv=gl_FragCoord.xy/u_res;
  if(u_flip>0.5) uv.y=1.0-uv.y;
  vec2 p=uv;p.x*=u_res.x/u_res.y;
  float t=u_time*0.045+u_seed;
  vec3 col=u_base;
  for(int i=0;i<4;i++){
    float fi=float(i);
    float y=0.74+u_offset-fi*0.075
      +0.085*sin(p.x*1.25+t*(1.0+fi*0.25)+fi*1.7)
      +0.045*sin(p.x*2.6-t*0.8+fi*2.3)
      +0.07*(fbm(vec2(p.x*0.7+t*0.35,fi*3.0))-0.5);
    float w=0.055+0.03*fi;
    float d=(uv.y-y)/w;
    float band=exp(-d*d);
    float silk=exp(-d*d*22.0);
    vec3 c=i==0?u_c0:i==1?u_c1:i==2?u_c2:u_c3;
    col+=c*(band*0.26+silk*0.30)*u_gain;
  }
  col=mix(u_base,col,0.18+0.82*smoothstep(0.08,0.62,uv.y));
  col=mix(col,u_base,smoothstep(0.55,1.25,abs(uv.x-0.5)*1.6)*0.35);
  col+=(hash(gl_FragCoord.xy+fract(u_time))-0.5)/255.0;
  gl_FragColor=vec4(col,1.0);
}`;

type Rgb = readonly [number, number, number];

// Paleta Glaciar del shader (guía §3).
const glaciar = {
  base: [0.027, 0.035, 0.047] as Rgb,
  bands: [
    [0.55, 0.68, 0.82],
    [0.3, 0.4, 0.54],
    [0.42, 0.66, 0.74],
    [0.2, 0.26, 0.36],
  ] as readonly Rgb[],
  gain: 0.72,
};

const reducedQuery = "(prefers-reduced-motion: reduce)";

function subscribeReduced(listener: () => void) {
  const query = window.matchMedia(reducedQuery);
  query.addEventListener("change", listener);
  return () => query.removeEventListener("change", listener);
}

/** `true` si el sistema pide reducir el movimiento (en servidor: sin animar). */
function useReducedMotion() {
  return useSyncExternalStore(
    subscribeReduced,
    () => window.matchMedia(reducedQuery).matches,
    () => true,
  );
}

let webglSupport: WebglSupport | undefined;

function release(gl: WebGLRenderingContext | null) {
  gl?.getExtension("WEBGL_lose_context")?.loseContext();
}

function probeWebgl(): WebglSupport {
  if (webglSupport !== undefined) return webglSupport;
  try {
    const gl = document.createElement("canvas").getContext("webgl");
    const info = gl?.getExtension("WEBGL_debug_renderer_info");
    const renderer = info
      ? String(gl?.getParameter(info.UNMASKED_RENDERER_WEBGL) ?? "")
      : "";
    release(gl);
    // Chromium y Firefox devuelven `null` con esta opción cuando solo pueden
    // ofrecer WebGL por software. Si el nombre ya lo delata, no hace falta un
    // segundo contexto (cada uno cuesta en CPU sin GPU).
    const fast =
      gl && !softwareByName(renderer)
        ? document
            .createElement("canvas")
            .getContext("webgl", { failIfMajorPerformanceCaveat: true })
        : null;
    release(fast);
    webglSupport = classifyWebgl({
      context: gl !== null,
      withoutCaveat: fast !== null,
      renderer,
    });
  } catch {
    webglSupport = "unavailable";
  }
  return webglSupport;
}

const noSubscription = () => () => {};

/** Capacidad WebGL del navegador (en servidor: alternativa CSS). */
function useWebglSupport() {
  return useSyncExternalStore(
    noSubscription,
    probeWebgl,
    (): WebglSupport => "unavailable",
  );
}

function compile(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

type WaveLayer = {
  canvas: HTMLCanvasElement;
  /** Cambia entre ondas animadas y un fotograma fijo sin recrear el contexto. */
  setAnimate(animate: boolean): void;
  dispose(): void;
};

// Milisegundos mínimos entre dibujos de las ondas. El movimiento es muy lento
// (unos 4 px/s como máximo): ~22 fotogramas por segundo se ven igual de suaves
// que 30 y reducen el trabajo de GPU y de compositor.
const frameInterval = 45;

function createWaveLayer(
  position: "top" | "bottom",
  scale: number,
  initialAnimate: boolean,
): WaveLayer | null {
  const element = document.createElement("canvas");
  element.className = "ambient__canvas";
  const gl = element.getContext("webgl", {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    powerPreference: "low-power",
    preserveDrawingBuffer: false,
    failIfMajorPerformanceCaveat: true,
  });
  if (!gl) return null; // Sin WebGL acelerado: queda la capa CSS.

  const vs = compile(gl, gl.VERTEX_SHADER, vertex);
  const fs = compile(gl, gl.FRAGMENT_SHADER, fragment);
  const program = gl.createProgram();
  if (!vs || !fs || !program) return null;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null;
  gl.useProgram(program);

  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 3, -1, -1, 3]),
    gl.STATIC_DRAW,
  );
  const vertexPosition = gl.getAttribLocation(program, "a_pos");
  gl.enableVertexAttribArray(vertexPosition);
  gl.vertexAttribPointer(vertexPosition, 2, gl.FLOAT, false, 0, 0);
  const resolution = gl.getUniformLocation(program, "u_res");
  const time = gl.getUniformLocation(program, "u_time");
  const setColor = (name: string, [r, g, b]: Rgb) =>
    gl.uniform3f(gl.getUniformLocation(program, name), r, g, b);
  setColor("u_base", glaciar.base);
  glaciar.bands.forEach((band, index) => setColor(`u_c${index}`, band));
  gl.uniform1f(gl.getUniformLocation(program, "u_gain"), glaciar.gain);
  const bottom = position === "bottom";
  gl.uniform1f(gl.getUniformLocation(program, "u_flip"), bottom ? 1 : 0);
  // Otra fase para que abajo no sea un espejo exacto de arriba.
  gl.uniform1f(gl.getUniformLocation(program, "u_seed"), bottom ? 7.3 : 0);
  // Abajo, las ondas se apoyan cerca del borde inferior (el espacio libre
  // bajo el último panel) en lugar de quedar detrás del contenido.
  gl.uniform1f(gl.getUniformLocation(program, "u_offset"), bottom ? 0.17 : 0);

  let animate = initialAnimate;
  let frame = 0;
  let last = 0;
  let lost = false;
  let onScreen = true;
  // Punto de partida estable: el fotograma estático siempre es el mismo. El
  // reloj vive con la capa (no con la página): al navegar, las ondas siguen
  // desde donde estaban en lugar de reiniciarse.
  const origin = performance.now() - 40_000;
  const still = origin + 40_000;

  function resize() {
    const width = Math.max(1, Math.round(element.clientWidth * scale));
    const height = Math.max(1, Math.round(element.clientHeight * scale));
    if (element.width !== width || element.height !== height) {
      element.width = width;
      element.height = height;
      gl!.viewport(0, 0, width, height);
    }
  }

  function draw(now: number) {
    if (lost || !element.isConnected) return;
    resize();
    gl!.uniform2f(resolution, element.width, element.height);
    gl!.uniform1f(time, (now - origin) / 1000);
    gl!.drawArrays(gl!.TRIANGLES, 0, 3);
    // Solo la primera vez: reescribir el atributo cada cuadro invalida estilos.
    if (element.dataset.ready !== "true") element.dataset.ready = "true";
  }

  function loop(now: number) {
    frame = requestAnimationFrame(loop);
    if (now - last < frameInterval) return;
    last = now;
    draw(now);
  }

  function start() {
    cancelAnimationFrame(frame);
    if (!onScreen) return; // Fuera de la vista o sin página: no se dibuja.
    if (animate && !document.hidden) frame = requestAnimationFrame(loop);
    else draw(still);
  }

  const visibility = new IntersectionObserver(([entry]) => {
    onScreen = entry.isIntersecting;
    start();
  });
  visibility.observe(element);

  function onVisibility() {
    if (document.hidden) cancelAnimationFrame(frame);
    else start();
  }

  function onLost(event: Event) {
    event.preventDefault();
    lost = true;
    cancelAnimationFrame(frame);
    delete element.dataset.ready;
  }

  const observer = new ResizeObserver(() => {
    if (!animate && onScreen) draw(still);
  });
  observer.observe(element);
  document.addEventListener("visibilitychange", onVisibility);
  element.addEventListener("webglcontextlost", onLost);

  return {
    canvas: element,
    setAnimate(next) {
      if (next === animate) return;
      animate = next;
      start();
    },
    dispose() {
      cancelAnimationFrame(frame);
      observer.disconnect();
      visibility.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      element.removeEventListener("webglcontextlost", onLost);
      gl.deleteProgram(program);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      gl.deleteBuffer(buffer);
      release(gl);
      element.remove();
    },
  };
}

// Cada página del shell monta su propio fondo. Para no crear de nuevo el
// contexto WebGL, compilar el shader y reiniciar la animación en cada
// navegación, las capas viven a nivel de módulo: la página que se desmonta
// suelta el lienzo y la siguiente lo reutiliza (si nadie lo reclama en unos
// segundos, se libera el contexto).
const layers: Partial<Record<"top" | "bottom", WaveLayer | null>> = {};
const holders = { top: 0, bottom: 0 };
const disposals: Partial<Record<"top" | "bottom", number>> = {};
const layerGrace = 3000;

function acquireWaveLayer(
  position: "top" | "bottom",
  scale: number,
  animate: boolean,
) {
  window.clearTimeout(disposals[position]);
  holders[position] += 1;
  let layer = layers[position];
  if (layer === undefined) {
    layer = createWaveLayer(position, scale, animate);
    layers[position] = layer;
  } else layer?.setAnimate(animate);
  return layer;
}

// Con la transición de Next la página nueva puede montarse antes de que la
// anterior termine de desmontarse: solo se suelta el lienzo si sigue en el
// contenedor que se va, y solo se libera el contexto sin ningún titular.
function releaseWaveLayer(position: "top" | "bottom", host: HTMLElement) {
  holders[position] -= 1;
  const layer = layers[position];
  if (!layer) return;
  if (layer.canvas.parentElement === host) layer.canvas.remove();
  if (holders[position] > 0) return;
  disposals[position] = window.setTimeout(() => {
    layer.dispose();
    delete layers[position];
  }, layerGrace);
}

function AmbientWaves({
  position,
  render,
  scale = 0.5,
}: {
  /** «bottom» dibuja las ondas invertidas para el final de la página. */
  position: "top" | "bottom";
  /** «css»: no se crea contexto WebGL y queda la capa CSS estática. */
  render: AmbientRender;
  /** Fracción de la resolución CSS que se renderiza (la luz difusa tolera poca). */
  scale?: number;
}) {
  const host = useRef<HTMLDivElement>(null);
  const animate = render === "animated";
  const enabled = render !== "css";

  useEffect(() => {
    const element = host.current;
    if (!element || !enabled) return;
    const layer = acquireWaveLayer(position, scale, animate);
    if (!layer) return;
    element.appendChild(layer.canvas);
    return () => releaseWaveLayer(position, element);
  }, [animate, enabled, position, scale]);

  return (
    <div
      ref={host}
      aria-hidden="true"
      data-ambient={position}
      data-render={render}
      className={`ambient${position === "bottom" ? " ambient--bottom" : ""}`}
    >
      {/* Sin WebGL acelerado el lienzo queda inerte (opacidad 0): se ve la capa CSS. */}
      {!enabled && <canvas className="ambient__canvas" />}
    </div>
  );
}

export function AmbientBackground() {
  const reduced = useReducedMotion();
  const support = useWebglSupport();
  const render = ambientRender(support, reduced);
  // La luz del medio deriva solo con GPU: por software, cada cuadro vuelve a
  // desenfocar en CPU todos los vidrios. El CSS la detiene además con
  // movimiento reducido o con la pestaña oculta.
  const accelerated = support === "accelerated";

  // Con la pestaña oculta también se detiene la deriva CSS de la luz del medio.
  useEffect(() => {
    const root = document.documentElement;
    function sync() {
      if (document.hidden) root.dataset.ambient = "paused";
      else delete root.dataset.ambient;
    }
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => {
      document.removeEventListener("visibilitychange", sync);
      delete root.dataset.ambient;
    };
  }, []);

  return (
    <>
      {/* Luz suave y lenta en toda la pantalla: el medio no queda negro y quieto. */}
      <div
        className="ambient-glow"
        data-motion={accelerated ? undefined : "static"}
        aria-hidden="true"
      >
        <span />
        <span />
        <span />
      </div>
      <AmbientWaves position="top" render={render} />
      <AmbientWaves position="bottom" render={render} />
      <div className="ambient-grain" aria-hidden="true" />
    </>
  );
}
