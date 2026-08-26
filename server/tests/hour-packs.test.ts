import { describe, expect, it } from "vitest";
import { adminToken, authHeaders, createTestApp } from "./helpers.js";

describe("Pacotes de horas (portal)", () => {
  it("salva hourPacks em settings e aparece no catálogo", async () => {
    const app = await createTestApp();
    const token = await adminToken(app);

    const put = await app.inject({
      method: "PUT",
      url: "/api/settings",
      headers: authHeaders(token),
      payload: {
        hourPacks: [
          { amountReais: 15, label: "Promo 15" },
          { amountReais: 40, label: "Combo 40" },
        ],
      },
    });
    expect(put.statusCode).toBe(200);
    const settings = put.json() as { hourPacks: Array<{ amountReais: number; label: string }> };
    expect(settings.hourPacks).toHaveLength(2);
    expect(settings.hourPacks[0].label).toBe("Promo 15");

    const catalog = await app.inject({ method: "GET", url: "/api/portal/catalog" });
    expect(catalog.statusCode).toBe(200);
    const body = catalog.json() as { hourPacks: Array<{ amountReais: number; label: string }> };
    expect(body.hourPacks.some((p) => p.amountReais === 15 && p.label === "Promo 15")).toBe(true);

    await app.close();
  });
});
