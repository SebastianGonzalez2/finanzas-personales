import test from "node:test";
import assert from "node:assert/strict";
import process from "node:process";
import {
  GoogleStageError,
  classifyDatabaseError,
  googleStageOf,
  googleStages,
  isGoogleStage,
  logGoogleStage,
} from "../../src/server/google-diagnostics.ts";
import { googleAuthRoute } from "../../src/server/google-auth-route.ts";
import { handleGoogleHttp } from "../../src/server/google-http.ts";
import {
  assertGoogleRuntimeRow,
  googleDatabaseConfig,
} from "../../src/server/google-database.ts";
import { googleAuth } from "../../src/server/google-auth.ts";
import {
  neonDatabaseConfig,
  neonTargets,
} from "../../src/server/neon-targets.ts";

const { Request, Response } = globalThis;
const origin = "https://finanzas.example.test";
const prod = neonTargets.production;
const dev = neonTargets.development;
// Valores que jamás deben aparecer en un registro.
const secrets = [
  "postgresql://finanzas_google_auth:SUPER-SECRETO@host.invalid/neondb",
  "SUPER-SECRETO",
  "token-privado-123",
];
const leaky = (extra = {}) =>
  Object.assign(
    new Error(`fallo con ${secrets.join(" ")}\n    at /srv/app/secret.js:1:1`),
    { cause: new Error(secrets[0]) },
    extra,
  );

function post(deps, path = "sign-in/social", body = { provider: "google" }) {
  return handleGoogleHttp(
    new Request(`${origin}/api/auth/${path}`, {
      method: "POST",
      headers: { origin, "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    path.split("/"),
    { enabled: true, origin, ...deps },
  );
}
const collect = () => {
  const lines = [];
  return {
    lines,
    onFailure: (stage) => logGoogleStage(stage, (line) => lines.push(line)),
  };
};
const client = () => {
  const c = { released: 0, release: () => c.released++ };
  return c;
};
const route = (overrides = {}) => {
  const c = client();
  return {
    c,
    deps: {
      pool: () => ({ connect: async () => c }),
      assertRuntime: async () => {},
      auth: () => ({ handler: async () => Response.json({ ok: true }) }),
      ...overrides,
    },
  };
};
async function stageOf(overrides) {
  const { c, deps } = route(overrides);
  const log = collect();
  const response = await post({
    handler: (r) => googleAuthRoute(r, deps),
    onFailure: log.onFailure,
  });
  return { response, log, c };
}

test("OPS: la lista de etapas es cerrada, única y solo contiene códigos seguros", () => {
  assert.equal(new Set(googleStages).size, googleStages.length);
  for (const stage of googleStages) {
    assert.match(stage, /^[a-z]+\.[a-z-]+$/, stage);
    assert.equal(isGoogleStage(stage), true);
  }
  assert.equal(isGoogleStage("request.invented"), false);
  assert.equal(isGoogleStage("postgresql://u:p@h/db"), false);
  assert.equal(isGoogleStage(undefined), false);
});

test("OPS: logGoogleStage solo emite una línea fija con un código predefinido", () => {
  const out = [];
  logGoogleStage("db.connect-timeout", (l) => out.push(l));
  logGoogleStage("postgresql://u:SUPER-SECRETO@h/db", (l) => out.push(l));
  assert.deepEqual(out, [
    "[google-auth] stage=db.connect-timeout",
    "[google-auth] stage=request.unexpected",
  ]);
  assert.doesNotThrow(() =>
    logGoogleStage("db.connect-other", () => {
      throw new Error("sink roto");
    }),
  );
});

test("OPS: classifyDatabaseError elige una clase por código sin exponer el error", () => {
  const code = (c) => classifyDatabaseError(leaky({ code: c }));
  assert.equal(code("28P01"), "auth-failed");
  assert.equal(code("42501"), "permission");
  assert.equal(code("42P01"), "missing-object");
  assert.equal(code("3F000"), "missing-object");
  assert.equal(code("ETIMEDOUT"), "timeout");
  assert.equal(code("ENOTFOUND"), "network");
  assert.equal(code("ECONNREFUSED"), "network");
  assert.equal(code("DEPTH_ZERO_SELF_SIGNED_CERT"), "tls");
  assert.equal(
    classifyDatabaseError(
      new Error("Connection terminated due to connection timeout"),
    ),
    "timeout",
  );
  assert.equal(
    classifyDatabaseError(new Error("SASL: SCRAM-SERVER-FINAL-MESSAGE")),
    "auth-failed",
  );
  assert.equal(classifyDatabaseError(new Error("otro")), "other");
  assert.equal(classifyDatabaseError("texto"), "other");
  assert.equal(classifyDatabaseError(undefined), "other");
  // También reconoce el código en la cadena de causas.
  assert.equal(
    classifyDatabaseError(new Error("x", { cause: { code: "42501" } })),
    "permission",
  );
});

test("OPS: cada comprobación del runtime de PostgreSQL tiene su propia etapa", () => {
  const healthy = {
    branch: prod.branchId,
    database: prod.database,
    role: "finanzas_google_auth",
    privileged: false,
    managed_access: false,
    owns: false,
  };
  assert.doesNotThrow(() => assertGoogleRuntimeRow(healthy, "auth", prod));
  const expected = {
    branch: "runtime.mismatch-branch",
    database: "runtime.mismatch-database",
    role: "runtime.mismatch-role",
    privileged: "runtime.mismatch-privileged",
    managed_access: "runtime.mismatch-managed-access",
    owns: "runtime.mismatch-owns",
  };
  for (const [field, stage] of Object.entries(expected)) {
    for (const bad of [
      null,
      undefined,
      field === "branch" ? dev.branchId : true,
    ]) {
      assert.throws(
        () =>
          assertGoogleRuntimeRow({ ...healthy, [field]: bad }, "auth", prod),
        (error) =>
          error instanceof GoogleStageError &&
          error.stage === stage &&
          error.message === "Runtime no autorizado",
        `${field}=${String(bad)}`,
      );
    }
  }
  assert.throws(
    () => assertGoogleRuntimeRow(undefined, "auth", prod),
    (e) => e.stage === "runtime.mismatch-row",
  );
});

test("OPS: la configuración privada se distingue por etapa sin valores", () => {
  const base = {
    NEON_PROJECT_ID: prod.projectId,
    NEON_BRANCH_ID: prod.branchId,
    VERCEL: "1",
    VERCEL_ENV: "production",
  };
  const url = (user) =>
    `postgresql://${user}:fixture@${prod.endpointHost.replace(".", "-pooler.")}/neondb`;
  const stage = (env) => {
    try {
      googleDatabaseConfig(env, "auth");
    } catch (error) {
      return googleStageOf(error, "config.database-unknown");
    }
    return "ok";
  };
  const good = {
    ...base,
    GOOGLE_AUTH_DATABASE_URL: url("finanzas_google_auth"),
  };
  assert.equal(stage(good), "ok");
  assert.equal(
    stage({ ...good, NEON_BRANCH_ID: undefined }),
    "config.neon-identity-production",
  );
  // Sin variables del sistema de Vercel el destino cae a development.
  assert.equal(
    stage({ ...good, VERCEL: undefined, VERCEL_ENV: undefined }),
    "config.neon-identity-development",
  );
  assert.equal(
    stage({ ...good, VERCEL_ENV: undefined }),
    "config.neon-environment",
  );
  assert.equal(
    stage({ ...good, GOOGLE_AUTH_DATABASE_URL: undefined }),
    "config.neon-connection-production",
  );
  assert.equal(
    stage({
      ...good,
      GOOGLE_AUTH_DATABASE_URL: `${good.GOOGLE_AUTH_DATABASE_URL}?sslmode=disable`,
    }),
    "config.neon-ssl-option",
  );
  assert.equal(
    stage({ ...good, GOOGLE_AUTH_DATABASE_URL: url("neondb_owner") }),
    "config.database-role",
  );
  assert.throws(
    () => neonDatabaseConfig({}, { ...prod, branchName: "development" }),
    (e) => googleStageOf(e, "request.unexpected") === "config.neon-target",
  );
});

test("OPS: googleAuth() etiqueta configuración de origen, secreto y cliente", () => {
  const keys = [
    "GOOGLE_AUTH_READY",
    "GOOGLE_AUTH_ORIGIN",
    "GOOGLE_AUTH_SECRET",
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
  ];
  const saved = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
  const run = (env) => {
    for (const k of keys) delete process.env[k];
    Object.assign(process.env, env);
    try {
      googleAuth();
    } catch (error) {
      return error instanceof GoogleStageError ? error.stage : "otro";
    }
    return "ok";
  };
  const full = {
    GOOGLE_AUTH_READY: "true",
    GOOGLE_AUTH_ORIGIN: origin,
    GOOGLE_AUTH_SECRET: "s".repeat(32),
    GOOGLE_CLIENT_ID: "id",
    GOOGLE_CLIENT_SECRET: "secret",
  };
  try {
    assert.equal(run({}), "request.disabled");
    assert.equal(
      run({ ...full, GOOGLE_AUTH_ORIGIN: `${origin}/` }),
      "config.auth-origin",
    );
    assert.equal(
      run({ ...full, GOOGLE_AUTH_ORIGIN: `${origin}\n` }),
      "config.auth-origin",
    );
    assert.equal(
      run({ ...full, GOOGLE_AUTH_SECRET: "corto" }),
      "config.auth-secret",
    );
    assert.equal(run({ ...full, GOOGLE_CLIENT_ID: "" }), "config.auth-client");
    assert.equal(
      run({ ...full, GOOGLE_CLIENT_SECRET: "" }),
      "config.auth-client",
    );
  } finally {
    for (const k of keys) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  }
});

test("OPS: handleGoogleHttp registra etapas de solicitud y responde siempre igual", async () => {
  const disabled = collect();
  const off = await post({
    enabled: false,
    handler: async () => Response.json({}),
    onFailure: disabled.onFailure,
  });
  assert.equal(off.status, 503);
  assert.deepEqual(disabled.lines, ["[google-auth] stage=request.disabled"]);

  const badOrigin = collect();
  const r1 = await post({
    origin: `${origin}/`,
    handler: async () => Response.json({}),
    onFailure: badOrigin.onFailure,
  });
  assert.equal(r1.status, 503);
  assert.deepEqual(badOrigin.lines, ["[google-auth] stage=request.origin"]);

  const badBody = collect();
  const r2 = await handleGoogleHttp(
    new Request(`${origin}/api/auth/sign-in/social`, {
      method: "POST",
      headers: { origin },
      body: "{}",
    }),
    ["sign-in", "social"],
    {
      enabled: true,
      origin,
      handler: async () => Response.json({}),
      onFailure: badBody.onFailure,
    },
  );
  assert.equal(r2.status, 503);
  assert.deepEqual(badBody.lines, ["[google-auth] stage=request.body"]);

  // Un handler que lanza un error sin etiquetar nunca filtra su contenido.
  const raw = collect();
  const r3 = await post({
    handler: async () => {
      throw leaky();
    },
    onFailure: raw.onFailure,
  });
  assert.equal(r3.status, 503);
  assert.deepEqual(raw.lines, ["[google-auth] stage=request.unexpected"]);
  const text = await r3.text();
  assert.equal(
    text,
    JSON.stringify({ error: "No se pudo completar el acceso." }),
  );
  assert.equal(r3.headers.get("cache-control"), "private, no-store");

  // Un diagnóstico defectuoso no altera la respuesta; sin onFailure tampoco.
  const broken = await post({
    handler: async () => {
      throw leaky();
    },
    onFailure: () => {
      throw new Error(secrets[0]);
    },
  });
  assert.equal(broken.status, 503);
  const silent = await post({
    handler: async () => {
      throw leaky();
    },
  });
  assert.equal(silent.status, 503);
});

test("OPS: googleAuthRoute distingue pool, conexión, runtime, inicialización y Better Auth", async () => {
  const ok = await stageOf({});
  assert.equal(ok.response.status, 200);
  assert.deepEqual(ok.log.lines, []);
  assert.equal(ok.c.released, 1);

  const cases = [
    [
      "config.neon-identity-production",
      {
        pool: () => {
          throw neonErrorFor("identity", "production");
        },
      },
    ],
    [
      "config.database-unknown",
      {
        pool: () => {
          throw leaky();
        },
      },
    ],
    [
      "config.database-role",
      {
        pool: () => {
          throw new GoogleStageError(
            "config.database-role",
            "Runtime no autorizado",
          );
        },
      },
    ],
    [
      "db.connect-auth-failed",
      {
        pool: () => ({
          connect: async () => {
            throw leaky({ code: "28P01" });
          },
        }),
      },
    ],
    [
      "db.connect-timeout",
      {
        pool: () => ({
          connect: async () => {
            throw new Error("timeout exceeded when trying to connect");
          },
        }),
      },
    ],
    [
      "db.connect-network",
      {
        pool: () => ({
          connect: async () => {
            throw leaky({ code: "ENOTFOUND" });
          },
        }),
      },
    ],
    [
      "db.connect-other",
      {
        pool: () => ({
          connect: async () => {
            throw leaky();
          },
        }),
      },
    ],
    [
      "runtime.query-missing-object",
      {
        assertRuntime: async () => {
          throw leaky({ code: "3F000" });
        },
      },
    ],
    [
      "runtime.query-permission",
      {
        assertRuntime: async () => {
          throw leaky({ code: "42501" });
        },
      },
    ],
    [
      "runtime.mismatch-branch",
      {
        assertRuntime: async () =>
          assertGoogleRuntimeRow(
            {
              branch: dev.branchId,
              database: prod.database,
              role: "finanzas_google_auth",
              privileged: false,
              managed_access: false,
              owns: false,
            },
            "auth",
            prod,
          ),
      },
    ],
    [
      "config.auth-secret",
      {
        auth: () => {
          throw new GoogleStageError(
            "config.auth-secret",
            "Configuración incompleta",
          );
        },
      },
    ],
    [
      "auth.init-failed",
      {
        auth: () => {
          throw leaky();
        },
      },
    ],
    [
      "auth.handler-api-forbidden",
      {
        auth: () => ({
          handler: async () => {
            throw leaky({ status: "FORBIDDEN", statusCode: 403 });
          },
        }),
      },
    ],
    [
      "auth.handler-api-too-many-requests",
      {
        auth: () => ({
          handler: async () => {
            throw leaky({ status: "TOO_MANY_REQUESTS", statusCode: 429 });
          },
        }),
      },
    ],
    [
      "auth.handler-api-other",
      {
        auth: () => ({
          handler: async () => {
            throw leaky({ status: "RARO", statusCode: 499 });
          },
        }),
      },
    ],
    [
      "auth.handler-db-permission",
      {
        auth: () => ({
          handler: async () => {
            throw leaky({ code: "42501" });
          },
        }),
      },
    ],
    [
      "auth.handler-db-missing-object",
      {
        auth: () => ({
          handler: async () => {
            throw leaky({ code: "42P01" });
          },
        }),
      },
    ],
    [
      "auth.handler-failed",
      {
        auth: () => ({
          handler: async () => {
            throw leaky();
          },
        }),
      },
    ],
  ];
  for (const [stage, overrides] of cases) {
    const { response, log, c } = await stageOf(overrides);
    assert.equal(response.status, 503, stage);
    assert.deepEqual(log.lines, [`[google-auth] stage=${stage}`], stage);
    assert.equal(
      await response.text(),
      JSON.stringify({ error: "No se pudo completar el acceso." }),
      stage,
    );
    // La conexión de runtime se libera siempre que llegó a abrirse.
    if (
      stage.startsWith("runtime.") ||
      stage.startsWith("auth.") ||
      stage.startsWith("config.auth")
    ) {
      assert.equal(c.released, 1, stage);
    }
    for (const secret of secrets)
      assert.ok(!log.lines.join("\n").includes(secret), stage);
  }
});

function neonErrorFor(reason, environment) {
  // Se obtiene un NeonConfigError real, sin construirlo a mano.
  const target = neonTargets[environment];
  try {
    neonDatabaseConfig(
      reason === "identity"
        ? {}
        : {
            NEON_PROJECT_ID: target.projectId,
            NEON_BRANCH_ID: target.branchId,
          },
      target,
    );
  } catch (error) {
    return error;
  }
  throw new Error("se esperaba un NeonConfigError");
}
