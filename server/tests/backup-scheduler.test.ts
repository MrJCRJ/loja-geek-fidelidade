import { describe, expect, it, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { closeDb, initDb } from "../src/db.js";
import {
  getBackupSchedule,
  runScheduledBackupIfDue,
  setBackupSchedule,
} from "../src/backup-scheduler.js";
import { listBackupFiles } from "../src/admin-ops.js";

describe("backup scheduler", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lg-bak-"));
  const dbPath = path.join(dir, "t.db");

  beforeAll(() => {
    process.env.DATABASE_PATH = dbPath;
    initDb(dbPath);
  });

  afterAll(() => {
    closeDb();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("cria backup quando devido e respeita intervalo", () => {
    setBackupSchedule({ enabled: true, intervalHours: 24, keep: 5 });
    const first = runScheduledBackupIfDue();
    expect(first.ran).toBe(true);
    expect(first.result?.fileName).toMatch(/fidelidade-auto-/);

    const second = runScheduledBackupIfDue();
    expect(second.ran).toBe(false);

    const forced = runScheduledBackupIfDue(true);
    expect(forced.ran).toBe(true);
    expect(listBackupFiles().length).toBeGreaterThanOrEqual(2);

    const schedule = getBackupSchedule();
    expect(schedule.enabled).toBe(true);
    expect(schedule.keep).toBe(5);
  });
});
