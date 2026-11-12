import { URL } from "node:url";
import pg from "pg";
import { developmentTarget } from "../../src/server/neon-development-config.ts";
import { runtimePassword } from "./finance-browser.mjs";
import { testDatabaseConfig } from "./test-database.mjs";

const local = new URL(testDatabaseConfig().connectionString);
const Pool = pg.Pool;

// Finance browser tests seed public observations in the disposable database.
// Provider availability and response parsing are tested with explicit fixtures.
const realFetch = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const url = new URL(input instanceof globalThis.Request ? input.url : input);
  if (["datosuruguay.com", "api.frankfurter.dev"].includes(url.hostname))
    return Promise.resolve(new globalThis.Response(null, { status: 503 }));
  return realFetch(input, init);
};

// This preload only runs in the test server. Preserve the two LOGIN roles and
// runtime checks, replacing the network target with the guarded fixture DB.
pg.Pool = class extends Pool {
  constructor(config) {
    if (
      config?.host !==
        developmentTarget.endpointHost.replace(".", "-pooler.") ||
      config.database !== developmentTarget.database ||
      config.password !== runtimePassword ||
      !["finanzas_google_auth", "finanzas_google_finance"].includes(config.user)
    ) {
      throw new Error(
        "El servidor de pruebas solo admite roles de fixture locales",
      );
    }
    super({
      ...config,
      host: local.hostname,
      port: Number(local.port),
      database: local.pathname.slice(1),
      ssl: false,
      enableChannelBinding: false,
      options: `-c neon.branch_id=${developmentTarget.branchId}`,
    });
  }
};
