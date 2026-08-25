import { describe, expect, it } from "vitest";
import { adminToken, createTestApp } from "./helpers.js";

describe("GET /api/health", () => {
  it("retorna ok e status do face-service", async () => {
    const app = await createTestApp();
    const res = await app.inject({ method: "GET", url: "/api/health" });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { ok: boolean; faceService: { ok?: boolean }; time: string };
    expect(body.ok).toBe(true);
    expect(body.time).toBeTruthy();
    expect(body.faceService).toBeDefined();
    await app.close();
  });
});

describe("POST /api/admin/login", () => {
  it("aceita senha correta e retorna token JWT", async () => {
    const app = await createTestApp();
    const token = await adminToken(app);
    expect(token).toBeTruthy();
    expect(typeof token).toBe("string");
    await app.close();
  });

  it("rejeita senha incorreta", async () => {
    const app = await createTestApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/admin/login",
      payload: { password: "wrong" },
    });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});

describe("GET /api/admin/me", () => {
  it("retorna role admin com token válido", async () => {
    const app = await createTestApp();
    const token = await adminToken(app);
    const res = await app.inject({
      method: "GET",
      url: "/api/admin/me",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ role: "admin" });
    await app.close();
  });

  it("rejeita sem token", async () => {
    const app = await createTestApp();
    const res = await app.inject({ method: "GET", url: "/api/admin/me" });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});
