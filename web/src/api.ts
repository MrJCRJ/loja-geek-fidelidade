export type CustomerLevel = "bronze" | "prata" | "ouro";

export type Customer = {
  id: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  level: CustomerLevel;
  points: number;
  consent_at?: string | null;
  notes?: string | null;
  face_samples?: number;
  time_balance_seconds?: number;
  subscription_status?: string;
  subscription_expires_at?: string | null;
  subscriber_since?: string | null;
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

export function clearAdminSession() {
  setAdminToken(null);
  window.dispatchEvent(new CustomEvent("lg-auth-expired"));
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
    if (res.status === 401 && token && options.stationToken == null && options.token !== null) {
      clearAdminSession();
    }
    const err = data as { error?: string; tip?: string };
    const msg = [err.error, err.tip].filter(Boolean).join(" — ") || `HTTP ${res.status}`;
    throw new Error(res.status === 401 ? "Sessão expirada — faça login novamente (senha admin)." : msg);
  }
  return data as T;
}

export function wsUrl(role: "admin" | "station", token: string) {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${location.host}/ws?role=${role}&token=${encodeURIComponent(token)}`;
}

import {
  attachCameraStream as attachCameraStreamShared,
  captureFrame as captureFrameShared,
  openUserCamera as openUserCameraShared,
} from "../../shared/camera";

export function captureFrame(video: HTMLVideoElement, quality = 0.72): string {
  return captureFrameShared(video, quality);
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
    return "Câmera ocupada por outro app. Feche Firefox/abas na porta 8100, Cheese, Zoom… e confira se o DroidCam no PC está conectado ao celular.";
  }
  if (name === "TimeoutError") {
    return raw;
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
 * Abre a webcam com fallbacks (DroidCam / v4l2loopback no Linux).
 */
export async function openUserCamera(): Promise<MediaStream> {
  return openUserCameraShared({
    requireSecureContext: true,
    timeoutMessage:
      "Timeout ao abrir câmera (15s). No PC: DroidCam conectado ao celular? Feche outras abas usando a câmera.",
    formatError: cameraErrorMessage,
  });
}

/** Anexa stream ao <video> e aguarda frames (DroidCam pode demorar). */
export async function attachCameraStream(
  video: HTMLVideoElement,
  stream: MediaStream,
): Promise<void> {
  return attachCameraStreamShared(
    video,
    stream,
    "Vídeo não iniciou (10s). DroidCam no PC está conectado e mostrando imagem?",
  );
}
