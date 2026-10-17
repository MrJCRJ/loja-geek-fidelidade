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
    expect(body.month).toBeTruthy();
    expect(Array.isArray((body as { consoles: unknown[] }).consoles)).toBe(true);
    expect((body as { consoles: Array<{ name: string }> }).consoles.map((c) => c.name)).toEqual([
      "PS4-1",
      "PS4-2",
      "Switch",
      "PS5",
    ]);

    const start = await app.inject({
      method: "POST",
      url: "/api/consoles/console_ps5/start",
      headers: authHeaders(token),
      payload: { mode: "sale", customerName: "Dash VIP", hours: 1 },
    });
    expect(start.statusCode).toBe(200);

    const after = await app.inject({
      method: "GET",
      url: "/api/admin/metrics",
      headers: authHeaders(token),
    });
    const live = after.json() as {
      today: { sessions: number };
      consoles: Array<{ name: string; status: string; customerName: string | null }>;
      activeNow: Array<{ place_name: string; kind: string }>;
      topConsolesToday: Array<{ console_name: string }>;
    };
    expect(live.today.sessions).toBeGreaterThanOrEqual(1);
    expect(live.consoles.find((c) => c.name === "PS5")?.status).toBe("active");
    expect(live.consoles.find((c) => c.name === "PS5")?.customerName).toBe("Dash VIP");
    expect(live.activeNow.some((s) => s.kind === "console" && s.place_name === "PS5")).toBe(true);
    expect(live.topConsolesToday.some((c) => c.console_name === "PS5")).toBe(true);
    await app.close();
  });
});
