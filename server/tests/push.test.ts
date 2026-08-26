import { describe, expect, it } from "vitest";
import webpush from "web-push";
import { createTestApp } from "./helpers.js";

describe("Web push portal", () => {
  it("GET vapid-public-key: 503 sem chaves; 200 com VAPID", async () => {
    delete process.env.VAPID_PUBLIC_KEY;
    delete process.env.VAPID_PRIVATE_KEY;
    const appOff = await createTestApp();
    const denied = await appOff.inject({ method: "GET", url: "/api/portal/push/vapid-public-key" });
    expect(denied.statusCode).toBe(503);
    await appOff.close();

    const keys = webpush.generateVAPIDKeys();
    process.env.VAPID_PUBLIC_KEY = keys.publicKey;
    process.env.VAPID_PRIVATE_KEY = keys.privateKey;
    process.env.VAPID_SUBJECT = "mailto:test@localhost";

    const appOn = await createTestApp();
    const ok = await appOn.inject({ method: "GET", url: "/api/portal/push/vapid-public-key" });
    expect(ok.statusCode).toBe(200);
    const body = ok.json() as { publicKey: string; enabled: boolean };
    expect(body.enabled).toBe(true);
    expect(body.publicKey).toBe(keys.publicKey);
    await appOn.close();

    delete process.env.VAPID_PUBLIC_KEY;
    delete process.env.VAPID_PRIVATE_KEY;
  });
});
