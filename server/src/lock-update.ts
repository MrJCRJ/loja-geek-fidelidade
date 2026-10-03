import fs from "node:fs";
import path from "node:path";
import { cmpSemver } from "./central-update.js";
import { centralDataDir, resolveGithubToken } from "./github-token.js";
import { listStations } from "./stations.js";
import { getSetting, setSetting } from "./customers.js";

const REPO = "MrJCRJ/loja-geek-fidelidade";
export const LOCK_ASSET_NAME = "GeekLock-win-x64.zip";

type GhRelease = {
  tag_name?: string;
  body?: string;
  assets?: Array<{ id: number; name: string; url: string; size?: number }>;
};

type CachedLatest = {
  at: number;
  latestVersion: string;
  tag: string;
  assetUrl: string;
  notes: string;
};

let cachedLatest: CachedLatest | null = null;
const CACHE_MS = 5 * 60_000;

export function lockUpdateDir() {
  return path.join(centralDataDir(), "lock-updates");
}

export function lockPackagePath() {
  return path.join(lockUpdateDir(), LOCK_ASSET_NAME);
}

export function getLockTargetVersion() {
  return String(getSetting("lock_target_version", "") || "").trim();
}

export function setLockTargetVersion(version: string) {
  setSetting("lock_target_version", String(version || "").trim());
}

function parseLockVersion(tag: string) {
  return String(tag || "")
    .replace(/^lock-v/i, "")
    .replace(/^central-v/i, "")
    .replace(/^v/i, "");
}

export function lockNeedsUpdate(current: string | null | undefined, latest: string) {
  if (!latest) return false;
  if (!current) return true;
  return cmpSemver(current, latest) < 0;
}

export function classifyLockStation(
  station: { id: string; name: string; online?: number; lock_version?: string | null },
  latest: string,
) {
  const version = String(station.lock_version || "").trim();
  const online = Boolean(station.online);
  const outdated = latest ? lockNeedsUpdate(version || null, latest) : false;
  let status: "current" | "outdated" | "unknown" | "offline_outdated" | "offline_unknown";
  if (!version) status = online ? "unknown" : "offline_unknown";
  else if (outdated) status = online ? "outdated" : "offline_outdated";
  else status = "current";
  return {
    id: station.id,
    name: station.name,
    online,
    version: version || "",
    status,
  };
}

async function ghFetch(url: string, token: string, accept = "application/vnd.github+json") {
  return fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: accept,
      "User-Agent": "GeekCentral-LockUpdater",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    redirect: "follow",
  });
}

export async function findLatestLockRelease(force = false): Promise<{
  ok: boolean;
  error?: string;
  latestVersion?: string;
  tag?: string;
  assetUrl?: string;
  notes?: string;
  hasGithub: boolean;
  source: string;
}> {
  const { token, source } = resolveGithubToken();
  if (!token) {
    return { ok: false, error: "GitHub não autenticado neste PC", hasGithub: false, source: "" };
  }
  if (!force && cachedLatest && Date.now() - cachedLatest.at < CACHE_MS) {
    return {
      ok: true,
      latestVersion: cachedLatest.latestVersion,
      tag: cachedLatest.tag,
      assetUrl: cachedLatest.assetUrl,
      notes: cachedLatest.notes,
      hasGithub: true,
      source,
    };
  }
  const res = await ghFetch(`https://api.github.com/repos/${REPO}/releases?per_page=20`, token);
  if (res.status === 401 || res.status === 403) {
    return { ok: false, error: "Token GitHub sem permissão (contents:read)", hasGithub: true, source };
  }
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    return { ok: false, error: `GitHub HTTP ${res.status}: ${t.slice(0, 120)}`, hasGithub: true, source };
  }
  const releases = (await res.json()) as GhRelease[];
  for (const rel of releases) {
    const asset = (rel.assets || []).find((a) => a.name === LOCK_ASSET_NAME);
    if (!asset) continue;
    const tag = String(rel.tag_name || "");
    const latestVersion = parseLockVersion(tag);
    cachedLatest = {
      at: Date.now(),
      latestVersion,
      tag,
      assetUrl: asset.url,
      notes: String(rel.body || "").slice(0, 400),
    };
    return {
      ok: true,
      latestVersion,
      tag,
      assetUrl: asset.url,
      notes: cachedLatest.notes,
      hasGithub: true,
      source,
    };
  }
  return {
    ok: false,
    error: `Nenhum release com ${LOCK_ASSET_NAME}`,
    hasGithub: true,
    source,
  };
}

function readLocalLockPackage(): { version: string; path: string } | null {
  const dest = lockPackagePath();
  const metaPath = path.join(lockUpdateDir(), "version.json");
  if (!fs.existsSync(dest)) return null;
  try {
    const meta = JSON.parse(fs.readFileSync(metaPath, "utf8")) as { version?: string };
    const version = String(meta.version || "").trim();
    if (!version) return null;
    return { version, path: dest };
  } catch {
    return null;
  }
}

/** Aceita pacote colocado à mão na VPS (scp) sem exigir release no GitHub. */
export async function ensureLockPackageCached(): Promise<{
  ok: boolean;
  error?: string;
  latestVersion?: string;
  applying?: boolean;
}> {
  const dest = lockPackagePath();
  const metaPath = path.join(lockUpdateDir(), "version.json");
  const local = readLocalLockPackage();
  const found = await findLatestLockRelease();

  if (local) {
    const localWins =
      !found.ok ||
      !found.latestVersion ||
      cmpSemver(local.version, found.latestVersion) >= 0;
    if (localWins) {
      setLockTargetVersion(local.version);
      return { ok: true, latestVersion: local.version, applying: true };
    }
  }

  if (!found.ok || !found.latestVersion || !found.assetUrl) {
    if (local) {
      setLockTargetVersion(local.version);
      return { ok: true, latestVersion: local.version, applying: true };
    }
    return { ok: false, error: found.error || "Sem release do GeekLock" };
  }
  const { token } = resolveGithubToken();
  if (!token) {
    if (local) {
      setLockTargetVersion(local.version);
      return { ok: true, latestVersion: local.version, applying: true };
    }
    return { ok: false, error: "GitHub não autenticado neste PC" };
  }

  try {
    const meta = JSON.parse(fs.readFileSync(metaPath, "utf8")) as { version?: string };
    if (meta.version === found.latestVersion && fs.existsSync(dest)) {
      setLockTargetVersion(found.latestVersion);
      return { ok: true, latestVersion: found.latestVersion, applying: true };
    }
  } catch {
    /* baixa de novo */
  }

  const res = await ghFetch(found.assetUrl, token, "application/octet-stream");
  if (!res.ok) return { ok: false, error: `Download HTTP ${res.status}` };
  const buf = Buffer.from(await res.arrayBuffer());
  fs.mkdirSync(lockUpdateDir(), { recursive: true });
  fs.writeFileSync(dest, buf);
  fs.writeFileSync(metaPath, JSON.stringify({ version: found.latestVersion, tag: found.tag }, null, 2));
  setLockTargetVersion(found.latestVersion);
  return { ok: true, latestVersion: found.latestVersion, applying: true };
}

export function lockUpdateHintForStation(currentVersion: string | null | undefined) {
  const target = getLockTargetVersion();
  if (!target || !lockNeedsUpdate(currentVersion, target)) return null;
  if (!fs.existsSync(lockPackagePath())) return null;
  return { needed: true as const, latestVersion: target };
}

export async function lockUpdateStatus() {
  const latest = await findLatestLockRelease();
  const local = readLocalLockPackage();
  let version = latest.latestVersion || getLockTargetVersion() || "";
  let source = latest.source || "";
  let ok = latest.ok;
  let error = latest.error;
  if (local) {
    if (!version || cmpSemver(local.version, version) >= 0) {
      version = local.version;
      source = source ? `${source}+local` : "local";
      ok = true;
      error = undefined;
    }
  } else if (!ok && getLockTargetVersion()) {
    version = getLockTargetVersion();
  }
  const stations = listStations().map((s) => classifyLockStation(s, version || ""));
  const outdated = stations.filter((s) => s.status === "outdated" || s.status === "offline_outdated");
  return {
    ok,
    error,
    latestVersion: version || "",
    tag: latest.tag,
    notes: latest.notes,
    hasGithub: latest.hasGithub,
    source,
    packageReady: fs.existsSync(lockPackagePath()),
    stations,
    outdatedCount: outdated.length,
    offlineOutdated: stations.filter((s) => s.status === "offline_outdated").map((s) => s.name),
  };
}
