import { ApiError } from "./api";

export type Phase = "boot" | "setup" | "offline" | "locked" | "unlocked" | "staff";
export type ScanVisual = "idle" | "scanning" | "warn" | "error" | "success";

export type RemoteBanner = {
  title: string;
  text: string;
  level: "info" | "warn" | "urgent";
  until: number;
};

export const DEFAULT_ABSENT_SEC = 90;
export const PRESENCE_MS = 1800;
export const SESSION_HB_MS = 8000;
/** Match único forte libera; senão precisa de 2 frames. */
export const STRONG_MATCH_SCORE = 0.55;
export const KEEP_STREAK_MIN_SCORE = 0.4;

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
