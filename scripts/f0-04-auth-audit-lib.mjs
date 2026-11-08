import { developmentTarget } from "../src/server/neon-development-config.mts";

export const expectedWebhookUrl =
  "https://finanzas-personales-f0-04.vercel.app/api/webhooks/neon-auth";

// Diagnostic only: never authorizes events or exports managed config/secrets.
// Inherited project metadata is not accepted as proof of the request's branch.
export function auditManagedConfig(row) {
  const checks = {
    connectedToDevelopment: row.connected_branch === developmentTarget.branchId,
    storedEndpointMatchesDevelopment:
      row.endpoint_id === developmentTarget.endpointHost.split(".")[0],
    emailSignupsDisabled: row.email_and_password?.disableSignUp === true,
    webhookEnabled: row.webhook_config?.enabled === true,
    webhookUrlMatches: row.webhook_config?.webhookUrl === expectedWebhookUrl,
    onlyBeforeCreate:
      Array.isArray(row.webhook_config?.enabledEvents) &&
      row.webhook_config.enabledEvents.length === 1 &&
      row.webhook_config.enabledEvents[0] === "user.before_create",
    invitationRevoked: row.code_revoked === true,
  };
  return {
    checks,
    blockingReasons: Object.entries(checks)
      .filter(([, passed]) => !passed)
      .map(([name]) => name),
    storedEndpoint:
      typeof row.endpoint_id === "string" &&
      /^ep-[a-z0-9-]{1,90}$/.test(row.endpoint_id)
        ? row.endpoint_id
        : "unrecognized",
  };
}
