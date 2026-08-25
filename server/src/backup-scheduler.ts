import { getSetting, setSetting } from "./customers.js";
import { createSqliteBackup, listBackupFiles } from "./admin-ops.js";
import { logEvent } from "./telemetry.js";

export type BackupSchedule = {
  enabled: boolean;
  intervalHours: number;
  keep: number;
  lastBackupAt: string | null;
  nextDueAt: string | null;
};

let timer: ReturnType<typeof setInterval> | null = null;

export function getBackupSchedule(): BackupSchedule {
  const enabled = getSetting("backup_auto_enabled", "1") !== "0";
  const intervalHours = Math.min(
    168,
    Math.max(1, Number(getSetting("backup_interval_hours", "24")) || 24),
  );
  const keep = Math.min(50, Math.max(3, Number(getSetting("backup_keep", "20")) || 20));
  const files = listBackupFiles();
  const lastBackupAt = files[0]?.createdAt ?? null;
  let nextDueAt: string | null = null;
  if (enabled) {
    const lastMs = lastBackupAt ? Date.parse(lastBackupAt) : 0;
    const nextMs = (lastMs || 0) + intervalHours * 3600_000;
    nextDueAt = new Date(Math.max(nextMs, Date.now())).toISOString();
    if (!lastBackupAt) nextDueAt = new Date().toISOString();
  }
  return { enabled, intervalHours, keep, lastBackupAt, nextDueAt };
}

export function setBackupSchedule(input: {
  enabled?: boolean;
  intervalHours?: number;
  keep?: number;
}) {
  if (input.enabled !== undefined) {
    setSetting("backup_auto_enabled", input.enabled ? "1" : "0");
  }
  if (input.intervalHours !== undefined) {
    const h = Math.min(168, Math.max(1, Math.round(input.intervalHours)));
    setSetting("backup_interval_hours", String(h));
  }
  if (input.keep !== undefined) {
    const k = Math.min(50, Math.max(3, Math.round(input.keep)));
    setSetting("backup_keep", String(k));
  }
  return getBackupSchedule();
}

function isDue(schedule: BackupSchedule): boolean {
  if (!schedule.enabled) return false;
  if (!schedule.lastBackupAt) return true;
  const ageMs = Date.now() - Date.parse(schedule.lastBackupAt);
  return ageMs >= schedule.intervalHours * 3600_000;
}

export function runScheduledBackupIfDue(force = false) {
  const schedule = getBackupSchedule();
  if (!force && !isDue(schedule)) {
    return { ran: false as const, schedule };
  }
  try {
    const result = createSqliteBackup({ keep: schedule.keep, reason: force ? "manual" : "scheduled" });
    logEvent({
      level: "info",
      source: "api",
      kind: force ? "backup.manual" : "backup.scheduled",
      message: `Backup ${result.fileName} criado`,
      meta: { fileName: result.fileName, keep: schedule.keep, intervalHours: schedule.intervalHours },
    });
    return { ran: true as const, schedule: getBackupSchedule(), result };
  } catch (err) {
    logEvent({
      level: "error",
      source: "api",
      kind: "backup.failed",
      message: err instanceof Error ? err.message : "Falha no backup agendado",
    });
    throw err;
  }
}

/** Checa a cada `checkMs` se já passou o intervalo (padrão 15 min). */
export function startBackupScheduler(checkMs = 15 * 60_000) {
  if (timer) return;
  // primeira checagem após 45s (API já estável)
  setTimeout(() => {
    try {
      runScheduledBackupIfDue();
    } catch {
      /* já logado */
    }
  }, 45_000);
  timer = setInterval(() => {
    try {
      runScheduledBackupIfDue();
    } catch {
      /* já logado */
    }
  }, checkMs);
}
