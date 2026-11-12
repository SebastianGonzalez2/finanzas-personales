import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { parseRecurrencePause } from "../../src/domain/recurrence-pause.ts";

const seriesId = randomUUID();
const idempotencyKey = randomUUID();

test("F4-03: pausa y reanudación válidas con identificadores normalizados", () => {
  assert.deepEqual(
    parseRecurrencePause({ seriesId, idempotencyKey, action: "pause" }),
    {
      seriesId,
      idempotencyKey,
      action: "pause",
    },
  );
  assert.deepEqual(
    parseRecurrencePause({
      seriesId: seriesId.toUpperCase(),
      idempotencyKey: idempotencyKey.toUpperCase(),
      action: "resume",
    }),
    { seriesId, idempotencyKey, action: "resume" },
  );
});

test("F4-03: rechaza acciones, identificadores y campos inválidos", () => {
  for (const invalid of [
    null,
    "pause",
    {},
    { seriesId, idempotencyKey },
    { seriesId, idempotencyKey, action: "delete" },
    { seriesId, idempotencyKey, action: "pause", target: {} },
    { seriesId: randomUUID(), idempotencyKey: "no-uuid", action: "pause" },
    { seriesId, idempotencyKey, action: 1 },
    { seriesId: "no-uuid", idempotencyKey, action: "pause" },
  ])
    assert.ok("error" in parseRecurrencePause(invalid));
});
