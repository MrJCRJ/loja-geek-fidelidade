import { describe, expect, it } from "vitest";
import { getTimeBalance } from "../src/billing.js";
import { expireDueConsoles, listConsoles } from "../src/consoles.js";
import { getDb } from "../src/db.js";
import { adminToken, authHeaders, createCustomer, createTestApp } from "./helpers.js";

describe("Consoles sem GeekLock", () => {
  it("lista os quatro consoles livres", async () => {
    const app = await createTestApp();
    const token = await adminToken(app);
    const res = await app.inject({
      method: "GET",
      url: "/api/consoles",
      headers: authHeaders(token),
    });
    expect(res.statusCode).toBe(200);
    const names = (res.json() as { consoles: Array<{ name: string; session: null }> }).consoles.map(
      (c) => c.name,
    );
    expect(names).toEqual(["PS4-1", "PS4-2", "Switch", "PS5"]);
    await app.close();
  });

  it("vende hora, devolve o que sobra ao encerrar e não devolve duas vezes", async () => {
    const app = await createTestApp();
    const token = await adminToken(app);
    const customer = await createCustomer(app, token, "Ana Console");
    const headers = authHeaders(token);

    const start = await app.inject({
      method: "POST",
      url: "/api/consoles/console_ps5/start",
      headers,
      payload: { mode: "sale", customerId: customer.id, hours: 1 },
    });
    expect(start.statusCode).toBe(200);
    expect(getTimeBalance(customer.id)).toBe(0);
    const body = start.json() as { amountReais: number; session: { remainingSeconds: number } };
    expect(body.amountReais).toBeGreaterThan(0);
    expect(body.session.remainingSeconds).toBeGreaterThan(3500);

    const end = await app.inject({
      method: "POST",
      url: "/api/consoles/console_ps5/end",
      headers,
    });
    expect(end.statusCode).toBe(200);
    expect((end.json() as { refundedSeconds: number }).refundedSeconds).toBe(0);
    expect(getTimeBalance(customer.id)).toBe(0);

    const again = await app.inject({
      method: "POST",
      url: "/api/consoles/console_ps5/end",
      headers,
    });
    expect(again.statusCode).toBe(200);
    expect(getTimeBalance(customer.id)).toBe(0);
    await app.close();
  });

  it("reduzir encurta o relógio e não guarda hora na conta", async () => {
    const app = await createTestApp();
    const token = await adminToken(app);
    const customer = await createCustomer(app, token, "Bia Console");
    const headers = authHeaders(token);
    await app.inject({
      method: "POST",
      url: "/api/consoles/console_switch/start",
      headers,
      payload: { mode: "sale", customerId: customer.id, hours: 1 },
    });
    const reduced = await app.inject({
      method: "POST",
      url: "/api/consoles/console_switch/reduce",
      headers,
      payload: { seconds: 600 },
    });
    expect(reduced.statusCode).toBe(200);
    const payload = reduced.json() as {
      closed: boolean;
      refundedSeconds: number;
      session: { remainingSeconds: number };
    };
    expect(payload.closed).toBe(false);
    expect(payload.refundedSeconds).toBe(0);
    expect(getTimeBalance(customer.id)).toBe(0);
    expect(payload.session.remainingSeconds).toBeLessThan(3100);
    expect(payload.session.remainingSeconds).toBeGreaterThan(2800);
    await app.close();
  });

  it("no zero marca expirado uma vez e não manda de novo", async () => {
    const app = await createTestApp();
    const token = await adminToken(app);
    const customer = await createCustomer(app, token, "Caio Console");
    const headers = authHeaders(token);
    await app.inject({
      method: "POST",
      url: "/api/consoles/console_ps4_1/start",
      headers,
      payload: { mode: "sale", customerId: customer.id, hours: 1 },
    });
    const past = new Date(Date.now() - 5000).toISOString();
    getDb()
      .prepare(
        `UPDATE console_sessions SET ends_at = ? WHERE console_id = 'console_ps4_1' AND status = 'active'`,
      )
      .run(past);

    expect(expireDueConsoles()).toBe(1);
    expect(expireDueConsoles()).toBe(0);
    const listed = listConsoles().find((c) => c.id === "console_ps4_1");
    expect(listed?.session?.status).toBe("expired");
    expect(getTimeBalance(customer.id)).toBe(0);

    const row = getDb()
      .prepare(
        `SELECT whatsapp_sent_at FROM console_sessions WHERE console_id = 'console_ps4_1' AND status = 'expired'`,
      )
      .get() as { whatsapp_sent_at: string };
    expect(row.whatsapp_sent_at).toBeTruthy();
    await app.close();
  });

  it("aberto encerra sem devolver hora", async () => {
    const app = await createTestApp();
    const token = await adminToken(app);
    const customer = await createCustomer(app, token, "Duda Console");
    const headers = authHeaders(token);
    const start = await app.inject({
      method: "POST",
      url: "/api/consoles/console_ps4_2/start",
      headers,
      payload: { mode: "open", customerName: "Duda Console" },
    });
    expect(start.statusCode).toBe(200);
    const end = await app.inject({
      method: "POST",
      url: "/api/consoles/console_ps4_2/end",
      headers,
    });
    expect((end.json() as { refundedSeconds: number }).refundedSeconds).toBe(0);
    expect(getTimeBalance(customer.id)).toBe(0);
    await app.close();
  });
});
