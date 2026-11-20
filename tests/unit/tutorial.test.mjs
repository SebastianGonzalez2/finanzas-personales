import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { ayudaGroups } from "../../src/domain/ayuda.ts";
import {
  parseTutorialStatus,
  shouldShowTutorial,
  tutorialStorageKey,
  tutorialSteps,
} from "../../src/domain/tutorial.ts";

test("SIMP-03: el tutorial tiene los seis pasos de la app de gastos, únicos y con textos cortos", () => {
  assert.deepEqual(
    tutorialSteps.map((step) => step.title),
    [
      "Bienvenido a Finanzas personales",
      "Moneda de toda la app",
      "Gastos del mes",
      "Registrar un gasto",
      "Menú de secciones",
      "Ayuda cuando la necesites",
    ],
  );
  assert.equal(
    new Set(tutorialSteps.map((step) => step.id)).size,
    tutorialSteps.length,
  );
  for (const step of tutorialSteps) assert.ok(step.text.length <= 160);
  // Solo el primer paso es general; el resto señala un elemento real.
  assert.deepEqual(tutorialSteps[0].targets, []);
  for (const step of tutorialSteps.slice(1)) assert.ok(step.targets.length > 0);
});

test("UI-06: los objetivos `data-tour` existen en los componentes reales", () => {
  const sources = [
    "src/components/display-currency-selector.tsx",
    "src/components/glaciar-summary/pieces.tsx",
    "src/components/register-movement-link.tsx",
  ]
    .map((file) => readFileSync(file, "utf8"))
    .join("\n");
  const used = new Set(
    tutorialSteps
      .flatMap((step) => step.targets)
      .flatMap((selector) =>
        [...selector.matchAll(/data-tour="([^"]+)"/g)].map((match) => match[1]),
      ),
  );
  assert.deepEqual([...used].sort(), ["gastos-mes", "moneda-app", "registrar"]);
  for (const name of used) assert.ok(sources.includes(`data-tour="${name}"`));
});

test("F6-06: la clave es versionada y solo guarda estados de interfaz", () => {
  assert.match(tutorialStorageKey, /:v\d+$/);
  assert.equal(parseTutorialStatus("completed"), "completed");
  assert.equal(parseTutorialStatus("hidden"), "hidden");
  assert.equal(parseTutorialStatus("1"), null);
  assert.equal(parseTutorialStatus(null), null);
});

test("F6-06: reglas de primera entrada, preferencia y reapertura", () => {
  const base = { stored: null, skippedThisSession: false, replay: false };
  assert.equal(shouldShowTutorial(base), true);
  assert.equal(shouldShowTutorial({ ...base, stored: "completed" }), false);
  assert.equal(shouldShowTutorial({ ...base, stored: "hidden" }), false);
  assert.equal(
    shouldShowTutorial({ ...base, skippedThisSession: true }),
    false,
  );
  assert.equal(shouldShowTutorial({ ...base, stored: "basura" }), true);
  for (const stored of ["completed", "hidden", null])
    assert.equal(
      shouldShowTutorial({ stored, skippedThisSession: true, replay: true }),
      true,
    );
});

test("F6-06: solo Resumen autenticado monta el tutorial y Ayuda lo reabre", () => {
  const shell = readFileSync("src/components/finance-shell.tsx", "utf8");
  assert.match(shell, /current === "resumen" && <IntroTour \/>/);
  const login = readFileSync("src/app/auth/sign-in/page.tsx", "utf8");
  assert.doesNotMatch(login, /IntroTour|finance-shell/);
  const ayuda = readFileSync("src/app/ayuda/page.tsx", "utf8");
  assert.match(ayuda, /href="\/resumen\?tutorial=1"/);
  assert.match(ayuda, /Volver a ver tutorial/);
  const tour = readFileSync("src/components/intro-tour.tsx", "utf8");
  assert.doesNotMatch(tour, /fetch\(|neon|sql/i);
});

test("UI-06: el tutorial conserva Escape, foco, no modalidad y movimiento reducido", () => {
  const tour = readFileSync("src/components/intro-tour.tsx", "utf8");
  assert.match(tour, /event\.key !== "Escape"/);
  assert.match(tour, /aria-modal="false"/);
  assert.match(tour, /returnFocus/);
  assert.match(tour, /titulo-pagina/);
  for (const label of ["Omitir", "No volver a mostrar", "Finalizar"])
    assert.match(tour, new RegExp(label));
  const css = readFileSync("src/app/glaciar-tour.css", "utf8");
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(css, /\.intro-tour__spot[^}]*pointer-events: none/s);
  assert.match(css, /\.intro-tour__arrow[^}]*pointer-events: none/s);
});

test("UI-06: Ayuda explica el selector de moneda superior", () => {
  const entry = ayudaGroups
    .flatMap((group) => group.entries)
    .find((item) => item.question.includes("selector UYU / USD / EUR"));
  assert.ok(entry);
  assert.match(entry.answer, /No convierte ni mueve tu dinero/);
  assert.match(entry.answer, /conservan su moneda original/);
});
