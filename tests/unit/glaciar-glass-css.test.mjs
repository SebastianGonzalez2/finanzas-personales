import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = join(import.meta.dirname, "../..");
const read = (path) => readFileSync(join(root, path), "utf8");

// HOTFIX: con `backdrop-filter` y `-webkit-backdrop-filter` en la misma regla,
// la minificación de producción conservaba solo la prefijada y Chrome/Edge
// dejaban los paneles, el riel y el dock sin vidrio. El compilador ya agrega
// el prefijo de Safari a partir de la declaración estándar.
test("HOTFIX: el CSS del producto declara el vidrio solo sin prefijo", () => {
  for (const file of [
    "src/app/globals.css",
    "src/app/glaciar-summary.css",
    "src/app/glaciar-history.css",
  ]) {
    const css = read(file).replace(/@supports[^{]*\{/g, "");
    assert.doesNotMatch(
      css,
      /^\s*-webkit-backdrop-filter\s*:/m,
      `${file} no debe repetir -webkit-backdrop-filter`,
    );
  }
});

test("HOTFIX: el CSS compilado conserva backdrop-filter estándar", (t) => {
  const dir = join(root, ".next/static/css");
  if (!existsSync(dir))
    return t.skip("sin build de producción (CI la ejecuta tras npm run check)");
  const rules = readdirSync(dir)
    .filter((file) => file.endsWith(".css"))
    .flatMap((file) =>
      readFileSync(join(dir, file), "utf8").match(/[^{}]+\{[^{}]*\}/g),
    )
    .filter((rule) => rule?.includes("-webkit-backdrop-filter:"));
  assert.ok(rules.length > 0);
  for (const rule of rules)
    assert.match(
      rule,
      /[{;]backdrop-filter:/,
      `regla sin backdrop-filter estándar: ${rule.slice(0, 120)}`,
    );
});
