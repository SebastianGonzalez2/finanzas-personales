// F0-02: verificación documental sin paquetes externos. Ejecutar desde la raíz.
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import console from 'node:console';
import process from 'node:process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const files = [
  'docs/design/fintrack-visual-spec.md',
  'docs/planning/10-informe-f0-02.md',
  'docs/planning/README.md',
  'docs/planning/05-plan-de-implementacion.md',
  'docs/planning/06-riesgos-y-pendientes.md',
];
let linkCount = 0;
const failures = [];
for (const file of files) {
  const markdown = readFileSync(resolve(root, file), 'utf8');
  for (const match of markdown.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
    const target = match[1];
    if (/^(https?:|#)/.test(target)) continue;
    const path = decodeURIComponent(target.split('#')[0]);
    linkCount++;
    if (!existsSync(resolve(root, dirname(file), path))) {
      failures.push(`Enlace local inexistente: ${file} -> ${target}`);
    }
  }
}

const spec = readFileSync(resolve(root, files[0]), 'utf8');
const palette = spec.split('### 2.1 Color y contraste')[1].split('### 2.2')[0];
const tokens = new Map();
for (const row of palette.split('\n').filter((line) => line.startsWith('| `'))) {
  const cells = row.split('|');
  const names = [...cells[1].matchAll(/`([^`]+)`/g)].map((m) => m[1]);
  const colors = cells[2].match(/#[0-9A-F]{6}/g) ?? [];
  if (names.length === colors.length) {
    names.forEach((name, i) => tokens.set(name, colors[i]));
  } else if (names.length > 1 && colors.length === 1) {
    names.forEach((name) => tokens.set(name, colors[0]));
  } else if (names.length === 1 && colors.length === 2) {
    tokens.set(names[0], colors[0]);
    tokens.set(`${names[0]}-background`, colors[1]);
  } else {
    failures.push(`Fila de tokens ambigua: ${row}`);
  }
}

function luminance(hex) {
  const rgb = hex.slice(1).match(/../g).map((v) => parseInt(v, 16) / 255);
  const linear = rgb.map((v) => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

let contrastCount = 0;
let textMinimum = Infinity;
let nonTextMinimum = Infinity;
function check(foreground, background, threshold) {
  if (!tokens.has(foreground) || !tokens.has(background)) {
    failures.push(`Token inexistente: ${foreground} / ${background}`);
    return;
  }
  const values = [luminance(tokens.get(foreground)), luminance(tokens.get(background))];
  const ratio = (Math.max(...values) + 0.05) / (Math.min(...values) + 0.05);
  contrastCount++;
  if (threshold === 4.5) textMinimum = Math.min(textMinimum, ratio);
  else nonTextMinimum = Math.min(nonTextMinimum, ratio);
  if (ratio < threshold) failures.push(`Contraste ${foreground}/${background}: ${ratio} < ${threshold}`);
}

const surfaces = ['canvas', 'sidebar', 'input', 'hover', 'selected'];
for (const foreground of ['text-primary', 'text-secondary', 'text-muted', 'info']) {
  surfaces.forEach((background) => check(foreground, background, 4.5));
}
for (const background of ['primary', 'primary-hover', 'primary-pressed']) {
  check('text-primary', background, 4.5);
}
for (const foreground of ['success', 'warning', 'danger', 'neutral', 'violet']) {
  check(foreground, `${foreground}-background`, 4.5);
  check(foreground, 'surface', 4.5);
}
for (const foreground of ['border-control', 'focus']) {
  [...surfaces, 'primary', 'primary-hover', 'primary-pressed'].forEach((background) => {
    // El borde neutro identifica inputs; el anillo identifica foco también en botones azules.
    if (foreground === 'border-control' && background.startsWith('primary')) return;
    check(foreground, background, 3);
  });
}
for (const foreground of ['chart-blue', 'chart-green', 'chart-violet', 'chart-orange']) {
  ['track', 'surface'].forEach((background) => check(foreground, background, 3));
}

if (failures.length) {
  failures.forEach((message) => console.error(message));
  process.exitCode = 1;
} else {
  console.log(`PASS: ${linkCount} enlaces locales en ${files.length} documentos.`);
  console.log(`PASS: ${contrastCount} pares de contraste; mínimos texto ${textMinimum.toFixed(3)}:1, no textual ${nonTextMinimum.toFixed(3)}:1.`);
  console.log('Alcance: tokens sólidos y enlaces locales; no certifica UI, accesibilidad ni CA funcionales.');
}
