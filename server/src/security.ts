import { createHash, timingSafeEqual } from "node:crypto";
import bcrypt from "bcryptjs";
import { config } from "./config.js";

const rateBuckets = new Map<string, { count: number; resetAt: number }>();

/** Retorna true se a requisição pode seguir; false se excedeu o limite. */
export function resetRateLimitBuckets() {
  rateBuckets.clear();
}

export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const cur = rateBuckets.get(key);
  if (!cur || now > cur.resetAt) {
    rateBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (cur.count >= limit) return false;
  cur.count += 1;
  return true;
}

export function hashStationToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function looksLikeBcrypt(value: string): boolean {
  return /^\$2[aby]\$\d{2}\$/.test(value);
}

function verifySecret(stored: string, input: string): boolean {
  if (!stored) return false;
  if (looksLikeBcrypt(stored)) {
    return bcrypt.compareSync(input, stored);
  }
  const a = Buffer.from(input);
  const b = Buffer.from(stored);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function verifyAdminPassword(input: string): boolean {
  return verifySecret(config.adminPassword, input);
}

export function verifyClerkPassword(input: string): boolean {
  return verifySecret(config.clerkPassword, input);
}

export function assertProductionSecrets() {
  if (!config.strictSecrets) return;

  const defaults: Array<[string, string, string]> = [
    ["ADMIN_PASSWORD", config.adminPassword, "admin123"],
    ["JWT_SECRET", config.jwtSecret, "troque-este-segredo-em-producao"],
    ["STATION_SHARED_SECRET", config.stationSharedSecret, "loja-geek-station-secret"],
  ];

  const bad: string[] = [];
  for (const [name, value, def] of defaults) {
    if (!value || value === def) bad.push(name);
  }
  if (bad.length) {
    throw new Error(
      `STRICT_SECRETS/produção: troque os defaults inseguros: ${bad.join(", ")}. ` +
        `Defina variáveis no .env (ver docs/loja-ready.md).`,
    );
  }
}
