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

/**
 * Parear Lock:
 * - LAN / geek.local / IP privado: ok
 * - api.geekloja.com.br: ok (Locks da loja usam a API pública via Cloudflare)
 * - admin / loja.geekloja (painel): bloqueado (não é endpoint de estação)
 */
export function isLanPairAllowed(
  req: FastifyRequest | { ip?: string; headers?: Record<string, string | string[] | undefined> },
): boolean {
  const host = requestHost(req);
  if (host === HOME_HOST || host === SHOP_PUBLIC_HOST) return false;
  if (host === PUBLIC_API_HOST) return true;
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

/**
 * IP público da loja (NAT) para liberar equipe no painel via Cloudflare.
 * Em API na nuvem/VPS: NÃO probear a saída do servidor (vira IP da VPS e
 * marca todo mundo "fora do Wi‑Fi"). Use STORE_PUBLIC_IP no .env.
 * Probe (1.1.1.1) só quando ainda não há IP e estamos em rede privada (Central on-prem).
 */
export async function refreshStorePublicIp(): Promise<string | null> {
  const fromEnv = (process.env.STORE_PUBLIC_IP || "").trim();
  if (fromEnv) {
    storePublicIp = fromEnv;
    return storePublicIp;
  }
  // Já temos um IP conhecido (ex.: setado por teste / env anterior): não sobrescrever
  // com o egress da VPS.
  if (storePublicIp) return storePublicIp;

  const lans = centralLanIpv4s();
  const onPrem = lans.some((ip) => isPrivateIpv4(ip) && !ip.startsWith("127."));
  if (!onPrem) {
    // API na nuvem sem STORE_PUBLIC_IP: deixa null (isOnStoreNetwork usa outras regras / falha fechado para clerk).
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

/** IP que os GeekLocks devem usar (default loja). Env ou setting sobrescreve. */
export function expectedCentralLanIp(override?: string | null): string {
  const fromArg = String(override || "").trim();
  if (fromArg && isPrivateIpv4(fromArg)) return fromArg.split("%")[0];
  const fromEnv = (process.env.EXPECTED_CENTRAL_LAN_IP || "").trim();
  if (fromEnv && isPrivateIpv4(fromEnv)) return fromEnv.split("%")[0];
  return "192.168.3.70";
}

export type LanIpCheck = {
  expected: string;
  current: string[];
  ok: boolean;
  severity: "warn" | "error" | null;
  code: string | null;
  message: string | null;
};

/**
 * Detecta Central fora do IP fixo da loja (causa clássica: DHCP → Locks offline).
 * - Sem IPv4 privado: error (só loopback / APIPA?)
 * - Tem IPs mas nenhum é o esperado: error
 * - Tem o esperado + outros na mesma /24: ok (multi-NIC normal)
 * - Tem o esperado + outro /24: warn
 */
export function checkCentralLanIp(opts?: {
  expected?: string | null;
  current?: string[] | null;
}): LanIpCheck {
  const expected = expectedCentralLanIp(opts?.expected);
  const current = (opts?.current ?? centralLanIpv4s())
    .map((ip) => String(ip || "").split("%")[0])
    .filter((ip) => isPrivateIpv4(ip) && ip !== "127.0.0.1" && !ip.startsWith("127."));

  if (current.length === 0) {
    return {
      expected,
      current,
      ok: false,
      severity: "error",
      code: "lan_ip_missing",
      message:
        `Central sem IPv4 na LAN — GeekLocks em http://${expected}:8787 não acham o motor. ` +
        "Confira Wi‑Fi/cabo (evite 169.254.x.x) e IP manual 192.168.3.70.",
    };
  }

  if (current.includes(expected)) {
    const foreign = current.filter((ip) => ip !== expected && !sameIpv4Slash24(ip, expected));
    if (foreign.length) {
      return {
        expected,
        current,
        ok: true,
        severity: "warn",
        code: "lan_ip_extra_subnet",
        message:
          `IP esperado ${expected} ok, mas também há ${foreign.join(", ")} ` +
          `(outra rede). Locks devem usar http://${expected}:8787.`,
      };
    }
    return {
      expected,
      current,
      ok: true,
      severity: null,
      code: null,
      message: null,
    };
  }

  return {
    expected,
    current,
    ok: false,
    severity: "error",
    code: "lan_ip_mismatch",
    message:
      `IP da LAN é ${current.join(", ")} — esperado ${expected}. ` +
      `GeekLocks com serverUrl http://${expected}:8787 ficam offline. ` +
      "Refixe o Wi‑Fi em IP manual ou reserve DHCP no roteador.",
  };
}
