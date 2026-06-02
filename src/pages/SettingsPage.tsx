import { useRef, useState } from "react";
import SectionCard from "../components/common/SectionCard";
import AlertModal from "../components/common/AlertModal";
import ConfirmModal from "../components/common/ConfirmModal";
import { useAppSelector } from "../app/hooks";
import { useGetDatabaseInfoQuery, useGetPushVapidPublicKeyQuery, useSubscribePushMutation, useUnsubscribePushMutation } from "../services/api";
import { isPushSupported, subscribeStaffPush, unsubscribeStaffPush } from "../utils/staffPush";
import type { DatabaseRestoreResponse } from "../types";

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export default function SettingsPage() {
  const user = useAppSelector((s) => s.auth.user);
  const isAdmin = user?.role === "admin";

  const { data: dbInfo, isLoading: infoLoading, refetch: refetchInfo } = useGetDatabaseInfoQuery(undefined, {
    skip: !isAdmin,
  });

  const [isDownloading, setIsDownloading] = useState(false);
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);
  const [showRestoreConfirm, setShowRestoreConfirm] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushEnabledLocal, setPushEnabledLocal] = useState<boolean | null>(null);
  const { data: pushConfig } = useGetPushVapidPublicKeyQuery(undefined, { skip: !isAdmin });
  const [subscribePush] = useSubscribePushMutation();
  const [unsubscribePush] = useUnsubscribePushMutation();
  const [alertModal, setAlertModal] = useState<{
    isOpen: boolean;
    message: string;
    type: "error" | "warning" | "success" | "info";
  }>({ isOpen: false, message: "", type: "info" });

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleEnablePush = async () => {
    if (!pushConfig?.enabled || !pushConfig.publicKey) {
      setAlertModal({
        isOpen: true,
        message: "Push is not configured on the server. Add VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY to your environment.",
        type: "warning",
      });
      return;
    }
    setPushBusy(true);
    try {
      const subscription = await subscribeStaffPush(pushConfig.publicKey);
      await subscribePush({ subscription: subscription as Record<string, unknown> }).unwrap();
      setPushEnabledLocal(true);
      setAlertModal({
        isOpen: true,
        message: "Phone notifications enabled for this browser. You will be alerted when parents submit fee screenshots.",
        type: "success",
      });
    } catch (err: unknown) {
      setAlertModal({
        isOpen: true,
        message: err instanceof Error ? err.message : "Could not enable notifications.",
        type: "error",
      });
    } finally {
      setPushBusy(false);
    }
  };

  const handleDisablePush = async () => {
    setPushBusy(true);
    try {
      const endpoint = await unsubscribeStaffPush();
      if (endpoint) {
        await unsubscribePush({ endpoint }).unwrap();
      }
      setPushEnabledLocal(false);
      setAlertModal({ isOpen: true, message: "Notifications disabled on this device.", type: "success" });
    } catch {
      setAlertModal({ isOpen: true, message: "Could not disable notifications.", type: "error" });
    } finally {
      setPushBusy(false);
    }
  };

  const handleDownloadBackup = async () => {
    setIsDownloading(true);
    try {
      const res = await fetch("/api/settings/backup", {
        headers: user?.id != null ? { "X-User-Id": String(user.id) } : {},
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error || "Backup failed.");
      }
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition");
      const match = disposition?.match(/filename="?([^"]+)"?/);
      const filename = match?.[1] ?? `school-backup-${new Date().toISOString().slice(0, 10)}.db`;

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);

      setAlertModal({
        isOpen: true,
        message: "Backup downloaded. Store this file somewhere safe.",
        type: "success",
      });
      void refetchInfo();
    } catch (err: unknown) {
      setAlertModal({
        isOpen: true,
        message: err instanceof Error ? err.message : "Could not download backup.",
        type: "error",
      });
    } finally {
      setIsDownloading(false);
    }
  };

  const runRestore = async () => {
    setShowRestoreConfirm(false);
    if (!restoreFile || !user?.id) return;

    setIsRestoring(true);
    try {
      const form = new FormData();
      form.append("database", restoreFile);

      const res = await fetch("/api/settings/restore", {
        method: "POST",
        headers: { "X-User-Id": String(user.id) },
        body: form,
      });

      const body = (await res.json().catch(() => ({}))) as DatabaseRestoreResponse & { error?: string };
      if (!res.ok) {
        throw new Error(body.error || "Restore failed.");
      }

      setRestoreFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";

      setAlertModal({
        isOpen: true,
        message: `${body.message ?? "Database restored."} The page will reload so you see fresh data.`,
        type: "success",
      });

      setTimeout(() => {
        window.location.href = import.meta.env.BASE_URL;
      }, 2000);
    } catch (err: unknown) {
      setAlertModal({
        isOpen: true,
        message: err instanceof Error ? err.message : "Could not restore database.",
        type: "error",
      });
    } finally {
      setIsRestoring(false);
    }
  };

  if (!user) {
    return null;
  }

  if (!isAdmin) {
    return (
      <div className="max-w-lg">
        <SectionCard title="Settings">
          <p className="text-sm text-slate-600">
            Database backup and restore are available to <strong>admin</strong> accounts only. You are signed in as{" "}
            <strong>{user.email}</strong> ({user.role}).
          </p>
        </SectionCard>
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-6">
      <p className="text-sm text-slate-600 leading-relaxed">
        Download a full copy of the school database or replace it with a backup file. Invoice PDF branding saved in
        this browser is <strong>not</strong> included — only server database tables.
      </p>

      <SectionCard title="Database overview">
        {infoLoading ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : dbInfo ? (
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-slate-500">File size</dt>
              <dd className="font-medium text-slate-900">{formatBytes(dbInfo.sizeBytes)}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Last modified</dt>
              <dd className="font-medium text-slate-900">{formatDateTime(dbInfo.modifiedAt)}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Students</dt>
              <dd className="font-medium text-slate-900">{dbInfo.students}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Invoices</dt>
              <dd className="font-medium text-slate-900">{dbInfo.invoices}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-slate-500">Path</dt>
              <dd className="font-mono text-xs text-slate-700 break-all">{dbInfo.path}</dd>
            </div>
          </dl>
        ) : (
          <p className="text-sm text-red-600">Could not load database info.</p>
        )}
      </SectionCard>

      <SectionCard title="Backup">
        <p className="text-sm text-slate-600 mb-4">
          Creates a consistent snapshot of <code className="text-xs bg-slate-100 px-1 rounded">school.db</code> while
          the app is running. Keep backups on another drive or cloud storage.
        </p>
        <button
          type="button"
          disabled={isDownloading}
          onClick={() => void handleDownloadBackup()}
          className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {isDownloading ? "Preparing download…" : "Download database backup"}
        </button>
      </SectionCard>

      <SectionCard title="Restore">
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 mb-4">
          <strong>Warning:</strong> Restore replaces all current data (students, invoices, fees, users, etc.) with the
          uploaded file. A safety copy of the current database is saved on the server before restore.
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Backup file (.db)</label>
            <input
              ref={fileInputRef}
              type="file"
              accept=".db,.sqlite,.sqlite3,application/x-sqlite3,application/vnd.sqlite3"
              disabled={isRestoring}
              onChange={(e) => setRestoreFile(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-slate-800 hover:file:bg-slate-200"
            />
            {restoreFile && (
              <p className="mt-1 text-xs text-slate-500">
                Selected: {restoreFile.name} ({formatBytes(restoreFile.size)})
              </p>
            )}
          </div>

          <button
            type="button"
            disabled={!restoreFile || isRestoring}
            onClick={() => setShowRestoreConfirm(true)}
            className="rounded-lg bg-red-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isRestoring ? "Restoring…" : "Restore from backup"}
          </button>
        </div>
      </SectionCard>

      {isAdmin && (
        <SectionCard title="Phone notifications">
          <p className="mb-4 text-sm text-slate-600">
            Get an alert on this device when a parent uploads a fee payment screenshot. Works in Chrome on Android and
            desktop. On iPhone, add the admin site to your Home Screen first, then enable here.
          </p>
          {!isPushSupported() ? (
            <p className="text-sm text-amber-700">This browser does not support push notifications.</p>
          ) : (
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                disabled={pushBusy || pushEnabledLocal === true}
                onClick={() => void handleEnablePush()}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {pushBusy ? "Working…" : "Enable notifications on this device"}
              </button>
              <button
                type="button"
                disabled={pushBusy || pushEnabledLocal === false}
                onClick={() => void handleDisablePush()}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Disable on this device
              </button>
            </div>
          )}
          {pushConfig && !pushConfig.enabled && (
            <p className="mt-3 text-xs text-slate-500">
              Server push keys are not set. Run <code className="rounded bg-slate-100 px-1">npx web-push generate-vapid-keys</code>{" "}
              and add them to your <code className="rounded bg-slate-100 px-1">.env</code> file.
            </p>
          )}
        </SectionCard>
      )}

      <AlertModal
        isOpen={alertModal.isOpen}
        message={alertModal.message}
        type={alertModal.type}
        onClose={() => setAlertModal((m) => ({ ...m, isOpen: false }))}
      />

      <ConfirmModal
        isOpen={showRestoreConfirm}
        message={`Replace the entire database with "${restoreFile?.name}"? This cannot be undone from the app (a server-side safety copy is kept).`}
        onConfirm={() => void runRestore()}
        onCancel={() => setShowRestoreConfirm(false)}
      />
    </div>
  );
}
