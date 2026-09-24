import fs from "node:fs";
import { describe, expect, it } from "vitest";
import {
  classifyLockStation,
  lockNeedsUpdate,
  lockPackagePath,
  lockUpdateDir,
  setLockTargetVersion,
} from "../src/lock-update.js";
import { adminToken, authHeaders, claimStation, createTestApp } from "./helpers.js";

describe("Update GeekLock", () => {
  it("1.0.0 precisa de 1.1.0", () => {
    expect(lockNeedsUpdate("1.0.0", "1.1.0")).toBe(true);
    expect(lockNeedsUpdate("1.1.0", "1.1.0")).toBe(false);
    expect(lockNeedsUpdate("", "1.1.0")).toBe(true);
  });

  it("classifica ligado/desligado e desatualizado", () => {
    expect(
      classifyLockStation({ id: "a", name: "PC-01", online: 1, lock_version: "1.0.0" }, "1.1.0").status,
    ).toBe("outdated");
    expect(
      classifyLockStation({ id: "b", name: "PC-02", online: 0, lock_version: "1.0.0" }, "1.1.0").status,
    ).toBe("offline_outdated");
    expect(
      classifyLockStation({ id: "c", name: "PC-03", online: 1, lock_version: "1.1.0" }, "1.1.0").status,
    ).toBe("current");
  });

  it("heartbeat avisa catch-up quando o alvo é maior", async () => {
    const app = await createTestApp();
    fs.mkdirSync(lockUpdateDir(), { recursive: true });
    fs.writeFileSync(lockPackagePath(), "zip");
    setLockTargetVersion("1.1.0");
    const station = await claimStation(app, "PC-Catch");
    const hb = await app.inject({
      method: "POST",
      url: "/api/stations/heartbeat",
      payload: { token: station.token, lockVersion: "1.0.0" },
    });
    expect(hb.statusCode).toBe(200);
    const body = hb.json() as { lockUpdate?: { needed?: boolean; latestVersion?: string } | null };
    expect(body.lockUpdate?.needed).toBe(true);
    expect(body.lockUpdate?.latestVersion).toBe("1.1.0");
    const token = await adminToken(app);
    const list = await app.inject({
      method: "GET",
      url: "/api/stations",
      headers: authHeaders(token),
    });
    const found = (
      list.json() as { stations: Array<{ name: string; lock_version?: string }> }
    ).stations.find((s) => s.name === "PC-Catch");
    expect(found?.lock_version).toBe("1.0.0");
    await app.close();
  });
});
