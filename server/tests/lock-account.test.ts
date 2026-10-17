import { describe, expect, it } from "vitest";
import { getDb } from "../src/db.js";
import { getActiveSessionForStation } from "../src/sessions.js";
import { purgeCustomersWithoutCredential } from "../src/lock-account.js";
import { addFaceEmbedding } from "../src/customers.js";
import {
  adminToken,
  authHeaders,
  claimStation,
  createCustomer,
  createTestApp,
  stationHeaders,
} from "./helpers.js";

describe("Conta no GeekLock", () => {
  it("cadastra com usuário e senha e recusa o mesmo usuário", async () => {
    const app = await createTestApp();
    const station = await claimStation(app, "PC-1");
    const res = await app.inject({
      method: "POST",
      url: "/api/lock/register",
      headers: stationHeaders(station.token),
      payload: { name: "Ana", username: "ana.1", password: "123456" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ code: "no_credit" });

    const again = await app.inject({
      method: "POST",
      url: "/api/lock/register",
      headers: stationHeaders(station.token),
      payload: { name: "Ana 2", username: "Ana.1", password: "123456" },
    });
    expect(again.statusCode).toBe(400);
    expect(String((again.json() as { error: string }).error)).toMatch(/já cadastrado/i);
    await app.close();
  });

  it("não abre a conta em um segundo PC", async () => {
    const app = await createTestApp();
    const admin = await adminToken(app);
    const a = await claimStation(app, "PC-A");
    const b = await claimStation(app, "PC-B");
    const created = await app.inject({
      method: "POST",
      url: "/api/lock/register",
      headers: stationHeaders(a.token),
      payload: { name: "Beto", username: "beto", password: "123456" },
    });
    const customerId = (created.json() as { customer: { id: string } }).customer.id;
    await app.inject({
      method: "POST",
      url: `/api/customers/${customerId}/time/adjust`,
      headers: authHeaders(admin),
      payload: { deltaSeconds: 3600, note: "teste" },
    });

    const first = await app.inject({
      method: "POST",
      url: "/api/lock/login",
      headers: stationHeaders(a.token),
      payload: { username: "beto", password: "123456" },
    });
    expect(first.statusCode).toBe(200);

    const second = await app.inject({
      method: "POST",
      url: "/api/lock/login",
      headers: stationHeaders(b.token),
      payload: { username: "beto", password: "123456" },
    });
    expect(second.statusCode).toBe(409);
    expect(second.json()).toMatchObject({ code: "already_in_use" });
    await app.close();
  });

  it("sem hora o PC continua livre para outra conta", async () => {
    const app = await createTestApp();
    const admin = await adminToken(app);
    const station = await claimStation(app, "PC-1");
    const semHora = await app.inject({
      method: "POST",
      url: "/api/lock/register",
      headers: stationHeaders(station.token),
      payload: { name: "Sem Hora", username: "semhora", password: "123456" },
    });
    const semId = (semHora.json() as { customer: { id: string } }).customer.id;

    const travado = await app.inject({
      method: "POST",
      url: "/api/lock/login",
      headers: stationHeaders(station.token),
      payload: { username: "semhora", password: "123456" },
    });
    expect(travado.statusCode).toBe(400);
    expect(travado.json()).toMatchObject({ code: "no_credit" });
    expect(getActiveSessionForStation(station.id)).toBeUndefined();

    const senhaErrada = await app.inject({
      method: "POST",
      url: "/api/lock/login",
      headers: stationHeaders(station.token),
      payload: { username: "semhora", password: "errada" },
    });
    expect(senhaErrada.statusCode).toBe(401);

    const outro = await app.inject({
      method: "POST",
      url: "/api/lock/register",
      headers: stationHeaders(station.token),
      payload: { name: "Com Hora", username: "comhora", password: "123456" },
    });
    const outroId = (outro.json() as { customer: { id: string } }).customer.id;
    await app.inject({
      method: "POST",
      url: `/api/customers/${outroId}/time/adjust`,
      headers: authHeaders(admin),
      payload: { deltaSeconds: 3600, note: "teste" },
    });
    const entrou = await app.inject({
      method: "POST",
      url: "/api/lock/login",
      headers: stationHeaders(station.token),
      payload: { username: "comhora", password: "123456" },
    });
    expect(entrou.statusCode).toBe(200);
    expect(getActiveSessionForStation(station.id)?.customer_id).toBe(outroId);
    expect(getActiveSessionForStation(station.id)?.customer_id).not.toBe(semId);
    await app.close();
  });

  it("apaga conta sem senha e sem face, e guarda quem tem senha, face ou sessão", async () => {
    const app = await createTestApp();
    const admin = await adminToken(app);
    const empty = await createCustomer(app, admin, "Vazio");
    const withPass = await app.inject({
      method: "POST",
      url: "/api/lock/register",
      headers: stationHeaders((await claimStation(app)).token),
      payload: { name: "Com senha", username: "senha", password: "123456" },
    });
    const passId = (withPass.json() as { customer: { id: string } }).customer.id;
    const faced = await createCustomer(app, admin, "Com face");
    addFaceEmbedding(faced.id, [0.1, 0.2, 0.3]);
    const playing = await createCustomer(app, admin, "Jogando");
    const station = await claimStation(app, "PC-jogo");
    await app.inject({
      method: "POST",
      url: `/api/customers/${playing.id}/time/adjust`,
      headers: authHeaders(admin),
      payload: { deltaSeconds: 600, note: "teste" },
    });
    await app.inject({
      method: "POST",
      url: "/api/sessions/start",
      headers: stationHeaders(station.token),
      payload: { customerId: playing.id },
    });

    const result = purgeCustomersWithoutCredential();
    expect(result.removed).toBe(1);
    expect(getDb().prepare("SELECT id FROM customers WHERE id = ?").get(empty.id)).toBeUndefined();
    expect(getDb().prepare("SELECT id FROM customers WHERE id = ?").get(passId)).toBeTruthy();
    expect(getDb().prepare("SELECT id FROM customers WHERE id = ?").get(faced.id)).toBeTruthy();
    expect(getDb().prepare("SELECT id FROM customers WHERE id = ?").get(playing.id)).toBeTruthy();
    expect(purgeCustomersWithoutCredential().skipped).toBe(true);
    await app.close();
  });

  it("o site não cria conta nova", async () => {
    const app = await createTestApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/portal/register",
      payload: { name: "X", email: "x@x.com", password: "123456", consent: true },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });
});
