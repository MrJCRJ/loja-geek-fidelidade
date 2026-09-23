import { describe, expect, it } from "vitest";
import { HOME_HOST } from "../src/request-scope.js";
import { createStaffUser, hasNamedOwner } from "../src/staff-users.js";
import { TEST_ADMIN_PASSWORD, adminToken, authHeaders, createTestApp } from "./helpers.js";

describe("Contas da equipe + controle só na LAN", () => {
  it("senha compartilhada funciona até existir dono; depois exige usuário", async () => {
    const app = await createTestApp();
    expect(hasNamedOwner()).toBe(false);

    const boot = await app.inject({
      method: "POST",
      url: "/api/admin/login",
      payload: { password: TEST_ADMIN_PASSWORD },
    });
    expect(boot.statusCode).toBe(200);
    const bootBody = boot.json() as { token: string; needsBootstrap: boolean; role: string };
    expect(bootBody.role).toBe("admin");
    expect(bootBody.needsBootstrap).toBe(true);

    const created = await app.inject({
      method: "POST",
      url: "/api/admin/bootstrap-owner",
      headers: authHeaders(bootBody.token),
      payload: { username: "dono", password: "senha-dona-1", displayName: "Dono Loja" },
    });
    expect(created.statusCode).toBe(200);
    const owner = created.json() as { token: string; username: string };
    expect(owner.username).toBe("dono");
    expect(hasNamedOwner()).toBe(true);

    const oldPass = await app.inject({
      method: "POST",
      url: "/api/admin/login",
      payload: { password: TEST_ADMIN_PASSWORD },
    });
    expect(oldPass.statusCode).toBe(400);

    const named = await app.inject({
      method: "POST",
      url: "/api/admin/login",
      payload: { username: "dono", password: "senha-dona-1" },
    });
    expect(named.statusCode).toBe(200);

    await app.close();
  });

  it("admin.geekloja.com.br libera controle; host desconhecido esconde /api/admin e bloqueia comando", async () => {
    const app = await createTestApp();
    const bootToken = await adminToken(app);
    await app.inject({
      method: "POST",
      url: "/api/admin/bootstrap-owner",
      headers: authHeaders(bootToken),
      payload: { username: "dono", password: "senha-dona-1", displayName: "Dono" },
    });
    const ownerLogin = await app.inject({
      method: "POST",
      url: "/api/admin/login",
      payload: { username: "dono", password: "senha-dona-1" },
    });
    const ownerToken = (ownerLogin.json() as { token: string }).token;

    const clerk = await app.inject({
      method: "POST",
      url: "/api/admin/staff",
      headers: authHeaders(ownerToken),
      payload: { username: "joao", password: "joao-123", displayName: "João", role: "clerk" },
    });
    expect(clerk.statusCode).toBe(200);

    const clerkHome = await app.inject({
      method: "POST",
      url: "/api/admin/login",
      headers: { host: HOME_HOST },
      payload: { username: "joao", password: "joao-123" },
    });
    expect(clerkHome.statusCode).toBe(200);

    const ownerHome = await app.inject({
      method: "POST",
      url: "/api/admin/login",
      headers: { host: HOME_HOST },
      payload: { username: "dono", password: "senha-dona-1" },
    });
    expect(ownerHome.statusCode).toBe(200);
    const homeToken = (ownerHome.json() as { token: string }).token;

    const me = await app.inject({
      method: "GET",
      url: "/api/admin/me",
      headers: { ...authHeaders(homeToken), host: HOME_HOST },
    });
    expect(me.statusCode).toBe(200);
    expect((me.json() as { remoteReadOnly: boolean }).remoteReadOnly).toBe(false);

    const otherHost = "outro.exemplo.com";
    const meOther = await app.inject({
      method: "GET",
      url: "/api/admin/me",
      headers: { ...authHeaders(homeToken), host: otherHost },
    });
    // Painel da equipe só em loja/LAN/admin.geekloja — host estranho some (não vaza /api/admin).
    expect(meOther.statusCode).toBe(404);

    const cmd = await app.inject({
      method: "POST",
      url: "/api/stations/x/command",
      headers: { ...authHeaders(homeToken), host: otherHost },
      payload: { command: "unlock_screen" },
    });
    expect(cmd.statusCode).toBe(403);
    expect((cmd.json() as { code: string }).code).toBe("remote_readonly");

    await app.close();
  });

  it("venda de horas grava o nome de quem vendeu", async () => {
    const app = await createTestApp();
    const bootToken = await adminToken(app);
    await app.inject({
      method: "POST",
      url: "/api/admin/bootstrap-owner",
      headers: authHeaders(bootToken),
      payload: { username: "dono", password: "senha-dona-1", displayName: "Maria" },
    });
    const login = await app.inject({
      method: "POST",
      url: "/api/admin/login",
      payload: { username: "dono", password: "senha-dona-1" },
    });
    const token = (login.json() as { token: string }).token;

    const customer = await app.inject({
      method: "POST",
      url: "/api/customers",
      headers: authHeaders(token),
      payload: { name: "VIP Audit", consent: true, level: "bronze" },
    });
    const id = (customer.json() as { id: string }).id;
    await app.inject({
      method: "POST",
      url: `/api/customers/${id}/time/sale`,
      headers: authHeaders(token),
      payload: { amountReais: 10 },
    });

    const audit = await app.inject({
      method: "GET",
      url: "/api/admin/audit",
      headers: authHeaders(token),
    });
    const events = (audit.json() as { events: Array<{ kind: string; meta?: { actor?: string } }> }).events;
    const sale = events.find((e) => e.kind === "time.sale");
    expect(sale?.meta?.actor).toBe("Maria");
    await app.close();
  });

  it("não desativa o último dono", async () => {
    const app = await createTestApp();
    createStaffUser({ username: "unico", password: "senha-123", displayName: "Único", role: "admin" });
    const login = await app.inject({
      method: "POST",
      url: "/api/admin/login",
      payload: { username: "unico", password: "senha-123" },
    });
    const token = (login.json() as { token: string }).token;
    const users = await app.inject({
      method: "GET",
      url: "/api/admin/staff",
      headers: authHeaders(token),
    });
    const id = (users.json() as { staff: Array<{ id: string }> }).staff[0].id;
    const denied = await app.inject({
      method: "PATCH",
      url: `/api/admin/staff/${id}`,
      headers: authHeaders(token),
      payload: { active: false },
    });
    expect(denied.statusCode).toBe(400);
    await app.close();
  });
});
