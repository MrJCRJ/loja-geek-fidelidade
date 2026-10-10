import { ApiError } from "../../shared/api-error";
import {
  CAMERA_ERROR_COPY,
  attachCameraStream as attachCameraStreamShared,
  cameraErrorMessage as cameraErrorMessageShared,
  captureFrame as captureFrameShared,
  openUserCamera as openUserCameraShared,
} from "../../shared/camera";
import { formatDuration as formatDurationShared } from "../../shared/format-time";
import type { Customer, GeekLockConfig, Session } from "./vite-env";
import { openPs3EyeBridge } from "./ps3eye";

function joinUrl(base: string, path: string) {
  return `${base.replace(/\/$/, "")}${path}`;
}

export { ApiError };

export async function apiFetch<T>(
  config: GeekLockConfig,
  path: string,
  options: RequestInit & { stationToken?: string } = {},
): Promise<T> {
  const headers = new Headers(options.headers || {});
  if (options.body && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  const token = options.stationToken || config.stationToken;
  if (token) headers.set("x-station-token", token);

  const res = await fetch(joinUrl(config.serverUrl, path), {
    ...options,
    headers,
    signal: AbortSignal.timeout(12_000),
  });
  const data = (await res.json().catch(() => ({}))) as {
    error?: string;
    code?: string;
    timeBalanceSeconds?: number;
  };
  if (!res.ok) {
    throw new ApiError(data.error || `HTTP ${res.status}`, {
      code: data.code,
      timeBalanceSeconds: data.timeBalanceSeconds,
    });
  }
  return data as T;
}

export async function checkHealth(config: GeekLockConfig) {
  return apiFetch<{ ok: boolean; faceService: boolean }>(config, "/api/health");
}

/** Na LAN: só o nome. */
export async function pairStationLan(config: GeekLockConfig) {
  return apiFetch<{ id: string; name: string; token: string }>(config, "/api/stations/pair-lan", {
    method: "POST",
    body: JSON.stringify({ name: config.stationName }),
  });
}

export type SessionSafetyConfig = {
  lowBalanceWarnSeconds?: number;
  staffUnlockMaxSeconds?: number;
  presenceMinFaceRatio?: number;
};

export type UsageRemoteConfig = {
  usageDetailedTitles?: boolean;
  staffTimedMaxMinutes?: number;
};

export async function heartbeat(config: GeekLockConfig, lockVersion?: string) {
  let health:
    | {
        diskFreePct?: number | null;
        diskTotalGb?: number | null;
        uptimeSec?: number | null;
        ramUsedPct?: number | null;
      }
    | undefined;
  try {
    if (window.geeklock.collectHealth) {
      health = await window.geeklock.collectHealth();
    }
  } catch {
    health = undefined;
  }
  return apiFetch<{
    ok: boolean;
    station?: { id: string; name: string };
    sessionSafety?: SessionSafetyConfig;
    usage?: UsageRemoteConfig;
    portalPublicUrl?: string;
    lockUpdate?: { needed: boolean; latestVersion?: string } | null;
  }>(config, "/api/stations/heartbeat", {
    method: "POST",
    body: JSON.stringify({ token: config.stationToken, lockVersion, health }),
  });
}

export async function recognize(config: GeekLockConfig, imageBase64: string) {
  const headers = new Headers({ "content-type": "application/json" });
  if (config.stationToken) headers.set("x-station-token", config.stationToken);

  const res = await fetch(joinUrl(config.serverUrl, "/api/recognize"), {
    method: "POST",
    headers,
    body: JSON.stringify({ imageBase64 }),
    signal: AbortSignal.timeout(12_000),
  });
  const data = (await res.json().catch(() => ({}))) as {
    matched: boolean;
    customer?: Customer;
    score?: number;
    bestScore?: number;
    bestCustomerId?: string | null;
    timeBalanceSeconds?: number;
    reason?: string;
    tip?: string;
    code?: string;
    error?: string;
  };

  if (res.status === 503 || data.reason === "service_down" || data.code === "service_down") {
    return {
      matched: false,
      reason: "service_down",
      code: "service_down",
      tip: data.tip || "Serviço facial reiniciando…",
      error: data.error,
    };
  }

  if (!res.ok) {
    throw new Error(data.error || `HTTP ${res.status}`);
  }
  return data;
}

export async function checkPresence(
  config: GeekLockConfig,
  imageBase64: string,
  customerId?: string,
) {
  const headers = new Headers({ "content-type": "application/json" });
  if (config.stationToken) headers.set("x-station-token", config.stationToken);

  const res = await fetch(joinUrl(config.serverUrl, "/api/presence"), {
    method: "POST",
    headers,
    body: JSON.stringify({ imageBase64, customerId }),
    signal: AbortSignal.timeout(12_000),
  });
  const data = (await res.json().catch(() => ({}))) as {
    present?: boolean;
    reason?: string;
    code?: string;
    tip?: string;
    bestScore?: number;
    bestCustomerId?: string | null;
    score?: number;
  };

  if (res.status === 503 || data.reason === "service_down" || data.code === "service_down") {
    return {
      present: false,
      reason: "service_down" as const,
      code: "service_down",
      tip: data.tip || "Serviço facial reiniciando…",
    };
  }

  if (!res.ok) {
    throw new ApiError((data as { error?: string }).error || `HTTP ${res.status}`, {
      code: data.code,
    });
  }

  return {
    present: Boolean(data.present),
    reason: data.reason || (data.present ? "face" : "no_face"),
    code: data.code,
    bestScore: typeof data.bestScore === "number" ? data.bestScore : typeof data.score === "number" ? data.score : undefined,
    bestCustomerId: data.bestCustomerId ?? null,
  };
}

export async function startSession(config: GeekLockConfig, customerId: string) {
  return apiFetch<{
    ok: boolean;
    session: Session;
    customer?: Customer;
    code?: string;
    timeBalanceSeconds?: number;
  }>(config, "/api/sessions/start", {
    method: "POST",
    body: JSON.stringify({ customerId }),
  });
}

export async function sessionHeartbeat(
  config: GeekLockConfig,
  sessionId: string,
  opts?: { pauseBilling?: boolean },
) {
  return apiFetch<{
    ok: boolean;
    session: Session & {
      time_balance_seconds?: number;
      time_depleted?: boolean;
      billing_paused?: boolean;
      low_balance_warn?: boolean;
    };
    timeDepleted?: boolean;
    billingPaused?: boolean;
    lowBalanceWarn?: boolean;
    lowBalanceWarnSeconds?: number;
    timeBalanceSeconds?: number;
  }>(config, "/api/sessions/heartbeat", {
    method: "POST",
    body: JSON.stringify({
      sessionId,
      pauseBilling: Boolean(opts?.pauseBilling),
    }),
  });
}

export async function endSession(config: GeekLockConfig, sessionId?: string, reason?: string) {
  return apiFetch<{ ok: boolean; session: Session | null }>(config, "/api/sessions/end", {
    method: "POST",
    body: JSON.stringify({ sessionId, reason }),
  });
}

export async function reportStaffUnlock(config: GeekLockConfig, reason = "pin") {
  try {
    await apiFetch<{ ok: boolean }>(config, "/api/stations/staff-unlock", {
      method: "POST",
      body: JSON.stringify({ reason }),
    });
  } catch {
    /* auditoria best-effort */
  }
}

export function captureFrame(video: HTMLVideoElement, quality = 0.85): string {
  return captureFrameShared(video, quality);
}

export function cameraErrorMessage(err: unknown): string {
  return cameraErrorMessageShared(err, CAMERA_ERROR_COPY.kiosk);
}

export async function openUserCamera(): Promise<MediaStream> {
  try {
    return await openUserCameraShared({
      requireSecureContext: false,
      preferredWidth: 640,
      preferredHeight: 480,
      timeoutMs: 20_000,
      timeoutMessage:
        "Timeout ao abrir câmera (20s). DroidCam conectado no celular? Feche outros apps usando /dev/video0.",
      formatError: cameraErrorMessage,
    });
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err);
    if (!/nenhuma câmera|não encontrada|notfound/i.test(raw)) throw err;
    return openPs3EyeBridge();
  }
}

export async function attachCameraStream(video: HTMLVideoElement, stream: MediaStream): Promise<void> {
  return attachCameraStreamShared(video, stream, {
    timeoutMs: 18_000,
    waitFrames: true,
    timeoutMessage:
      "Vídeo não iniciou (18s). No celular: DroidCam → Wi‑Fi → conecte no IP:4747 do PC, depois Reconectar webcam.",
  });
}

export function formatDuration(seconds: number) {
  return formatDurationShared(seconds);
}
