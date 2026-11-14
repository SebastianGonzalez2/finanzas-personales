"use client";

import { useEffect, useRef } from "react";
import { useLabMotion } from "./motion";
import { palettes, type Palette, type PaletteKey } from "./palettes";

// UI-01 — Fondo ambiental. Siempre hay una capa CSS estática (alternativa sin
// WebGL, con movimiento reducido o mientras carga). El shader se dibuja a baja
// resolución (la luz difusa no necesita detalle), a 30 fps como máximo, y se
// detiene con la pestaña oculta, con movimiento reducido o con la pausa manual.

const vertex = `attribute vec2 a_pos;void main(){gl_Position=vec4(a_pos,0.0,1.0);}`;

const common = `
precision mediump float;
uniform vec2 u_res;
uniform float u_time;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p);vec2 f=fract(p);vec2 u=f*f*(3.0-2.0*f);
return mix(mix(hash(i),hash(i+vec2(1.0,0.0)),u.x),mix(hash(i+vec2(0.0,1.0)),hash(i+vec2(1.0,1.0)),u.x),u.y);}
float fbm(vec2 p){float v=0.0;float a=0.5;for(int i=0;i<4;i++){v+=a*noise(p);p*=2.02;a*=0.5;}return v;}
`;

// Ondas de seda: bandas lentas que se funden con la base. Los colores llegan
// como uniformes desde la paleta elegida.
const fragment = `${common}
uniform vec3 u_base;
uniform vec3 u_c0;
uniform vec3 u_c1;
uniform vec3 u_c2;
uniform vec3 u_c3;
uniform float u_gain;
void main(){
  vec2 uv=gl_FragCoord.xy/u_res;
  vec2 p=uv;p.x*=u_res.x/u_res.y;
  float t=u_time*0.045;
  vec3 col=u_base;
  for(int i=0;i<4;i++){
    float fi=float(i);
    float y=0.74-fi*0.075
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

export function AmbientShader({
  palette,
  scale = 0.4,
}: {
  palette: PaletteKey;
  /** Fracción de la resolución CSS que se renderiza (la luz difusa tolera poca). */
  scale?: number;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const { animate } = useLabMotion();

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
    const position = gl.getAttribLocation(program, "a_pos");
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    const resolution = gl.getUniformLocation(program, "u_res");
    const time = gl.getUniformLocation(program, "u_time");
    const colors: Palette = palettes[palette];
    const setColor = (name: string, [r, g, b]: Palette["base"]) =>
      gl.uniform3f(gl.getUniformLocation(program, name), r, g, b);
    setColor("u_base", colors.base);
    colors.bands.forEach((band, index) => setColor(`u_c${index}`, band));
    gl.uniform1f(gl.getUniformLocation(program, "u_gain"), colors.gain);

    let frame = 0;
    let last = 0;
    let lost = false;
    // Punto de partida estable: el fotograma estático siempre es el mismo.
    const origin = performance.now() - 40_000;

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
      if (!gl || lost) return;
      resize();
      gl.uniform2f(resolution, element!.width, element!.height);
      gl.uniform1f(time, (now - origin) / 1000);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      element!.dataset.ready = "true";
    }

    function loop(now: number) {
      frame = requestAnimationFrame(loop);
      if (now - last < 1000 / 30) return;
      last = now;
      draw(now);
    }

    function start() {
      cancelAnimationFrame(frame);
      if (!onScreen) return; // Fuera de la vista (variante C): no se dibuja.
      if (animate && !document.hidden) frame = requestAnimationFrame(loop);
      else draw(origin + 40_000);
    }

    let onScreen = true;
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
      delete element!.dataset.ready;
    }

    const observer = new ResizeObserver(() => {
      if (!animate) draw(origin + 40_000);
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
  }, [palette, scale, animate]);

  return (
    <div aria-hidden="true" className="lab-ambient lab-ambient--waves">
      <canvas ref={canvas} className="lab-ambient__canvas" />
    </div>
  );
}
