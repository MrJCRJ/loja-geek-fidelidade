import { describe, expect, it } from "vitest";
import { adminToken, authHeaders, createCustomer, createTestApp } from "./helpers.js";

describe("GeekCentral admin ops", () => {
  it("readiness + settings com unidade", async () => {
    const app = await createTestApp();
    const token = await adminToken(app);
    const ready = await app.inject({
      method: "GET",
      url: "/api/admin/readiness",
      headers: authHeaders(token),
    });
    expect(ready.statusCode).toBe(200);
    const body = ready.json() as { secretsOk: boolean; checklist: unknown[]; unit: { unitName: string } };
    expect(body.secretsOk).toBe(true);
    expect(Array.isArray(body.checklist)).toBe(true);

    const put = await app.inject({
      method: "PUT",
      url: "/api/settings",
      headers: authHeaders(token),
      payload: { unitName: "Geeks Centro", unitId: "centro-1", faceMatchThreshold: 0.4 },
    });
    expect(put.statusCode).toBe(200);
    const settings = put.json() as { unitName: string; unitId: string };
    expect(settings.unitName).toBe("Geeks Centro");
    expect(settings.unitId).toBe("centro-1");
    await app.close();
  });

  it("backup SQLite e export LGPD", async () => {
    const app = await createTestApp();
    const token = await adminToken(app);
    const customer = await createCustomer(app, token, "LGPD User");

    const backup = await app.inject({
      method: "POST",
      url: "/api/admin/backup",
      headers: authHeaders(token),
    });
    expect(backup.statusCode).toBe(200);
    const b = backup.json() as { ok: boolean; fileName: string };
    expect(b.ok).toBe(true);
    expect(b.fileName).toMatch(/\.db$/);

    const list = await app.inject({
      method: "GET",
      url: "/api/admin/backups",
      headers: authHeaders(token),
    });
    expect(list.statusCode).toBe(200);
    expect((list.json() as { backups: unknown[] }).backups.length).toBeGreaterThan(0);

    const exp = await app.inject({
      method: "GET",
      url: `/api/customers/${customer.id}/export`,
      headers: authHeaders(token),
    });
    expect(exp.statusCode).toBe(200);
    const data = exp.json() as { customer: { name: string }; biometrics: { sampleCount: number } };
    expect(data.customer.name).toBe("LGPD User");
    expect(data.biometrics.sampleCount).toBe(0);
    await app.close();
  });
});
