import assert from "node:assert/strict";
import test from "node:test";
import {
  auditManagedConfig,
  expectedWebhookUrl,
} from "../../scripts/f0-04-auth-audit-lib.mjs";

const closed = {
  connected_branch: "br-late-feather-b6czfkx0",
  endpoint_id: "ep-falling-queen-b63xbfuk",
  code_revoked: true,
  email_and_password: { disableSignUp: true },
  webhook_config: {
    enabled: true,
    webhookUrl: expectedWebhookUrl,
    enabledEvents: ["user.before_create"],
  },
};

test("auditoría: configuración heredada no acredita la rama del evento", () => {
  const inherited = auditManagedConfig({
    ...closed,
    endpoint_id: "ep-morning-sunset-b6i4kxdg",
  });
  assert.equal(inherited.checks.connectedToDevelopment, true);
  assert.deepEqual(inherited.blockingReasons, [
    "storedEndpointMatchesDevelopment",
  ]);
  assert.deepEqual(auditManagedConfig(closed).blockingReasons, []);
});

test("auditoría: rechaza flags ambiguos, rama ajena y eventos adicionales sin filtrar secretos", () => {
  const result = auditManagedConfig({
    ...closed,
    connected_branch: "br-wild-mode-b64fgovd",
    endpoint_id: "synthetic-private-value",
    email_and_password: {
      disableSignUp: "true",
      secret: "synthetic-private-value",
    },
    webhook_config: {
      ...closed.webhook_config,
      enabledEvents: ["user.before_create", "user.created"],
      secret: "synthetic-private-value",
    },
  });
  assert.equal(result.checks.connectedToDevelopment, false);
  assert.equal(result.checks.emailSignupsDisabled, false);
  assert.equal(result.checks.onlyBeforeCreate, false);
  assert.equal(result.storedEndpoint, "unrecognized");
  assert.equal(
    JSON.stringify(result).includes("synthetic-private-value"),
    false,
  );
});
