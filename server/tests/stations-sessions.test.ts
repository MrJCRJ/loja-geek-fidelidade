import { describe, expect, it } from "vitest";
import { getTimeBalance } from "../src/billing.js";
import { getDb } from "../src/db.js";
import { getStaleSweepStats, sweepStaleSessions } from "../src/sessions.js";
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

  it("heartbeat guarda resolução e escala da tela", async () => {
    const app = await createTestApp();
    const station = await claimStation(app);
    const hb = await app.inject({
      method: "POST",
      url: "/api/stations/heartbeat",
      payload: {
        token: station.token,
        lockVersion: "1.1.16",
        health: { displayWidth: 1920, displayHeight: 1080, displayScalePct: 125 },
      },
    });
    expect(hb.statusCode).toBe(200);
    const token = await adminToken(app);
    const list = await app.inject({
      method: "GET",
      url: "/api/stations",
      headers: authHeaders(token),
    });
    const body = list.json() as {
      stations: Array<{
        id: string;
        display_width?: number;
        display_height?: number;
        display_scale_pct?: number;
      }>;
    };
    const found = body.stations.find((s) => s.id === station.id);
    expect(found?.display_width).toBe(1920);
    expect(found?.display_height).toBe(1080);
    expect(found?.display_scale_pct).toBe(125);
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

  it("sessão parada há 2 min não bloqueia outro PC", async () => {
    const app = await createTestApp();
    const admin = await adminToken(app);
    const customer = await createCustomer(app, admin);
    const pc1 = await claimStation(app, "PC-1");
    const pc2 = await claimStation(app, "PC-2");
    await creditHours(app, admin, customer.id);

    const start = await app.inject({
      method: "POST",
      url: "/api/sessions/start",
      headers: stationHeaders(pc1.token),
      payload: { customerId: customer.id },
    });
    const { session } = start.json() as { session: { id: string } };
    const recent = new Date(Date.now() - 30_000).toISOString();
    getDb().prepare("UPDATE machine_sessions SET last_seen_at = ? WHERE id = ?").run(recent, session.id);

    const blocked = await app.inject({
      method: "POST",
      url: "/api/sessions/start",
      headers: stationHeaders(pc2.token),
      payload: { customerId: customer.id },
    });
    expect(blocked.statusCode).toBe(409);

    const stale = new Date(Date.now() - 2 * 60_000 - 1000).toISOString();
    getDb().prepare("UPDATE machine_sessions SET last_seen_at = ? WHERE id = ?").run(stale, session.id);
    const moved = await app.inject({
      method: "POST",
      url: "/api/sessions/start",
      headers: stationHeaders(pc2.token),
      payload: { customerId: customer.id },
    });
    expect(moved.statusCode).toBe(200);
    const old = getDb().prepare("SELECT status FROM machine_sessions WHERE id = ?").get(session.id) as {
      status: string;
    };
    expect(old.status).toBe("closed");
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

  it("heartbeat de 60s cobra o minuto inteiro e não passa de 90s", async () => {
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
    const past = new Date(Date.now() - 60_000).toISOString();
    getDb().prepare("UPDATE machine_sessions SET last_seen_at = ? WHERE id = ?").run(past, session.id);

    const hb = await app.inject({
      method: "POST",
      url: "/api/sessions/heartbeat",
      headers: stationHeaders(station.token),
      payload: { sessionId: session.id },
    });
    expect(hb.statusCode).toBe(200);
    const minute = hb.json() as { session: { seconds_total: number } };
    expect(minute.session.seconds_total).toBeGreaterThanOrEqual(59);
    expect(minute.session.seconds_total).toBeLessThanOrEqual(62);

    const hole = new Date(Date.now() - 10 * 60_000).toISOString();
    getDb().prepare("UPDATE machine_sessions SET last_seen_at = ? WHERE id = ?").run(hole, session.id);
    const hb2 = await app.inject({
      method: "POST",
      url: "/api/sessions/heartbeat",
      headers: stationHeaders(station.token),
      payload: { sessionId: session.id },
    });
    const capped = hb2.json() as { session: { seconds_total: number } };
    expect(capped.session.seconds_total - minute.session.seconds_total).toBe(90);
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

  it("faxina fecha sessão morta sem cobrar gap", async () => {
    const app = await createTestApp();
    const admin = await adminToken(app);
    const customer = await createCustomer(app, admin);
    const station = await claimStation(app, "PC-Stale");
    await creditHours(app, admin, customer.id);

    const start = await app.inject({
      method: "POST",
      url: "/api/sessions/start",
      headers: stationHeaders(station.token),
      payload: { customerId: customer.id },
    });
    const { session } = start.json() as { session: { id: string } };
    const balanceBefore = getTimeBalance(customer.id);
    const stale = new Date(Date.now() - 2 * 60_000 - 2000).toISOString();
    getDb().prepare("UPDATE machine_sessions SET last_seen_at = ? WHERE id = ?").run(stale, session.id);

    const closed = sweepStaleSessions();
    expect(closed).toHaveLength(1);
    expect(closed[0]?.id).toBe(session.id);
    expect(closed[0]?.status).toBe("closed");
    expect(getTimeBalance(customer.id)).toBe(balanceBefore);
    expect(getStaleSweepStats().closedToday).toBeGreaterThanOrEqual(1);

    const row = getDb().prepare("SELECT status FROM machine_sessions WHERE id = ?").get(session.id) as {
      status: string;
    };
    expect(row.status).toBe("closed");
    await app.close();
  });

  it("Encerrar no Central fecha sessão no banco sem Lock", async () => {
    const app = await createTestApp();
    const admin = await adminToken(app);
    const customer = await createCustomer(app, admin);
    const station = await claimStation(app, "PC-Ghost");
    await creditHours(app, admin, customer.id);

    const start = await app.inject({
      method: "POST",
      url: "/api/sessions/start",
      headers: stationHeaders(station.token),
      payload: { customerId: customer.id },
    });
    const { session } = start.json() as { session: { id: string } };
    const balanceBefore = getTimeBalance(customer.id);
    const old = new Date(Date.now() - 10 * 60_000).toISOString();
    getDb().prepare("UPDATE machine_sessions SET last_seen_at = ? WHERE id = ?").run(old, session.id);

    const cmd = await app.inject({
      method: "POST",
      url: `/api/stations/${station.id}/command`,
      headers: authHeaders(admin),
      payload: { command: "end_session" },
    });
    expect(cmd.statusCode).toBe(200);

    const row = getDb().prepare("SELECT status FROM machine_sessions WHERE id = ?").get(session.id) as {
      status: string;
    };
    expect(row.status).toBe("closed");
    expect(getTimeBalance(customer.id)).toBe(balanceBefore);
    await app.close();
  });

  it("métricas marcam sessão PC sem sinal como stale", async () => {
    const app = await createTestApp();
    const admin = await adminToken(app);
    const customer = await createCustomer(app, admin);
    const station = await claimStation(app, "PC-Monitor");
    await creditHours(app, admin, customer.id);

    const start = await app.inject({
      method: "POST",
      url: "/api/sessions/start",
      headers: stationHeaders(station.token),
      payload: { customerId: customer.id },
    });
    const { session } = start.json() as { session: { id: string } };
    const stale = new Date(Date.now() - 3 * 60_000).toISOString();
    getDb().prepare("UPDATE machine_sessions SET last_seen_at = ? WHERE id = ?").run(stale, session.id);

    const metrics = await app.inject({
      method: "GET",
      url: "/api/admin/metrics",
      headers: authHeaders(admin),
    });
    expect(metrics.statusCode).toBe(200);
    const body = metrics.json() as {
      today: { staleSessions: number; staleAfterSeconds: number };
      activeNow: Array<{ id: string; stale?: boolean; status: string; kind: string }>;
    };
    expect(body.today.staleAfterSeconds).toBe(120);
    const pc = body.activeNow.find((s) => s.id === session.id);
    expect(pc?.kind).toBe("pc");
    expect(pc?.stale).toBe(true);
    expect(pc?.status).toBe("stale");
    expect(body.today.staleSessions).toBeGreaterThanOrEqual(1);
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
