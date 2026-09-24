import fs from "node:fs";
import { resolveGithubToken, saveGithubToken, updateRequestPath } from "./github-token.js";

const REPO = "MrJCRJ/loja-geek-fidelidade";
const ASSET_NAME = "GeekCentral-win-x64.zip";

function parseSemver(v: string): [number, number, number] | null {
  const m = String(v || "")
    .replace(/^central-v/i, "")
    .replace(/^v/i, "")
    .trim()
    .match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

export function cmpSemver(a: string, b: string): number {
  const pa = parseSemver(a);
  const pb = parseSemver(b);
  if (!pa || !pb) return 0;
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] < pb[i] ? -1 : 1;
  }
  return 0;
}

export function currentCentralVersion(): string {
  return String(process.env.GEEKCENTRAL_APP_VERSION || "").trim() || "0.0.0";
}

export function githubAuthStatus() {
  const { token, source } = resolveGithubToken();
  return { hasGithub: Boolean(token), source: token ? source : "" };
}

export async function checkCentralUpdate(): Promise<{
  ok: boolean;
  error?: string;
  updateAvailable?: boolean;
  currentVersion: string;
  latestVersion?: string;
  tag?: string;
  notes?: string;
  hasGithub: boolean;
  source: string;
}> {
  const currentVersion = currentCentralVersion();
  const { token, source } = resolveGithubToken();
  if (!token) {
    return {
      ok: false,
      error: "GitHub não autenticado neste PC (gh ou token em data\\config.json)",
      currentVersion,
      hasGithub: false,
      source: "",
    };
  }
  const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "GeekCentral-Updater",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (res.status === 401 || res.status === 403) {
    return {
      ok: false,
      error: "Token GitHub sem permissão (contents:read)",
      currentVersion,
      hasGithub: true,
      source,
    };
  }
  if (res.status === 404) {
    return {
      ok: false,
      error: "Nenhum release no GitHub ainda",
      currentVersion,
      hasGithub: true,
      source,
    };
  }
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    return {
      ok: false,
      error: `GitHub HTTP ${res.status}: ${t.slice(0, 120)}`,
      currentVersion,
      hasGithub: true,
      source,
    };
  }
  const release = (await res.json()) as {
    tag_name?: string;
    body?: string;
    assets?: Array<{ name: string }>;
  };
  const tag = String(release.tag_name || "");
  const latestVersion = tag.replace(/^central-v/i, "").replace(/^v/i, "");
  const asset = (release.assets || []).find((a) => a.name === ASSET_NAME);
  if (!asset) {
    return {
      ok: false,
      error: `Release ${tag} sem ${ASSET_NAME}`,
      currentVersion,
      latestVersion,
      tag,
      hasGithub: true,
      source,
    };
  }
  return {
    ok: true,
    updateAvailable: cmpSemver(currentVersion, latestVersion) < 0,
    currentVersion,
    latestVersion,
    tag,
    notes: String(release.body || "").slice(0, 400),
    hasGithub: true,
    source,
  };
}

export function requestCentralInstall(): { ok: boolean; error?: string; applying?: boolean } {
  const { token } = resolveGithubToken();
  if (!token) {
    return { ok: false, error: "GitHub não autenticado neste PC" };
  }
  const p = updateRequestPath();
  fs.writeFileSync(
    p,
    JSON.stringify({ action: "install", at: new Date().toISOString() }, null, 2),
  );
  return { ok: true, applying: true };
}

export function setCentralGithubToken(token: string) {
  saveGithubToken(token);
  return githubAuthStatus();
}
