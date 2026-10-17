import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { config } from "./config.js";
import { getReadiness, getUnitSettings, setUnitSettings } from "./admin-ops.js";
import { getBackupSchedule, setBackupSchedule } from "./backup-scheduler.js";
import {
  getPublicApiUrl,
  listPeerCentrals,
  setPeerCentrals,
  setPublicApiUrl,
  type PeerCentral,
} from "./centrals.js";
import { getHourPacks, setHourPacks, type HourPack } from "./hour-packs.js";
import { getSetting, setSetting } from "./customers.js";
import { getRecognitionRetentionDays, setRecognitionRetentionDays } from "./lgpd.js";
import { faceHealth } from "./face-client.js";
import { setStationOfflineHook } from "./hub.js";
import {
  adminGuard,
  ownerGuard,
  ownerWriteGuard,
  getAuthRole,
  getAuthPayload,
  actorLabel,
} from "./http-guards.js";
import {
  homeAdminUrl,
  isLanControlHost,
  isRemoteAdminHost,
  isStaffUiHost,
  requestHost,
  shopAdminUrl,
} from "./request-scope.js";
import { isOnStoreNetwork } from "./store-network.js";
import {
  checkCentralUpdate,
  requestCentralInstall,
  setCentralGithubToken,
} from "./central-update.js";
import {
  createStaffUser,
  hasNamedOwner,
  listStaffUsers,
  updateStaffUser,
  verifyStaffPassword,
} from "./staff-users.js";
import { registerConsoleRoutes } from "./console-routes.js";
import { registerStationRoutes } from "./station-routes.js";
import { registerFaceRoutes } from "./face-routes.js";
import { registerLockRoutes } from "./lock-routes.js";
import { registerAdminMaintenanceRoutes } from "./admin-maintenance-routes.js";
import { registerSessionRoutes } from "./session-routes.js";
import { registerCustomerRoutes } from "./customer-routes.js";
import { getHourPriceReais, getSubscriberDiscountPct } from "./billing.js";
import { rateLimit, verifyAdminPassword, verifyClerkPassword } from "./security.js";
import { logEvent } from "./telemetry.js";
import { applyTunnel, getTunnelStatusFull } from "./tunnel-manager.js";
import {
  sessionSafetySettingsPayload,
  setLowBalanceWarnSeconds,
  setPresenceMinFaceRatio,
  setStaffUnlockMaxSeconds,
} from "./session-safety.js";
import {
  setEnergyTariffReaisPerKwh,
  setStaffTimedMaxMinutes,
  setUsageDetailedTitles,
  usageSettingsPayload,
} from "./station-usage.js";

setStationOfflineHook((stationId, stationName) => {
  logEvent({
    level: "warn",
    source: "api",
    kind: "station.ws_offline",
    message: `Estação desconectou do WebSocket: ${stationName || stationId}`,
    stationId,
  });
});

function settingsPayload() {
  const unit = getUnitSettings();
  const backup = getBackupSchedule();
  return {
    faceMatchThreshold: Number(getSetting("face_match_threshold", String(config.faceMatchThreshold))),
    pointsPerReal: Number(getSetting("points_per_real", String(config.pointsPerReal))),
    hourPriceReais: getHourPriceReais(),
    subscriberHourDiscountPct: getSubscriberDiscountPct(),
    hourPacks: getHourPacks(),
    unitName: unit.unitName,
    unitId: unit.unitId,
    backupAutoEnabled: backup.enabled,
    backupIntervalHours: backup.intervalHours,
    backupKeep: backup.keep,
    recognitionEventsKeepDays: getRecognitionRetentionDays(),
    publicApiUrl: getPublicApiUrl(),
    peerCentrals: listPeerCentrals(),
    ...sessionSafetySettingsPayload(),
    ...usageSettingsPayload(),
  };
}

export async function registerRoutes(app: FastifyInstance) {
  await registerStationRoutes(app);
  await registerConsoleRoutes(app);
  await registerFaceRoutes(app);
  await registerSessionRoutes(app);
  await registerCustomerRoutes(app);
  await registerLockRoutes(app);

  app.get("/api/health", async () => {
    const face = await faceHealth();
    return {
      ok: true,
      faceService: face,
      time: new Date().toISOString(),
    };
  });

  app.post("/api/admin/login", async (req, reply) => {
    const ip = req.ip || "unknown";
    const host = requestHost(req);
    const remote = isRemoteAdminHost(host);
    if (!rateLimit(`admin-login:${ip}`, 10, 60_000)) {
      return reply.code(429).send({ error: "Muitas tentativas — aguarde um minuto" });
    }
    const body = z
      .object({
        username: z.string().optional(),
        password: z.string(),
      })
      .parse(req.body);

    if (hasNamedOwner()) {
      const username = String(body.username || "").trim();
      if (!username) {
        return reply.code(400).send({ error: "Informe o usuário" });
      }
      const user = verifyStaffPassword(username, body.password);
      if (!user) {
        return reply.code(401).send({ error: "Usuário ou senha inválidos" });
      }
      if (remote && user.role !== "admin") {
        return reply.code(403).send({
          error: "Funcionário só entra na loja (geek.local). De casa é só o dono.",
          code: "home_owner_only",
        });
      }
      const token = app.jwt.sign(
        {
          role: user.role,
          userId: user.id,
          username: user.username,
          displayName: user.displayName,
        },
        { expiresIn: "12h" },
      );
      return {
        token,
        role: user.role,
        userId: user.id,
        username: user.username,
        displayName: user.displayName,
        needsBootstrap: false,
      };
    }

    let role: "admin" | "clerk" | null = null;
    if (verifyAdminPassword(body.password)) role = "admin";
    else if (verifyClerkPassword(body.password)) role = "clerk";
    if (!role) {
      return reply.code(401).send({ error: "Senha inválida" });
    }
    if (remote) {
      return reply.code(403).send({
        error: "Primeiro acesso: crie a conta do dono na loja (geek.local).",
        code: "bootstrap_local_only",
      });
    }
    const token = app.jwt.sign({ role, bootstrap: true }, { expiresIn: "12h" });
    return { token, role, needsBootstrap: role === "admin" };
  });

  app.post("/api/admin/bootstrap-owner", async (req, reply) => {
    if (!(await adminGuard(req, reply))) return;
    if (!isLanControlHost(requestHost(req))) {
      return reply.code(403).send({
        error: "Crie a conta do dono só na loja (geek.local).",
        code: "bootstrap_local_only",
      });
    }
    if (getAuthRole(req) !== "admin") {
      return reply.code(403).send({ error: "Só o dono cria a primeira conta." });
    }
    if (hasNamedOwner()) {
      return reply.code(409).send({ error: "Já existe um dono. Use a aba Equipe." });
    }
    const body = z
      .object({
        username: z.string(),
        password: z.string(),
        displayName: z.string().optional(),
      })
      .parse(req.body);
    try {
      const user = createStaffUser({
        username: body.username,
        password: body.password,
        displayName: body.displayName || body.username,
        role: "admin",
      });
      const token = app.jwt.sign(
        {
          role: user.role,
          userId: user.id,
          username: user.username,
          displayName: user.displayName,
        },
        { expiresIn: "12h" },
      );
      logEvent({
        level: "info",
        source: "admin",
        kind: "staff.bootstrap",
        message: `Conta dono criada: ${user.username}`,
        meta: { actor: user.displayName, userId: user.id },
      });
      return {
        token,
        role: user.role,
        userId: user.id,
        username: user.username,
        displayName: user.displayName,
        needsBootstrap: false,
      };
    } catch (err) {
      return reply.code(400).send({ error: err instanceof Error ? err.message : "Erro" });
    }
  });

  app.get("/api/admin/me", async (req, reply) => {
    if (!(await adminGuard(req, reply))) return;
    const host = requestHost(req);
    const actor = getAuthPayload(req);
    const role = getAuthRole(req) || "admin";
    const onStoreNetwork = isOnStoreNetwork(req);
    const canWrite = (role === "admin" || role === "clerk") && isStaffUiHost(host);
    return {
      role,
      userId: actor?.userId || null,
      username: actor?.username || null,
      displayName: actor?.displayName || null,
      needsBootstrap: Boolean(actor?.bootstrap && actor.role === "admin" && !hasNamedOwner()),
      remoteReadOnly: !canWrite,
      onStoreNetwork,
      offStoreWifi: false,
      lanControl: canWrite,
      host,
      shopUrl: shopAdminUrl(config.port),
      homeUrl: homeAdminUrl(),
    };
  });

  app.get("/api/admin/staff", async (req, reply) => {
    if (!(await ownerGuard(req, reply))) return;
    return { staff: listStaffUsers(), hasNamedOwner: hasNamedOwner() };
  });

  app.post("/api/admin/staff", async (req, reply) => {
    if (!(await ownerWriteGuard(req, reply))) return;
    const body = z
      .object({
        username: z.string(),
        password: z.string(),
        displayName: z.string().optional(),
        role: z.enum(["admin", "clerk"]).optional(),
      })
      .parse(req.body);
    try {
      const user = createStaffUser({
        username: body.username,
        password: body.password,
        displayName: body.displayName || body.username,
        role: body.role === "admin" ? "admin" : "clerk",
      });
      logEvent({
        level: "info",
        source: "admin",
        kind: "staff.create",
        message: `${actorLabel(req)} criou ${user.displayName} (${user.username})`,
        meta: { actor: actorLabel(req), userId: user.id, role: user.role },
      });
      return user;
    } catch (err) {
      return reply.code(400).send({ error: err instanceof Error ? err.message : "Erro" });
    }
  });

  app.patch("/api/admin/staff/:id", async (req, reply) => {
    if (!(await ownerWriteGuard(req, reply))) return;
    const { id } = req.params as { id: string };
    const body = z
      .object({
        displayName: z.string().optional(),
        password: z.string().optional(),
        active: z.boolean().optional(),
        role: z.enum(["admin", "clerk"]).optional(),
      })
      .parse(req.body);
    try {
      const user = updateStaffUser(id, body);
      logEvent({
        level: "info",
        source: "admin",
        kind: "staff.update",
        message: `${actorLabel(req)} atualizou ${user.displayName}`,
        meta: { actor: actorLabel(req), userId: user.id, active: user.active },
      });
      return user;
    } catch (err) {
      return reply.code(400).send({ error: err instanceof Error ? err.message : "Erro" });
    }
  });

  app.get("/api/settings", async (req, reply) => {
    if (!(await adminGuard(req, reply))) return;
    return settingsPayload();
  });

  app.put("/api/settings", async (req, reply) => {
    if (!(await ownerWriteGuard(req, reply))) return;
    const body = z
      .object({
        faceMatchThreshold: z.number().min(0.1).max(0.99).optional(),
        pointsPerReal: z.number().min(0.01).max(100).optional(),
        hourPriceReais: z.number().min(0.5).max(500).optional(),
        subscriberHourDiscountPct: z.number().min(0).max(90).optional(),
        unitName: z.string().min(1).max(80).optional(),
        unitId: z.string().min(1).max(64).optional(),
        backupAutoEnabled: z.boolean().optional(),
        backupIntervalHours: z.number().min(1).max(168).optional(),
        backupKeep: z.number().min(3).max(50).optional(),
        recognitionEventsKeepDays: z.number().min(7).max(730).optional(),
        publicApiUrl: z.string().max(300).optional(),
        peerCentrals: z
          .array(
            z.object({
              unitId: z.string().min(1).max(64),
              unitName: z.string().min(1).max(80),
              publicApiUrl: z.string().url().max(300),
            }),
          )
          .max(12)
          .optional(),
        lowBalanceWarnSeconds: z.number().min(60).max(3600).optional(),
        staffUnlockMaxSeconds: z.number().min(60).max(7200).optional(),
        presenceMinFaceRatio: z.number().min(0.06).max(0.4).optional(),
        energyTariffReaisPerKwh: z.number().min(0).max(10).optional(),
        usageDetailedTitles: z.boolean().optional(),
        staffTimedMaxMinutes: z.number().min(15).max(480).optional(),
        hourPacks: z
          .array(
            z.object({
              amountReais: z.number().min(1).max(5000),
              label: z.string().min(1).max(40),
            }),
          )
          .min(1)
          .max(12)
          .optional(),
      })
      .parse(req.body);
    if (body.faceMatchThreshold !== undefined) {
      setSetting("face_match_threshold", String(body.faceMatchThreshold));
    }
    if (body.pointsPerReal !== undefined) {
      setSetting("points_per_real", String(body.pointsPerReal));
    }
    if (body.hourPriceReais !== undefined) {
      setSetting("hour_price_reais", String(body.hourPriceReais));
    }
    if (body.subscriberHourDiscountPct !== undefined) {
      setSetting("subscriber_hour_discount_pct", String(body.subscriberHourDiscountPct));
    }
    if (body.unitName !== undefined || body.unitId !== undefined) {
      setUnitSettings({ unitName: body.unitName, unitId: body.unitId });
    }
    if (
      body.backupAutoEnabled !== undefined ||
      body.backupIntervalHours !== undefined ||
      body.backupKeep !== undefined
    ) {
      setBackupSchedule({
        enabled: body.backupAutoEnabled,
        intervalHours: body.backupIntervalHours,
        keep: body.backupKeep,
      });
    }
    if (body.recognitionEventsKeepDays !== undefined) {
      setRecognitionRetentionDays(body.recognitionEventsKeepDays);
    }
    if (body.publicApiUrl !== undefined) {
      setPublicApiUrl(body.publicApiUrl);
    }
    if (body.peerCentrals !== undefined) {
      setPeerCentrals(body.peerCentrals as PeerCentral[]);
    }
    if (body.lowBalanceWarnSeconds !== undefined) {
      setLowBalanceWarnSeconds(body.lowBalanceWarnSeconds);
    }
    if (body.staffUnlockMaxSeconds !== undefined) {
      setStaffUnlockMaxSeconds(body.staffUnlockMaxSeconds);
    }
    if (body.presenceMinFaceRatio !== undefined) {
      setPresenceMinFaceRatio(body.presenceMinFaceRatio);
    }
    if (body.energyTariffReaisPerKwh !== undefined) {
      setEnergyTariffReaisPerKwh(body.energyTariffReaisPerKwh);
    }
    if (body.usageDetailedTitles !== undefined) {
      setUsageDetailedTitles(body.usageDetailedTitles);
    }
    if (body.staffTimedMaxMinutes !== undefined) {
      setStaffTimedMaxMinutes(body.staffTimedMaxMinutes);
    }
    if (body.hourPacks !== undefined) {
      setHourPacks(body.hourPacks as HourPack[]);
    }
    return settingsPayload();
  });

  app.get("/api/admin/readiness", async (req, reply) => {
    if (!(await adminGuard(req, reply))) return;
    const face = await faceHealth();
    const tunnel = await getTunnelStatusFull();
    const publicUrl =
      tunnel.mode === "named"
        ? tunnel.publicApiUrl
        : tunnel.mode === "quick"
          ? tunnel.lastQuickTunnelUrl
          : "";
    const readiness = getReadiness();
    const tunnelOk =
      tunnel.running &&
      Boolean(publicUrl) &&
      (tunnel.publicHealthy || tunnel.mode === "named");
    readiness.checklist = readiness.checklist.map((c) =>
      c.id === "tunnel" ? { ...c, ok: tunnelOk, label: "Túnel Cloudflare ativo" } : c,
    );
    readiness.tunnelHint = tunnel.running
      ? publicUrl
        ? `Túnel ativo: ${publicUrl}`
        : "Túnel rodando — aguardando URL pública"
      : "Ligue o túnel em Config → Portal / Cloudflare (auto-start disponível).";
    return {
      ...readiness,
      faceService: face,
      tunnel: {
        running: tunnel.running,
        mode: tunnel.mode,
        autoStart: tunnel.autoStart,
        publicUrl,
        publicHealthy: tunnel.publicHealthy,
        binaryFound: tunnel.binaryFound,
      },
    };
  });

  app.get("/api/admin/central-update", async (req, reply) => {
    if (!(await ownerGuard(req, reply))) return;
    return checkCentralUpdate();
  });

  app.post("/api/admin/central-update/token", async (req, reply) => {
    if (!(await ownerWriteGuard(req, reply))) return;
    const body = z.object({ token: z.string().min(8) }).parse(req.body);
    return setCentralGithubToken(body.token);
  });

  app.post("/api/admin/central-update/apply", async (req, reply) => {
    if (!(await ownerWriteGuard(req, reply))) return;
    const result = requestCentralInstall();
    if (!result.ok) return reply.code(400).send(result);
    logEvent({
      level: "warn",
      source: "admin",
      kind: "central.update",
      message: `${actorLabel(req)} pediu atualização do GeekCentral`,
      meta: { actor: actorLabel(req) },
    });
    return result;
  });

  app.get("/api/admin/tunnel", async (req, reply) => {
    if (!(await adminGuard(req, reply))) return;
    return getTunnelStatusFull();
  });

  app.post("/api/admin/tunnel", async (req, reply) => {
    if (!(await ownerWriteGuard(req, reply))) return;
    const body = z
      .object({
        mode: z.enum(["off", "quick", "named"]).optional(),
        tunnelName: z.string().optional(),
        publicApiUrl: z.string().optional(),
        autoStart: z.boolean().optional(),
        action: z.enum(["start", "stop", "apply", "check"]).optional(),
      })
      .parse(req.body);
    if (body.action === "check") {
      const st = await getTunnelStatusFull();
      return { ok: true, status: st };
    }
    const { action, ...rest } = body;
    void action;
    return applyTunnel(rest);
  });

  await registerAdminMaintenanceRoutes(app);
}
