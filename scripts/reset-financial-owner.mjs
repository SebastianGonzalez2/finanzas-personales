import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import process from "node:process";
import { fileURLToPath, URL } from "node:url";
import pg from "pg";
import { readProductionManifest } from "../src/db/production-migrations.mts";
import { BACKUP_MAX_BYTES } from "../src/lib/export/backup-format.ts";
import { backupSigningKey, decodeBackup } from "../src/server/backup-format.ts";
import {
  assertProductionOwnerSession,
  productionDatabaseConfig,
  productionTarget,
} from "../src/server/neon-production-config.mts";

const sha256 = (input) => createHash("sha256").update(input).digest("hex");
const hashFormat = /^[a-f0-9]{64}$/;
const pushTables = [
  "finance.card_push_attempts",
  "finance.card_push_subscriptions",
];
const receipts = "finance_meta.account_restores";
const preserved = [
  "finance.fx_reference_rates",
  "finance.fx_reference_refreshes",
  "finance_meta.account_backup_layout",
  "finance_meta.schema_migrations",
];

class ResetError extends Error {}

function check(condition, message) {
  if (!condition) throw new ResetError(message);
}

const sorted = (names) => JSON.stringify([...names].sort());

const ownerPolicy =
  "(owner_id = NULLIF(current_setting('finance.owner_id'::text, true), ''::text))";

async function readInventory(client, apply) {
  const { entries } = await readProductionManifest();
  const { rows: applied } = await client.query(
    "SELECT version, sha256 FROM finance_meta.schema_migrations ORDER BY version",
  );
  check(
    JSON.stringify(applied) === JSON.stringify(entries),
    "Ledger financiero divergente",
  );

  const {
    rows: [backup],
  } = await client.query(`
    SELECT finance.account_backup_tables() AS tables,
      current_user = pg_get_userbyid(proowner) AS migration_owner
    FROM pg_proc WHERE oid = 'finance.account_backup_snapshot()'::regprocedure
  `);
  check(
    backup?.migration_owner,
    "Usar el rol propietario que instaló la copia",
  );
  check(backup.tables.length === 59, "Inventario de copia divergente");
  const purge = [
    ...pushTables,
    ...backup.tables.toReversed().map((name) => "finance." + name),
    receipts,
  ];
  check(
    purge.every((name) => /^(finance|finance_meta)\.[a-z_]+$/.test(name)),
    "Nombre de tabla inesperado",
  );
  const { rows: catalog } = await client.query(`
    SELECT n.nspname || '.' || c.relname AS name,
      EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = c.oid
        AND a.attnum > 0 AND NOT a.attisdropped AND a.attname = 'owner_id'
        AND a.attnotnull AND a.atttypid = 'text'::regtype) AS owned,
      c.relkind = 'r' AND NOT c.relispartition
        AND NOT EXISTS (SELECT 1 FROM pg_inherits i WHERE c.oid IN (i.inhrelid, i.inhparent))
        AS ordinary
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname IN ('finance','finance_meta') AND c.relkind IN ('r','p','f','m')
  `);
  check(
    sorted(catalog.map((row) => row.name)) ===
      sorted([...purge, ...preserved]) &&
      sorted(
        catalog
          .filter((row) => row.owned && row.ordinary)
          .map((row) => row.name),
      ) === sorted(purge),
    "Inventario financiero divergente",
  );

  // Compatible with normal reads and writes. It prevents concurrent changes
  // to rules and triggers on the target tables while this reset is running.
  if (apply)
    await client.query(`LOCK TABLE ${purge.join(", ")} IN ROW EXCLUSIVE MODE`);
  const {
    rows: [dependencies],
  } = await client.query(
    `
    WITH target AS (
      SELECT name, name::regclass AS oid, ord
      FROM unnest($1::text[]) WITH ORDINALITY AS t(name, ord)
    )
    SELECT EXISTS (
      SELECT 1 FROM pg_trigger t JOIN target r ON t.tgrelid = r.oid
      WHERE NOT t.tgisinternal AND (t.tgtype & 8) <> 0
    ) OR EXISTS (
      SELECT 1 FROM pg_rewrite r JOIN target t ON r.ev_class = t.oid
    ) OR EXISTS (
      SELECT 1 FROM pg_constraint fk JOIN target parent ON fk.confrelid = parent.oid
      LEFT JOIN target child ON fk.conrelid = child.oid
      WHERE fk.contype = 'f' AND (
        child.oid IS NULL OR child.ord > parent.ord OR fk.confdeltype <> 'a'
        OR NOT EXISTS (
          SELECT 1 FROM unnest(fk.conkey, fk.confkey) AS pair(source, destination)
          JOIN pg_attribute a ON a.attrelid = child.oid AND a.attnum = pair.source
          JOIN pg_attribute b ON b.attrelid = parent.oid AND b.attnum = pair.destination
          WHERE a.attname = 'owner_id' AND b.attname = 'owner_id'
        )
      )
    ) OR EXISTS (
      SELECT 1 FROM target t
      JOIN pg_class c ON c.oid = t.oid
      WHERE NOT c.relrowsecurity OR NOT c.relforcerowsecurity OR (
        NOT EXISTS (
          SELECT 1 FROM pg_policy p WHERE p.polrelid = t.oid
            AND p.polname IN ('account_backup_owner','account_delete_owner')
            AND p.polpermissive AND p.polcmd = '*'
            AND pg_get_expr(p.polqual, p.polrelid) = $2
            AND p.polroles = ARRAY[(SELECT oid FROM pg_roles WHERE rolname = current_user)]
        )
        OR (row_security_active(t.oid) AND EXISTS (
          SELECT 1 FROM pg_policy p CROSS JOIN LATERAL unnest(p.polroles) AS role(oid)
          WHERE p.polrelid = t.oid AND NOT p.polpermissive AND p.polcmd IN ('*','r','d')
            AND CASE WHEN role.oid = 0 THEN true ELSE pg_has_role(role.oid, 'USAGE') END
        ))
      )
    ) AS unsafe
  `,
    [purge, ownerPolicy],
  );
  check(!dependencies.unsafe, "Dependencia de borrado incompatible");
  return purge;
}

async function inspectOwner(client, purge, ownerId) {
  // PostgreSQL serializes exact decimals and timestamps. Only digests and
  // counts come out of this transaction.
  const {
    rows: [snapshot],
  } = await client.query(`
    SELECT s.revision, encode(sha256(convert_to(s.payload, 'UTF8')), 'hex') AS payload_sha256
    FROM finance.account_backup_snapshot() s
  `);
  const counts = {};
  const extraRevisions = [];
  for (const name of purge) {
    const digest = [...pushTables, receipts].includes(name)
      ? `, encode(sha256(convert_to(coalesce(
          jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text COLLATE "C")::text, '[]'
        ), 'UTF8')), 'hex') AS digest`
      : "";
    const {
      rows: [row],
    } = await client.query(
      `SELECT count(*)::text AS count${digest} FROM ${name} AS t WHERE owner_id = $1`,
      [ownerId],
    );
    counts[name] = row.count;
    if (row.digest) extraRevisions.push(row.digest);
  }
  return {
    counts,
    payloadSha256: snapshot.payload_sha256,
    stateSha256: sha256(
      JSON.stringify([ownerId, snapshot.revision, extraRevisions, counts]),
    ),
  };
}

// The CLI alone selects production. Tests supply a disposable connection.
export async function resetFinancialOwner(
  client,
  { ownerId, email, approval, backupPayloadSha256, verifyTarget },
) {
  check(
    typeof ownerId === "string" &&
      ownerId.length > 0 &&
      ownerId.length <= 200 &&
      ownerId.trim() === ownerId &&
      typeof email === "string" &&
      email === email.trim().toLowerCase() &&
      email.includes("@"),
    "Identidad exacta requerida",
  );
  await client.query("BEGIN");
  try {
    await verifyTarget(client);
    await client.query(`
      SET LOCAL search_path = pg_catalog;
      SET LOCAL lock_timeout = '5s';
      SET LOCAL statement_timeout = '30s';
      SET LOCAL TimeZone = 'UTC';
      SET LOCAL DateStyle = 'ISO, YMD';
      SELECT pg_advisory_xact_lock_shared(705005);
    `);
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtextextended('finanzas:account:' || $1, 0))",
      [ownerId],
    );

    // authorize_session locks the enabled binding and checks the existing
    // Google account and live session. The token stays inside PostgreSQL.
    const {
      rows: [identity],
    } = await client.query(
      `
      SELECT app_access.authorize_session(s.token) AS owner
      FROM app_auth.session s JOIN app_auth."user" u ON u.id = s."userId"
      WHERE u.id = $1 AND u.email = $2 AND s."expiresAt" > clock_timestamp()
      ORDER BY s."expiresAt" DESC LIMIT 1
    `,
      [ownerId, email],
    );
    check(
      identity?.owner === ownerId,
      "Identidad Google o sesión no autorizada",
    );
    await client.query("SELECT set_config('finance.owner_id', $1, true)", [
      ownerId,
    ]);

    const purge = await readInventory(client, Boolean(approval));
    const initial = await inspectOwner(client, purge, ownerId);
    if (approval) {
      check(
        initial.stateSha256 === approval.stateSha256,
        "El estado cambió desde el inventario",
      );
      check(backupPayloadSha256 !== undefined, "Copia previa requerida");
    }
    check(
      backupPayloadSha256 === undefined ||
        initial.payloadSha256 === backupPayloadSha256,
      "La copia no corresponde al estado actual",
    );
    if (!approval) {
      await client.query("ROLLBACK");
      return initial;
    }

    for (const name of purge) {
      const deleted = await client.query(
        `DELETE FROM ${name} WHERE owner_id = $1`,
        [ownerId],
      );
      check(
        String(deleted.rowCount) === initial.counts[name],
        "Recuento de borrado divergente",
      );
    }
    await client.query("SET CONSTRAINTS ALL IMMEDIATE");
    const final = await inspectOwner(client, purge, ownerId);
    check(
      Object.values(final.counts).every((count) => count === "0"),
      "Quedaron datos del titular",
    );
    check(
      (await client.query("COMMIT")).command === "COMMIT",
      "Transacción no confirmada",
    );
    return { deleted: initial.counts, remaining: final.counts };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  }
}

async function main(args) {
  const [mode, argument, applyFileSha256, approvedScript] = args;
  const fileSha256 = mode === "--plan" ? argument : applyFileSha256;
  const scriptSha256 = sha256(await readFile(new URL(import.meta.url)));
  if (args.length === 0) return { target: productionTarget, scriptSha256 };
  check(
    (mode === "--plan" &&
      (args.length === 1 ||
        (args.length === 2 && hashFormat.test(fileSha256)))) ||
      (mode === "--apply" &&
        args.length === 4 &&
        hashFormat.test(argument) &&
        hashFormat.test(fileSha256) &&
        approvedScript === scriptSha256),
    "Uso: --plan [archivo SHA-256] o --apply <estado SHA-256> <archivo SHA-256> <script SHA-256>",
  );
  const { OPS_RESET_OWNER_ID: ownerId, OPS_RESET_EMAIL: email } = process.env;
  let backupPayloadSha256;
  if (fileSha256) {
    const file = await readFile(process.env.OPS_RESET_BACKUP_PATH);
    check(
      file.byteLength <= BACKUP_MAX_BYTES && sha256(file) === fileSha256,
      "El archivo no coincide con la copia autorizada",
    );
    const archive = JSON.parse(file.toString("utf8"));
    check(
      archive?.protection === "scrypt-aes-256-gcm",
      "Se requiere una copia cifrada",
    );
    const backup = await decodeBackup(
      archive,
      ownerId,
      backupSigningKey(),
      process.env.OPS_RESET_BACKUP_PASSWORD,
    );
    backupPayloadSha256 = sha256(backup.payload);
  }
  const client = new pg.Client(
    productionDatabaseConfig(process.env, productionTarget, "direct"),
  );
  try {
    await client.connect();
    return {
      target: productionTarget,
      scriptSha256,
      ...(fileSha256 ? { verifiedBackupSha256: fileSha256 } : {}),
      ...(await resetFinancialOwner(client, {
        ownerId,
        email,
        approval: mode === "--apply" ? { stateSha256: argument } : undefined,
        backupPayloadSha256,
        verifyTarget: assertProductionOwnerSession,
      })),
    };
  } finally {
    await client.end().catch(() => {});
  }
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1])
) {
  try {
    const result = await main(process.argv.slice(2));
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  } catch (error) {
    // Driver errors and filesystem paths may contain private fields.
    process.stderr.write(
      error instanceof ResetError
        ? error.message + "\n"
        : "Operación rechazada o estado de confirmación desconocido. Verificar con --plan antes de reintentar.\n",
    );
    process.exitCode = 1;
  }
}
