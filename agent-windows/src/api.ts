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

export async function claimStation(config: GeekLockConfig) {
  return apiFetch<{ id: string; name: string; token: string }>(config, "/api/stations/claim", {
    method: "POST",
    body: JSON.stringify({
      name: config.stationName,
      sharedSecret: config.sharedSecret,
    }),
  });
}

export async function heartbeat(config: GeekLockConfig) {
  return apiFetch(config, "/api/stations/heartbeat", {
    method: "POST",
    body: JSON.stringify({ token: config.stationToken }),
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

export async function sessionHeartbeat(config: GeekLockConfig, sessionId: string) {
  return apiFetch<{
    ok: boolean;
    session: Session & { time_balance_seconds?: number; time_depleted?: boolean };
    timeDepleted?: boolean;
  }>(config, "/api/sessions/heartbeat", {
    method: "POST",
    body: JSON.stringify({ sessionId }),
  });
}

export async function endSession(config: GeekLockConfig, sessionId?: string, reason?: string) {
  return apiFetch<{ ok: boolean; session: Session | null }>(config, "/api/sessions/end", {
    method: "POST",
    body: JSON.stringify({ sessionId, reason }),
  });
}

export function captureFrame(video: HTMLVideoElement, quality = 0.85): string {
  return captureFrameShared(video, quality);
}

export function cameraErrorMessage(err: unknown): string {
  return cameraErrorMessageShared(err, CAMERA_ERROR_COPY.kiosk);
}

export async function openUserCamera(): Promise<MediaStream> {
  return openUserCameraShared({
    requireSecureContext: false,
    timeoutMessage:
      "Timeout ao abrir câmera (15s). DroidCam conectado no PC? Feche outros apps usando a câmera.",
    formatError: cameraErrorMessage,
  });
}

export async function attachCameraStream(video: HTMLVideoElement, stream: MediaStream): Promise<void> {
  return attachCameraStreamShared(video, stream, {
    timeoutMessage: "Vídeo não iniciou (10s). DroidCam conectado?",
  });
}

export function formatDuration(seconds: number) {
  return formatDurationShared(seconds);
}
