import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  parseTutorialStatus,
  shouldShowTutorial,
  tutorialStorageKey,
  tutorialSteps,
} from "../../src/domain/tutorial.ts";

test("F6-06: el tutorial tiene entre 4 y 5 pasos únicos y textos cortos", () => {
  assert.ok(tutorialSteps.length >= 4 && tutorialSteps.length <= 5);
  assert.equal(
    new Set(tutorialSteps.map((step) => step.id)).size,
    tutorialSteps.length,
  );
  for (const step of tutorialSteps) assert.ok(step.text.length <= 160);
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
