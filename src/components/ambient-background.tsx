"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";

// UI-02 — Fondo ambiental Glaciar (guía §2–§4, prototipo `_lab/ambient.tsx`):
// ondas de luz WebGL arriba y al final de la página y, en el medio, luz difusa
// tenue que deriva despacio. Siempre hay una capa CSS estática debajo del
// lienzo (sin WebGL, mientras carga, con el contexto perdido o con movimiento
// reducido). El shader se dibuja a la mitad de la resolución, a 30 fps como
// máximo, y se detiene con la pestaña oculta, fuera de la vista o con
// `prefers-reduced-motion` (queda un fotograma fijo). Solo decoración:
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

// Paleta Glaciar del shader (guía §3, `_lab/palettes.ts`).
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

function AmbientWaves({
  position,
  animate,
  scale = 0.5,
}: {
  /** «bottom» dibuja las ondas invertidas para el final de la página. */
  position: "top" | "bottom";
  animate: boolean;
  /** Fracción de la resolución CSS que se renderiza (la luz difusa tolera poca). */
  scale?: number;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const gl = element.getContext("webgl", {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: "low-power",
      preserveDrawingBuffer: false,
    });
    if (!gl) return; // Sin WebGL: queda la capa CSS.

    const vs = compile(gl, gl.VERTEX_SHADER, vertex);
    const fs = compile(gl, gl.FRAGMENT_SHADER, fragment);
    const program = gl.createProgram();
    if (!vs || !fs || !program) return;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return;
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

    let frame = 0;
    let last = 0;
    let lost = false;
    let onScreen = true;
    // Punto de partida estable: el fotograma estático siempre es el mismo.
    const origin = performance.now() - 40_000;
    const still = origin + 40_000;

    function resize() {
      if (!element || !gl) return;
      const width = Math.max(1, Math.round(element.clientWidth * scale));
      const height = Math.max(1, Math.round(element.clientHeight * scale));
      if (element.width !== width || element.height !== height) {
        element.width = width;
        element.height = height;
        gl.viewport(0, 0, width, height);
      }
    }

    function draw(now: number) {
      if (!gl || !element || lost) return;
      resize();
      gl.uniform2f(resolution, element.width, element.height);
      gl.uniform1f(time, (now - origin) / 1000);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      element.dataset.ready = "true";
    }

    function loop(now: number) {
      frame = requestAnimationFrame(loop);
      if (now - last < 1000 / 30) return;
      last = now;
      draw(now);
    }

    function start() {
      cancelAnimationFrame(frame);
      if (!onScreen) return; // Fuera de la vista: no se dibuja.
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
      delete element?.dataset.ready;
    }

    const observer = new ResizeObserver(() => {
      if (!animate && onScreen) draw(still);
    });
    observer.observe(element);
    document.addEventListener("visibilitychange", onVisibility);
    element.addEventListener("webglcontextlost", onLost);
    start();

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      visibility.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      element.removeEventListener("webglcontextlost", onLost);
      gl.deleteProgram(program);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      gl.deleteBuffer(buffer);
    };
  }, [animate, position, scale]);

  return (
    <div
      aria-hidden="true"
      data-ambient={position}
      className={`ambient${position === "bottom" ? " ambient--bottom" : ""}`}
    >
      <canvas ref={canvas} className="ambient__canvas" />
    </div>
  );
}

export function AmbientBackground() {
  const reduced = useReducedMotion();

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
      <div className="ambient-glow" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <AmbientWaves position="top" animate={!reduced} />
      <AmbientWaves position="bottom" animate={!reduced} />
      <div className="ambient-grain" aria-hidden="true" />
    </>
  );
}
