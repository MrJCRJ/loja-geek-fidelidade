import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { cmpSemver, requestCentralInstall } from "../src/central-update.js";
import { saveGithubToken, updateRequestPath } from "../src/github-token.js";

describe("Atualizar Central", () => {
  const prevData = process.env.GEEKCENTRAL_DATA_DIR;
  let tmp: string;

  afterEach(() => {
    if (prevData === undefined) delete process.env.GEEKCENTRAL_DATA_DIR;
    else process.env.GEEKCENTRAL_DATA_DIR = prevData;
    if (tmp && fs.existsSync(tmp)) fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("1.0.0 é mais antigo que 1.1.1", () => {
    expect(cmpSemver("1.0.0", "1.1.1")).toBe(-1);
    expect(cmpSemver("1.1.1", "1.1.1")).toBe(0);
  });

  it("apply grava update-request.json quando há token", () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "geek-upd-"));
    process.env.GEEKCENTRAL_DATA_DIR = tmp;
    saveGithubToken("ghp_testtoken_min8");
    const r = requestCentralInstall();
    expect(r.ok).toBe(true);
    const written = JSON.parse(fs.readFileSync(updateRequestPath(), "utf8")) as { action: string };
    expect(written.action).toBe("install");
  });
});
