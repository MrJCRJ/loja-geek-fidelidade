import { createHash, randomInt } from "node:crypto";

const PAIR_TTL_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 8;
const ATTEMPT_WINDOW_MS = 10 * 60 * 1000;

type PairState = {
  code: string;
  codeHash: string;
  expiresAt: number;
};

type AttemptBucket = { count: number; resetAt: number };

let current: PairState | null = null;
const attemptsByIp = new Map<string, AttemptBucket>();

function hashCode(code: string) {
  return createHash("sha256").update(code.trim()).digest("hex");
}

function genCode() {
  return String(randomInt(100000, 1000000));
}

/** Garante um código válido (cria ou renova se expirou). */
export function ensurePairCode(): { code: string; expiresAt: number; ttlMs: number } {
  const now = Date.now();
  if (current && current.expiresAt > now) {
    return {
      code: current.code,
      expiresAt: current.expiresAt,
      ttlMs: current.expiresAt - now,
    };
  }
  return rotatePairCode();
}

export function rotatePairCode(): { code: string; expiresAt: number; ttlMs: number } {
  const code = genCode();
  const expiresAt = Date.now() + PAIR_TTL_MS;
  current = { code, codeHash: hashCode(code), expiresAt };
  return { code, expiresAt, ttlMs: PAIR_TTL_MS };
}

export function peekPairCode(): { code: string; expiresAt: number; ttlMs: number } | null {
  const now = Date.now();
  if (!current || current.expiresAt <= now) return null;
  return {
    code: current.code,
    expiresAt: current.expiresAt,
    ttlMs: current.expiresAt - now,
  };
}

function rateLimitOk(ip: string): boolean {
  const now = Date.now();
  const bucket = attemptsByIp.get(ip);
  if (!bucket || bucket.resetAt <= now) {
    attemptsByIp.set(ip, { count: 1, resetAt: now + ATTEMPT_WINDOW_MS });
    return true;
  }
  bucket.count += 1;
  return bucket.count <= MAX_ATTEMPTS;
}

/**
 * Valida código de pareamento. Em sucesso, invalida o código (uso único).
 * @returns true se ok
 */
export function consumePairCode(rawCode: string, ip = "unknown"): { ok: true } | { ok: false; error: string; status: number } {
  if (!rateLimitOk(ip)) {
    return { ok: false, error: "Muitas tentativas — aguarde alguns minutos", status: 429 };
  }
  const code = String(rawCode || "").replace(/\D/g, "");
  if (code.length !== 6) {
    return { ok: false, error: "Código deve ter 6 dígitos", status: 400 };
  }
  const now = Date.now();
  if (!current || current.expiresAt <= now) {
    return { ok: false, error: "Código expirado — peça um novo no GeekCentral", status: 401 };
  }
  if (hashCode(code) !== current.codeHash) {
    return { ok: false, error: "Código inválido", status: 401 };
  }
  current = null;
  return { ok: true };
}

export function isLocalRequest(ip: string | undefined, host?: string): boolean {
  const a = String(ip || "").replace("::ffff:", "");
  if (a === "127.0.0.1" || a === "::1" || a === "localhost") return true;
  const h = String(host || "").split(":")[0];
  return h === "127.0.0.1" || h === "localhost" || h === "::1";
}

export const PAIR_CODE_TTL_MS = PAIR_TTL_MS;
