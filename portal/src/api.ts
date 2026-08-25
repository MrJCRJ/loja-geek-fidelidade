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

export class ApiError extends Error {
  tip?: string;
  code?: string;
  constructor(message: string, extra?: { tip?: string; code?: string }) {
    super(message);
    this.tip = extra?.tip;
    this.code = extra?.code;
  }
}

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
  const s = Math.max(0, Math.floor(Number(seconds) || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  return `${m} min`;
}

/** Mensagens claras para falhas comuns de câmera (celular / HTTPS). */
export function cameraErrorMessage(err: unknown): string {
  const name = err instanceof DOMException ? err.name : "";
  const raw = err instanceof Error ? err.message : String(err || "erro desconhecido");
  if (!window.isSecureContext) {
    return "A câmera só funciona em HTTPS (ou localhost). Abra o portal pelo link seguro (https://…).";
  }
  if (name === "NotAllowedError" || name === "PermissionDeniedError") {
    return "Permissão da câmera negada. Toque no cadeado na barra de endereço → Câmera → Permitir, e tente de novo.";
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return "Nenhuma câmera encontrada. Confira se o celular/notebook tem câmera disponível.";
  }
  if (name === "NotReadableError" || name === "TrackStartError") {
    return "Câmera ocupada por outro app. Feche outras abas ou apps que usam a câmera e tente de novo.";
  }
  if (name === "TimeoutError") {
    return raw;
  }
  if (name === "OverconstrainedError" || name === "ConstraintNotSatisfiedError") {
    return "A câmera não aceitou as restrições de vídeo. Tente de novo.";
  }
  if (name === "SecurityError") {
    return "Navegador bloqueou a câmera (contexto inseguro). Use HTTPS.";
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    return "Este navegador não permite câmera. Use Chrome, Edge ou Safari atualizado.";
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

/**
 * Abre a câmera frontal com fallbacks (mobile + desktop).
 * Constraints rígidas primeiro; se falhar, reduz exigência.
 */
export async function openCamera(): Promise<MediaStream> {
  if (!window.isSecureContext) {
    throw new Error(cameraErrorMessage(new DOMException("insecure", "SecurityError")));
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error(cameraErrorMessage(new Error("getUserMedia indisponível")));
  }

  const timeoutMsg =
    "Timeout ao abrir a câmera (15s). Feche outros apps usando a câmera e tente de novo.";

  const attempts: MediaStreamConstraints[] = [
    {
      audio: false,
      video: { facingMode: { ideal: "user" }, width: { ideal: 720 }, height: { ideal: 960 } },
    },
    {
      audio: false,
      video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
    },
    { audio: false, video: { facingMode: "user" } },
    { audio: false, video: { width: { ideal: 640 }, height: { ideal: 480 } } },
    { audio: false, video: true },
  ];

  let lastErr: unknown;
  for (const constraints of attempts) {
    try {
      return await withMediaTimeout(
        navigator.mediaDevices.getUserMedia(constraints),
        15_000,
        timeoutMsg,
      );
    } catch (err) {
      lastErr = err;
      const name = err instanceof DOMException ? err.name : "";
      if (name === "NotAllowedError" || name === "PermissionDeniedError" || name === "NotFoundError") {
        break;
      }
    }
  }
  throw new Error(cameraErrorMessage(lastErr));
}

/** Anexa stream ao <video> e aguarda frames reais (evita tela preta). */
export async function attachCameraStream(
  video: HTMLVideoElement,
  stream: MediaStream,
): Promise<void> {
  if (video.srcObject && video.srcObject !== stream) {
    video.pause();
    video.srcObject = null;
  }

  video.setAttribute("autoplay", "");
  video.setAttribute("muted", "");
  video.setAttribute("playsinline", "true");
  video.setAttribute("webkit-playsinline", "true");
  video.muted = true;
  video.playsInline = true;
  video.srcObject = stream;

  await new Promise<void>((resolve, reject) => {
    let finished = false;
    const timeout = setTimeout(() => {
      cleanup();
      reject(
        new Error(
          "Vídeo não iniciou (12s). Confira a permissão da câmera e se outra aba não está usando ela.",
        ),
      );
    }, 12_000);

    const cleanup = () => {
      clearTimeout(timeout);
      clearInterval(poll);
      video.removeEventListener("loadedmetadata", onMeta);
      video.removeEventListener("playing", onPlaying);
      video.removeEventListener("loadeddata", onPlaying);
    };

    const tryFinish = () => {
      if (finished) return;
      if (video.videoWidth > 0 && video.videoHeight > 0) {
        finished = true;
        cleanup();
        resolve();
      }
    };

    const tryPlay = () => {
      const p = video.play();
      if (p && typeof p.then === "function") {
        p.then(() => tryFinish()).catch((err) => {
          const name = err instanceof DOMException ? err.name : "";
          if (name === "AbortError") {
            setTimeout(() => {
              video.play().then(() => tryFinish()).catch(() => undefined);
            }, 150);
          } else if (name !== "NotAllowedError") {
            cleanup();
            reject(err instanceof Error ? err : new Error(String(err)));
          }
        });
      }
    };

    const onMeta = () => tryPlay();
    const onPlaying = () => tryFinish();

    video.addEventListener("loadedmetadata", onMeta);
    video.addEventListener("playing", onPlaying);
    video.addEventListener("loadeddata", onPlaying);

    const poll = window.setInterval(tryFinish, 100);

    if (video.readyState >= 1) tryPlay();
    tryFinish();
  });

  await waitForVideoFrames(video);
}

/** Espera o elemento ter width/height de vídeo > 0. */
export async function waitForVideoFrames(
  video: HTMLVideoElement,
  timeoutMs = 10_000,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (video.videoWidth > 0 && video.videoHeight > 0 && video.readyState >= 2) {
      return;
    }
    // Força um frame em browsers que suportam
    if ("requestVideoFrameCallback" in video) {
      await new Promise<void>((resolve) => {
        const v = video as HTMLVideoElement & {
          requestVideoFrameCallback: (cb: () => void) => number;
        };
        const id = window.setTimeout(() => resolve(), 200);
        v.requestVideoFrameCallback(() => {
          clearTimeout(id);
          resolve();
        });
      });
    } else {
      await new Promise((r) => setTimeout(r, 50));
    }
  }
  throw new Error(
    "A câmera abriu, mas não entregou imagem. Feche outros apps da câmera, permita o acesso e tente de novo.",
  );
}

export function captureFrame(video: HTMLVideoElement, quality = 0.85): string {
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth || 640;
  canvas.height = video.videoHeight || 480;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas indisponível");
  // Frame cru (sem espelho). O espelho é só CSS no preview.
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", quality);
}
