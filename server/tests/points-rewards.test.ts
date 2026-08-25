import { describe, expect, it } from "vitest";
import {
  adminToken,
  authHeaders,
  claimStation,
  createCustomer,
  createTestApp,
  stationHeaders,
} from "./helpers.js";

describe("Pontos e ledger", () => {
  it("credita pontos por valor em reais", async () => {
    const app = await createTestApp();
    const token = await adminToken(app);
    const customer = await createCustomer(app, token);
    const res = await app.inject({
      method: "POST",
      url: `/api/customers/${customer.id}/points`,
      headers: authHeaders(token),
      payload: { amountReais: 50, reason: "Compra teste" },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { customer: { points: number } };
    expect(body.customer.points).toBe(50);
    await app.close();
  });

  it("bloqueia saldo negativo", async () => {
    const app = await createTestApp();
    const token = await adminToken(app);
    const customer = await createCustomer(app, token);
    const res = await app.inject({
      method: "POST",
      url: `/api/customers/${customer.id}/points`,
      headers: authHeaders(token),
      payload: { delta: -10 },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it("registra movimentação no ledger", async () => {
    const app = await createTestApp();
    const token = await adminToken(app);
    const customer = await createCustomer(app, token);
    await app.inject({
      method: "POST",
      url: `/api/customers/${customer.id}/points`,
      headers: authHeaders(token),
      payload: { delta: 25, reason: "Bônus" },
    });
    const res = await app.inject({
      method: "GET",
      url: `/api/customers/${customer.id}/ledger`,
      headers: authHeaders(token),
    });
    expect(res.statusCode).toBe(200);
    const ledger = res.json() as Array<{ delta: number; reason: string }>;
    expect(ledger.length).toBeGreaterThan(0);
    expect(ledger[0].delta).toBe(25);
    await app.close();
  });

  it("estação pode creditar pontos com token", async () => {
    const app = await createTestApp();
    const admin = await adminToken(app);
    const customer = await createCustomer(app, admin);
    const station = await claimStation(app);
    const res = await app.inject({
      method: "POST",
      url: `/api/customers/${customer.id}/points`,
      headers: stationHeaders(station.token),
      payload: { amountReais: 10 },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { customer: { points: number } };
    expect(body.customer.points).toBe(10);
    await app.close();
  });
});

describe("Recompensas", () => {
  it("lista recompensas seed", async () => {
    const app = await createTestApp();
    const res = await app.inject({ method: "GET", url: "/api/rewards" });
    expect(res.statusCode).toBe(200);
    const rewards = res.json() as Array<{ title: string }>;
    expect(rewards.length).toBeGreaterThanOrEqual(3);
    await app.close();
  });

  it("resgata recompensa com pontos suficientes", async () => {
    const app = await createTestApp();
    const token = await adminToken(app);
    const customer = await createCustomer(app, token);
    await app.inject({
      method: "POST",
      url: `/api/customers/${customer.id}/points`,
      headers: authHeaders(token),
      payload: { delta: 100 },
    });
    const res = await app.inject({
      method: "POST",
      url: `/api/customers/${customer.id}/redeem`,
      headers: authHeaders(token),
      payload: { rewardId: "rw_pin" },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { customer: { points: number } };
    expect(body.customer.points).toBe(50);
    await app.close();
  });

  it("rejeita resgate sem pontos", async () => {
    const app = await createTestApp();
    const token = await adminToken(app);
    const customer = await createCustomer(app, token);
    const res = await app.inject({
      method: "POST",
      url: `/api/customers/${customer.id}/redeem`,
      headers: authHeaders(token),
      payload: { rewardId: "rw_pin" },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});
