import { describe, expect, it } from "vitest";
import { adminToken, authHeaders, createCustomer, createTestApp } from "./helpers.js";

describe("Dashboard métricas", () => {
  it("GET /api/admin/metrics requer admin e devolve blocos", async () => {
    const app = await createTestApp();
    const denied = await app.inject({ method: "GET", url: "/api/admin/metrics" });
    expect(denied.statusCode).toBe(401);

    const token = await adminToken(app);
    await createCustomer(app, token, "Dash VIP");

    const res = await app.inject({
      method: "GET",
      url: "/api/admin/metrics",
      headers: authHeaders(token),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      today: { sessions: number; hoursUsed: number; salesReais: number };
      week: { days: unknown[] };
      inventory: { customers: number; withFace: number };
      unit: { unitId: string };
    };
    expect(body.inventory.customers).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(body.week.days)).toBe(true);
    expect(body.week.days).toHaveLength(7);
    expect(typeof body.today.sessions).toBe("number");
    expect(body.unit.unitId).toBeTruthy();
    await app.close();
  });
});
