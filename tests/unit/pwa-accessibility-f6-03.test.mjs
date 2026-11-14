import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = join(import.meta.dirname, "../..");
const read = (path) => readFileSync(join(root, path), "utf8");

function walk(dir) {
  return readdirSync(join(root, dir), { withFileTypes: true }).flatMap(
    (entry) =>
      entry.isDirectory()
        ? walk(join(dir, entry.name))
        : [join(dir, entry.name)],
  );
}

test("F6-03: el manifest declara instalación, idioma, colores e íconos PNG", async () => {
  const { default: manifest } = await import("../../src/app/manifest.ts");
  const data = manifest();
  assert.equal(data.name, "Finanzas personales");
  assert.equal(data.lang, "es");
  assert.equal(data.start_url, "/");
  assert.equal(data.display, "standalone");
  assert.equal(data.theme_color, "#070a0d");
  assert.equal(data.background_color, "#070a0d");
  assert.ok(data.description);
  const png = data.icons.filter((icon) => icon.type === "image/png");
  assert.ok(png.some((icon) => icon.sizes === "192x192"));
  assert.ok(png.some((icon) => icon.sizes === "512x512"));
  assert.ok(png.some((icon) => icon.purpose === "maskable"));
  assert.deepEqual(
    data.icons.map((icon) => icon.src).filter((src) => src.startsWith("/pwa-")),
    png.map((icon) => icon.src),
  );
});

test("F6-03: PWA sin almacenamiento financiero offline ni caché de respuestas", () => {
  const sources = [...walk("src"), "public/card-push-worker.js"].filter(
    (file) => /\.(tsx?|mjs|js)$/.test(file),
  );
  const forbidden =
    /\b(indexedDB|localStorage|sessionStorage|caches\.|CacheStorage|BackgroundSync|periodicSync)\b|navigator\.serviceWorker\.register/;
  // F6-06: única excepción, la preferencia de interfaz del tutorial (ver tutorial.test.mjs).
  const uiPreference = [
    "src/components/intro-tour.tsx",
    "src/domain/tutorial.ts",
  ];
  const offenders = sources.filter(
    (file) =>
      !uiPreference.includes(file.replaceAll("\\", "/")) &&
      forbidden.test(read(file)),
  );
  assert.deepEqual(offenders, []);
  assert.deepEqual(readdirSync(join(root, "public")).sort(), [
    "card-push-worker.js",
  ]);
});

test("F6-03: el aviso de conexión informa sin persistir ni reintentar solo", () => {
  const status = read("src/components/connection-status.tsx");
  assert.match(status, /aria-live="polite"/);
  assert.doesNotMatch(status, /\srole=/, "No duplica los estados de página");
  assert.doesNotMatch(status, /fetch\(|localStorage|indexedDB/);
});

test("F6-03: los mensajes de fallo de red nunca anuncian éxito", async () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const setOnline = (onLine) =>
    Object.defineProperty(globalThis, "navigator", {
      value: { onLine },
      configurable: true,
    });
  try {
    const { connectionAwareMessage, offlineSaveMessage } =
      await import("../../src/components/connection.ts");
    setOnline(false);
    assert.equal(connectionAwareMessage("base"), offlineSaveMessage);
    assert.match(offlineSaveMessage, /^Sin conexión/);
    assert.match(offlineSaveMessage, /siguen en el formulario/);
    assert.match(offlineSaveMessage, /reintentá el mismo envío/);
    assert.doesNotMatch(
      offlineSaveMessage,
      /registrad|guardad[oa] correctamente/i,
    );
    setOnline(true);
    assert.equal(connectionAwareMessage("base"), "base");
  } finally {
    if (original) Object.defineProperty(globalThis, "navigator", original);
  }
});

function luminance(hex) {
  const channel = (offset) => {
    const value = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

test("F6-03: el texto de estado y los tokens cumplen contraste AA (4,5:1) sobre el fondo", () => {
  const css = read("src/app/globals.css");
  const token = (name) =>
    css.match(new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`, "i"))?.[1];
  const background = token("background");
  for (const [label, color] of [
    ["foreground", token("foreground")],
    ["muted-foreground", token("muted-foreground")],
    ["ring", token("ring")],
    ["amber-400 (advertencia)", "#fbbf24"],
    ["red-400 (límite)", "#f87171"],
    ["amber-200 (aviso de conexión)", "#fde68a"],
  ]) {
    assert.ok(
      contrast(color, background) >= 4.5,
      `${label} sobre ${background}`,
    );
  }
  assert.ok(
    contrast(token("primary-foreground"), token("primary")) >= 4.5,
    "Texto sobre botón primario",
  );
  assert.ok(contrast(token("ring"), background) >= 3, "Foco ≥ 3:1");
  const notices = read("src/components/notices.tsx");
  assert.match(notices, /text-amber-400/);
  assert.match(notices, /text-red-400/);
  assert.doesNotMatch(notices, /text-(red|amber)-600/);
});

test("F6-03: controles con área táctil adecuada y texto legible", () => {
  const files = walk("src").filter((file) => file.endsWith(".tsx"));
  const small = files.filter((file) =>
    /min-h-(8|9)\b|text-\[(10|11)px\]/.test(read(file)),
  );
  assert.deepEqual(small, []);
  const css = read("src/app/globals.css");
  assert.match(css, /summary\s*{[^}]*padding-block/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /\[aria-invalid="true"\]/);
});

test("F6-03: el layout declara color de tema y registra los avisos globales", () => {
  const layout = read("src/app/layout.tsx");
  assert.match(layout, /themeColor: "#070a0d"/);
  assert.match(layout, /<ConnectionStatus \/>/);
  assert.match(layout, /<FormValidation \/>/);
  assert.match(layout, /lang="es"/);
});
