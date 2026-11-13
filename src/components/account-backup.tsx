"use client";

import { useRef, useState, type FormEvent } from "react";
import {
  BACKUP_MAX_BYTES,
  BACKUP_PASSWORD_MAX,
  BACKUP_PASSWORD_MIN,
} from "@/lib/export/backup-format";
import { saveDownload } from "@/lib/export/download";
import { HistoryField, historyControl, historyPrimary } from "./history-fields";
import { Card } from "./ui/card";

type Notice = { kind: "error" | "status"; message: string };
type Preview = { createdAt: string; confirmation: string };

async function backupRequest(body: object) {
  const response = await fetch("/api/account/backup", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new Error(
      error?.error ?? "No se pudo procesar la copia. Volvé a intentarlo.",
    );
  }
  return response;
}

export function AccountBackup() {
  const [protect, setProtect] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [downloadNotice, setDownloadNotice] = useState<Notice>();
  const [backup, setBackup] = useState<{
    content: unknown;
    encrypted: boolean;
  }>();
  const [password, setPassword] = useState("");
  const [preview, setPreview] = useState<Preview>();
  const [confirmed, setConfirmed] = useState(false);
  const [restoreNotice, setRestoreNotice] = useState<Notice>();
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  async function download(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setDownloadNotice(undefined);
    try {
      const response = await backupRequest({
        action: "download",
        password: protect ? newPassword : undefined,
      });
      await saveDownload(response, "finanzas-copia.json");
      setNewPassword("");
      setDownloadNotice({
        kind: "status",
        message: "Copia de seguridad descargada.",
      });
    } catch (error) {
      setDownloadNotice({ kind: "error", message: (error as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function selectFile(file?: File) {
    setBackup(undefined);
    setPreview(undefined);
    setConfirmed(false);
    setPassword("");
    setRestoreNotice(undefined);
    if (!file) return;
    if (file.size > BACKUP_MAX_BYTES) {
      setRestoreNotice({
        kind: "error",
        message: "La copia supera el tamaño admitido.",
      });
      return;
    }
    setBusy(true);
    try {
      const content = JSON.parse(await file.text());
      if (
        content?.version !== 1 ||
        !["plain", "scrypt-aes-256-gcm"].includes(content.protection)
      )
        throw new Error("Archivo incompatible");
      setBackup({
        content,
        encrypted: content.protection === "scrypt-aes-256-gcm",
      });
    } catch {
      setRestoreNotice({
        kind: "error",
        message: "Elegí un archivo de copia compatible.",
      });
    } finally {
      setBusy(false);
    }
  }

  async function restore(event: FormEvent) {
    event.preventDefault();
    if (!backup || (preview && !confirmed)) return;
    setBusy(true);
    setRestoreNotice(undefined);
    try {
      const response = await backupRequest({
        action: preview ? "restore" : "preview",
        backup: backup.content,
        password: backup.encrypted ? password : undefined,
        confirmation: preview?.confirmation,
      });
      if (!preview) {
        setPreview((await response.json()) as Preview);
      } else {
        setBackup(undefined);
        setPreview(undefined);
        setConfirmed(false);
        setPassword("");
        if (fileInput.current) fileInput.current.value = "";
        setRestoreNotice({
          kind: "status",
          message: "Se restauró la copia de seguridad.",
        });
      }
    } catch (error) {
      setRestoreNotice({ kind: "error", message: (error as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      aria-labelledby="configuracion-copias"
      className="mt-6 grid max-w-2xl gap-4"
    >
      <h2 id="configuracion-copias" className="text-lg font-semibold">
        Copias de seguridad
      </h2>
      <Card className="gap-3 p-5 shadow-none">
        <form onSubmit={download} className="grid gap-3">
          <h3 id="descargar-copia" className="font-semibold" tabIndex={-1}>
            Descargar copia de seguridad
          </h3>
          <p className="text-sm text-muted-foreground">
            El archivo contiene tus datos financieros. Guardalo en un lugar
            privado y seguro.
          </p>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              checked={protect}
              disabled={busy}
              onChange={(event) => {
                setProtect(event.target.checked);
                setNewPassword("");
              }}
            />
            Proteger esta copia con contraseña
          </label>
          {protect && (
            <>
              <HistoryField label="Contraseña nueva para esta copia">
                <input
                  type="password"
                  className={historyControl}
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  autoComplete="new-password"
                  minLength={BACKUP_PASSWORD_MIN}
                  maxLength={BACKUP_PASSWORD_MAX}
                  required
                  disabled={busy}
                />
              </HistoryField>
              <p className="text-sm text-muted-foreground">
                Usá al menos {BACKUP_PASSWORD_MIN} caracteres. Si perdés la
                contraseña, no vas a poder recuperar esta copia.
              </p>
            </>
          )}
          <button type="submit" className={historyPrimary} disabled={busy}>
            Descargar copia
          </button>
          <BackupNotice notice={downloadNotice} />
        </form>
      </Card>
      <Card className="gap-3 p-5 shadow-none">
        <form onSubmit={restore} className="grid gap-3">
          <h3 className="font-semibold">Restaurar copia de seguridad</h3>
          <HistoryField label="Archivo de copia">
            <input
              ref={fileInput}
              type="file"
              className={historyControl}
              accept=".json,application/json"
              disabled={busy}
              onChange={(event) => void selectFile(event.target.files?.[0])}
              required
            />
          </HistoryField>
          {backup?.encrypted && (
            <HistoryField label="Contraseña de la copia">
              <input
                type="password"
                className={historyControl}
                value={password}
                autoComplete="off"
                maxLength={BACKUP_PASSWORD_MAX}
                required
                disabled={busy || !!preview}
                onChange={(event) => setPassword(event.target.value)}
              />
            </HistoryField>
          )}
          {preview && (
            <div className="grid gap-3 rounded-lg border p-3 text-sm">
              <p>
                Copia del{" "}
                {new Intl.DateTimeFormat("es-UY", {
                  dateStyle: "long",
                  timeStyle: "short",
                  timeZone: "America/Montevideo",
                }).format(new Date(preview.createdAt))}
                .
              </p>
              <p>
                Se reemplazarán todos tus datos financieros. Perderás los
                cambios posteriores a esta copia.
              </p>
              <a href="#configuracion-copias" className="underline">
                Descargar una copia del estado actual
              </a>
              <label className="flex items-start gap-2 font-medium">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={confirmed}
                  disabled={busy}
                  onChange={(event) => setConfirmed(event.target.checked)}
                />
                Confirmo que quiero reemplazar mis datos financieros.
              </label>
              <button
                type="button"
                className="justify-self-start underline"
                disabled={busy}
                onClick={() => {
                  setPreview(undefined);
                  setConfirmed(false);
                  setRestoreNotice(undefined);
                }}
              >
                Volver a verificar la copia
              </button>
            </div>
          )}
          <button
            type="submit"
            className={historyPrimary}
            disabled={busy || !backup || (!!preview && !confirmed)}
          >
            {preview ? "Restaurar y reemplazar datos" : "Verificar copia"}
          </button>
          <BackupNotice notice={restoreNotice} />
        </form>
      </Card>
    </section>
  );
}

function BackupNotice({ notice }: { notice?: Notice }) {
  return (
    notice && (
      <p
        role={notice.kind === "error" ? "alert" : "status"}
        className={
          notice.kind === "error"
            ? "text-sm text-destructive"
            : "text-sm text-muted-foreground"
        }
      >
        {notice.message}
      </p>
    )
  );
}
