import type { FastifyRequest } from "fastify";

export const SHOP_HOST = "geek.local";
/** Nome que o Android resolve (mDNS .local falha no Chrome). Mesmo túnel, certificado real. */
export const SHOP_PUBLIC_HOST = "loja.geekloja.com.br";
export const HOME_HOST = "admin.geekloja.com.br";
export const PUBLIC_API_HOST = "api.geekloja.com.br";

export function requestHost(req: FastifyRequest | { headers?: { host?: string | string[] } }): string {
  const raw = req.headers?.host;
  const host = Array.isArray(raw) ? raw[0] : raw;
  return String(host || "")
    .split(":")[0]
    .trim()
    .toLowerCase();
}

function isPrivateIpv4(host: string): boolean {
  if (/^127\./.test(host)) return true;
  if (/^10\./.test(host)) return true;
  if (/^192\.168\./.test(host)) return true;
  if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(host)) return true;
  return false;
}

/** Host da loja: celular/PC na LAN. Túnel Cloudflare NÃO entra aqui (Host público). */
export function isLanControlHost(host: string): boolean {
  const h = String(host || "")
    .split(":")[0]
    .trim()
    .toLowerCase();
  if (!h) return false;
  if (h === SHOP_HOST || h === SHOP_PUBLIC_HOST || h.endsWith(".local")) return true;
  if (h === "localhost" || h === "127.0.0.1" || h === "::1") return true;
  if (isPrivateIpv4(h)) return true;
  return false;
}

export function isHomeAdminHost(host: string): boolean {
  const h = String(host || "")
    .split(":")[0]
    .trim()
    .toLowerCase();
  return h === HOME_HOST;
}

export function isRemoteAdminHost(host: string): boolean {
  return !isLanControlHost(host);
}

/** Painel da equipe: loja / LAN / admin de casa. NÃO inclui api.geekloja.com.br. */
export function isStaffUiHost(host: string): boolean {
  const h = String(host || "")
    .split(":")[0]
    .trim()
    .toLowerCase();
  if (!h) return true;
  if (h === PUBLIC_API_HOST) return false;
  return isLanControlHost(h) || isHomeAdminHost(h);
}

export function shopAdminUrl(_port = 8787): string {
  return `https://${SHOP_PUBLIC_HOST}/admin`;
}

export function homeAdminUrl(): string {
  return `https://${HOME_HOST}`;
}
