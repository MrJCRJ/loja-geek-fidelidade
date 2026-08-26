import { describe, expect, it } from "vitest";
import { adminToken, authHeaders, createTestApp } from "./helpers.js";

describe("Multi-Central", () => {
  it("settings e catalog expõem centrals / peers", async () => {
    const app = await createTestApp();
    const token = await adminToken(app);

    const put = await app.inject({
      method: "PUT",
      url: "/api/settings",
      headers: authHeaders(token),
      payload: {
        unitId: "lan-pa",
        unitName: "Lan Paulo Afonso",
        publicApiUrl: "https://lan-pa.example.com",
        peerCentrals: [
          {
            unitId: "lan-2",
            unitName: "Lan 2",
            publicApiUrl: "https://lan-2.example.com",
          },
        ],
      },
    });
    expect(put.statusCode).toBe(200);
    const settings = put.json() as {
      publicApiUrl: string;
      peerCentrals: Array<{ unitId: string }>;
    };
    expect(settings.publicApiUrl).toBe("https://lan-pa.example.com");
    expect(settings.peerCentrals).toHaveLength(1);
    expect(settings.peerCentrals[0].unitId).toBe("lan-2");

    const catalog = await app.inject({ method: "GET", url: "/api/portal/catalog" });
    expect(catalog.statusCode).toBe(200);
    const body = catalog.json() as {
      centrals: Array<{ unitId: string; self?: boolean; publicApiUrl: string }>;
    };
    expect(body.centrals.length).toBeGreaterThanOrEqual(2);
    const self = body.centrals.find((c) => c.self);
    expect(self?.unitId).toBe("lan-pa");
    expect(self?.publicApiUrl).toBe("https://lan-pa.example.com");
    expect(body.centrals.some((c) => c.unitId === "lan-2")).toBe(true);

    await app.close();
  });

  it("rejeita peer sem URL http(s)", async () => {
    const app = await createTestApp();
    const token = await adminToken(app);
    const put = await app.inject({
      method: "PUT",
      url: "/api/settings",
      headers: authHeaders(token),
      payload: {
        peerCentrals: [{ unitId: "x", unitName: "X", publicApiUrl: "notaurl" }],
      },
    });
    expect(put.statusCode).toBe(400);
    await app.close();
  });
});
