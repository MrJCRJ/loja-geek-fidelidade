import type { Customer, GeekLockConfig, Session } from "./vite-env";

function joinUrl(base: string, path: string) {
  return `${base.replace(/\/$/, "")}${path}`;
}

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
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || `HTTP ${res.status}`);
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
  return apiFetch<{
    matched: boolean;
    customer?: Customer;
    score?: number;
    reason?: string;
  }>(config, "/api/recognize", {
    method: "POST",
    body: JSON.stringify({ imageBase64 }),
  });
}

export async function startSession(config: GeekLockConfig, customerId: string) {
  return apiFetch<{ ok: boolean; session: Session }>(config, "/api/sessions/start", {
    method: "POST",
    body: JSON.stringify({ customerId }),
  });
}

export async function sessionHeartbeat(config: GeekLockConfig, sessionId: string) {
  return apiFetch<{ ok: boolean; session: Session }>(config, "/api/sessions/heartbeat", {
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

export function captureFrame(video: HTMLVideoElement, quality = 0.65): string {
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth || 640;
  canvas.height = video.videoHeight || 480;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas indisponível");
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", quality);
}

export function cameraErrorMessage(err: unknown): string {
  const name = err instanceof DOMException ? err.name : "";
  const raw = err instanceof Error ? err.message : String(err || "erro desconhecido");
  if (name === "NotAllowedError" || name === "PermissionDeniedError") {
    return "Permissão da câmera negada. Permita o acesso à webcam nas configurações do Windows/app.";
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return "Nenhuma câmera encontrada neste PC.";
  }
  if (name === "NotReadableError" || name === "TrackStartError") {
    return "Câmera ocupada por outro aplicativo. Feche e tente de novo.";
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    return "getUserMedia indisponível neste ambiente.";
  }
  return `Falha na câmera: ${raw}`;
}

export async function openUserCamera(): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error(cameraErrorMessage(new Error("getUserMedia indisponível")));
  }
  const attempts: MediaStreamConstraints[] = [
    { audio: false, video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } } },
    { audio: false, video: { width: { ideal: 640 }, height: { ideal: 480 } } },
    { audio: false, video: true },
  ];
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const cams = devices.filter((d) => d.kind === "videoinput" && d.deviceId);
    if (cams[0]?.deviceId) {
      attempts.splice(1, 0, {
        audio: false,
        video: { deviceId: { exact: cams[0].deviceId }, width: { ideal: 640 }, height: { ideal: 480 } },
      });
    }
  } catch {
    /* ignore */
  }
  let lastErr: unknown;
  for (const constraints of attempts) {
    try {
      return await navigator.mediaDevices.getUserMedia(constraints);
    } catch (err) {
      lastErr = err;
      const name = err instanceof DOMException ? err.name : "";
      if (name === "NotAllowedError" || name === "PermissionDeniedError" || name === "NotFoundError") break;
    }
  }
  throw new Error(cameraErrorMessage(lastErr));
}

export function formatDuration(seconds: number) {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  return `${m}m ${String(r).padStart(2, "0")}s`;
}
