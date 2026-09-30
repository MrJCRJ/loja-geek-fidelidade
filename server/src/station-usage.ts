/** Uso da estação: hardware, samples 15s → agregados 1 min. */

import { randomUUID } from "node:crypto";
import { getDb } from "./db.js";
import { getSetting, setSetting } from "./customers.js";

export type OccupantKind = "vip" | "staff_timed" | "staff_open" | "guest_named";

export type GpuInfo = {
  vendor: "nvidia" | "amd" | "intel" | "other";
  model: string;
  vramMb?: number | null;
};

export type HardwarePayload = {
  cpuName?: string | null;
  cpuCores?: number | null;
  cpuTdpW?: number | null;
  gpus?: GpuInfo[];
  ramTotalMb?: number | null;
  osBuild?: string | null;
};

export type UsageSampleInput = {
  occupantKind: OccupantKind;
  occupantCustomerId?: string | null;
  occupantLabel?: string | null;
  appProcess?: string | null;
  appTitle?: string | null;
  cpuPct?: number | null;
  gpuPct?: number | null;
  ramPct?: number | null;
  watts?: number | null;
  wattsSource?: "sensor" | "estimate" | null;
};

const MAX_AGE_DAYS = 30;
const DEFAULT_TARIFF = 0.95;
const DEFAULT_STAFF_TIMED_MAX_MIN = 240;
const DEFAULT_IDLE_W = 45;
const DEFAULT_TDP_CPU = 65;
const DEFAULT_TDP_GPU = 150;

export function ensureStationUsageSchema() {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS station_hardware (
      station_id TEXT PRIMARY KEY REFERENCES stations(id) ON DELETE CASCADE,
      updated_at TEXT NOT NULL,
      cpu_name TEXT,
      cpu_cores INTEGER,
      cpu_tdp_suggest REAL,
      gpus_json TEXT,
      ram_total_mb INTEGER,
      os_build TEXT,
      tdp_cpu_w REAL,
      tdp_gpu_w REAL,
      idle_w REAL
    );

    CREATE TABLE IF NOT EXISTS station_usage_minutes (
      station_id TEXT NOT NULL REFERENCES stations(id) ON DELETE CASCADE,
      minute_ts TEXT NOT NULL,
      occupant_kind TEXT NOT NULL,
      occupant_customer_id TEXT,
      occupant_label TEXT,
      app_process TEXT,
      app_title TEXT,
      cpu_avg REAL,
      gpu_avg REAL,
      ram_avg REAL,
      watts_avg REAL,
      sample_count INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (station_id, minute_ts)
    );

    CREATE INDEX IF NOT EXISTS idx_usage_minutes_ts ON station_usage_minutes(minute_ts DESC);
    CREATE INDEX IF NOT EXISTS idx_usage_minutes_kind ON station_usage_minutes(occupant_kind);
    CREATE INDEX IF NOT EXISTS idx_usage_minutes_app ON station_usage_minutes(app_process);
  `);
}

function minuteBucket(iso?: string) {
  const d = iso ? new Date(iso) : new Date();
  d.setSeconds(0, 0);
  return d.toISOString();
}

function guessTdpFromGpu(gpus: GpuInfo[]): number {
  const model = (gpus[0]?.model || "").toLowerCase();
  if (/4090|7900\s*xtx/.test(model)) return 450;
  if (/4080|7900\s*xt|3080\s*ti/.test(model)) return 320;
  if (/4070|7800|3070|6800/.test(model)) return 220;
  if (/4060|7600|3060|6700/.test(model)) return 170;
  if (/1650|1660|5600|rx\s*580/.test(model)) return 120;
  if (gpus[0]?.vendor === "nvidia" || gpus[0]?.vendor === "amd") return DEFAULT_TDP_GPU;
  return 50;
}

export function upsertStationHardware(stationId: string, hw: HardwarePayload) {
  ensureStationUsageSchema();
  const db = getDb();
  const gpus = Array.isArray(hw.gpus) ? hw.gpus.slice(0, 4) : [];
  const suggestGpu = guessTdpFromGpu(gpus);
  const suggestCpu = hw.cpuTdpW && hw.cpuTdpW > 0 ? hw.cpuTdpW : DEFAULT_TDP_CPU;
  const existing = db
    .prepare("SELECT tdp_cpu_w, tdp_gpu_w, idle_w FROM station_hardware WHERE station_id = ?")
    .get(stationId) as { tdp_cpu_w: number | null; tdp_gpu_w: number | null; idle_w: number | null } | undefined;

  const tdpCpu = existing?.tdp_cpu_w ?? suggestCpu;
  const tdpGpu = existing?.tdp_gpu_w ?? suggestGpu;
  const idleW = existing?.idle_w ?? DEFAULT_IDLE_W;

  db.prepare(
    `INSERT INTO station_hardware (
      station_id, updated_at, cpu_name, cpu_cores, cpu_tdp_suggest, gpus_json,
      ram_total_mb, os_build, tdp_cpu_w, tdp_gpu_w, idle_w
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(station_id) DO UPDATE SET
      updated_at = excluded.updated_at,
      cpu_name = excluded.cpu_name,
      cpu_cores = excluded.cpu_cores,
      cpu_tdp_suggest = excluded.cpu_tdp_suggest,
      gpus_json = excluded.gpus_json,
      ram_total_mb = excluded.ram_total_mb,
      os_build = excluded.os_build,
      tdp_cpu_w = COALESCE(station_hardware.tdp_cpu_w, excluded.tdp_cpu_w),
      tdp_gpu_w = COALESCE(station_hardware.tdp_gpu_w, excluded.tdp_gpu_w),
      idle_w = COALESCE(station_hardware.idle_w, excluded.idle_w)`,
  ).run(
    stationId,
    new Date().toISOString(),
    hw.cpuName ? String(hw.cpuName).slice(0, 120) : null,
    hw.cpuCores ?? null,
    suggestCpu,
    JSON.stringify(gpus),
    hw.ramTotalMb ?? null,
    hw.osBuild ? String(hw.osBuild).slice(0, 80) : null,
    tdpCpu,
    tdpGpu,
    idleW,
  );

  return getStationHardware(stationId);
}

export function getStationHardware(stationId: string) {
  ensureStationUsageSchema();
  const row = getDb()
    .prepare("SELECT * FROM station_hardware WHERE station_id = ?")
    .get(stationId) as Record<string, unknown> | undefined;
  if (!row) return null;
  let gpus: GpuInfo[] = [];
  try {
    gpus = JSON.parse(String(row.gpus_json || "[]")) as GpuInfo[];
  } catch {
    gpus = [];
  }
  return {
    stationId,
    updatedAt: row.updated_at as string,
    cpuName: (row.cpu_name as string) || null,
    cpuCores: (row.cpu_cores as number) ?? null,
    cpuTdpSuggest: (row.cpu_tdp_suggest as number) ?? null,
    gpus,
    ramTotalMb: (row.ram_total_mb as number) ?? null,
    osBuild: (row.os_build as string) || null,
    tdpCpuW: (row.tdp_cpu_w as number) ?? DEFAULT_TDP_CPU,
    tdpGpuW: (row.tdp_gpu_w as number) ?? DEFAULT_TDP_GPU,
    idleW: (row.idle_w as number) ?? DEFAULT_IDLE_W,
  };
}

export function listStationHardware() {
  ensureStationUsageSchema();
  const rows = getDb().prepare("SELECT station_id FROM station_hardware").all() as Array<{ station_id: string }>;
  return rows.map((r) => getStationHardware(r.station_id)).filter(Boolean);
}

export function updateStationEnergyCalibration(
  stationId: string,
  patch: { tdpCpuW?: number; tdpGpuW?: number; idleW?: number },
) {
  ensureStationUsageSchema();
  const cur = getStationHardware(stationId);
  if (!cur) {
    upsertStationHardware(stationId, {});
  }
  getDb()
    .prepare(
      `UPDATE station_hardware SET
        tdp_cpu_w = COALESCE(?, tdp_cpu_w),
        tdp_gpu_w = COALESCE(?, tdp_gpu_w),
        idle_w = COALESCE(?, idle_w),
        updated_at = ?
       WHERE station_id = ?`,
    )
    .run(
      patch.tdpCpuW ?? null,
      patch.tdpGpuW ?? null,
      patch.idleW ?? null,
      new Date().toISOString(),
      stationId,
    );
  return getStationHardware(stationId);
}

function sanitizeTitle(title: string | null | undefined): string | null {
  if (!title) return null;
  let t = String(title).slice(0, 160);
  t = t.replace(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi, "[email]");
  t = t.replace(/https?:\/\/\S+/gi, (url) => {
    try {
      const u = new URL(url);
      return `${u.origin}${u.pathname}`.slice(0, 80);
    } catch {
      return "[url]";
    }
  });
  t = t.replace(/[A-Za-z]:\\[^\s]{20,}/g, "[path]");
  return t.slice(0, 120);
}

export function estimateWatts(opts: {
  cpuPct?: number | null;
  gpuPct?: number | null;
  sensorWatts?: number | null;
  tdpCpuW: number;
  tdpGpuW: number;
  idleW: number;
}): { watts: number; source: "sensor" | "estimate" } {
  if (opts.sensorWatts != null && Number.isFinite(opts.sensorWatts) && opts.sensorWatts > 0) {
    return { watts: Math.round(opts.sensorWatts * 10) / 10, source: "sensor" };
  }
  const cpu = Math.min(100, Math.max(0, Number(opts.cpuPct) || 0)) / 100;
  const gpu = Math.min(100, Math.max(0, Number(opts.gpuPct) || 0)) / 100;
  const w = opts.idleW + cpu * opts.tdpCpuW + gpu * opts.tdpGpuW;
  return { watts: Math.round(w * 10) / 10, source: "estimate" };
}

export function ingestUsageSample(stationId: string, sample: UsageSampleInput) {
  ensureStationUsageSchema();
  const hw = getStationHardware(stationId);
  const tdpCpuW = hw?.tdpCpuW ?? DEFAULT_TDP_CPU;
  const tdpGpuW = hw?.tdpGpuW ?? DEFAULT_TDP_GPU;
  const idleW = hw?.idleW ?? DEFAULT_IDLE_W;

  let watts = sample.watts ?? null;
  let wattsSource = sample.wattsSource || null;
  if (watts == null || !Number.isFinite(watts)) {
    const est = estimateWatts({
      cpuPct: sample.cpuPct,
      gpuPct: sample.gpuPct,
      sensorWatts: null,
      tdpCpuW,
      tdpGpuW,
      idleW,
    });
    watts = est.watts;
    wattsSource = est.source;
  }

  const detailed = getUsageDetailedTitles();
  const appTitle = detailed ? sanitizeTitle(sample.appTitle) : null;
  const appProcess = sample.appProcess ? String(sample.appProcess).slice(0, 64) : null;
  const minuteTs = minuteBucket();
  const db = getDb();

  const existing = db
    .prepare("SELECT * FROM station_usage_minutes WHERE station_id = ? AND minute_ts = ?")
    .get(stationId, minuteTs) as
    | {
        sample_count: number;
        cpu_avg: number | null;
        gpu_avg: number | null;
        ram_avg: number | null;
        watts_avg: number | null;
        app_process: string | null;
      }
    | undefined;

  const n = (existing?.sample_count || 0) + 1;
  const avg = (prev: number | null | undefined, next: number | null | undefined, count: number) => {
    if (next == null || !Number.isFinite(next)) return prev ?? null;
    if (prev == null || !Number.isFinite(prev)) return next;
    return Math.round(((prev * (count - 1) + next) / count) * 10) / 10;
  };

  // dominante: último processo visto no minuto (amostras curtas)
  const dominantApp = appProcess || existing?.app_process || null;

  db.prepare(
    `INSERT INTO station_usage_minutes (
      station_id, minute_ts, occupant_kind, occupant_customer_id, occupant_label,
      app_process, app_title, cpu_avg, gpu_avg, ram_avg, watts_avg, sample_count
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(station_id, minute_ts) DO UPDATE SET
      occupant_kind = excluded.occupant_kind,
      occupant_customer_id = excluded.occupant_customer_id,
      occupant_label = excluded.occupant_label,
      app_process = excluded.app_process,
      app_title = COALESCE(excluded.app_title, station_usage_minutes.app_title),
      cpu_avg = excluded.cpu_avg,
      gpu_avg = excluded.gpu_avg,
      ram_avg = excluded.ram_avg,
      watts_avg = excluded.watts_avg,
      sample_count = excluded.sample_count`,
  ).run(
    stationId,
    minuteTs,
    sample.occupantKind,
    sample.occupantCustomerId || null,
    sample.occupantLabel ? String(sample.occupantLabel).slice(0, 40) : null,
    dominantApp,
    appTitle,
    avg(existing?.cpu_avg, sample.cpuPct, n),
    avg(existing?.gpu_avg, sample.gpuPct, n),
    avg(existing?.ram_avg, sample.ramPct, n),
    avg(existing?.watts_avg, watts, n),
    n,
  );

  if (Math.random() < 0.02) pruneUsageMinutes();

  return { ok: true as const, minuteTs, watts, wattsSource };
}

export function pruneUsageMinutes() {
  ensureStationUsageSchema();
  const cutoff = new Date(Date.now() - MAX_AGE_DAYS * 86400_000).toISOString();
  getDb().prepare("DELETE FROM station_usage_minutes WHERE minute_ts < ?").run(cutoff);
}

export function getEnergyTariffReaisPerKwh() {
  const n = Number(getSetting("energy_tariff_reais_per_kwh", String(DEFAULT_TARIFF)));
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_TARIFF;
}

export function setEnergyTariffReaisPerKwh(v: number) {
  setSetting("energy_tariff_reais_per_kwh", String(Math.min(10, Math.max(0, v))));
}

export function getUsageDetailedTitles() {
  return getSetting("usage_detailed_titles", "0") === "1";
}

export function setUsageDetailedTitles(on: boolean) {
  setSetting("usage_detailed_titles", on ? "1" : "0");
}

export function getStaffTimedMaxMinutes() {
  const n = Number(getSetting("staff_timed_max_minutes", String(DEFAULT_STAFF_TIMED_MAX_MIN)));
  return Math.min(480, Math.max(15, Number.isFinite(n) ? n : DEFAULT_STAFF_TIMED_MAX_MIN));
}

export function setStaffTimedMaxMinutes(min: number) {
  setSetting("staff_timed_max_minutes", String(Math.min(480, Math.max(15, Math.round(min)))));
}

export function getGuestLabelRecents(): string[] {
  try {
    const raw = JSON.parse(getSetting("guest_label_recents", "[]")) as unknown;
    if (!Array.isArray(raw)) return [];
    return raw.map(String).filter(Boolean).slice(0, 5);
  } catch {
    return [];
  }
}

export function pushGuestLabelRecent(label: string) {
  const clean = label.trim().slice(0, 40);
  if (clean.length < 2) return getGuestLabelRecents();
  const next = [clean, ...getGuestLabelRecents().filter((x) => x.toLowerCase() !== clean.toLowerCase())].slice(
    0,
    5,
  );
  setSetting("guest_label_recents", JSON.stringify(next));
  return next;
}

export function usageSettingsPayload() {
  return {
    energyTariffReaisPerKwh: getEnergyTariffReaisPerKwh(),
    usageDetailedTitles: getUsageDetailedTitles(),
    staffTimedMaxMinutes: getStaffTimedMaxMinutes(),
    guestLabelRecents: getGuestLabelRecents(),
  };
}

export function buildUsageSummary(opts?: { hours?: number }) {
  ensureStationUsageSchema();
  const hours = Math.min(168, Math.max(1, opts?.hours ?? 24));
  const since = new Date(Date.now() - hours * 3600_000).toISOString();
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT station_id, occupant_kind, occupant_customer_id, occupant_label,
              app_process, app_title, cpu_avg, gpu_avg, ram_avg, watts_avg, minute_ts, sample_count
       FROM station_usage_minutes
       WHERE minute_ts >= ?
       ORDER BY minute_ts DESC
       LIMIT 5000`,
    )
    .all(since) as Array<{
    station_id: string;
    occupant_kind: string;
    occupant_customer_id: string | null;
    occupant_label: string | null;
    app_process: string | null;
    app_title: string | null;
    cpu_avg: number | null;
    gpu_avg: number | null;
    ram_avg: number | null;
    watts_avg: number | null;
    minute_ts: string;
    sample_count: number;
  }>;

  const tariff = getEnergyTariffReaisPerKwh();
  let wattMinutes = 0;
  const appCount = new Map<string, number>();
  const byStation = new Map<string, { wattMinutes: number; minutes: number; peakCpu: number }>();
  const byOccupant = new Map<
    string,
    { kind: string; label: string; customerId: string | null; wattMinutes: number; minutes: number; apps: Map<string, number> }
  >();

  for (const r of rows) {
    const w = Number(r.watts_avg) || 0;
    wattMinutes += w;
    const app = r.app_process || "(desconhecido)";
    appCount.set(app, (appCount.get(app) || 0) + 1);

    const st = byStation.get(r.station_id) || { wattMinutes: 0, minutes: 0, peakCpu: 0 };
    st.wattMinutes += w;
    st.minutes += 1;
    st.peakCpu = Math.max(st.peakCpu, Number(r.cpu_avg) || 0);
    byStation.set(r.station_id, st);

    const occKey = `${r.occupant_kind}|${r.occupant_customer_id || ""}|${r.occupant_label || ""}`;
    const occ =
      byOccupant.get(occKey) ||
      {
        kind: r.occupant_kind,
        label: r.occupant_label || r.occupant_customer_id || r.occupant_kind,
        customerId: r.occupant_customer_id,
        wattMinutes: 0,
        minutes: 0,
        apps: new Map<string, number>(),
      };
    occ.wattMinutes += w;
    occ.minutes += 1;
    occ.apps.set(app, (occ.apps.get(app) || 0) + 1);
    byOccupant.set(occKey, occ);
  }

  const kwh = wattMinutes / 60 / 1000;
  const costReais = Math.round(kwh * tariff * 100) / 100;

  const topApps = [...appCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([process, minutes]) => ({ process, minutes }));

  const stations = [...byStation.entries()].map(([stationId, v]) => ({
    stationId,
    kwh: Math.round((v.wattMinutes / 60 / 1000) * 1000) / 1000,
    costReais: Math.round((v.wattMinutes / 60 / 1000) * tariff * 100) / 100,
    minutes: v.minutes,
    peakCpu: v.peakCpu,
    hardware: getStationHardware(stationId),
  }));

  const occupants = [...byOccupant.values()]
    .map((o) => ({
      kind: o.kind,
      label: o.label,
      customerId: o.customerId,
      minutes: o.minutes,
      kwh: Math.round((o.wattMinutes / 60 / 1000) * 1000) / 1000,
      costReais: Math.round((o.wattMinutes / 60 / 1000) * tariff * 100) / 100,
      topApps: [...o.apps.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([process, minutes]) => ({ process, minutes })),
    }))
    .sort((a, b) => b.minutes - a.minutes)
    .slice(0, 40);

  return {
    hours,
    since,
    tariffReaisPerKwh: tariff,
    kwh: Math.round(kwh * 1000) / 1000,
    costReais,
    topApps,
    stations,
    occupants,
    recent: rows.slice(0, 80).map((r) => ({
      stationId: r.station_id,
      minuteTs: r.minute_ts,
      kind: r.occupant_kind,
      label: r.occupant_label || r.occupant_customer_id,
      app: r.app_process,
      title: r.app_title,
      cpu: r.cpu_avg,
      gpu: r.gpu_avg,
      ram: r.ram_avg,
      watts: r.watts_avg,
    })),
  };
}
