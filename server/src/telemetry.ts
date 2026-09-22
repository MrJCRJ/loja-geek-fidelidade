import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { config } from "./config.js";
import { getDb } from "./db.js";
import { faceHealth } from "./face-client.js";
import { listConnectedStations } from "./hub.js";
import { listStations } from "./stations.js";
import { getReadiness } from "./admin-ops.js";

export type TelemetryLevel = "debug" | "info" | "warn" | "error";

export type TelemetryInput = {
  level?: TelemetryLevel;
  source: string;
  kind: string;
  message: string;
  stationId?: string | null;
  meta?: Record<string, unknown> | null;
};

const SENSITIVE =
  /^(password|passwd|secret|token|pin|authorization|cookie|embedding|image|imagebase64|face|biometric)/i;

const MAX_ROWS = 5000;
const MAX_AGE_DAYS = 30;

let lastProbeKey = "";
let probeTimer: ReturnType<typeof setInterval> | null = null;

export function ensureTelemetrySchema() {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS system_events (
      id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      level TEXT NOT NULL,
      source TEXT NOT NULL,
      kind TEXT NOT NULL,
      message TEXT NOT NULL,
      station_id TEXT,
      meta TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_system_events_created ON system_events(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_system_events_level ON system_events(level);
    CREATE INDEX IF NOT EXISTS idx_system_events_kind ON system_events(kind);
  `);
}

export function sanitizeMeta(meta?: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!meta || typeof meta !== "object") return null;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(meta)) {
    if (SENSITIVE.test(k)) continue;
    if (typeof v === "string" && v.length > 500) {
      out[k] = `${v.slice(0, 500)}…`;
      continue;
    }
    if (typeof v === "number" || typeof v === "boolean" || v === null) {
      out[k] = v;
      continue;
    }
    if (typeof v === "string") {
      out[k] = v;
      continue;
    }
    try {
      out[k] = JSON.parse(JSON.stringify(v));
    } catch {
      out[k] = String(v);
    }
  }
  return Object.keys(out).length ? out : null;
}

export function logEvent(input: TelemetryInput) {
  ensureTelemetrySchema();
  const db = getDb();
  const id = randomUUID();
  const createdAt = new Date().toISOString();
  const level = input.level || "info";
  const meta = sanitizeMeta(input.meta);
  db.prepare(
    `INSERT INTO system_events (id, created_at, level, source, kind, message, station_id, meta)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    createdAt,
    level,
    String(input.source || "api").slice(0, 64),
    String(input.kind || "event").slice(0, 96),
    String(input.message || "").slice(0, 500),
    input.stationId || null,
    meta ? JSON.stringify(meta) : null,
  );

  // retenção leve (a cada ~50 inserts)
  if (Math.random() < 0.02) pruneTelemetry();

  return { id, createdAt };
}

export function pruneTelemetry() {
  const db = getDb();
  const cutoff = new Date(Date.now() - MAX_AGE_DAYS * 86400_000).toISOString();
  db.prepare("DELETE FROM system_events WHERE created_at < ?").run(cutoff);
  const count = (db.prepare("SELECT COUNT(*) AS c FROM system_events").get() as { c: number }).c;
  if (count > MAX_ROWS) {
    db.prepare(
      `DELETE FROM system_events WHERE id IN (
         SELECT id FROM system_events ORDER BY created_at ASC LIMIT ?
       )`,
    ).run(count - MAX_ROWS);
  }
}

export function listTelemetryEvents(opts?: {
  limit?: number;
  level?: string;
  source?: string;
  kind?: string;
}) {
  ensureTelemetrySchema();
  const limit = Math.min(Math.max(opts?.limit ?? 100, 1), 500);
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (opts?.level) {
    clauses.push("level = ?");
    params.push(opts.level);
  }
  if (opts?.source) {
    clauses.push("source = ?");
    params.push(opts.source);
  }
  if (opts?.kind) {
    clauses.push("kind LIKE ?");
    params.push(`%${opts.kind}%`);
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const rows = getDb()
    .prepare(
      `SELECT id, created_at, level, source, kind, message, station_id, meta
       FROM system_events ${where}
       ORDER BY created_at DESC LIMIT ?`,
    )
    .all(...params, limit) as Array<{
    id: string;
    created_at: string;
    level: string;
    source: string;
    kind: string;
    message: string;
    station_id: string | null;
    meta: string | null;
  }>;

  return rows.map((r) => ({
    ...r,
    meta: r.meta ? (JSON.parse(r.meta) as Record<string, unknown>) : null,
  }));
}

function diskStats() {
  try {
    const dir = path.dirname(config.databasePath);
    const st = fs.statfsSync(dir);
    const total = Number(st.blocks) * Number(st.bsize);
    const free = Number(st.bavail) * Number(st.bsize);
    return {
      path: dir,
      totalBytes: total,
      freeBytes: free,
      freePct: total > 0 ? Math.round((free / total) * 1000) / 10 : null,
    };
  } catch {
    return null;
  }
}

export function hostSnapshot() {
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  return {
    hostname: os.hostname(),
    platform: os.platform(),
    uptimeSec: Math.round(os.uptime()),
    loadAvg: os.loadavg().map((n) => Math.round(n * 100) / 100),
    mem: {
      totalBytes: totalMem,
      freeBytes: freeMem,
      usedPct: Math.round(((totalMem - freeMem) / totalMem) * 1000) / 10,
    },
    disk: diskStats(),
    unitId: config.unitId,
    unitName: config.unitName,
  };
}

export async function buildDiagnostics() {
  ensureTelemetrySchema();
  const face = await faceHealth();
  const host = hostSnapshot();
  const readiness = getReadiness();
  const stations = listStations() as Array<{ id: string; name: string; online: number }>;
  const connected = listConnectedStations();
  const offlineNamed = stations.filter((s) => !s.online);
  const recentErrors = listTelemetryEvents({ limit: 20, level: "error" });
  const recentWarns = listTelemetryEvents({ limit: 20, level: "warn" });

  const alerts: Array<{ severity: "warn" | "error"; code: string; message: string }> = [];
  if (!face) {
    alerts.push({
      severity: "error",
      code: "face_down",
      message: "Face-service não responde — reconhecimento e enroll vão falhar",
    });
  }
  if (host.mem.usedPct >= 90) {
    alerts.push({
      severity: "warn",
      code: "mem_high",
      message: `Memória alta (${host.mem.usedPct}%) — risco de travadas no PC controle`,
    });
  }
  if (host.disk && host.disk.freePct != null && host.disk.freePct < 10) {
    alerts.push({
      severity: "error",
      code: "disk_low",
      message: `Disco com pouco espaço livre (${host.disk.freePct}%)`,
    });
  } else if (host.disk && host.disk.freePct != null && host.disk.freePct < 20) {
    alerts.push({
      severity: "warn",
      code: "disk_warn",
      message: `Disco abaixo de 20% livre (${host.disk.freePct}%)`,
    });
  }
  if (!readiness.secretsOk) {
    alerts.push({
      severity: "warn",
      code: "default_secrets",
      message: "Segredos default ainda em uso — troque antes de produção",
    });
  }
  if (offlineNamed.length >= 1) {
    alerts.push({
      severity: offlineNamed.length >= 3 ? "error" : "warn",
      code: "stations_offline",
      message: `${offlineNamed.length} estação(ões) offline: ${offlineNamed
        .slice(0, 4)
        .map((s) => s.name)
        .join(", ")}`,
    });
  }

  const counts = getDb()
    .prepare(
      `SELECT level, COUNT(*) AS c FROM system_events
       WHERE created_at >= datetime('now', '-1 day')
       GROUP BY level`,
    )
    .all() as Array<{ level: string; c: number }>;

  return {
    ok: alerts.every((a) => a.severity !== "error"),
    time: new Date().toISOString(),
    faceService: face,
    host,
    readiness,
    stations: {
      total: stations.length,
      connected: connected.length,
      online: stations.filter((s) => s.online).length,
    },
    eventCounts24h: Object.fromEntries(counts.map((r) => [r.level, r.c])),
    alerts,
    recentErrors,
    recentWarns,
  };
}

export async function runHealthProbe() {
  try {
    const face = await faceHealth();
    const host = hostSnapshot();
    const key = [
      face ? "1" : "0",
      host.mem.usedPct >= 90 ? "mem" : "ok",
      host.disk && host.disk.freePct != null && host.disk.freePct < 15 ? "disk" : "ok",
    ].join("|");

    if (key !== lastProbeKey) {
      lastProbeKey = key;
      if (!face) {
        logEvent({
          level: "error",
          source: "api",
          kind: "probe.face_down",
          message: "Probe: face-service indisponível",
          meta: { memUsedPct: host.mem.usedPct, diskFreePct: host.disk?.freePct ?? null },
        });
      } else if (host.mem.usedPct >= 90 || (host.disk?.freePct != null && host.disk.freePct < 15)) {
        logEvent({
          level: "warn",
          source: "api",
          kind: "probe.resources",
          message: "Probe: recursos do PC controle sob pressão",
          meta: { memUsedPct: host.mem.usedPct, diskFreePct: host.disk?.freePct ?? null },
        });
      } else {
        logEvent({
          level: "info",
          source: "api",
          kind: "probe.ok",
          message: "Probe: API + face saudáveis",
          meta: { memUsedPct: host.mem.usedPct, diskFreePct: host.disk?.freePct ?? null },
        });
      }
    }
  } catch (err) {
    logEvent({
      level: "error",
      source: "api",
      kind: "probe.exception",
      message: err instanceof Error ? err.message : "Falha no probe",
    });
  }
}

export function startTelemetryProbe(intervalMs = 60_000) {
  if (probeTimer) return;
  ensureTelemetrySchema();
  logEvent({
    level: "info",
    source: "api",
    kind: "boot",
    message: "API iniciada — telemetria ativa",
    meta: hostSnapshot() as unknown as Record<string, unknown>,
  });
  void runHealthProbe();
  probeTimer = setInterval(() => void runHealthProbe(), intervalMs);
}
