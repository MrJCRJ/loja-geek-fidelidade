import type { FastifyRequest } from "fastify";
import os from "node:os";
import { HOME_HOST, PUBLIC_API_HOST, SHOP_HOST, SHOP_PUBLIC_HOST, requestHost } from "./request-scope.js";

/** IPv4 público da loja (NAT). Env ganha; senão o probe preenche. */
let storePublicIp = (process.env.STORE_PUBLIC_IP || "").trim() || null;
let lanIpsOverride: string[] | null = null;

export function getStorePublicIp(): string | null {
  return storePublicIp;
}

export function setStorePublicIpForTest(ip: string | null) {
  storePublicIp = ip;
}

export function setCentralLanIpsForTest(ips: string[] | null) {
  lanIpsOverride = ips;
}

export function centralLanIpv4s(): string[] {
  if (lanIpsOverride) return lanIpsOverride;
  const found: string[] = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const net of list || []) {
      if (net.internal) continue;
      const family = String(net.family);
      if (family !== "IPv4" && family !== "4") continue;
      if (isPrivateIpv4(net.address)) found.push(net.address);
    }
  }
  return found;
}

export function isPrivateIpv4(ip: string): boolean {
  const h = String(ip || "").split("%")[0];
  if (/^127\./.test(h)) return true;
  if (/^10\./.test(h)) return true;
  if (/^192\.168\./.test(h)) return true;
  if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(h)) return true;
  return false;
}

export function sameIpv4Slash24(a: string, b: string): boolean {
  const pa = String(a || "").split(".");
  const pb = String(b || "").split(".");
  if (pa.length !== 4 || pb.length !== 4) return false;
  return pa[0] === pb[0] && pa[1] === pb[1] && pa[2] === pb[2];
}

function firstHeader(value: string | string[] | undefined): string {
  const raw = Array.isArray(value) ? value[0] : value;
  return String(raw || "")
    .split(",")[0]
    .trim()
    .split(":")[0];
}

/** IP do celular/PC, não o do cloudflared (127.0.0.1). */
export function clientFacingIp(
  req: FastifyRequest | { ip?: string; headers?: Record<string, string | string[] | undefined> },
): string {
  const cf = firstHeader(req.headers?.["cf-connecting-ip"]);
  if (cf) return cf;
  const xff = firstHeader(req.headers?.["x-forwarded-for"]);
  if (xff && xff !== "127.0.0.1" && xff !== "::1") return xff;
  return String(req.ip || "")
    .replace("::ffff:", "")
    .split("%")[0];
}

function isLoopbackHost(host: string): boolean {
  return host === "localhost" || host === "127.0.0.1" || host === "::1";
}

function isPublicStaffHost(host: string): boolean {
  return host === SHOP_PUBLIC_HOST || host === HOME_HOST;
}

/** Parear Lock: só rede da loja, nunca túnel/internet. */
export function isLanPairAllowed(
  req: FastifyRequest | { ip?: string; headers?: Record<string, string | string[] | undefined> },
): boolean {
  const host = requestHost(req);
  if (host === PUBLIC_API_HOST || host === HOME_HOST || host === SHOP_PUBLIC_HOST) return false;
  if (host === SHOP_HOST || host.endsWith(".local") || isPrivateIpv4(host) || isLoopbackHost(host)) {
    return true;
  }
  const ip = clientFacingIp(req);
  if (isPrivateIpv4(ip) && ip !== "127.0.0.1" && !ip.startsWith("127.")) return true;
  return false;
}

export function isOnStoreNetwork(
  req: FastifyRequest | { ip?: string; headers?: Record<string, string | string[] | undefined> },
): boolean {
  const host = requestHost(req);
  if (host === SHOP_HOST || host.endsWith(".local") || isPrivateIpv4(host) || isLoopbackHost(host)) {
    return true;
  }

  const ip = clientFacingIp(req);
  const lans = centralLanIpv4s();

  if (isPublicStaffHost(host)) {
    if (!ip || ip === "127.0.0.1" || ip === "::1") return false;
    if (isPrivateIpv4(ip) && lans.some((lan) => sameIpv4Slash24(ip, lan))) return true;
    if (storePublicIp && ip === storePublicIp) return true;
    return false;
  }

  if (ip === "127.0.0.1" || ip === "::1") return true;
  if (isPrivateIpv4(ip) && (lans.length === 0 || lans.some((lan) => sameIpv4Slash24(ip, lan)))) {
    return true;
  }
  if (storePublicIp && ip === storePublicIp) return true;
  return false;
}

export async function refreshStorePublicIp(): Promise<string | null> {
  const fromEnv = (process.env.STORE_PUBLIC_IP || "").trim();
  if (fromEnv) {
    storePublicIp = fromEnv;
    return storePublicIp;
  }
  try {
    const res = await fetch("https://1.1.1.1/cdn-cgi/trace", {
      signal: AbortSignal.timeout(4000),
    });
    const text = await res.text();
    const match = text.match(/^ip=(\S+)/m);
    if (match?.[1]) storePublicIp = match[1].trim();
  } catch {
    /* mantém o último */
  }
  return storePublicIp;
}

export function startStorePublicIpProbe(intervalMs = 10 * 60_000): { stop: () => void } {
  void refreshStorePublicIp();
  const timer = setInterval(() => {
    void refreshStorePublicIp();
  }, intervalMs);
  return {
    stop() {
      clearInterval(timer);
    },
  };
}
