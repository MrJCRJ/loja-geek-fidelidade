import fs from "node:fs";
import path from "node:path";
import { config } from "./config.js";
import { getDb } from "./db.js";
import { getCustomer, getSetting, listLedger, setSetting } from "./customers.js";
import { getCustomerTimeSummary } from "./billing.js";
import { listSessions } from "./sessions.js";

export function getUnitSettings() {
  return {
    unitName: getSetting("unit_name", process.env.UNIT_NAME || config.unitName || "Unidade 1"),
    unitId: getSetting("unit_id", process.env.UNIT_ID || config.unitId || "unit-1"),
  };
}

export function setUnitSettings(input: { unitName?: string; unitId?: string }) {
  if (input.unitName !== undefined) setSetting("unit_name", input.unitName.trim());
  if (input.unitId !== undefined) setSetting("unit_id", input.unitId.trim());
  return getUnitSettings();
}

export function createSqliteBackup(opts?: { keep?: number; reason?: string }) {
  const dbPath = config.databasePath;
  const backupDir = path.join(path.dirname(dbPath), "backups");
  fs.mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const reason = opts?.reason === "scheduled" ? "auto" : "manual";
  const fileName = `fidelidade-${reason}-${stamp}.db`;
  const dest = path.join(backupDir, fileName);
  // Checkpoint WAL then copy
  getDb().pragma("wal_checkpoint(TRUNCATE)");
  fs.copyFileSync(dbPath, dest);
  const keep = Math.min(
    50,
    Math.max(3, opts?.keep ?? (Number(getSetting("backup_keep", "20")) || 20)),
  );
  const files = listBackupFiles();
  for (const old of files.slice(keep)) {
    try {
      fs.unlinkSync(path.join(backupDir, old.fileName));
    } catch {
      /* ignore */
    }
  }
  return {
    ok: true as const,
    fileName,
    path: dest,
    createdAt: new Date().toISOString(),
    reason,
    keep,
  };
}

export function listBackupFiles() {
  const backupDir = path.join(path.dirname(config.databasePath), "backups");
  if (!fs.existsSync(backupDir)) return [];
  return fs
    .readdirSync(backupDir)
    .filter((f) => f.endsWith(".db"))
    .map((fileName) => {
      const full = path.join(backupDir, fileName);
      const st = fs.statSync(full);
      return { fileName, size: st.size, createdAt: st.mtime.toISOString(), path: full };
    })
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export function resolveBackupPath(fileName: string) {
  const safe = path.basename(fileName);
  if (safe !== fileName || !safe.endsWith(".db")) return null;
  const full = path.join(path.dirname(config.databasePath), "backups", safe);
  if (!fs.existsSync(full)) return null;
  return full;
}

export function exportCustomerLgpd(customerId: string) {
  const customer = getCustomer(customerId) as Record<string, unknown> | undefined;
  if (!customer) return null;
  const faceCount = getDb()
    .prepare("SELECT COUNT(*) AS c FROM face_embeddings WHERE customer_id = ?")
    .get(customerId) as { c: number };
  const faceMeta = getDb()
    .prepare(
      "SELECT id, created_at FROM face_embeddings WHERE customer_id = ? ORDER BY created_at",
    )
    .all(customerId);
  const points = listLedger(customerId, 200);
  const time = getCustomerTimeSummary(customerId);
  const sessions = listSessions(100).filter(
    (s: { customer_id?: string }) => s.customer_id === customerId,
  );
  const events = getDb()
    .prepare(
      `SELECT id, station_id, score, status, created_at
       FROM recognition_events WHERE customer_id = ? ORDER BY created_at DESC LIMIT 200`,
    )
    .all(customerId);

  return {
    exportedAt: new Date().toISOString(),
    purpose: "LGPD — portabilidade / auditoria (sem embeddings biométricos brutos)",
    unit: getUnitSettings(),
    customer: {
      id: customer.id,
      name: customer.name,
      phone: customer.phone,
      email: customer.email,
      level: customer.level,
      points: customer.points,
      notes: customer.notes,
      consent_at: customer.consent_at,
      time_balance_seconds: customer.time_balance_seconds,
      subscription_status: customer.subscription_status,
      subscription_expires_at: customer.subscription_expires_at,
      created_at: customer.created_at,
      updated_at: customer.updated_at,
    },
    biometrics: {
      sampleCount: faceCount.c,
      samples: faceMeta,
      note: "Embeddings faciais não são exportados neste arquivo (dado sensível).",
    },
    pointLedger: points,
    timeSummary: time,
    sessions,
    recognitionEvents: events,
  };
}

export function getReadiness() {
  const unit = getUnitSettings();
  const defaults = {
    adminPassword: config.adminPassword === "admin123",
    jwtSecret: config.jwtSecret === "troque-este-segredo-em-producao",
    stationSharedSecret: config.stationSharedSecret === "loja-geek-station-secret",
  };
  const secretsOk = !defaults.adminPassword && !defaults.jwtSecret && !defaults.stationSharedSecret;
  return {
    unit,
    strictSecrets: config.strictSecrets,
    secretsOk,
    defaultsInUse: defaults,
    portalOrigin: Boolean(config.portalOrigin),
    portalCheckoutMode: config.portalCheckoutMode,
    mpConfigured: Boolean(config.mpAccessToken),
    tunnelHint:
      "Configure cloudflared nomeado + MP_ACCESS_TOKEN conforme docs/loja-ready.md para portal↔loja.",
    checklist: [
      { id: "secrets", ok: secretsOk, label: "Segredos não-default" },
      { id: "strict", ok: config.strictSecrets, label: "STRICT_SECRETS / production" },
      { id: "portal_origin", ok: Boolean(config.portalOrigin), label: "PORTAL_ORIGIN definido" },
      {
        id: "pix",
        ok: Boolean(config.mpAccessToken) && config.portalCheckoutMode === "live",
        label: "Pix live (MP_ACCESS_TOKEN + checkout)",
      },
    ],
  };
}
