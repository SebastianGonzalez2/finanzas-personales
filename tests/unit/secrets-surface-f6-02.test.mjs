import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath, URL } from "node:url";
import process from "node:process";
import test from "node:test";

// F6-02 etapa A: secretos ausentes del repositorio versionado y de los
// artefactos de compilación. Las pruebas de artefactos requieren `npm run build`
// y se informan como omitidas (no como aprobadas) si el directorio `.next` no
// existe. Para que sean significativas, compilar con las variables privadas
// sintéticas exportadas (ver docs/planning/53-auditoria-seguridad-f6-02.md).
const root = fileURLToPath(new URL("../../", import.meta.url));
const fixtureSecrets = [
  "isolated-finance-browser-fixture-secret",
  "isolated-finance-browser-only",
  "isolated-fixture-only",
  "finance-fixture-secret",
  "synthetic-finance-cron-secret",
  "synthetic-secret-with-more-than-32-characters",
  "01".repeat(32),
];
const secretEnvNames = [
  "GOOGLE_AUTH_SECRET",
  "GOOGLE_CLIENT_SECRET",
  "FINANCE_BACKUP_SIGNING_KEY",
  "CRON_SECRET",
  "GOOGLE_AUTH_DATABASE_URL",
  "GOOGLE_FINANCE_DATABASE_URL",
  "DATABASE_URL",
  "DATABASE_URL_UNPOOLED",
  "NEON_AUTH_COOKIE_SECRET",
  "CARD_PUSH_PRIVATE_KEY",
];
const walk = (dir) =>
  existsSync(dir)
    ? readdirSync(dir).flatMap((name) => {
        const path = join(dir, name);
        return statSync(path).isDirectory() ? walk(path) : [path];
      })
    : [];
const textExtensions =
  /\.(?:js|mjs|cjs|json|html|txt|rsc|css|map|svg|webmanifest|body|meta)$/;

test("F6-02: el repositorio versionado no contiene credenciales, claves privadas ni archivos .env", () => {
  const files = execFileSync("git", ["ls-files", "-z"], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  })
    .split("\0")
    .filter(Boolean);
  assert.ok(files.length > 400);
  const envFiles = files.filter((f) => /(^|\/)\.env(\.|$)/.test(f));
  assert.deepEqual(envFiles.sort(), [
    ".env.example",
    "spikes/neon-auth/.env.example",
  ]);
  for (const file of envFiles)
    for (const line of readFileSync(join(root, file), "utf8").split("\n")) {
      if (!line || line.startsWith("#")) continue;
      const [name, value = ""] = [
        line.slice(0, line.indexOf("=")),
        line.slice(line.indexOf("=") + 1),
      ];
      assert.ok(
        value === "" ||
          value === "false" ||
          /^http:\/\/localhost:\d+$/.test(value),
        `${file}: ${name} no puede traer un valor`,
      );
    }
  const patterns = [
    [
      /-----BEGIN (?:RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY-----/,
      "clave privada",
    ],
    [/GOCSPX-[A-Za-z0-9_-]{20,}/, "secreto de cliente de Google"],
    [/AIza[0-9A-Za-z_-]{35}/, "clave de API de Google"],
    [/\b(?:sk|rk)_live_[0-9A-Za-z]{16,}/, "clave live"],
    [/\bAKIA[0-9A-Z]{16}\b/, "clave de acceso AWS"],
    [/\bnpg_[A-Za-z0-9]{20,}\b/, "token de Neon"],
    [/\bghp_[A-Za-z0-9]{30,}\b/, "token de GitHub"],
    [/\bBearer [A-Za-z0-9._-]{30,}/, "token Bearer"],
  ];
  const connection =
    /postgres(?:ql)?:\/\/([^\s:/@'"`]+):([^\s@'"`]+)@([^\s/'"`:]+)/g;
  const publicUsers = new Set([
    "f0_test",
    "user",
    "usuario",
    "postgres",
    "fixture",
  ]);
  const suspicious = [];
  for (const file of files) {
    if (
      !/\.(?:ts|tsx|mts|mjs|js|json|md|yml|yaml|sql|css|svg|example)$/.test(
        file,
      )
    )
      continue;
    if (file.endsWith("package-lock.json")) continue;
    const text = readFileSync(join(root, file), "utf8");
    for (const [pattern, label] of patterns)
      assert.ok(!pattern.test(text), `${file}: ${label}`);
    for (const [, user, password, host] of text.matchAll(connection)) {
      const harmless =
        publicUsers.has(user) ||
        /^(?:127\.0\.0\.1|localhost|fixture\.invalid|host|\$\{?\w+\}?|<[^>]+>|…)$/.test(
          host,
        ) ||
        /^(?:\*+|<[^>]+>|password|contraseña|fixture|x+|…|\$\{?\w+\}?|f0_test|isolated-[\w-]+)$/.test(
          password,
        );
      // Nunca se imprime la contraseña: solo archivo, usuario y host.
      if (!harmless) suspicious.push(`${file}: ${user}@${host}`);
    }
  }
  assert.deepEqual(
    suspicious,
    [],
    "Cadenas de conexión con credenciales no sintéticas",
  );
});

const build = join(root, ".next");
const built = existsSync(join(build, "BUILD_ID"));

test(
  "F6-02: el JavaScript enviado al navegador no incorpora secretos, nombres de variables privadas ni mapas de fuentes",
  { skip: built ? false : "Requiere npm run build (.next ausente)" },
  () => {
    const statics = walk(join(build, "static"));
    assert.ok(statics.length > 10, "El build debe incluir recursos estáticos");
    assert.deepEqual(
      statics.filter((f) => f.endsWith(".map")).map((f) => relative(root, f)),
      [],
      "Sin mapas de fuentes públicos",
    );
    const privateNames = [
      ...secretEnvNames,
      "finanzas_google_",
      "app_access",
      "authorize_session",
      "pg_advisory",
      "restore_account",
      "reset_own_finances",
      "account_backup_snapshot",
    ];
    const values = [
      ...fixtureSecrets,
      ...secretEnvNames
        .map((name) => process.env[name])
        .filter((v) => v && v.length >= 8),
    ];
    for (const file of statics.filter((f) => textExtensions.test(f))) {
      const text = readFileSync(file, "utf8");
      const where = relative(root, file).split(sep).join("/");
      for (const name of privateNames)
        assert.ok(!text.includes(name), `${where} contiene ${name}`);
      for (const value of values)
        assert.ok(
          !text.includes(value),
          `${where} contiene un secreto de prueba`,
        );
      assert.ok(
        !/postgres(?:ql)?:\/\/[^\s"']+:[^\s"']+@/.test(text),
        `${where} contiene credenciales PostgreSQL`,
      );
      assert.ok(
        !/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(text),
        `${where} contiene una clave privada`,
      );
    }
  },
);

test(
  "F6-02: el servidor compilado no incrusta valores de secretos ni credenciales",
  { skip: built ? false : "Requiere npm run build (.next ausente)" },
  () => {
    const files = [
      ...walk(join(build, "server")),
      ...walk(join(root, "public")),
      ...["BUILD_ID", "routes-manifest.json", "required-server-files.json"]
        .map((name) => join(build, name))
        .filter(existsSync),
    ].filter((f) => textExtensions.test(f) || f.endsWith("BUILD_ID"));
    assert.ok(files.length > 50);
    const values = [
      ...fixtureSecrets,
      ...secretEnvNames
        .map((name) => process.env[name])
        .filter((v) => v && v.length >= 8),
    ];
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      const where = relative(root, file).split(sep).join("/");
      for (const value of values)
        assert.ok(
          !text.includes(value),
          `${where} incrusta un secreto de prueba`,
        );
      assert.ok(
        !/postgres(?:ql)?:\/\/[^\s"'`]+:[^\s"'`]+@[^\s"'`]*neon\.tech/.test(
          text,
        ),
        `${where} contiene credenciales de Neon`,
      );
      assert.ok(
        !/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(text),
        `${where} contiene una clave privada`,
      );
      assert.ok(
        !/GOCSPX-[A-Za-z0-9_-]{20,}/.test(text),
        `${where} contiene un secreto de cliente de Google`,
      );
    }
    const required = JSON.parse(
      readFileSync(join(build, "required-server-files.json"), "utf8"),
    );
    assert.ok(
      !JSON.stringify(required).match(/GOOGLE_|CRON_SECRET|DATABASE_URL/),
      "Los manifiestos del servidor no listan secretos",
    );
  },
);
