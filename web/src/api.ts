export type CustomerLevel = "bronze" | "prata" | "ouro";

export type Customer = {
  id: string;
  name: string;
  phone?: string | null;
  level: CustomerLevel;
  points: number;
  consent_at?: string | null;
  notes?: string | null;
  face_samples?: number;
  created_at?: string;
  updated_at?: string;
};

export type Station = {
  id: string;
  name: string;
  token?: string;
  last_seen_at?: string | null;
  last_ip?: string | null;
  online?: number;
  created_at?: string;
};

export type Reward = {
  id: string;
  title: string;
  description?: string | null;
  cost_points: number;
  active: number;
  created_at: string;
};

export type RecognitionEvent = {
  id: string;
  customer_id?: string | null;
  station_id?: string | null;
  score: number;
  status: string;
  created_at: string;
  customer_name?: string | null;
  customer_level?: string | null;
  station_name?: string | null;
};

export type MachineSession = {
  id: string;
  customer_id: string;
  station_id: string;
  started_at: string;
  ended_at?: string | null;
  last_seen_at: string;
  seconds_total: number;
  status: string;
  customer_name?: string | null;
  customer_level?: string | null;
  station_name?: string | null;
};

export type SessionStats = {
  since: string;
  byCustomer: Array<{
    customer_id: string;
    customer_name: string;
    customer_level: string;
    seconds_total: number;
    sessions: number;
  }>;
  byStation: Array<{
    station_id: string;
    station_name: string;
    seconds_total: number;
    sessions: number;
  }>;
  active: Array<MachineSession & { customer_name?: string; station_name?: string }>;
};

export function formatDuration(seconds: number) {
  const s = Math.max(0, Math.floor(Number(seconds) || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  return `${m}m ${String(r).padStart(2, "0")}s`;
}

const TOKEN_KEY = "lg_admin_token";

export function getAdminToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setAdminToken(token: string | null) {
  if (!token) localStorage.removeItem(TOKEN_KEY);
  else localStorage.setItem(TOKEN_KEY, token);
}

export async function api<T>(
  path: string,
  options: RequestInit & { token?: string | null; stationToken?: string | null } = {},
): Promise<T> {
  const headers = new Headers(options.headers || {});
  if (!headers.has("content-type") && options.body) {
    headers.set("content-type", "application/json");
  }
  const token = options.token === undefined ? getAdminToken() : options.token;
  if (token) headers.set("authorization", `Bearer ${token}`);
  if (options.stationToken) headers.set("x-station-token", options.stationToken);

  const res = await fetch(path, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || `HTTP ${res.status}`);
  }
  return data as T;
}

export function wsUrl(role: "admin" | "station", token: string) {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${location.host}/ws?role=${role}&token=${encodeURIComponent(token)}`;
}

export function captureFrame(video: HTMLVideoElement, quality = 0.72): string {
  const canvas = document.createElement("canvas");
  const w = video.videoWidth || 640;
  const h = video.videoHeight || 480;
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas indisponível");
  ctx.drawImage(video, 0, 0, w, h);
  return canvas.toDataURL("image/jpeg", quality);
}

/** Mensagens claras para falhas comuns de webcam no notebook/Linux. */
export function cameraErrorMessage(err: unknown): string {
  const name = err instanceof DOMException ? err.name : "";
  const raw = err instanceof Error ? err.message : String(err || "erro desconhecido");
  if (!window.isSecureContext) {
    return "A câmera só funciona em HTTPS (ou localhost). Abra https://IP-DO-SERVIDOR/ — não use http://IP:8787.";
  }
  if (name === "NotAllowedError" || name === "PermissionDeniedError") {
    return "Permissão da câmera negada. No Chromium: cadeado na barra de endereço → Câmera → Permitir, e recarregue.";
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return "Nenhuma câmera encontrada. Confira se o notebook detecta a webcam e se não está desativada no BIOS.";
  }
  if (name === "NotReadableError" || name === "TrackStartError") {
    return "Câmera ocupada por outro app (Zoom, Meet, Cheese…). Feche e tente de novo.";
  }
  if (name === "OverconstrainedError" || name === "ConstraintNotSatisfiedError") {
    return "A webcam não aceitou as restrições de vídeo. Tente de novo (o app já faz fallback automático).";
  }
  if (name === "SecurityError") {
    return "Navegador bloqueou a câmera (contexto inseguro). Use HTTPS.";
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    return "Este navegador não expõe getUserMedia. Use Chromium/Chrome/Edge atualizado.";
  }
  return `Falha na câmera: ${raw}`;
}

/**
 * Abre a webcam do notebook com fallbacks.
 * `facingMode: "user"` falha em muitas UVC no Linux → tenta constraints mais simples.
 */
export async function openUserCamera(): Promise<MediaStream> {
  if (!window.isSecureContext) {
    throw new Error(cameraErrorMessage(new DOMException("insecure", "SecurityError")));
  }
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
    /* enumerate pode exigir permissão prévia — ignora */
  }

  let lastErr: unknown;
  for (const constraints of attempts) {
    try {
      return await navigator.mediaDevices.getUserMedia(constraints);
    } catch (err) {
      lastErr = err;
      const name = err instanceof DOMException ? err.name : "";
      // Permissão negada / sem dispositivo: não adianta tentar de novo
      if (name === "NotAllowedError" || name === "PermissionDeniedError" || name === "NotFoundError") {
        break;
      }
    }
  }
  throw new Error(cameraErrorMessage(lastErr));
}
