import { describe, expect, it } from "vitest";
import { adminToken, authHeaders, createCustomer, createTestApp } from "./helpers.js";

describe("Clientes VIP", () => {
  it("cria cliente com consentimento LGPD", async () => {
    const app = await createTestApp();
    const token = await adminToken(app);
    const customer = await createCustomer(app, token, "João VIP");
    expect(customer.name).toBe("João VIP");
    expect(customer.points).toBe(0);
    await app.close();
  });

  it("rejeita cadastro sem consentimento", async () => {
    const app = await createTestApp();
    const token = await adminToken(app);
    const res = await app.inject({
      method: "POST",
      url: "/api/customers",
      headers: authHeaders(token),
      payload: { name: "Sem Consent", consent: false },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it("lista clientes cadastrados", async () => {
    const app = await createTestApp();
    const token = await adminToken(app);
    await createCustomer(app, token, "Maria VIP");
    const res = await app.inject({
      method: "GET",
      url: "/api/customers",
      headers: authHeaders(token),
    });
    expect(res.statusCode).toBe(200);
    const list = res.json() as Array<{ name: string }>;
    expect(list.some((c) => c.name === "Maria VIP")).toBe(true);
    await app.close();
  });

  it("atualiza cliente existente", async () => {
    const app = await createTestApp();
    const token = await adminToken(app);
    const customer = await createCustomer(app, token, "Pedro");
    const res = await app.inject({
      method: "PATCH",
      url: `/api/customers/${customer.id}`,
      headers: authHeaders(token),
      payload: { level: "ouro", notes: "Cliente frequente" },
    });
    expect(res.statusCode).toBe(200);
    const updated = res.json() as { level: string; notes: string };
    expect(updated.level).toBe("ouro");
    expect(updated.notes).toBe("Cliente frequente");
    await app.close();
  });

  it("exclui cliente", async () => {
    const app = await createTestApp();
    const token = await adminToken(app);
    const customer = await createCustomer(app, token);
    const del = await app.inject({
      method: "DELETE",
      url: `/api/customers/${customer.id}`,
      headers: authHeaders(token),
    });
    expect(del.statusCode).toBe(200);
    const get = await app.inject({
      method: "GET",
      url: `/api/customers/${customer.id}`,
      headers: authHeaders(token),
    });
    expect(get.statusCode).toBe(404);
    await app.close();
  });
});
