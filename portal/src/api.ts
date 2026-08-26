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

export type CatalogCentral = {
  unitId: string;
  unitName: string;
  publicApiUrl: string;
  self?: boolean;
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
  unit?: { unitId: string; unitName: string };
  centrals?: CatalogCentral[];
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

const API_BASE_KEY = "lg_portal_api_base";
const CENTRALS_CACHE_KEY = "lg_portal_centrals";

function defaultApiBase() {
  const raw = import.meta.env.VITE_API_URL || "http://127.0.0.1:8787";
  return String(raw).replace(/\/$/, "");
}

function centralsFromEnv(): CatalogCentral[] {
  const raw = import.meta.env.VITE_CENTRALS;
  if (!raw || typeof raw !== "string") return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((row) => {
        const r = row as Record<string, unknown>;
        const unitId = String(r.unitId || "").trim();
        const unitName = String(r.unitName || "").trim();
        const publicApiUrl = String(r.publicApiUrl || r.apiUrl || "")
          .trim()
          .replace(/\/$/, "");
        if (!unitId || !unitName || !publicApiUrl) return null;
        return { unitId, unitName, publicApiUrl };
      })
      .filter((x): x is CatalogCentral => Boolean(x));
  } catch {
    return [];
  }
}

export function getApiBase() {
  try {
    const stored = localStorage.getItem(API_BASE_KEY);
    if (stored) return stored.replace(/\/$/, "");
  } catch {
    /* ignore */
  }
  return defaultApiBase();
}

/** Troca o GeekCentral alvo. Contas são por loja — limpa o token. */
export function setApiBase(url: string, opts?: { clearSession?: boolean }) {
  const next = String(url || "")
    .trim()
    .replace(/\/$/, "");
  if (!next) {
    localStorage.removeItem(API_BASE_KEY);
  } else {
    localStorage.setItem(API_BASE_KEY, next);
  }
  if (opts?.clearSession !== false) setToken(null);
  window.dispatchEvent(new CustomEvent("lg-central-changed", { detail: { apiBase: getApiBase() } }));
}

export function cacheCentrals(centrals: CatalogCentral[]) {
  const merged = mergeCentrals(centralsFromEnv(), centrals);
  try {
    localStorage.setItem(CENTRALS_CACHE_KEY, JSON.stringify(merged));
  } catch {
    /* ignore */
  }
  return merged;
}

export function listCachedCentrals(): CatalogCentral[] {
  const fromEnv = centralsFromEnv();
  try {
    const raw = localStorage.getItem(CENTRALS_CACHE_KEY);
    if (!raw) return fromEnv;
    const parsed = JSON.parse(raw) as CatalogCentral[];
    return mergeCentrals(fromEnv, Array.isArray(parsed) ? parsed : []);
  } catch {
    return fromEnv;
  }
}

function mergeCentrals(...lists: CatalogCentral[][]): CatalogCentral[] {
  const map = new Map<string, CatalogCentral>();
  for (const list of lists) {
    for (const c of list) {
      if (!c?.unitId) continue;
      const url = (c.publicApiUrl || "").replace(/\/$/, "");
      const prev = map.get(c.unitId);
      map.set(c.unitId, {
        unitId: c.unitId,
        unitName: c.unitName || prev?.unitName || c.unitId,
        publicApiUrl: url || prev?.publicApiUrl || "",
        self: Boolean(c.self || prev?.self),
      });
    }
  }
  return [...map.values()].filter((c) => c.publicApiUrl);
}

export function rememberCentralsFromCatalog(catalog: Catalog) {
  const current = getApiBase();
  const fromCatalog = (catalog.centrals || []).map((c) => ({
    ...c,
    publicApiUrl: (c.publicApiUrl || (c.self ? current : "")).replace(/\/$/, ""),
  }));
  if (catalog.unit && !fromCatalog.some((c) => c.unitId === catalog.unit!.unitId)) {
    fromCatalog.unshift({
      unitId: catalog.unit.unitId,
      unitName: catalog.unit.unitName,
      publicApiUrl: current,
      self: true,
    });
  }
  return cacheCentrals(fromCatalog);
}

function apiBase() {
  return getApiBase();
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
