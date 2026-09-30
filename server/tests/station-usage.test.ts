import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { buildApp } from "../src/app.js";
import { closeDb } from "../src/db.js";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

describe("station usage", () => {
  let dbPath = "";
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    dbPath = path.join(os.tmpdir(), `usage-test-${Date.now()}.db`);
    app = await buildApp({ logger: false, databasePath: dbPath });
  });

  afterEach(async () => {
    await app.close();
    closeDb();
    try {
      fs.unlinkSync(dbPath);
    } catch {
      /* ignore */
    }
  });

  it("aceita hardware + sample e resume no admin", async () => {
    const login = await app.inject({
      method: "POST",
      url: "/api/admin/login",
      payload: { password: process.env.ADMIN_PASSWORD || "admin123" },
    });
    expect(login.statusCode).toBe(200);
    const { token } = login.json() as { token: string };

    const created = await app.inject({
      method: "POST",
      url: "/api/stations",
      headers: { authorization: `Bearer ${token}` },
      payload: { name: "PC Uso 1" },
    });
    expect(created.statusCode).toBe(200);
    const station = created.json() as { id: string; token: string };

    const hw = await app.inject({
      method: "POST",
      url: "/api/stations/hardware",
      headers: { "x-station-token": station.token },
      payload: {
        cpuName: "Test CPU",
        cpuCores: 8,
        gpus: [{ vendor: "nvidia", model: "RTX 4060", vramMb: 8192 }],
        ramTotalMb: 16384,
        osBuild: "Windows 10",
      },
    });
    expect(hw.statusCode).toBe(200);

    const sample = await app.inject({
      method: "POST",
      url: "/api/stations/usage-sample",
      headers: { "x-station-token": station.token },
      payload: {
        occupantKind: "vip",
        occupantCustomerId: "c1",
        occupantLabel: "João",
        appProcess: "cs2.exe",
        cpuPct: 40,
        gpuPct: 70,
        ramPct: 55,
      },
    });
    expect(sample.statusCode).toBe(200);
    expect(sample.json()).toMatchObject({ ok: true });

    const usage = await app.inject({
      method: "GET",
      url: "/api/admin/usage?hours=24",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(usage.statusCode).toBe(200);
    const body = usage.json() as { topApps: Array<{ process: string }>; kwh: number };
    expect(body.topApps[0]?.process).toBe("cs2.exe");
    expect(body.kwh).toBeGreaterThanOrEqual(0);
  });
});
