import { describe, expect, it } from "vitest";
import {
  adminToken,
  authHeaders,
  claimStation,
  createCustomer,
  createTestApp,
  stationHeaders,
} from "./helpers.js";

describe("Estações", () => {
  it("claim com segredo correto cria estação e token", async () => {
    const app = await createTestApp();
    const station = await claimStation(app, "Balcao-1");
    expect(station.name).toBe("Balcao-1");
    expect(station.token).toBeTruthy();
    await app.close();
  });

  it("claim rejeita segredo inválido", async () => {
    const app = await createTestApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/stations/claim",
      payload: { name: "Fake", sharedSecret: "wrong" },
    });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it("pair-lan na LAN cria estação sem código", async () => {
    const app = await createTestApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/stations/pair-lan",
      headers: { host: "192.168.3.70" },
      payload: { name: "PC-LAN" },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { name: string; token: string };
    expect(body.name).toBe("PC-LAN");
    expect(body.token).toBeTruthy();
    await app.close();
  });

  it("pair-lan no painel (admin) bloqueia", async () => {
    const app = await createTestApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/stations/pair-lan",
      headers: { host: "admin.geekloja.com.br" },
      payload: { name: "PC-Casa" },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it("pair-lan via API pública cria estação", async () => {
    const app = await createTestApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/stations/pair-lan",
      headers: { host: "api.geekloja.com.br" },
      payload: { name: "PC-Nuvem" },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { name: string; token: string };
    expect(body.name).toBe("PC-Nuvem");
    expect(body.token).toBeTruthy();
    await app.close();
  });

  it("heartbeat guarda versão do Lock", async () => {
    const app = await createTestApp();
    const station = await claimStation(app);
    const hb = await app.inject({
      method: "POST",
      url: "/api/stations/heartbeat",
      payload: { token: station.token, lockVersion: "1.0.0" },
    });
    expect(hb.statusCode).toBe(200);
    const token = await adminToken(app);
    const list = await app.inject({
      method: "GET",
      url: "/api/stations",
      headers: authHeaders(token),
    });
    const body = list.json() as { stations: Array<{ id: string; lock_version?: string }> };
    const found = body.stations.find((s) => s.id === station.id);
    expect(found?.lock_version).toBe("1.0.0");
    await app.close();
  });

  it("admin cria estação via painel", async () => {
    const app = await createTestApp();
    const token = await adminToken(app);
    const res = await app.inject({
      method: "POST",
      url: "/api/stations",
      headers: authHeaders(token),
      payload: { name: "PC-02" },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { name: string; token: string };
    expect(body.name).toBe("PC-02");
    expect(body.token).toBeTruthy();
    await app.close();
  });

  it("heartbeat marca estação online", async () => {
    const app = await createTestApp();
    const station = await claimStation(app);
    const hb = await app.inject({
      method: "POST",
      url: "/api/stations/heartbeat",
      payload: { token: station.token },
    });
    expect(hb.statusCode).toBe(200);
    const token = await adminToken(app);
    const list = await app.inject({
      method: "GET",
      url: "/api/stations",
      headers: authHeaders(token),
    });
    const body = list.json() as { stations: Array<{ id: string; online: number }> };
    const found = body.stations.find((s) => s.id === station.id);
    expect(found?.online).toBe(1);
    await app.close();
  });

  it("reconhecer exige token de estação", async () => {
    const app = await createTestApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/recognize",
      payload: { imageBase64: "a".repeat(64) },
    });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});

describe("Sessões de máquina", () => {
  async function creditHours(app: Awaited<ReturnType<typeof createTestApp>>, admin: string, customerId: string) {
    const res = await app.inject({
      method: "POST",
      url: `/api/customers/${customerId}/time/adjust`,
      headers: authHeaders(admin),
      payload: { deltaSeconds: 3600, note: "crédito teste" },
    });
    expect(res.statusCode).toBe(200);
  }

  it("inicia e encerra sessão VIP", async () => {
    const app = await createTestApp();
    const admin = await adminToken(app);
    const customer = await createCustomer(app, admin);
    const station = await claimStation(app);
    await creditHours(app, admin, customer.id);

    const start = await app.inject({
      method: "POST",
      url: "/api/sessions/start",
      headers: stationHeaders(station.token),
      payload: { customerId: customer.id },
    });
    expect(start.statusCode).toBe(200);
    const started = start.json() as { session: { id: string; status: string } };
    expect(started.session.status).toBe("active");

    const end = await app.inject({
      method: "POST",
      url: "/api/sessions/end",
      headers: stationHeaders(station.token),
      payload: { sessionId: started.session.id },
    });
    expect(end.statusCode).toBe(200);
    const ended = end.json() as { session: { status: string } };
    expect(ended.session.status).toBe("closed");
    await app.close();
  });

  it("heartbeat atualiza sessão ativa", async () => {
    const app = await createTestApp();
    const admin = await adminToken(app);
    const customer = await createCustomer(app, admin);
    const station = await claimStation(app);
    await creditHours(app, admin, customer.id);

    const start = await app.inject({
      method: "POST",
      url: "/api/sessions/start",
      headers: stationHeaders(station.token),
      payload: { customerId: customer.id },
    });
    const { session } = start.json() as { session: { id: string } };

    const hb = await app.inject({
      method: "POST",
      url: "/api/sessions/heartbeat",
      headers: stationHeaders(station.token),
      payload: { sessionId: session.id },
    });
    expect(hb.statusCode).toBe(200);
    await app.close();
  });

  it("desk-liberar balance usa saldo sem venda", async () => {
    const app = await createTestApp();
    const admin = await adminToken(app);
    const customer = await createCustomer(app, admin);
    const station = await claimStation(app);
    await creditHours(app, admin, customer.id);

    const res = await app.inject({
      method: "POST",
      url: `/api/stations/${station.id}/desk-liberar`,
      headers: authHeaders(admin),
      payload: { mode: "balance", customerId: customer.id },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      mode: string;
      session?: { id: string };
      timeBalanceSeconds?: number;
    };
    expect(body.mode).toBe("balance");
    expect(body.session?.id).toBeTruthy();
    expect(Number(body.timeBalanceSeconds)).toBeGreaterThan(0);
    await app.close();
  });

  it("admin lista sessões e stats", async () => {
    const app = await createTestApp();
    const token = await adminToken(app);
    const res = await app.inject({
      method: "GET",
      url: "/api/sessions",
      headers: authHeaders(token),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { sessions: unknown[]; stats: { since: string } };
    expect(Array.isArray(body.sessions)).toBe(true);
    expect(body.stats.since).toBeTruthy();
    await app.close();
  });
});

describe("Configurações", () => {
  it("admin lê e atualiza settings", async () => {
    const app = await createTestApp();
    const token = await adminToken(app);
    const get = await app.inject({
      method: "GET",
      url: "/api/settings",
      headers: authHeaders(token),
    });
    expect(get.statusCode).toBe(200);

    const put = await app.inject({
      method: "PUT",
      url: "/api/settings",
      headers: authHeaders(token),
      payload: { pointsPerReal: 2, faceMatchThreshold: 0.5 },
    });
    expect(put.statusCode).toBe(200);
    const body = put.json() as { pointsPerReal: number; faceMatchThreshold: number };
    expect(body.pointsPerReal).toBe(2);
    expect(body.faceMatchThreshold).toBe(0.5);
    await app.close();
  });
});
