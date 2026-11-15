import assert from "node:assert/strict";
import test from "node:test";
import {
  ambientRender,
  classifyWebgl,
  softwareByName,
} from "../../src/components/ambient-render.ts";

const gpu =
  "ANGLE (AMD, AMD Radeon RX 6650 XT (0x000073EF) Direct3D11 vs_5_0 ps_5_0, D3D11)";
const swiftshader =
  "ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)";

test("HOTFIX: WebGL con GPU se considera acelerado y anima las ondas", () => {
  for (const renderer of [gpu, "Apple GPU", "Adreno (TM) 650", ""])
    assert.equal(
      classifyWebgl({ context: true, withoutCaveat: true, renderer }),
      "accelerated",
      renderer,
    );
  assert.equal(ambientRender("accelerated", false), "animated");
});

test("HOTFIX: WebGL por software usa la capa CSS (sin costo de CPU)", () => {
  for (const renderer of [
    swiftshader,
    "llvmpipe (LLVM 15.0.7, 256 bits)",
    "ANGLE (Microsoft, Microsoft Basic Render Driver Direct3D11)",
  ])
    assert.equal(
      classifyWebgl({ context: true, withoutCaveat: true, renderer }),
      "software",
      renderer,
    );
  // El navegador declara la penalización aunque el nombre no la delate.
  assert.equal(
    classifyWebgl({ context: true, withoutCaveat: false, renderer: gpu }),
    "software",
  );
  assert.equal(ambientRender("software", false), "css");
  assert.equal(ambientRender("software", true), "css");
  assert.equal(softwareByName(swiftshader), true);
  assert.equal(softwareByName(gpu), false);
});

test("HOTFIX: movimiento reducido conserva el fotograma fijo de las ondas", () => {
  assert.equal(ambientRender("accelerated", true), "still");
});

test("HOTFIX: sin WebGL queda la alternativa CSS", () => {
  assert.equal(
    classifyWebgl({ context: false, withoutCaveat: false, renderer: "" }),
    "unavailable",
  );
  assert.equal(ambientRender("unavailable", false), "css");
  assert.equal(ambientRender("unavailable", true), "css");
});
