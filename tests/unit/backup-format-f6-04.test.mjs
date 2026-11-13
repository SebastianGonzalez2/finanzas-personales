import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { createHmac, randomBytes } from "node:crypto";
import test from "node:test";
import { promisify } from "node:util";
import { gzip } from "node:zlib";
import {
  BackupError,
  confirmBackup,
  decodeBackup,
  encodeBackup,
  verifyBackupConfirmation,
} from "../../src/server/backup-format.ts";

// F6-04 CA-062/063: envelope integrity, versioning and password handling.
// Synthetic values only; the keys below are random per run.
const key = randomBytes(32);
const schema = "a".repeat(64);
const owner = "titular-sintetico-a";
const password = "contraseña-sintética-f604";
const payload = JSON.stringify({
  schema,
  tables: { categories: [{ id: "1", name: "Mañana" }], loans: [] },
});
const compress = promisify(gzip);

const refused = (promise, pattern) =>
  assert.rejects(promise, (error) => {
    assert.ok(error instanceof BackupError, String(error));
    assert.match(error.message, pattern);
    return true;
  });

// Signs arbitrary content as the server would, to reach validation after the MAC.
async function signedFile(content, { signer = key, holder = owner } = {}) {
  const signed = JSON.stringify({
    ownerId: holder,
    createdAt: new Date().toISOString(),
    data: (await compress(content)).toString("base64url"),
  });
  const signature = createHmac("sha256", signer)
    .update("finanzas-personales:account-backup:v1:file\0")
    .update(signed)
    .digest("hex");
  return { version: 1, protection: "plain", signed, signature };
}

test("copia plana: ida y vuelta exacta, firmada y ligada al titular", async () => {
  const { file } = await encodeBackup(payload, owner, key);
  const envelope = JSON.parse(file);
  const decoded = await decodeBackup(envelope, owner, key);
  assert.equal(decoded.payload, payload);
  assert.equal(decoded.schema, schema);
  await refused(decodeBackup(envelope, "otro-titular", key), /otra cuenta/);
  await refused(decodeBackup(envelope, owner, randomBytes(32)), /firma/);
  await refused(
    decodeBackup({ ...envelope, signed: `${envelope.signed} ` }, owner, key),
    /firma/,
  );
  const unsigned = { ...envelope, signature: undefined };
  await refused(decodeBackup(unsigned, owner, key), /firma/);
  await refused(
    decodeBackup({ ...envelope, signature: "0".repeat(64) }, owner, key),
    /firma/,
  );
});

test("copia cifrada: no filtra el contenido y rechaza clave o bytes alterados", async () => {
  const { file } = await encodeBackup(payload, owner, key, password);
  assert.doesNotMatch(file, /Mañana|categories|titular-sintetico|contraseña/);
  const envelope = JSON.parse(file);
  assert.equal(envelope.protection, "scrypt-aes-256-gcm");
  assert.equal(
    (await decodeBackup(envelope, owner, key, password)).payload,
    payload,
  );

  await refused(decodeBackup(envelope, owner, key), /Ingresá la contraseña/);
  await refused(
    decodeBackup(envelope, owner, key, "x".repeat(257)),
    /Ingresá la contraseña/,
  );
  await refused(
    decodeBackup(envelope, owner, key, "contraseña-incorrecta"),
    /Contraseña incorrecta o copia dañada/,
  );
  const flip = (value) =>
    Buffer.from(value, "base64url")
      .map((byte) => byte ^ 1)
      .toString("base64url");
  for (const field of ["salt", "iv", "tag", "ciphertext"])
    await refused(
      decodeBackup(
        { ...envelope, [field]: flip(envelope[field]) },
        owner,
        key,
        password,
      ),
      /Contraseña incorrecta o copia dañada/,
    );
  // Truncated or malformed encodings never reach the cipher.
  await refused(
    decodeBackup(
      { ...envelope, tag: envelope.tag.slice(2) },
      owner,
      key,
      password,
    ),
    /dañada/,
  );
  await refused(
    decodeBackup({ ...envelope, ciphertext: "***" }, owner, key, password),
    /dañada/,
  );
  await refused(
    decodeBackup({ ...envelope, ciphertext: "" }, owner, key, password),
    /dañada/,
  );
  // The right password with another signing key is still rejected.
  await refused(
    decodeBackup(envelope, owner, randomBytes(32), password),
    /firma/,
  );
  await refused(
    decodeBackup(envelope, "otro-titular", key, password),
    /otra cuenta/,
  );
});

test("versiones y formatos incompatibles se rechazan de forma explícita", async () => {
  const { file } = await encodeBackup(payload, owner, key);
  const envelope = JSON.parse(file);
  for (const version of [0, 2, "1", null, undefined])
    await refused(
      decodeBackup({ ...envelope, version }, owner, key),
      /versión de la copia no es compatible/,
    );
  await refused(
    decodeBackup({ ...envelope, protection: "rot13" }, owner, key),
    /formato de la copia no es compatible/,
  );
  for (const input of [null, "texto", 42, [], undefined])
    await refused(
      decodeBackup(input, owner, key),
      /archivo de copia es inválido/,
    );
});

test("contenido firmado pero malformado, incompleto o desproporcionado", async () => {
  await refused(
    decodeBackup(await signedFile("no es json"), owner, key),
    /contenido de la copia es inválido/,
  );
  await refused(decodeBackup(await signedFile("[]"), owner, key), /inválid/);
  await refused(decodeBackup(await signedFile("{}"), owner, key), /inválid/);
  await refused(
    decodeBackup(
      await signedFile(JSON.stringify({ schema: "corto", tables: {} })),
      owner,
      key,
    ),
    /inválid/,
  );
  await refused(
    decodeBackup(await signedFile(JSON.stringify({ schema })), owner, key),
    /inválid/,
  );
  await refused(
    decodeBackup(
      await signedFile(JSON.stringify({ schema, tables: { loans: {} } })),
      owner,
      key,
    ),
    /inválid/,
  );
  // Payload bytes that are not gzip, even with a valid signature.
  const notGzip = await signedFile("{}");
  const content = JSON.parse(notGzip.signed);
  content.data = Buffer.from("no-gzip").toString("base64url");
  const signed = JSON.stringify(content);
  await refused(
    decodeBackup(
      {
        ...notGzip,
        signed,
        signature: createHmac("sha256", key)
          .update("finanzas-personales:account-backup:v1:file\0")
          .update(signed)
          .digest("hex"),
      },
      owner,
      key,
    ),
    /contenido de la copia es inválido/,
  );
  // A tiny archive that expands past the snapshot limit (decompression bomb).
  const bomb = JSON.stringify({
    schema,
    tables: { padding: ["0".repeat(25 * 1024 * 1024)] },
  });
  await refused(
    decodeBackup(await signedFile(bomb), owner, key),
    /contenido de la copia es inválido/,
  );
  await refused(encodeBackup(bomb, owner, key), /supera el tamaño admitido/);
});

test("la confirmación de restauración caduca y está ligada a sesión, copia y revisión", async () => {
  const revision = "b".repeat(64);
  const signature = "c".repeat(64);
  const token = confirmBackup(key, "sesion-1", signature, revision);
  const valid = verifyBackupConfirmation(key, "sesion-1", signature, token);
  assert.equal(valid.revision, revision);
  assert.match(valid.id, /^[0-9a-f-]{36}$/);
  assert.equal(
    verifyBackupConfirmation(key, "sesion-2", signature, token),
    null,
  );
  assert.equal(
    verifyBackupConfirmation(key, "sesion-1", "d".repeat(64), token),
    null,
  );
  assert.equal(
    verifyBackupConfirmation(randomBytes(32), "sesion-1", signature, token),
    null,
  );
  const [id, expiry, , mac] = token.split(".");
  assert.equal(
    verifyBackupConfirmation(
      key,
      "sesion-1",
      signature,
      [id, expiry, "e".repeat(64), mac].join("."),
    ),
    null,
    "Otra revisión invalida la confirmación",
  );
  assert.equal(
    verifyBackupConfirmation(
      key,
      "sesion-1",
      signature,
      [id, String(Number(expiry) + 1), revision, mac].join("."),
    ),
    null,
  );
  for (const input of [undefined, null, 7, "", "a.b.c.d"])
    assert.equal(
      verifyBackupConfirmation(key, "sesion-1", signature, input),
      null,
    );
  const realNow = Date.now;
  Date.now = () => realNow() + 16 * 60_000;
  try {
    assert.equal(
      verifyBackupConfirmation(key, "sesion-1", signature, token),
      null,
    );
  } finally {
    Date.now = realNow;
  }
});
