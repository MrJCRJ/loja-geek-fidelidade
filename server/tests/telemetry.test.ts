import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { buildApp } from "../src/app.js";
import { closeDb, initDb } from "../src/db.js";
import { logEvent, listTelemetryEvents, sanitizeMeta } from "../src/telemetry.js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

describe("telemetry", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lg-tel-"));
  const dbPath = path.join(dir, "t.db");

  beforeAll(() => {
    process.env.DATABASE_PATH = dbPath;
    initDb(dbPath);
  });

  afterAll(() => {
    closeDb();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("sanitizeMeta remove chaves sensíveis", () => {
    const clean = sanitizeMeta({
      score: 0.5,
      token: "secret",
      imageBase64: "xxx",
      embedding: [1, 2],
      reason: "ok",
    });
    expect(clean).toEqual({ score: 0.5, reason: "ok" });
  });

  it("grava e lista eventos", () => {
    logEvent({
      level: "warn",
      source: "test",
      kind: "unit.test",
      message: "hello",
      meta: { pin: "1234", ok: true },
    });
    const rows = listTelemetryEvents({ limit: 5, source: "test" });
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0].kind).toBe("unit.test");
    expect(rows[0].meta).toEqual({ ok: true });
  });

  it("diagnostics exige auth", async () => {
    const app = await buildApp({ logger: false, databasePath: dbPath });
    const res = await app.inject({ method: "GET", url: "/api/admin/diagnostics" });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});
