import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  adminToken,
  authHeaders,
  claimStation,
  createCustomer,
  createTestApp,
  stationHeaders,
} from "./helpers.js";
import { addFaceEmbedding } from "../src/customers.js";

vi.mock("../src/face-client.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/face-client.js")>();
  return {
    ...actual,
    faceHealth: vi.fn(async () => true),
    extractEmbedding: vi.fn(),
    matchEmbedding: vi.fn(),
  };
});

import { extractEmbedding, matchEmbedding } from "../src/face-client.js";

const mockExtract = vi.mocked(extractEmbedding);
const mockMatch = vi.mocked(matchEmbedding);

describe("POST /api/recognize diagnóstico", () => {
  beforeEach(() => {
    mockExtract.mockReset();
    mockMatch.mockReset();
  });

  it("devolve reason no_face + tip quando embed falha", async () => {
    mockExtract.mockResolvedValue({
      ok: false,
      error: "Nenhum rosto detectado",
      code: "no_face",
    });

    const app = await createTestApp();
    const station = await claimStation(app);
    const res = await app.inject({
      method: "POST",
      url: "/api/recognize",
      headers: stationHeaders(station.token),
      payload: { imageBase64: "a".repeat(64) },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { matched: boolean; reason: string; tip: string };
    expect(body.matched).toBe(false);
    expect(body.reason).toBe("no_face");
    expect(body.tip).toMatch(/rosto/i);
    await app.close();
  });

  it("devolve reason low_quality para face_blurry", async () => {
    mockExtract.mockResolvedValue({
      ok: false,
      error: "Imagem borrada",
      code: "face_blurry",
    });

    const app = await createTestApp();
    const station = await claimStation(app);
    const res = await app.inject({
      method: "POST",
      url: "/api/recognize",
      headers: stationHeaders(station.token),
      payload: { imageBase64: "a".repeat(64) },
    });
    const body = res.json() as { matched: boolean; reason: string; tip: string; code: string };
    expect(body.matched).toBe(false);
    expect(body.reason).toBe("low_quality");
    expect(body.code).toBe("face_blurry");
    expect(body.tip).toMatch(/borrad/i);
    await app.close();
  });

  it("devolve bestScore + reason unknown quando gallery existe mas não casa", async () => {
    const app = await createTestApp();
    const admin = await adminToken(app);
    const customer = await createCustomer(app, admin);
    addFaceEmbedding(customer.id, Array.from({ length: 8 }, (_, i) => i * 0.1));

    mockExtract.mockResolvedValue({
      ok: true,
      embedding: Array.from({ length: 8 }, () => 0.5),
      quality: 0.7,
    });
    mockMatch.mockResolvedValue({
      ok: true,
      match: null,
      best_score: 0.32,
      best_customer_id: customer.id,
      reason: "below_threshold",
    });

    const station = await claimStation(app);
    const res = await app.inject({
      method: "POST",
      url: "/api/recognize",
      headers: stationHeaders(station.token),
      payload: { imageBase64: "a".repeat(64) },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      matched: boolean;
      reason: string;
      bestScore: number;
      bestCustomerId: string;
      tip: string;
    };
    expect(body.matched).toBe(false);
    expect(body.reason).toBe("unknown");
    expect(body.bestScore).toBe(0.32);
    expect(body.bestCustomerId).toBe(customer.id);
    expect(body.tip).toMatch(/Score baixo/i);
    await app.close();
  });

  it("devolve no_gallery quando não há amostras", async () => {
    mockExtract.mockResolvedValue({
      ok: true,
      embedding: [0.1, 0.2, 0.3],
      quality: 0.8,
    });

    const app = await createTestApp();
    const station = await claimStation(app);
    const res = await app.inject({
      method: "POST",
      url: "/api/recognize",
      headers: stationHeaders(station.token),
      payload: { imageBase64: "a".repeat(64) },
    });
    const body = res.json() as { matched: boolean; reason: string; tip: string };
    expect(body.matched).toBe(false);
    expect(body.reason).toBe("no_gallery");
    expect(body.tip).toMatch(/enroll/i);
    await app.close();
  });
});

describe("POST /api/customers/:id/enroll qualidade", () => {
  beforeEach(() => {
    mockExtract.mockReset();
  });

  it("propaga tip em 400 quando sem rosto", async () => {
    mockExtract.mockResolvedValue({
      ok: false,
      error: "Nenhum rosto detectado",
      code: "no_face",
    });

    const app = await createTestApp();
    const admin = await adminToken(app);
    const customer = await createCustomer(app, admin);
    const res = await app.inject({
      method: "POST",
      url: `/api/customers/${customer.id}/enroll`,
      headers: authHeaders(admin),
      payload: { imageBase64: "a".repeat(64) },
    });
    expect(res.statusCode).toBe(400);
    const body = res.json() as { error: string; tip: string; code: string };
    expect(body.code).toBe("no_face");
    expect(body.tip).toBeTruthy();
    await app.close();
  });
});
