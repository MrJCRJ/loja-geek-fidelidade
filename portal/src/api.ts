import {
  CAMERA_ERROR_COPY,
  attachCameraStream as attachCameraStreamShared,
  cameraErrorMessage as cameraErrorMessageShared,
  captureFrame as captureFrameShared,
  openFacingUserCamera,
} from "../../shared/camera";
import { formatHoursPortal } from "../../shared/format-time";

const TOKEN_KEY = "lg_portal_token";

export type PortalCustomer = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  level: string;
  points: number;
  timeBalanceSeconds: number;
  timeBalanceHours: number;
  faceSamples: number;
  maxFaceSamples: number;
  subscriptionStatus: string;
  subscriptionExpiresAt: string | null;
  isSubscriber: boolean;
  hourPrice: number;
  baseHourPrice: number;
  subscriberDiscountPct: number;
};

export type Catalog = {
  baseHourPrice: number;
  subscriberDiscountPct: number;
  subscriptionMonthlyPrice: number;
  hourPacks: Array<{ amountReais: number; label: string }>;
  maxFaceSamples: number;
  checkoutEnabled?: boolean;
  checkoutMode?: "off" | "demo" | "live";
  demo?: boolean;
  payments?: { mode: string; pixEnabled: boolean };
  whatsappLan?: string;
  whatsappShop?: string;
  shopCatalog?: Array<{
    id: string;
    title: string;
    blurb: string;
    whatsapp: string;
    prefill: string;
  }>;
};

export type WebOrder = {
  id: string;
  kind: string;
  amountReais: number;
  hours: number | null;
  months: number | null;
  status: string;
  provider: string;
  demo?: boolean;
  createdAt: string;
  paidAt: string | null;
};

export type TimeLedgerEntry = {
  id: string;
  deltaSeconds: number;
  amountReais: number;
  reason: string;
  createdAt: string;
};

import { ApiError } from "../../shared/api-error";

export { ApiError };

function apiBase() {
  const raw = import.meta.env.VITE_API_URL || "http://127.0.0.1:8787";
  return String(raw).replace(/\/$/, "");
}

export function getApiBase() {
  return apiBase();
}

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null) {
  if (!token) localStorage.removeItem(TOKEN_KEY);
  else localStorage.setItem(TOKEN_KEY, token);
}

export async function api<T>(
  path: string,
  options: RequestInit & { token?: string | null } = {},
): Promise<T> {
  const headers = new Headers(options.headers || {});
  if (options.body && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  const token = options.token === undefined ? getToken() : options.token;
  if (token) headers.set("authorization", `Bearer ${token}`);

  let res: Response;
  try {
    res = await fetch(`${apiBase()}${path}`, { ...options, headers });
  } catch {
    throw new ApiError(
      "Não foi possível falar com a loja (rede/API offline). Tente de novo ou use o WhatsApp.",
    );
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = data as { error?: string; tip?: string; code?: string };
    if (
      res.status === 401 &&
      (err.error?.includes("Cliente não encontrado") ||
        err.error?.includes("Token de cliente") ||
        err.error?.includes("Não autorizado"))
    ) {
      setToken(null);
    }
    throw new ApiError(err.error || `HTTP ${res.status}`, { tip: err.tip, code: err.code });
  }
  return data as T;
}

export function formatHours(seconds: number) {
  return formatHoursPortal(seconds);
}

export function cameraErrorMessage(err: unknown): string {
  return cameraErrorMessageShared(err, CAMERA_ERROR_COPY.portal);
}

/** Abre a câmera frontal com fallbacks (mobile + desktop). */
export async function openCamera(): Promise<MediaStream> {
  return openFacingUserCamera({
    requireSecureContext: true,
    timeoutMessage:
      "Timeout ao abrir a câmera (15s). Feche outros apps usando a câmera e tente de novo.",
    formatError: cameraErrorMessage,
  });
}

/** Anexa stream ao <video> e aguarda frames reais (evita tela preta). */
export async function attachCameraStream(
  video: HTMLVideoElement,
  stream: MediaStream,
): Promise<void> {
  return attachCameraStreamShared(video, stream, {
    waitFrames: true,
    timeoutMs: 12_000,
    timeoutMessage:
      "Vídeo não iniciou (12s). Confira a permissão da câmera e se outra aba não está usando ela.",
  });
}

export function captureFrame(video: HTMLVideoElement, quality = 0.85): string {
  return captureFrameShared(video, quality);
}
