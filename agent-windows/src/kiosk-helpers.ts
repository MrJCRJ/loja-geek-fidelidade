import { ApiError } from "./api";

export type Phase = "boot" | "setup" | "offline" | "locked" | "unlocked" | "staff";
export type ScanVisual = "idle" | "scanning" | "warn" | "error" | "success";

export type RemoteBanner = {
  title: string;
  text: string;
  level: "info" | "warn" | "urgent";
  until: number;
};

export const DEFAULT_ABSENT_SEC = 60;
export const PRESENCE_MS = 1800;
export const SESSION_HB_MS = 8000;
/** Match único forte libera; senão precisa de 2 frames. Mais alto reduz T14 (quase-gêmeos). */
export const STRONG_MATCH_SCORE = 0.62;
export const KEEP_STREAK_MIN_SCORE = 0.4;
/** Modo staff sem sessão VIP — auto-trava (T6). */
export const DEFAULT_STAFF_UNLOCK_MAX_SEC = 600;

export function formatBalanceShort(seconds: number) {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m >= 60) {
    const h = Math.floor(m / 60);
    return `${h}h ${m % 60}m`;
  }
  return `${m}m ${String(r).padStart(2, "0")}s`;
}

export function scanVisualFromReason(reason?: string, scanning?: boolean): ScanVisual {
  if (scanning) return "scanning";
  if (reason === "no_face" || !reason) return "idle";
  if (reason === "low_quality") return "error";
  if (reason === "no_gallery") return "error";
  if (reason === "unknown" || reason === "ambiguous") return "warn";
  return "idle";
}

export function statusIcon(reason?: string) {
  if (reason === "no_gallery") return "⚠";
  if (reason === "low_quality" || reason === "no_face") return "◎";
  if (reason === "unknown" || reason === "ambiguous") return "?";
  return "◉";
}

/** Copy curta sob a oval — linguagem de loja, não código. */
export function scanStatusHint(reason?: string, scanning?: boolean): string {
  if (scanning) return "Olhe para a Logitech C270 — estamos confirmando seu VIP.";
  switch (reason) {
    case "no_gallery":
      return "Nenhum VIP cadastrado no servidor. Avise o balcão.";
    case "no_face":
      return "Não vejo um rosto. Chegue mais perto e ilumine de frente.";
    case "face_too_far":
      return "Rosto longe demais — aproxime-se da webcam.";
    case "low_quality":
      return "Imagem escura ou borrada. Melhore a luz da frente.";
    case "unknown":
      return "Rosto não reconhecido. Cadastre-se no portal ou fale no caixa.";
    case "ambiguous":
      return "Quase reconheci — olhe de frente e tente de novo.";
    case "no_credit":
      return "VIP sem crédito. Passe no caixa ou compre horas no site.";
    case "no_consent":
      return "Falta consentimento LGPD — refaça o cadastro facial no portal.";
    case "service_down":
      return "Serviço facial reiniciando. Aguarde alguns segundos.";
    default:
      return "Olhe para a câmera. Só VIP cadastrado libera a máquina.";
  }
}

export function playUnlockChime() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.12);
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.25);
    osc.onended = () => {
      ctx.close().catch(() => undefined);
    };
  } catch {
    /* ignore */
  }
}

/** Soft lock: aviso urgente (entrada) ou tick curto (contagem). */
export function playSoftLockBeep(kind: "enter" | "tick" | "final" = "tick") {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const now = ctx.currentTime;
    osc.type = kind === "enter" ? "triangle" : "sine";
    if (kind === "enter") {
      osc.frequency.setValueAtTime(620, now);
      osc.frequency.exponentialRampToValueAtTime(380, now + 0.28);
      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
      osc.stop(now + 0.35);
    } else if (kind === "final") {
      osc.frequency.setValueAtTime(240, now);
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
      osc.stop(now + 0.45);
    } else {
      osc.frequency.setValueAtTime(520, now);
      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
      osc.stop(now + 0.12);
    }
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.onended = () => {
      ctx.close().catch(() => undefined);
    };
  } catch {
    /* ignore */
  }
}

/** Hard lock: tom descendente + lembrete de apps logados. */
export function playLockWarnChime() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const now = ctx.currentTime;
    osc.type = "sine";
    osc.frequency.setValueAtTime(660, now);
    osc.frequency.exponentialRampToValueAtTime(220, now + 0.4);
    gain.gain.setValueAtTime(0.16, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.5);
    osc.onended = () => {
      ctx.close().catch(() => undefined);
    };
  } catch {
    /* ignore */
  }
}

export const DEFAULT_PORTAL_URL = "https://loja-geek-portal.vercel.app";

export function portalRegisterUrl(portalBase: string) {
  const base = (portalBase || DEFAULT_PORTAL_URL).replace(/\/$/, "");
  return `${base}/register`;
}

export function sessionStartErrorMessage(err: unknown): { reason: string; status: string } {
  if (err instanceof ApiError) {
    if (err.code === "no_consent") {
      return { reason: "no_consent", status: "Sem consentimento LGPD — cadastre de novo no portal" };
    }
    if (err.code === "no_credit" || /cr[eé]dito|caixa/i.test(err.message)) {
      return { reason: "no_credit", status: err.message || "Sem crédito — passe no caixa" };
    }
    return { reason: "error", status: err.message || "Não foi possível iniciar a sessão" };
  }
  if (err instanceof Error) {
    if (/consentimento|LGPD/i.test(err.message)) {
      return { reason: "no_consent", status: err.message };
    }
    if (/cr[eé]dito|caixa/i.test(err.message)) {
      return { reason: "no_credit", status: err.message };
    }
    return { reason: "error", status: err.message };
  }
  return { reason: "no_credit", status: "Sem crédito — passe no caixa" };
}
