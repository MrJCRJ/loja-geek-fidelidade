import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach } from "vitest";
import { buildApp } from "../src/app.js";
import { closeDb } from "../src/db.js";

export const TEST_ADMIN_PASSWORD = "test-admin-pass";
export const TEST_STATION_SECRET = "test-station-secret";
export const TEST_JWT_SECRET = "test-jwt-secret-for-vitest";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "geek-test-"));
  process.env.DATABASE_PATH = path.join(tmpDir, "test.db");
  process.env.ADMIN_PASSWORD = TEST_ADMIN_PASSWORD;
  process.env.STATION_SHARED_SECRET = TEST_STATION_SECRET;
  process.env.JWT_SECRET = TEST_JWT_SECRET;
  process.env.FACE_SERVICE_URL = "http://127.0.0.1:8100";
  delete process.env.STRICT_SECRETS;
  delete process.env.NODE_ENV;
  delete process.env.PORTAL_ORIGIN;
  delete process.env.FACE_SERVICE_TOKEN;
  delete process.env.MP_WEBHOOK_SECRET;
  delete process.env.CLERK_PASSWORD;
  delete process.env.VAPID_PUBLIC_KEY;
  delete process.env.VAPID_PRIVATE_KEY;
});

afterEach(async () => {
  closeDb();
  if (tmpDir && fs.existsSync(tmpDir)) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

export async function createTestApp(): Promise<FastifyInstance> {
  closeDb();
  return buildApp({ logger: false, databasePath: process.env.DATABASE_PATH });
}

export async function adminToken(app: FastifyInstance): Promise<string> {
  const res = await app.inject({
    method: "POST",
    url: "/api/admin/login",
    payload: { password: TEST_ADMIN_PASSWORD },
  });
  const body = res.json() as { token: string };
  return body.token;
}

export function authHeaders(token: string) {
  return { authorization: `Bearer ${token}` };
}

export function stationHeaders(token: string) {
  return { "x-station-token": token };
}

export async function createCustomer(
  app: FastifyInstance,
  token: string,
  name = "VIP Teste",
) {
  const res = await app.inject({
    method: "POST",
    url: "/api/customers",
    headers: authHeaders(token),
    payload: { name, consent: true, level: "bronze" },
  });
  return res.json() as { id: string; name: string; points: number };
}

export async function claimStation(app: FastifyInstance, name = "Estacao-Teste") {
  const res = await app.inject({
    method: "POST",
    url: "/api/stations/claim",
    payload: { name, sharedSecret: TEST_STATION_SECRET },
  });
  return res.json() as { id: string; name: string; token: string };
}
