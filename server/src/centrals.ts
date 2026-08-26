import { getUnitSettings } from "./admin-ops.js";
import { getSetting, setSetting } from "./customers.js";

export type PeerCentral = {
  unitId: string;
  unitName: string;
  publicApiUrl: string;
};

export type CatalogCentral = PeerCentral & {
  self: boolean;
};

const PEERS_KEY = "peer_centrals";
const PUBLIC_API_KEY = "public_api_url";

function normalizeUrl(url: string): string {
  return String(url || "")
    .trim()
    .replace(/\/$/, "");
}

export function getPublicApiUrl(): string {
  return normalizeUrl(getSetting(PUBLIC_API_KEY, ""));
}

export function setPublicApiUrl(url: string): string {
  const next = normalizeUrl(url);
  setSetting(PUBLIC_API_KEY, next);
  return next;
}

export function listPeerCentrals(): PeerCentral[] {
  const raw = getSetting(PEERS_KEY, "[]");
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((row) => {
        const r = row as Record<string, unknown>;
        const unitId = String(r.unitId || "").trim();
        const unitName = String(r.unitName || "").trim();
        const publicApiUrl = normalizeUrl(String(r.publicApiUrl || ""));
        if (!unitId || !unitName || !publicApiUrl) return null;
        if (!/^https?:\/\//i.test(publicApiUrl)) return null;
        return { unitId, unitName, publicApiUrl };
      })
      .filter((x): x is PeerCentral => Boolean(x))
      .slice(0, 12);
  } catch {
    return [];
  }
}

export function setPeerCentrals(peers: PeerCentral[]): PeerCentral[] {
  const cleaned = peers
    .map((p) => ({
      unitId: String(p.unitId || "").trim().slice(0, 64),
      unitName: String(p.unitName || "").trim().slice(0, 80),
      publicApiUrl: normalizeUrl(String(p.publicApiUrl || "")),
    }))
    .filter((p) => p.unitId && p.unitName && /^https?:\/\//i.test(p.publicApiUrl))
    .slice(0, 12);
  setSetting(PEERS_KEY, JSON.stringify(cleaned));
  return cleaned;
}

/** Lista este Central + peers para o portal escolher a API. */
export function buildCentralsCatalog(): CatalogCentral[] {
  const unit = getUnitSettings();
  const selfUrl = getPublicApiUrl();
  const self: CatalogCentral = {
    unitId: unit.unitId,
    unitName: unit.unitName,
    publicApiUrl: selfUrl,
    self: true,
  };
  const peers = listPeerCentrals().map((p) => ({ ...p, self: false as const }));
  // Evita duplicar se o peer for o próprio unitId
  const filtered = peers.filter((p) => p.unitId !== self.unitId);
  return [self, ...filtered];
}
