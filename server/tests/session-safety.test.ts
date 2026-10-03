import { describe, expect, it } from "vitest";
import { clampStaffUnlockSeconds } from "../src/session-safety.js";
import {
  adminToken,
  authHeaders,
  claimStation,
  createCustomer,
  createTestApp,
  stationHeaders,
} from "./helpers.js";

describe("Segurança de sessão (teorias produção)", () => {
  async function creditHours(
    app: Awaited<ReturnType<typeof createTestApp>>,
    admin: string,
    customerId: string,
    seconds = 3600,
  ) {
    const res = await app.inject({
      method: "POST",
      url: `/api/customers/${customerId}/time/adjust`,
      headers: authHeaders(admin),
      payload: { deltaSeconds: seconds, note: "crédito teste" },
    });
    expect(res.statusCode).toBe(200);
  }

  async function startVip(
    app: Awaited<ReturnType<typeof createTestApp>>,
    admin: string,
  ) {
    const customer = await createCustomer(app, admin);
    const station = await claimStation(app);
    await creditHours(app, admin, customer.id, 600);
    const start = await app.inject({
      method: "POST",
      url: "/api/sessions/start",
      headers: stationHeaders(station.token),
      payload: { customerId: customer.id },
    });
    expect(start.statusCode).toBe(200);
    const body = start.json() as { session: { id: string; customer_id: string } };
    return { customer, station, sessionId: body.session.id };
  }

  it("pauseBilling não consome saldo e não acumula gap (T10)", async () => {
    const app = await createTestApp();
    const admin = await adminToken(app);
    const { station, sessionId, customer } = await startVip(app, admin);

    const before = await app.inject({
      method: "GET",
      url: `/api/customers/${customer.id}`,
      headers: authHeaders(admin),
    });
    const balBefore = (before.json() as { time_balance_seconds: number }).time_balance_seconds;

    await new Promise((r) => setTimeout(r, 1100));

    const paused = await app.inject({
      method: "POST",
      url: "/api/sessions/heartbeat",
      headers: stationHeaders(station.token),
      payload: { sessionId, pauseBilling: true },
    });
    expect(paused.statusCode).toBe(200);
    const pausedBody = paused.json() as {
      billingPaused: boolean;
      session: { time_balance_seconds: number; seconds_total: number };
    };
    expect(pausedBody.billingPaused).toBe(true);
    expect(pausedBody.session.time_balance_seconds).toBe(balBefore);

    await new Promise((r) => setTimeout(r, 1100));

    const resume = await app.inject({
      method: "POST",
      url: "/api/sessions/heartbeat",
      headers: stationHeaders(station.token),
      payload: { sessionId, pauseBilling: false },
    });
    expect(resume.statusCode).toBe(200);
    const resumeBody = resume.json() as {
      billingPaused: boolean;
      session: { time_balance_seconds: number };
    };
    expect(resumeBody.billingPaused).toBe(false);
    // Só o intervalo pós-resume (~1s), não os ~2s de ausência.
    const consumed = balBefore - resumeBody.session.time_balance_seconds;
    expect(consumed).toBeLessThan(3);
    expect(consumed).toBeGreaterThanOrEqual(0);

    await app.close();
  });

  it("heartbeat sinaliza lowBalanceWarn perto do fim (T8)", async () => {
    const app = await createTestApp();
    const admin = await adminToken(app);

    await app.inject({
      method: "PUT",
      url: "/api/settings",
      headers: authHeaders(admin),
      payload: { lowBalanceWarnSeconds: 300 },
    });

    const customer = await createCustomer(app, admin);
    const station = await claimStation(app);
    await creditHours(app, admin, customer.id, 120);

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
    const body = hb.json() as { lowBalanceWarn: boolean; timeBalanceSeconds: number };
    expect(body.lowBalanceWarn).toBe(true);
    expect(body.timeBalanceSeconds).toBeLessThanOrEqual(120);

    await app.close();
  });

  it("settings expõe campos de segurança de sessão", async () => {
    const app = await createTestApp();
    const admin = await adminToken(app);
    const put = await app.inject({
      method: "PUT",
      url: "/api/settings",
      headers: authHeaders(admin),
      payload: {
        lowBalanceWarnSeconds: 180,
        staffUnlockMaxSeconds: 300,
        presenceMinFaceRatio: 0.15,
      },
    });
    expect(put.statusCode).toBe(200);
    const body = put.json() as {
      lowBalanceWarnSeconds: number;
      staffUnlockMaxSeconds: number;
      presenceMinFaceRatio: number;
    };
    expect(body.lowBalanceWarnSeconds).toBe(180);
    expect(body.staffUnlockMaxSeconds).toBe(300);
    expect(body.presenceMinFaceRatio).toBe(0.15);
    await app.close();
  });

  it("liberar sem conta fica entre 5 min e 23h59", () => {
    expect(clampStaffUnlockSeconds(2 * 60)).toBe(5 * 60);
    expect(clampStaffUnlockSeconds(5 * 60)).toBe(5 * 60);
    expect(clampStaffUnlockSeconds(30 * 60)).toBe(30 * 60);
    expect(clampStaffUnlockSeconds(24 * 3600)).toBe(23 * 3600 + 59 * 60);
  });
});
