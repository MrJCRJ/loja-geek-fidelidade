/** Coletor de uso: hardware no boot + sample a cada 15s enquanto unlocked. */

export type OccupantKind = "vip" | "vip_desk" | "staff_timed" | "staff_open" | "guest_named";

export type OccupantState = {
  kind: OccupantKind;
  customerId?: string | null;
  label?: string | null;
};

type UsageFlags = {
  detailedTitles: boolean;
};

let primaryGpuVendor: string | null = null;
let lastHardwareAt = 0;
const HARDWARE_TTL_MS = 6 * 3600_000;

async function postJson(serverUrl: string, token: string, path: string, body: unknown) {
  const res = await fetch(`${serverUrl.replace(/\/$/, "")}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Station-Token": token,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json().catch(() => ({}));
}

export async function reportHardware(serverUrl: string, token: string) {
  if (!window.geeklock.collectHardware) return null;
  const hw = await window.geeklock.collectHardware();
  const gpus = Array.isArray(hw.gpus) ? hw.gpus : [];
  primaryGpuVendor = gpus[0]?.vendor || null;
  const res = (await postJson(serverUrl, token, "/api/stations/hardware", hw)) as {
    usage?: { usageDetailedTitles?: boolean };
  };
  lastHardwareAt = Date.now();
  return res;
}

export async function maybeReportHardware(serverUrl: string, token: string) {
  if (Date.now() - lastHardwareAt < HARDWARE_TTL_MS && lastHardwareAt > 0) return null;
  try {
    return await reportHardware(serverUrl, token);
  } catch {
    return null;
  }
}

export async function sendUsageSample(
  serverUrl: string,
  token: string,
  occupant: OccupantState,
  flags: UsageFlags,
) {
  if (!window.geeklock.collectLoadSample) return;
  const load = await window.geeklock.collectLoadSample({
    primaryGpuVendor: primaryGpuVendor || undefined,
  });
  await postJson(serverUrl, token, "/api/stations/usage-sample", {
    occupantKind: occupant.kind,
    occupantCustomerId: occupant.customerId || null,
    occupantLabel: occupant.label || null,
    appProcess: load.appProcess,
    appTitle: flags.detailedTitles ? load.appTitle : null,
    cpuPct: load.cpuPct,
    gpuPct: load.gpuPct,
    ramPct: load.ramPct,
    watts: load.watts,
    wattsSource: load.wattsSource,
  });
}

export function startUsageLoop(opts: {
  getConfig: () => { serverUrl: string; stationToken?: string } | null;
  getPhase: () => string;
  getOccupant: () => OccupantState | null;
  getFlags: () => UsageFlags;
}) {
  let stopped = false;

  const tick = async () => {
    if (stopped) return;
    const cfg = opts.getConfig();
    if (!cfg?.serverUrl || !cfg.stationToken) return;
    try {
      await maybeReportHardware(cfg.serverUrl, cfg.stationToken);
    } catch {
      /* ignore */
    }
    if (opts.getPhase() !== "unlocked") return;
    const occ = opts.getOccupant();
    if (!occ) return;
    try {
      await sendUsageSample(cfg.serverUrl, cfg.stationToken, occ, opts.getFlags());
    } catch {
      /* ignore */
    }
  };

  void tick();
  const id = window.setInterval(() => void tick(), 15_000);
  return () => {
    stopped = true;
    window.clearInterval(id);
  };
}
