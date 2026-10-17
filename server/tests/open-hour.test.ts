import { describe, expect, it } from "vitest";
import { getDb } from "../src/db.js";
import { getTimeBalance } from "../src/billing.js";
import {
  adminToken,
  authHeaders,
  claimStation,
  createTestApp,
  stationHeaders,
} from "./helpers.js";

describe("Hora em aberto", () => {
  async function register(app: Awaited<ReturnType<typeof createTestApp>>, token: string, username: string) {
    const res = await app.inject({
      method: "POST",
      url: "/api/lock/register",
      headers: stationHeaders(token),
      payload: { name: username, username, password: "123456" },
    });
    return (res.json() as { customer: { id: string } }).customer.id;
  }

  it("pede no PC, a equipe libera e o saldo acaba antes da hora em aberto", async () => {
    const app = await createTestApp();
    const admin = await adminToken(app);
    const station = await claimStation(app, "PC-1");
    const customerId = await register(app, station.token, "fulano");
    await app.inject({
      method: "POST",
      url: `/api/customers/${customerId}/time/adjust`,
      headers: authHeaders(admin),
      payload: { deltaSeconds: 120, note: "saldo" },
    });

    const asked = await app.inject({
      method: "POST",
      url: "/api/lock/open-request",
      headers: stationHeaders(station.token),
      payload: { username: "fulano", password: "123456" },
    });
    expect(asked.statusCode).toBe(200);
    const listed = await app.inject({
      method: "GET",
      url: "/api/stations",
      headers: authHeaders(admin),
    });
    const body = listed.json() as { openRequests: Array<{ station_id: string; customer_name: string }> };
    expect(body.openRequests.some((r) => r.station_id === station.id && r.customer_name === "fulano")).toBe(true);

    const approved = await app.inject({
      method: "POST",
      url: `/api/stations/${station.id}/open-request/approve`,
      headers: authHeaders(admin),
    });
    expect(approved.statusCode).toBe(200);
    const sessionId = (approved.json() as { session: { id: string } }).session.id;
    const row = getDb()
      .prepare("SELECT open_after_balance, open_started_at FROM machine_sessions WHERE id = ?")
      .get(sessionId) as { open_after_balance: number; open_started_at: string | null };
    expect(row.open_after_balance).toBe(1);
    expect(row.open_started_at).toBeNull();
    expect(getTimeBalance(customerId)).toBe(120);
    await app.close();
  });

  it("sem saldo começa em aberto e avisa o valor ao encerrar", async () => {
    const app = await createTestApp();
    const admin = await adminToken(app);
    const station = await claimStation(app, "PC-2");
    const customerId = await register(app, station.token, "ciclano");
    await app.inject({
      method: "POST",
      url: "/api/lock/open-request",
      headers: stationHeaders(station.token),
      payload: { username: "ciclano", password: "123456" },
    });
    const approved = await app.inject({
      method: "POST",
      url: `/api/stations/${station.id}/open-request/approve`,
      headers: authHeaders(admin),
    });
    expect(approved.statusCode).toBe(200);
    expect((approved.json() as { openNow: boolean }).openNow).toBe(true);
    const sessionId = (approved.json() as { session: { id: string } }).session.id;
    getDb()
      .prepare("UPDATE machine_sessions SET last_seen_at = ? WHERE id = ?")
      .run(new Date(Date.now() - 90_000).toISOString(), sessionId);

    const end = await app.inject({
      method: "POST",
      url: "/api/sessions/end",
      headers: stationHeaders(station.token),
      payload: { sessionId },
    });
    expect(end.statusCode).toBe(200);
    const closed = end.json() as { session: { open_charge_reais: number; open_seconds: number } };
    expect(closed.session.open_seconds).toBeGreaterThanOrEqual(90);
    expect(closed.session.open_charge_reais).toBeCloseTo(0.25, 2);
    expect(getTimeBalance(customerId)).toBe(0);
    const ledger = getDb()
      .prepare("SELECT reason, amount_reais, delta_seconds FROM time_ledger WHERE customer_id = ?")
      .get(customerId) as { reason: string; amount_reais: number; delta_seconds: number };
    expect(ledger.reason).toBe("open_due");
    expect(ledger.delta_seconds).toBe(0);
    expect(ledger.amount_reais).toBeCloseTo(0.25, 2);
    const dueId = (
      getDb().prepare("SELECT id FROM time_ledger WHERE customer_id = ? AND reason = 'open_due'").get(customerId) as {
        id: string;
      }
    ).id;
    const pending = await app.inject({
      method: "GET",
      url: "/api/caixa/open-dues",
      headers: authHeaders(admin),
    });
    expect((pending.json() as { dues: Array<{ id: string }> }).dues.some((d) => d.id === dueId)).toBe(true);
    const paid = await app.inject({
      method: "POST",
      url: `/api/caixa/open-dues/${dueId}/pay`,
      headers: authHeaders(admin),
      payload: { paymentMethod: "pix" },
    });
    expect(paid.statusCode).toBe(200);
    expect((paid.json() as { paymentMethod: string }).paymentMethod).toBe("pix");
    const paidRow = getDb()
      .prepare("SELECT payment_method, paid_at FROM time_ledger WHERE id = ?")
      .get(dueId) as { payment_method: string; paid_at: string | null };
    expect(paidRow.payment_method).toBe("pix");
    expect(paidRow.paid_at).toBeTruthy();
    const again = await app.inject({
      method: "POST",
      url: `/api/caixa/open-dues/${dueId}/pay`,
      headers: authHeaders(admin),
      payload: { paymentMethod: "cash" },
    });
    expect(again.statusCode).toBe(400);
    const after = await app.inject({
      method: "GET",
      url: "/api/caixa/open-dues",
      headers: authHeaders(admin),
    });
    expect((after.json() as { dues: unknown[] }).dues).toEqual([]);
    expect(getTimeBalance(customerId)).toBe(0);
    await app.close();
  });

  it("recusar deixa o pedido fora da lista", async () => {
    const app = await createTestApp();
    const admin = await adminToken(app);
    const station = await claimStation(app, "PC-3");
    await register(app, station.token, "bela");
    await app.inject({
      method: "POST",
      url: "/api/lock/open-request",
      headers: stationHeaders(station.token),
      payload: { username: "bela", password: "123456" },
    });
    const rejected = await app.inject({
      method: "POST",
      url: `/api/stations/${station.id}/open-request/reject`,
      headers: authHeaders(admin),
    });
    expect(rejected.statusCode).toBe(200);
    const listed = await app.inject({
      method: "GET",
      url: "/api/stations",
      headers: authHeaders(admin),
    });
    const body = listed.json() as { openRequests: unknown[] };
    expect(body.openRequests).toEqual([]);
    await app.close();
  });
});
