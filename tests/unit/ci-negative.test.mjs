import assert from "node:assert/strict";
import test from "node:test";

test("F0-06: fallo deliberado temporal para verificar CI remoto", () => {
  assert.fail(
    "Prueba negativa F0-06: se retirará tras observar el check fallido",
  );
});
