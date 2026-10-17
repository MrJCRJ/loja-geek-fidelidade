import { describe, expect, it } from "vitest";
import { PUBLIC_API_HOST, SHOP_PUBLIC_HOST } from "../src/request-scope.js";
import { adminToken, authHeaders, claimStation, createCustomer, createTestApp } from "./helpers.js";

describe("Regras do caixa e do liberar", () => {
  it("recusa venda sem forma de pagamento", async () => {
    const app = await createTestApp();
    const token = await adminToken(app);
    const customer = await createCustomer(app, token);
    const sale = await app.inject({
      method: "POST",
      url: `/api/customers/${customer.id}/time/sale`,
      headers: authHeaders(token),
      payload: { amountReais: 10 },
    });
    expect(sale.statusCode).toBe(400);
    await app.close();
  });

  it("vende por horário e credita a hora inteira", async () => {
    const app = await createTestApp();
    const token = await adminToken(app);
    const customer = await createCustomer(app, token);
    const sale = await app.inject({
      method: "POST",
      url: `/api/customers/${customer.id}/time/sale`,
      headers: authHeaders(token),
      payload: { hours: 1, paymentMethod: "pix" },
    });
    expect(sale.statusCode).toBe(200);
    const body = sale.json() as { creditedSeconds: number; amountReais: number };
    expect(body.creditedSeconds).toBe(3600);
    expect(body.amountReais).toBeGreaterThan(0);
    await app.close();
  });

  it("equipe remove a conta", async () => {
    process.env.CLERK_PASSWORD = "balcao-teste-123";
    const app = await createTestApp();
    const admin = await adminToken(app);
    const customer = await createCustomer(app, admin, "Conta da equipe");
    const login = await app.inject({
      method: "POST",
      url: "/api/admin/login",
      payload: { password: "balcao-teste-123" },
    });
    const clerk = (login.json() as { token: string }).token;
    const del = await app.inject({
      method: "DELETE",
      url: `/api/customers/${customer.id}`,
      headers: authHeaders(clerk),
    });
    expect(del.statusCode).toBe(200);
    const get = await app.inject({
      method: "GET",
      url: `/api/customers/${customer.id}`,
      headers: authHeaders(admin),
    });
    expect(get.statusCode).toBe(404);
    delete process.env.CLERK_PASSWORD;
    await app.close();
  });

  it("equipe não apaga conta pelo endereço da API", async () => {
    process.env.CLERK_PASSWORD = "balcao-teste-123";
    const app = await createTestApp();
    const admin = await adminToken(app);
    const customer = await createCustomer(app, admin, "Conta da API");
    const login = await app.inject({
      method: "POST",
      url: "/api/admin/login",
      payload: { password: "balcao-teste-123" },
    });
    const clerk = (login.json() as { token: string }).token;

    const blocked = await app.inject({
      method: "DELETE",
      url: `/api/customers/${customer.id}`,
      headers: { ...authHeaders(clerk), host: PUBLIC_API_HOST },
    });
    expect(blocked.statusCode).toBe(403);

    const still = await app.inject({
      method: "GET",
      url: `/api/customers/${customer.id}`,
      headers: authHeaders(admin),
    });
    expect(still.statusCode).toBe(200);

    const allowed = await app.inject({
      method: "DELETE",
      url: `/api/customers/${customer.id}`,
      headers: { ...authHeaders(clerk), host: SHOP_PUBLIC_HOST },
    });
    expect(allowed.statusCode).toBe(200);
    delete process.env.CLERK_PASSWORD;
    await app.close();
  });

  it("liberar com saldo recusa conta sem hora", async () => {
    const app = await createTestApp();
    const admin = await adminToken(app);
    const customer = await createCustomer(app, admin);
    const station = await claimStation(app);
    const res = await app.inject({
      method: "POST",
      url: `/api/stations/${station.id}/desk-liberar`,
      headers: authHeaders(admin),
      payload: { mode: "balance", customerId: customer.id },
    });
    expect(res.statusCode).toBe(400);
    expect((res.json() as { error: string }).error).toMatch(/Sem crédito/);
    await app.close();
  });

  it("o caixa de hoje soma Pix, cartão e dinheiro", async () => {
    const app = await createTestApp();
    const token = await adminToken(app);
    const customer = await createCustomer(app, token);
    for (const [amountReais, paymentMethod] of [
      [10, "pix"],
      [20, "card"],
      [5, "cash"],
    ] as const) {
      const sale = await app.inject({
        method: "POST",
        url: `/api/customers/${customer.id}/time/sale`,
        headers: authHeaders(token),
        payload: { amountReais, paymentMethod },
      });
      expect(sale.statusCode).toBe(200);
    }
    const metrics = await app.inject({
      method: "GET",
      url: "/api/admin/metrics",
      headers: authHeaders(token),
    });
    expect(metrics.statusCode).toBe(200);
    const payments = (metrics.json() as { today: { payments: { pix: number; card: number; cash: number } } }).today
      .payments;
    expect(payments.pix).toBe(10);
    expect(payments.card).toBe(20);
    expect(payments.cash).toBe(5);
    await app.close();
  });
});
