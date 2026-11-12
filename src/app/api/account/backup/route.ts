import { createHash } from "node:crypto";
import { bankReferenceToday } from "@/domain/bank-balances";
import { withGoogleOwner } from "@/server/google-auth";
import { googlePrivateHeaders } from "@/server/google-http";
import { limitedJson } from "@/server/google-policy";
import {
  BackupError,
  backupSigningKey,
  confirmBackup,
  decodeBackup,
  encodeBackup,
  verifyBackupConfirmation,
} from "@/server/backup-format";
import {
  exportFailure,
  exportOperationError,
  exportOriginError,
  privateDownload,
} from "@/server/private-download";
import {
  BACKUP_MAX_BYTES,
  BACKUP_PASSWORD_MAX,
  BACKUP_PASSWORD_MIN,
} from "@/lib/export/backup-format";
import type pg from "pg";

export const runtime = "nodejs";

async function readSnapshot(client: pg.PoolClient) {
  const {
    rows: [snapshot],
  } = await client.query<{
    payload: string;
    revision: string;
    schema: string;
  }>(`SELECT s.*, s.payload::jsonb->>'schema' AS schema
      FROM finance.account_backup_snapshot() s`);
  return snapshot;
}

export async function POST(request: Request) {
  const originError = exportOriginError(request);
  if (originError) return originError;
  const body: unknown = await limitedJson(
    request,
    BACKUP_MAX_BYTES + 4096,
  ).catch(() => null);
  if (!body || typeof body !== "object" || !("action" in body))
    return exportFailure("Solicitud inválida o archivo demasiado grande.", 400);
  const action = body.action;
  const password = "password" in body ? body.password : undefined;
  if (
    password !== undefined &&
    (typeof password !== "string" || password.length > BACKUP_PASSWORD_MAX)
  )
    return exportFailure("La contraseña de la copia es inválida.", 400);

  try {
    if (action === "download") {
      if (password !== undefined && password.length < BACKUP_PASSWORD_MIN)
        return exportFailure(
          `Usá al menos ${BACKUP_PASSWORD_MIN} caracteres.`,
          400,
        );
      const { snapshot, ownerId } = await withGoogleOwner(
        request,
        async (client, ownerId) => ({
          snapshot: await readSnapshot(client),
          ownerId,
        }),
      );
      const { file, createdAt } = await encodeBackup(
        snapshot.payload,
        ownerId,
        backupSigningKey(),
        password,
      );
      return privateDownload(
        file,
        `finanzas-copia-${bankReferenceToday(new Date(createdAt))}.json`,
        "application/json; charset=utf-8",
      );
    }
    if ((action !== "preview" && action !== "restore") || !("backup" in body))
      return exportFailure("Solicitud inválida.", 400);
    return await withGoogleOwner(
      request,
      async (client, ownerId, sessionToken) => {
        const key = backupSigningKey();
        let backup;
        try {
          backup = await decodeBackup(body.backup, ownerId, key, password);
        } catch (error) {
          if (error instanceof BackupError)
            return exportFailure(error.message, 400);
          throw error;
        }
        if (action === "preview") {
          const { revision, schema } = await readSnapshot(client);
          if (schema !== backup.schema)
            return exportFailure(
              "La copia corresponde a otra versión del esquema financiero.",
              409,
            );
          return Response.json(
            {
              createdAt: backup.createdAt,
              confirmation: confirmBackup(
                key,
                sessionToken,
                backup.signature,
                revision,
              ),
            },
            { headers: googlePrivateHeaders },
          );
        }
        const confirmation = verifyBackupConfirmation(
          key,
          sessionToken,
          backup.signature,
          "confirmation" in body ? body.confirmation : undefined,
        );
        if (!confirmation)
          return exportFailure(
            "Volvé a verificar la copia y confirmá la restauración.",
            409,
          );
        const {
          rows: [row],
        } = await client.query<{ status: string }>(
          "SELECT finance.restore_account($1, $2::jsonb, $3, $4::uuid, $5) AS status",
          [
            sessionToken,
            backup.payload,
            confirmation.revision,
            confirmation.id,
            createHash("sha256").update(backup.payload).digest("hex"),
          ],
        );
        if (row.status !== "restored")
          return exportFailure(
            row.status === "changed"
              ? "La cuenta cambió desde la verificación. Revisá la copia y confirmá de nuevo."
              : "La copia corresponde a otra versión del esquema financiero.",
            409,
          );
        return Response.json(
          { restored: true },
          { headers: googlePrivateHeaders },
        );
      },
      action === "restore",
    );
  } catch (error) {
    return error instanceof BackupError
      ? exportFailure(error.message, 413)
      : exportOperationError(error);
  }
}
