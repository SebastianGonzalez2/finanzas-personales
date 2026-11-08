import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import test from "node:test";
import { createAdmissionExperiment, digestCode } from "../admission.mjs";

const now = 1_800_000_000_000;
function setup() {
  const code = randomBytes(32).toString("base64url");
  let clock = now;
  const policy = createAdmissionExperiment({
    codeDigest: digestCode(code),
    now: () => clock,
  });
  const approve = (
    email = "a@example.invalid",
    provider = "credential",
    invitation = code,
  ) => policy.approveCode({ code: invitation, email, provider });
  const event = (
    admissionId,
    email = "a@example.invalid",
    provider = "credential",
    id = randomUUID(),
  ) => ({
    event_id: randomUUID(),
    event_type: "user.before_create",
    user: { id, email },
    event_data: { auth_provider: provider, signup_metadata: { admissionId } },
  });
  return {
    code,
    policy,
    approve,
    event,
    advance: (ms) => {
      clock += ms;
    },
  };
}

for (const provider of ["credential", "google"]) {
  test(`${provider}: alta directa, código inválido y metadatos ausentes no autorizan`, () => {
    const f = setup();
    assert.equal(f.approve("a@example.invalid", provider, "incorrecto"), null);
    assert.equal(
      f.policy.beforeCreate(f.event(undefined, undefined, provider)).allowed,
      false,
    );
    assert.equal(
      f.policy.beforeCreate(f.event(randomUUID(), undefined, provider)).allowed,
      false,
    );
  });
  test(`${provider}: código grupal reutilizable autoriza dos titulares diferentes`, () => {
    const f = setup();
    for (const email of ["a@example.invalid", "b@example.invalid"]) {
      const admission = f.approve(email, provider);
      assert.equal(
        f.policy.beforeCreate(f.event(admission, email, provider)).allowed,
        true,
      );
    }
  });
  test(`${provider}: rotación invalida código y permisos pendientes; conserva cuenta admitida`, () => {
    const f = setup();
    const owner = f.event(
      f.approve("a@example.invalid", provider),
      "a@example.invalid",
      provider,
    );
    assert.equal(f.policy.beforeCreate(owner).allowed, true);
    const pending = f.approve("b@example.invalid", provider);
    const nextCode = randomBytes(32).toString("base64url");
    f.policy.rotate(digestCode(nextCode));
    assert.equal(f.approve("b@example.invalid", provider), null);
    assert.equal(
      f.policy.beforeCreate(f.event(pending, "b@example.invalid", provider))
        .allowed,
      false,
    );
    assert.ok(f.approve("b@example.invalid", provider, nextCode));
    const session = {
      user: { id: owner.user.id, emailVerified: true },
      session: {
        userId: owner.user.id,
        expiresAt: new Date(now + 60_000).toISOString(),
      },
    };
    assert.equal(f.policy.canAccessOwner(session, owner.user.id), true);
  });
}

test("permiso ligado al correo y método; no se traslada entre identidades", () => {
  const f = setup();
  const admission = f.approve();
  assert.equal(
    f.policy.beforeCreate(f.event(admission, "b@example.invalid")).allowed,
    false,
  );
  assert.equal(
    f.policy.beforeCreate(f.event(admission, undefined, "google")).allowed,
    false,
  );
  assert.equal(f.policy.beforeCreate(f.event(admission)).allowed, true);
  assert.equal(f.policy.beforeCreate(f.event(admission)).allowed, false);
});

test("reintento del mismo evento es idempotente; cambiar su sujeto se rechaza", () => {
  const f = setup();
  const event = f.event(f.approve());
  assert.deepEqual(f.policy.beforeCreate(event), { allowed: true });
  assert.deepEqual(f.policy.beforeCreate(event), { allowed: true });
  assert.equal(
    f.policy.beforeCreate({ ...event, user: { ...event.user, id: "otro" } })
      .allowed,
    false,
  );
});

test("registro interrumpido: caduca permiso y revocación bloquea pendientes", () => {
  const f = setup();
  const admission = f.approve();
  f.advance(300_000);
  assert.equal(f.policy.beforeCreate(f.event(admission)).allowed, false);
  f.policy.rotate(null);
  assert.equal(f.approve(), null);
});

test("sesión sin verificación, vencida, sin admisión o de otro titular no accede (I-12)", () => {
  const f = setup();
  const event = f.event(f.approve());
  f.policy.beforeCreate(event);
  const session = {
    user: { id: event.user.id, emailVerified: true },
    session: {
      userId: event.user.id,
      expiresAt: new Date(now + 60_000).toISOString(),
    },
  };
  assert.equal(f.policy.canAccessOwner(session, event.user.id), true);
  assert.equal(f.policy.canAccessOwner(null, event.user.id), false);
  assert.equal(
    f.policy.canAccessOwner(
      { ...session, user: { ...session.user, emailVerified: false } },
      event.user.id,
    ),
    false,
  );
  assert.equal(f.policy.canAccessOwner(session, "otro"), false);
  assert.equal(
    f.policy.canAccessOwner(
      { ...session, session: { ...session.session, userId: "otro" } },
      event.user.id,
    ),
    false,
  );
  assert.equal(
    f.policy.canAccessOwner(
      {
        user: { id: "otro", emailVerified: true },
        session: { userId: "otro", expiresAt: session.session.expiresAt },
      },
      "otro",
    ),
    false,
  );
  f.advance(60_000);
  assert.equal(f.policy.canAccessOwner(session, event.user.id), false);
});
