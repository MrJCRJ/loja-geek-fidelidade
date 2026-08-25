import { beforeEach, describe, expect, it, vi } from "vitest";
import { adminToken, authHeaders, createTestApp } from "./helpers.js";

vi.mock("../src/face-client.js", () => ({
  faceHealth: vi.fn(async () => true),
  extractEmbedding: vi.fn(),
  matchEmbedding: vi.fn(),
}));

import { extractEmbedding } from "../src/face-client.js";

const mockExtract = vi.mocked(extractEmbedding);

describe("POST /api/face/preview", () => {
  beforeEach(() => {
    mockExtract.mockReset();
  });

  it("requer admin", async () => {
    const app = await createTestApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/face/preview",
      payload: { imageBase64: "a".repeat(64) },
    });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it("devolve ok:false quando sem rosto", async () => {
    mockExtract.mockResolvedValue({
      ok: false,
      error: "Nenhum rosto detectado",
      code: "no_face",
    });

    const app = await createTestApp();
    const admin = await adminToken(app);
    const res = await app.inject({
      method: "POST",
      url: "/api/face/preview",
      headers: authHeaders(admin),
      payload: { imageBase64: "a".repeat(64) },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { ok: boolean; code: string; tip: string };
    expect(body.ok).toBe(false);
    expect(body.code).toBe("no_face");
    expect(body.tip).toMatch(/rosto/i);
    await app.close();
  });

  it("devolve ok:true quando qualidade suficiente", async () => {
    mockExtract.mockResolvedValue({
      ok: true,
      embedding: [0.1, 0.2],
      quality: 0.72,
      blur: 80,
      face_ratio: 0.15,
      rotation_used: 0,
    });

    const app = await createTestApp();
    const admin = await adminToken(app);
    const res = await app.inject({
      method: "POST",
      url: "/api/face/preview",
      headers: authHeaders(admin),
      payload: { imageBase64: "a".repeat(64) },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { ok: boolean; code: string; quality: number };
    expect(body.ok).toBe(true);
    expect(body.code).toBe("ready");
    expect(body.quality).toBe(0.72);
    await app.close();
  });

  it("devolve ok:false para qualidade baixa", async () => {
    mockExtract.mockResolvedValue({
      ok: true,
      embedding: [0.1, 0.2],
      quality: 0.12,
      blur: 20,
    });

    const app = await createTestApp();
    const admin = await adminToken(app);
    const res = await app.inject({
      method: "POST",
      url: "/api/face/preview",
      headers: authHeaders(admin),
      payload: { imageBase64: "a".repeat(64) },
    });
    const body = res.json() as { ok: boolean; code: string };
    expect(body.ok).toBe(false);
    expect(body.code).toBe("low_quality");
    await app.close();
  });
});
