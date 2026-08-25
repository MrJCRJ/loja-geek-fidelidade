import type { Customer, GeekLockConfig, Session } from "./vite-env";

function joinUrl(base: string, path: string) {
  return `${base.replace(/\/$/, "")}${path}`;
}

export class ApiError extends Error {
  code?: string;
  timeBalanceSeconds?: number;
  constructor(message: string, opts?: { code?: string; timeBalanceSeconds?: number }) {
    super(message);
    this.name = "ApiError";
    this.code = opts?.code;
    this.timeBalanceSeconds = opts?.timeBalanceSeconds;
  }
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
    return "Permissão da câmera negada. Permita o acesso à webcam no app.";
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return "Nenhuma câmera encontrada. DroidCam conectado? Rode: bash scripts/linux-loja.sh droidcam IP";
  }
  if (name === "NotReadableError" || name === "TrackStartError") {
    return "Câmera ocupada por outro app. Feche e tente de novo.";
  }
  if (name === "TimeoutError") {
    return raw;
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    return "getUserMedia indisponível neste ambiente.";
  }
  return `Falha na câmera: ${raw}`;
}

function withMediaTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new DOMException(message, "TimeoutError")), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

export async function openUserCamera(): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error(cameraErrorMessage(new Error("getUserMedia indisponível")));
  }

  const timeoutMsg =
    "Timeout ao abrir câmera (15s). DroidCam conectado no PC? Feche outros apps usando a câmera.";

  let probe: MediaStream | null = null;
  try {
    probe = await withMediaTimeout(
      navigator.mediaDevices.getUserMedia({ audio: false, video: true }),
      15_000,
      timeoutMsg,
    );
  } catch (err) {
    throw new Error(cameraErrorMessage(err));
  }

  const devices = await navigator.mediaDevices.enumerateDevices();
  const cams = devices.filter((d) => d.kind === "videoinput" && d.deviceId);
  const droidcam = cams.find((d) => /droidcam|loopback|dc/i.test(d.label));

  probe.getTracks().forEach((t) => t.stop());

  const attempts: MediaStreamConstraints[] = [];
  if (droidcam?.deviceId) {
    attempts.push({
      audio: false,
      video: {
        deviceId: { ideal: droidcam.deviceId },
        width: { ideal: 640 },
        height: { ideal: 480 },
      },
    });
  }
  attempts.push(
    { audio: false, video: { width: { ideal: 640 }, height: { ideal: 480 } } },
    { audio: false, video: true },
  );

  let lastErr: unknown;
  for (const constraints of attempts) {
    try {
      return await withMediaTimeout(navigator.mediaDevices.getUserMedia(constraints), 15_000, timeoutMsg);
    } catch (err) {
      lastErr = err;
      const name = err instanceof DOMException ? err.name : "";
      if (name === "NotAllowedError" || name === "PermissionDeniedError" || name === "NotFoundError") break;
    }
  }
  throw new Error(cameraErrorMessage(lastErr));
}

export async function attachCameraStream(video: HTMLVideoElement, stream: MediaStream): Promise<void> {
  video.srcObject = stream;
  video.muted = true;
  video.playsInline = true;
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("Vídeo não iniciou (10s). DroidCam conectado?")),
      10_000,
    );
    const done = () => {
      clearTimeout(timeout);
      resolve();
    };
    const fail = (err: unknown) => {
      clearTimeout(timeout);
      reject(err instanceof Error ? err : new Error(String(err)));
    };
    video.onloadedmetadata = () => {
      video.play().then(done).catch(fail);
    };
    if (video.readyState >= 1) {
      video.onloadedmetadata = null;
      video.play().then(done).catch(fail);
    }
  });
}

export function formatDuration(seconds: number) {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  return `${m}m ${String(r).padStart(2, "0")}s`;
}
