import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { config } from "./config.js";

export function centralDataDir(): string {
  if (process.env.GEEKCENTRAL_DATA_DIR) return process.env.GEEKCENTRAL_DATA_DIR;
  return path.dirname(config.databasePath);
}

function tokenFromConfigFile(dataDir: string): string {
  const p = path.join(dataDir, "config.json");
  try {
    const cfg = JSON.parse(fs.readFileSync(p, "utf8")) as { githubUpdateToken?: string };
    return String(cfg.githubUpdateToken || "").trim();
  } catch {
    return "";
  }
}

function tokenFromGhCli(): string {
  try {
    return execFileSync("gh", ["auth", "token"], {
      encoding: "utf8",
      timeout: 4000,
      windowsHide: true,
    }).trim();
  } catch {
    return "";
  }
}

/** Token já no PC (config do Central, env, ou `gh auth`). */
export function resolveGithubToken(): { token: string; source: "config" | "env" | "gh" | "" } {
  const fromCfg = tokenFromConfigFile(centralDataDir());
  if (fromCfg) return { token: fromCfg, source: "config" };
  const fromEnv = (process.env.GITHUB_TOKEN || process.env.GH_TOKEN || "").trim();
  if (fromEnv) return { token: fromEnv, source: "env" };
  const fromGh = tokenFromGhCli();
  if (fromGh) return { token: fromGh, source: "gh" };
  return { token: "", source: "" };
}

export function saveGithubToken(token: string) {
  const dataDir = centralDataDir();
  fs.mkdirSync(dataDir, { recursive: true });
  const p = path.join(dataDir, "config.json");
  let cfg: Record<string, unknown> = {};
  try {
    cfg = JSON.parse(fs.readFileSync(p, "utf8")) as Record<string, unknown>;
  } catch {
    cfg = {};
  }
  cfg.githubUpdateToken = String(token || "").trim();
  fs.writeFileSync(p, JSON.stringify(cfg, null, 2));
}

export function updateRequestPath(): string {
  return path.join(centralDataDir(), "update-request.json");
}
