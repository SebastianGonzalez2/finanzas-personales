import "server-only";
import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  randomUUID,
  scrypt,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
import { gzip, gunzip } from "node:zlib";
import {
  BACKUP_MAX_BYTES,
  BACKUP_PASSWORD_MAX,
} from "../lib/export/backup-format.ts";

const context = "finanzas-personales:account-backup:v1";
const hex256 = /^[a-f0-9]{64}$/;
const scryptOptions = { N: 131_072, r: 8, p: 1, maxmem: 160 * 1024 * 1024 };
const snapshotMaxBytes = 24 * 1024 * 1024;
const compress = promisify(gzip);
const decompress = promisify(gunzip);
let activeDerivations = 0;

export class BackupError extends Error {}

async function deriveKey(password: string, salt: Buffer) {
  if (activeDerivations >= 2)
    throw new BackupError("Hay otras copias procesándose. Volvé a intentarlo.");
  activeDerivations++;
  try {
    return await new Promise<Buffer>((resolve, reject) =>
      scrypt(password, salt, 32, scryptOptions, (error, key) =>
        error ? reject(error) : resolve(key),
      ),
    );
  } finally {
    activeDerivations--;
  }
}

function mac(key: Buffer, scope: string, content: string) {
  return createHmac("sha256", key)
    .update(`${context}:${scope}\0`)
    .update(content)
    .digest("hex");
}

function matches(actual: unknown, expected: string) {
  return (
    typeof actual === "string" &&
    hex256.test(actual) &&
    timingSafeEqual(Buffer.from(actual, "hex"), Buffer.from(expected, "hex"))
  );
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new BackupError("El archivo de copia es inválido.");
  return value as Record<string, unknown>;
}

function bytes(value: unknown, size?: number) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]+$/.test(value))
    throw new BackupError("La copia cifrada está dañada.");
  const buffer = Buffer.from(value, "base64url");
  if (
    (size !== undefined && buffer.length !== size) ||
    buffer.toString("base64url") !== value
  )
    throw new BackupError("La copia cifrada está dañada.");
  return buffer;
}

export function backupSigningKey() {
  const key = process.env.FINANCE_BACKUP_SIGNING_KEY;
  if (!key || !hex256.test(key))
    throw new Error("Firma de copias no configurada");
  return Buffer.from(key, "hex");
}

export async function encodeBackup(
  payload: string,
  ownerId: string,
  key: Buffer,
  password?: string,
) {
  if (Buffer.byteLength(payload) > snapshotMaxBytes)
    throw new BackupError("La copia supera el tamaño admitido.");
  const createdAt = new Date().toISOString();
  const data = (await compress(payload)).toString("base64url");
  const signed = JSON.stringify({ ownerId, createdAt, data });
  const signature = mac(key, "file", signed);
  let envelope;
  if (password === undefined) {
    envelope = { version: 1, protection: "plain", signed, signature };
  } else {
    const salt = randomBytes(16);
    const iv = randomBytes(12);
    const encryptionKey = await deriveKey(password, salt);
    try {
      const cipher = createCipheriv("aes-256-gcm", encryptionKey, iv);
      cipher.setAAD(Buffer.from(context));
      const ciphertext = Buffer.concat([
        cipher.update(JSON.stringify({ signed, signature }), "utf8"),
        cipher.final(),
      ]);
      envelope = {
        version: 1,
        protection: "scrypt-aes-256-gcm",
        salt: salt.toString("base64url"),
        iv: iv.toString("base64url"),
        tag: cipher.getAuthTag().toString("base64url"),
        ciphertext: ciphertext.toString("base64url"),
      };
    } finally {
      encryptionKey.fill(0);
    }
  }
  const file = JSON.stringify(envelope);
  if (Buffer.byteLength(file) > BACKUP_MAX_BYTES)
    throw new BackupError("La copia supera el tamaño admitido.");
  return { file, createdAt };
}

export async function decodeBackup(
  input: unknown,
  ownerId: string,
  key: Buffer,
  password?: string,
) {
  const envelope = object(input);
  if (envelope.version !== 1)
    throw new BackupError("La versión de la copia no es compatible.");
  let content = envelope;
  if (envelope.protection === "scrypt-aes-256-gcm") {
    if (!password || password.length > BACKUP_PASSWORD_MAX)
      throw new BackupError("Ingresá la contraseña de la copia.");
    const salt = bytes(envelope.salt, 16);
    const iv = bytes(envelope.iv, 12);
    const tag = bytes(envelope.tag, 16);
    const ciphertext = bytes(envelope.ciphertext);
    const encryptionKey = await deriveKey(password, salt);
    try {
      const decipher = createDecipheriv("aes-256-gcm", encryptionKey, iv);
      decipher.setAAD(Buffer.from(context));
      decipher.setAuthTag(tag);
      const clear = Buffer.concat([
        decipher.update(ciphertext),
        decipher.final(),
      ]);
      content = object(JSON.parse(clear.toString("utf8")));
    } catch {
      throw new BackupError("Contraseña incorrecta o copia dañada.");
    } finally {
      encryptionKey.fill(0);
    }
  } else if (envelope.protection !== "plain") {
    throw new BackupError("El formato de la copia no es compatible.");
  }
  if (
    typeof content.signed !== "string" ||
    !matches(content.signature, mac(key, "file", content.signed))
  )
    throw new BackupError("La firma de la copia es inválida.");
  const {
    ownerId: holder,
    createdAt,
    data,
  } = object(JSON.parse(content.signed));
  if (holder !== ownerId)
    throw new BackupError("La copia pertenece a otra cuenta.");
  if (
    typeof createdAt !== "string" ||
    !Number.isFinite(Date.parse(createdAt)) ||
    typeof data !== "string"
  )
    throw new BackupError("El contenido de la copia es inválido.");
  let payload: string;
  try {
    payload = (
      await decompress(bytes(data), { maxOutputLength: snapshotMaxBytes })
    ).toString("utf8");
  } catch {
    throw new BackupError("El contenido de la copia es inválido.");
  }
  let snapshot: Record<string, unknown>;
  try {
    snapshot = object(JSON.parse(payload));
  } catch {
    throw new BackupError("El contenido de la copia es inválido.");
  }
  if (
    typeof snapshot.schema !== "string" ||
    !hex256.test(snapshot.schema) ||
    !snapshot.tables ||
    typeof snapshot.tables !== "object" ||
    Array.isArray(snapshot.tables) ||
    Object.values(snapshot.tables).some((rows) => !Array.isArray(rows))
  )
    throw new BackupError("El contenido de la copia es inválido.");
  return {
    payload,
    schema: snapshot.schema,
    createdAt,
    signature: content.signature as string,
  };
}

export function confirmBackup(
  key: Buffer,
  sessionToken: string,
  backupSignature: string,
  revision: string,
) {
  const details = `${randomUUID()}.${Date.now() + 15 * 60_000}.${revision}`;
  return `${details}.${mac(key, "confirm", JSON.stringify([sessionToken, backupSignature, details]))}`;
}

export function verifyBackupConfirmation(
  key: Buffer,
  sessionToken: string,
  backupSignature: string,
  confirmation: unknown,
) {
  if (typeof confirmation !== "string") return null;
  const match =
    /^([0-9a-f-]{36})\.(\d{13})\.([0-9a-f]{64})\.([0-9a-f]{64})$/.exec(
      confirmation,
    );
  if (!match) return null;
  const [, id, expiry, revision, signature] = match;
  if (
    Number(expiry) < Date.now() ||
    !matches(
      signature,
      mac(
        key,
        "confirm",
        JSON.stringify([
          sessionToken,
          backupSignature,
          `${id}.${expiry}.${revision}`,
        ]),
      ),
    )
  )
    return null;
  return { id, revision };
}
