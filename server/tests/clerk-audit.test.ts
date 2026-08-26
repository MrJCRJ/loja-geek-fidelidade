import { describe, expect, it } from "vitest";
import { adminToken, authHeaders, createTestApp } from "./helpers.js";

describe("Modo balcão (clerk) + auditoria", () => {
  it("CLERK_PASSWORD autentica com role clerk e bloqueia PUT settings", async () => {
    process.env.CLERK_PASSWORD = "balcao-teste-123";
    const app = await createTestApp();

    const login = await app.inject({
      method: "POST",
      url: "/api/admin/login",
      payload: { password: "balcao-teste-123" },
    });
    expect(login.statusCode).toBe(200);
    const body = login.json() as { token: string; role: string };
    expect(body.role).toBe("clerk");

    const denied = await app.inject({
      method: "PUT",
      url: "/api/settings",
      headers: authHeaders(body.token),
      payload: { hourPriceReais: 99 },
    });
    expect(denied.statusCode).toBe(403);

    const okGet = await app.inject({
      method: "GET",
      url: "/api/settings",
      headers: authHeaders(body.token),
    });
    expect(okGet.statusCode).toBe(200);

    delete process.env.CLERK_PASSWORD;
    await app.close();
  });

  it("venda de horas gera evento de auditoria", async () => {
    const app = await createTestApp();
    const token = await adminToken(app);
    const customer = await app.inject({
      method: "POST",
      url: "/api/customers",
      headers: authHeaders(token),
      payload: { name: "Audit VIP", consent: true, level: "bronze" },
    });
    const id = (customer.json() as { id: string }).id;

    const sale = await app.inject({
      method: "POST",
      url: `/api/customers/${id}/time/sale`,
      headers: authHeaders(token),
      payload: { amountReais: 10 },
    });
    expect(sale.statusCode).toBe(200);

    const audit = await app.inject({
      method: "GET",
      url: "/api/admin/audit",
      headers: authHeaders(token),
    });
    expect(audit.statusCode).toBe(200);
    const events = (audit.json() as { events: Array<{ kind: string }> }).events;
    expect(events.some((e) => e.kind === "time.sale")).toBe(true);
    await app.close();
  });
});
