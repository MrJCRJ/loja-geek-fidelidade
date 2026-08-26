import { describe, expect, it } from "vitest";
import { adminToken, authHeaders, createCustomer, createTestApp } from "./helpers.js";
import { getDb } from "../src/db.js";
import { addFaceEmbedding } from "../src/customers.js";
import { pruneRecognitionEvents } from "../src/lgpd.js";

describe("LGPD retenção fina", () => {
  it("revoga biometria mantendo a conta", async () => {
    const app = await createTestApp();
    const token = await adminToken(app);
    const customer = await createCustomer(app, token, "LGPD Face");
    addFaceEmbedding(customer.id, Array.from({ length: 128 }, (_, i) => i * 0.01));

    const before = await app.inject({
      method: "GET",
      url: `/api/customers/${customer.id}`,
      headers: authHeaders(token),
    });
    expect(before.statusCode).toBe(200);
    expect((before.json() as { face_samples: number; consent_at: string }).face_samples).toBe(1);
    expect((before.json() as { consent_at: string }).consent_at).toBeTruthy();

    const res = await app.inject({
      method: "POST",
      url: `/api/customers/${customer.id}/lgpd/revoke-biometrics`,
      headers: authHeaders(token),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      ok: boolean;
      removed: number;
      customer: { face_samples: number; consent_at: string | null; points: number };
    };
    expect(body.ok).toBe(true);
    expect(body.removed).toBe(1);
    expect(body.customer.face_samples).toBe(0);
    expect(body.customer.consent_at).toBeNull();
    expect(body.customer.points).toBe(0);

    await app.close();
  });

  it("purge remove recognition_events antigos", async () => {
    const app = await createTestApp();
    const token = await adminToken(app);
    const customer = await createCustomer(app, token, "Evento Velho");
    const db = getDb();
    db.prepare(
      `INSERT INTO recognition_events (id, customer_id, station_id, score, status, created_at)
       VALUES (?, ?, NULL, 0.9, 'match', ?)`,
    ).run("ev_old", customer.id, "2020-01-01T00:00:00.000Z");
    db.prepare(
      `INSERT INTO recognition_events (id, customer_id, station_id, score, status, created_at)
       VALUES (?, ?, NULL, 0.8, 'match', ?)`,
    ).run("ev_new", customer.id, new Date().toISOString());

    const pruned = pruneRecognitionEvents(30);
    expect(pruned.deleted).toBeGreaterThanOrEqual(1);

    const left = db
      .prepare("SELECT id FROM recognition_events WHERE customer_id = ?")
      .all(customer.id) as Array<{ id: string }>;
    expect(left.some((r) => r.id === "ev_old")).toBe(false);
    expect(left.some((r) => r.id === "ev_new")).toBe(true);

    const apiPrune = await app.inject({
      method: "POST",
      url: "/api/admin/lgpd/prune-recognition",
      headers: authHeaders(token),
      payload: { keepDays: 30 },
    });
    expect(apiPrune.statusCode).toBe(200);

    await app.close();
  });

  it("settings expõe recognitionEventsKeepDays", async () => {
    const app = await createTestApp();
    const token = await adminToken(app);
    const put = await app.inject({
      method: "PUT",
      url: "/api/settings",
      headers: authHeaders(token),
      payload: { recognitionEventsKeepDays: 45 },
    });
    expect(put.statusCode).toBe(200);
    expect((put.json() as { recognitionEventsKeepDays: number }).recognitionEventsKeepDays).toBe(45);
    await app.close();
  });
});
