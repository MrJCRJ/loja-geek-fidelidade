import type { FastifyInstance } from "fastify";
import fs from "node:fs";
import { z } from "zod";
import { getTimeBalance, sellTime } from "./billing.js";
import { config } from "./config.js";
import { createCustomer, getCustomer, listCustomers, updateCustomer } from "./customers.js";
import { adminGuard, ownerGuard, ownerWriteGuard, staffWriteGuard, stationFromHeader, actorLabel } from "./http-guards.js";
import {
  broadcastAdmins,
  getAllStationStatuses,
  listConnectedStations,
  sendCommandToAllStations,
  sendCommandToStation,
} from "./hub.js";
import {
  deleteStation,
  heartbeatStation,
  heartbeatStationById,
  listStations,
  registerStation,
  renameStation,
} from "./stations.js";
import {
  ensureLockPackageCached,
  lockPackagePath,
  lockUpdateHintForStation,
  lockUpdateStatus,
} from "./lock-update.js";
import {
  attachStaffUnlockTimer,
  clearStaffUnlockWindow,
  getStaffUnlockMaxSeconds,
  sessionSafetySettingsPayload,
  startStaffUnlockWindow,
} from "./session-safety.js";
import { startSession } from "./sessions.js";
import { logEvent } from "./telemetry.js";
import { isLanPairAllowed } from "./store-network.js";
import {
  buildUsageSummary,
  getStaffTimedMaxMinutes,
  ingestUsageSample,
  listStationHardware,
  pushGuestLabelRecent,
  updateStationEnergyCalibration,
  upsertStationHardware,
  usageSettingsPayload,
} from "./station-usage.js";

const occupantKindSchema = z.enum(["vip", "vip_desk", "staff_timed", "staff_open", "guest_named"]);

const stationCommandBody = z.object({
  command: z.enum([
    "reload",
    "message",
    "lock_screen",
    "unlock_screen",
    "end_session",
    "quit_app",
    "apply_update",
    "shutdown",
    "hibernate",
  ]),
  text: z.string().optional(),
  title: z.string().max(80).optional(),
  level: z.enum(["info", "warn", "urgent"]).optional(),
  durationSec: z.number().int().min(3).max(23 * 3600 + 59 * 60).optional(),
  occupantKind: occupantKindSchema.optional(),
  guestLabel: z.string().min(2).max(40).optional(),
  customerId: z.string().min(1).optional(),
  customerName: z.string().min(1).max(80).optional(),
  sessionId: z.string().min(1).optional(),
  timeBalanceSeconds: z.number().int().nonnegative().optional(),
});

function resolveDeskCustomer(input: { customerId?: string; customerName?: string }) {
  if (input.customerId) {
    const existing = getCustomer(input.customerId) as { id: string; consent_at?: string | null } | undefined;
    if (!existing) throw new Error("Cliente não encontrado");
    if (!existing.consent_at) updateCustomer(existing.id, { consent: true });
    return getCustomer(existing.id)!;
  }
  const name = String(input.customerName || "").trim();
  if (name.length < 2) throw new Error("Informe o nome do cliente (mín. 2 caracteres)");
  const hit = (listCustomers() as Array<{ id: string; name: string; consent_at?: string | null }>).find(
    (c) => c.name.trim().toLowerCase() === name.toLowerCase(),
  );
  if (hit) {
    if (!hit.consent_at) updateCustomer(hit.id, { consent: true });
    return getCustomer(hit.id)!;
  }
  return createCustomer({
    name,
    consent: true,
    notes: "Criado no balcão (Liberar)",
  });
}

export async function registerStationRoutes(app: FastifyInstance) {
  app.get("/api/stations", async (req, reply) => {
    if (!(await adminGuard(req, reply))) return;
    return {
      stations: listStations(),
      connected: listConnectedStations(),
      live: getAllStationStatuses(),
    };
  });

  app.post("/api/stations", async (req, reply) => {
    if (!(await ownerWriteGuard(req, reply))) return;
    const body = z.object({ name: z.string().min(2) }).parse(req.body);
    return registerStation(body.name);
  });

  app.patch("/api/stations/:id", async (req, reply) => {
    if (!(await ownerWriteGuard(req, reply))) return;
    const { id } = req.params as { id: string };
    const body = z.object({ name: z.string().min(2) }).parse(req.body);
    const updated = renameStation(id, body.name);
    if (!updated) return reply.code(404).send({ error: "Não encontrado" });
    return updated;
  });

  app.delete("/api/stations/:id", async (req, reply) => {
    if (!(await ownerWriteGuard(req, reply))) return;
    const { id } = req.params as { id: string };
    if (!deleteStation(id)) return reply.code(404).send({ error: "Não encontrado" });
    return { ok: true };
  });

  app.post("/api/stations/heartbeat", async (req, reply) => {
    const body = z
      .object({
        token: z.string(),
        lockVersion: z.string().max(32).optional(),
        health: z
          .object({
            diskFreePct: z.number().min(0).max(100).optional().nullable(),
            diskTotalGb: z.number().min(0).max(102400).optional().nullable(),
            uptimeSec: z.number().int().min(0).max(20 * 365 * 24 * 3600).optional().nullable(),
            ramUsedPct: z.number().min(0).max(100).optional().nullable(),
          })
          .optional()
          .nullable(),
      })
      .parse(req.body);
    const station = heartbeatStation(body.token, req.ip, body.lockVersion, body.health || null);
    if (!station) return reply.code(401).send({ error: "Token de estação inválido" });
    broadcastAdmins({ type: "station_heartbeat", station });
    return {
      ok: true,
      station: { id: station.id, name: station.name },
      sessionSafety: sessionSafetySettingsPayload(station.id),
      usage: usageSettingsPayload(),
      portalPublicUrl: config.portalPublicUrl,
      lockUpdate: lockUpdateHintForStation(body.lockVersion || station.lock_version),
    };
  });

  app.post("/api/stations/:id/command", async (req, reply) => {
    if (!(await staffWriteGuard(req, reply))) return;
    const { id } = req.params as { id: string };
    const body = stationCommandBody.parse(req.body);
    let durationSec: number | undefined = body.durationSec ?? 12;
    let occupantKind = body.occupantKind;
    if (body.command === "lock_screen" || body.command === "end_session") {
      clearStaffUnlockWindow(id);
    }
    if (body.command === "unlock_screen") {
      occupantKind = occupantKind || "staff_timed";
      if (occupantKind === "guest_named" && body.guestLabel) {
        pushGuestLabelRecent(body.guestLabel);
      }
      const openEnded =
        occupantKind === "staff_open" || (occupantKind === "guest_named" && body.durationSec == null);
      if (openEnded) {
        clearStaffUnlockWindow(id);
        durationSec = undefined;
      } else {
        const maxTimed = getStaffTimedMaxMinutes() * 60;
        const requested = body.durationSec ?? Math.min(getStaffUnlockMaxSeconds(), maxTimed);
        durationSec = startStaffUnlockWindow(id, Math.min(maxTimed, requested));
      }
    }
    sendCommandToStation(id, body.command, {
      text: body.text || "",
      title: body.title || "",
      level: body.level || "info",
      durationSec,
      occupantKind,
      guestLabel: body.guestLabel || "",
    });
    if (body.command === "unlock_screen" && durationSec) {
      attachStaffUnlockTimer(
        id,
        setTimeout(() => {
          clearStaffUnlockWindow(id);
          sendCommandToStation(id, "lock_screen", { text: "", title: "", level: "info", durationSec: 12 });
        }, durationSec * 1000),
      );
    }
    logEvent({
      level: "info",
      source: "admin",
      kind: `command.${body.command}`,
      message: `${actorLabel(req)}: comando ${body.command} → estação ${id}`,
      stationId: id,
      meta: {
        text: body.text,
        title: body.title,
        level: body.level,
        actor: actorLabel(req),
        occupantKind,
        durationSec,
        guestLabel: body.guestLabel,
      },
    });
    return { ok: true };
  });

  app.post("/api/stations/command-all", async (req, reply) => {
    if (!(await staffWriteGuard(req, reply))) return;
    const body = stationCommandBody.parse(req.body);
    if (body.command === "unlock_screen") {
      const occupantKind = body.occupantKind || "staff_timed";
      if (occupantKind === "guest_named" && body.guestLabel) {
        pushGuestLabelRecent(body.guestLabel);
      }
      const openEnded =
        occupantKind === "staff_open" || (occupantKind === "guest_named" && body.durationSec == null);
      for (const s of listConnectedStations()) {
        let durationSec: number | undefined;
        if (openEnded) {
          clearStaffUnlockWindow(s.stationId);
        } else {
          const maxTimed = getStaffTimedMaxMinutes() * 60;
          const requested = body.durationSec ?? Math.min(getStaffUnlockMaxSeconds(), maxTimed);
          durationSec = startStaffUnlockWindow(s.stationId, Math.min(maxTimed, requested));
        }
        sendCommandToStation(s.stationId, body.command, {
          text: body.text || "",
          title: body.title || "",
          level: body.level || "info",
          durationSec,
          occupantKind,
          guestLabel: body.guestLabel || "",
        });
        if (durationSec) {
          attachStaffUnlockTimer(
            s.stationId,
            setTimeout(() => {
              clearStaffUnlockWindow(s.stationId);
              sendCommandToStation(s.stationId, "lock_screen", { text: "", title: "", level: "info", durationSec: 12 });
            }, durationSec * 1000),
          );
        }
      }
    } else {
      sendCommandToAllStations(body.command, {
        text: body.text || "",
        title: body.title || "",
        level: body.level || "info",
        durationSec: body.durationSec ?? 12,
      });
    }
    logEvent({
      level: "info",
      source: "admin",
      kind: `command_all.${body.command}`,
      message: `${actorLabel(req)}: comando ${body.command} → todas as estações`,
      meta: { text: body.text, title: body.title, level: body.level, actor: actorLabel(req) },
    });
    return { ok: true };
  });

  app.post("/api/stations/staff-unlock", async (req, reply) => {
    const station = stationFromHeader(req);
    if (!station) return reply.code(401).send({ error: "Token de estação obrigatório" });
    const body = z.object({ reason: z.string().max(80).optional() }).parse(req.body || {});
    logEvent({
      level: "warn",
      source: "geeklock",
      kind: "station.staff_unlock",
      message: `PIN Admin na estação ${station.name}`,
      stationId: station.id,
      meta: { reason: body.reason || "pin" },
    });
    return { ok: true };
  });

  app.post("/api/stations/hardware", async (req, reply) => {
    const station = stationFromHeader(req);
    if (!station) return reply.code(401).send({ error: "Token de estação obrigatório" });
    const body = z
      .object({
        cpuName: z.string().max(120).optional().nullable(),
        cpuCores: z.number().int().min(1).max(256).optional().nullable(),
        cpuTdpW: z.number().min(5).max(500).optional().nullable(),
        gpus: z
          .array(
            z.object({
              vendor: z.enum(["nvidia", "amd", "intel", "other"]),
              model: z.string().max(120),
              vramMb: z.number().int().min(0).max(262144).optional().nullable(),
            }),
          )
          .max(4)
          .optional(),
        ramTotalMb: z.number().int().min(256).max(1048576).optional().nullable(),
        osBuild: z.string().max(80).optional().nullable(),
        diskFreePct: z.number().min(0).max(100).optional().nullable(),
        diskTotalGb: z.number().min(0).max(102400).optional().nullable(),
        uptimeSec: z.number().int().min(0).max(20 * 365 * 24 * 3600).optional().nullable(),
        ramUsedPct: z.number().min(0).max(100).optional().nullable(),
      })
      .parse(req.body || {});
    const saved = upsertStationHardware(station.id, body);
    if (body.diskFreePct != null || body.uptimeSec != null || body.ramUsedPct != null || body.diskTotalGb != null) {
      heartbeatStationById(station.id, undefined, undefined, {
        diskFreePct: body.diskFreePct,
        diskTotalGb: body.diskTotalGb,
        uptimeSec: body.uptimeSec,
        ramUsedPct: body.ramUsedPct,
      });
    }
    return { ok: true, hardware: saved, usage: usageSettingsPayload() };
  });

  app.post("/api/stations/usage-sample", async (req, reply) => {
    const station = stationFromHeader(req);
    if (!station) return reply.code(401).send({ error: "Token de estação obrigatório" });
    const body = z
      .object({
        occupantKind: occupantKindSchema,
        occupantCustomerId: z.string().max(64).optional().nullable(),
        occupantLabel: z.string().max(40).optional().nullable(),
        appProcess: z.string().max(64).optional().nullable(),
        appTitle: z.string().max(200).optional().nullable(),
        cpuPct: z.number().min(0).max(100).optional().nullable(),
        gpuPct: z.number().min(0).max(100).optional().nullable(),
        ramPct: z.number().min(0).max(100).optional().nullable(),
        watts: z.number().min(0).max(2000).optional().nullable(),
        wattsSource: z.enum(["sensor", "estimate"]).optional().nullable(),
      })
      .parse(req.body || {});
    return ingestUsageSample(station.id, {
      occupantKind: body.occupantKind,
      occupantCustomerId: body.occupantCustomerId,
      occupantLabel: body.occupantLabel,
      appProcess: body.appProcess,
      appTitle: body.appTitle,
      cpuPct: body.cpuPct,
      gpuPct: body.gpuPct,
      ramPct: body.ramPct,
      watts: body.watts,
      wattsSource: body.wattsSource,
    });
  });

  app.get("/api/admin/usage", async (req, reply) => {
    if (!(await ownerGuard(req, reply))) return;
    const q = req.query as { hours?: string };
    const hours = q.hours ? Number(q.hours) : 24;
    return {
      ...buildUsageSummary({ hours: Number.isFinite(hours) ? hours : 24 }),
      hardware: listStationHardware(),
      settings: usageSettingsPayload(),
    };
  });

  app.patch("/api/admin/stations/:id/energy", async (req, reply) => {
    if (!(await ownerWriteGuard(req, reply))) return;
    const { id } = req.params as { id: string };
    const body = z
      .object({
        tdpCpuW: z.number().min(15).max(500).optional(),
        tdpGpuW: z.number().min(0).max(800).optional(),
        idleW: z.number().min(10).max(200).optional(),
      })
      .parse(req.body || {});
    const hardware = updateStationEnergyCalibration(id, body);
    if (!hardware) return reply.code(404).send({ error: "Estação sem hardware ainda" });
    return { ok: true, hardware };
  });

  // Bootstrap rápido de estação com segredo compartilhado (primeira config)
  app.post("/api/stations/claim", async (req, reply) => {
    const body = z
      .object({
        name: z.string().min(2),
        sharedSecret: z.string(),
      })
      .parse(req.body);
    if (body.sharedSecret !== config.stationSharedSecret) {
      return reply.code(401).send({ error: "Segredo inválido" });
    }
    return registerStation(body.name);
  });

  /** Na LAN: só nome. Sem código, sem senha. */
  app.post("/api/stations/pair-lan", async (req, reply) => {
    if (!isLanPairAllowed(req)) {
      return reply.code(403).send({ error: "Pareamento só na rede da loja", code: "off_store_wifi" });
    }
    const body = z.object({ name: z.string().min(2) }).parse(req.body);
    const station = registerStation(body.name);
    logEvent({
      level: "info",
      source: "admin",
      kind: "station.pair_lan",
      message: `Estação pareada na LAN: ${station.name}`,
      stationId: station.id,
    });
    return station;
  });

  app.get("/api/admin/lock-update", async (req, reply) => {
    if (!(await ownerGuard(req, reply))) return;
    return lockUpdateStatus();
  });

  app.post("/api/admin/lock-update/apply", async (req, reply) => {
    if (!(await ownerWriteGuard(req, reply))) return;
    const body = z.object({ stationIds: z.array(z.string()).optional() }).parse(req.body || {});
    const cached = await ensureLockPackageCached();
    if (!cached.ok) return reply.code(400).send(cached);
    const status = await lockUpdateStatus();
    const wanted = new Set(body.stationIds || []);
    const targets = status.stations.filter((s) => {
      if (wanted.size && !wanted.has(s.id)) return false;
      return s.online && (s.status === "outdated" || s.status === "unknown");
    });
    for (const s of targets) {
      sendCommandToStation(s.id, "apply_update", { latestVersion: cached.latestVersion || "" });
    }
    logEvent({
      level: "warn",
      source: "admin",
      kind: "lock.update",
      message: `${actorLabel(req)} pediu atualização do GeekLock (${targets.length} online)`,
      meta: { actor: actorLabel(req), stationIds: targets.map((s) => s.id) },
    });
    return {
      ok: true,
      applying: true,
      latestVersion: cached.latestVersion,
      sent: targets.map((s) => s.name),
      waitingOffline: status.offlineOutdated,
    };
  });

  /** Balcão: VIP + (saldo / venda R$/horas / aberto) → libera a estação. */
  app.post("/api/stations/:id/desk-liberar", async (req, reply) => {
    if (!(await staffWriteGuard(req, reply))) return;
    const { id } = req.params as { id: string };
    const station = listStations().find((s) => s.id === id);
    if (!station) return reply.code(404).send({ error: "Estação não encontrada" });
    const body = z
      .object({
        mode: z.enum(["sale", "open", "balance"]),
        customerId: z.string().min(1).optional(),
        customerName: z.string().min(2).max(80).optional(),
        amountReais: z.number().positive().optional(),
        hours: z.number().positive().optional(),
      })
      .parse(req.body || {});

    try {
      const customer = resolveDeskCustomer({
        customerId: body.customerId,
        customerName: body.customerName,
      }) as { id: string; name: string };

      if (body.mode === "open") {
        clearStaffUnlockWindow(id);
        sendCommandToStation(id, "unlock_screen", {
          occupantKind: "staff_open",
          customerId: customer.id,
          customerName: customer.name,
          guestLabel: customer.name,
        });
        logEvent({
          level: "info",
          source: "admin",
          kind: "desk.liberar_open",
          message: `${actorLabel(req)} liberou aberto ${station.name} para ${customer.name}`,
          stationId: id,
          meta: { actor: actorLabel(req), customerId: customer.id, customerName: customer.name },
        });
        broadcastAdmins({
          type: "desk_liberar",
          mode: "open",
          station: { id: station.id, name: station.name },
          customer,
          at: new Date().toISOString(),
        });
        return { ok: true, mode: "open", customer, station: { id: station.id, name: station.name } };
      }

      if (body.mode === "balance") {
        const balance = getTimeBalance(customer.id);
        if (balance <= 0) {
          return reply.code(400).send({ error: "Sem crédito de horas — venda ou liberar aberto" });
        }
        const session = startSession(customer.id, id);
        clearStaffUnlockWindow(id);
        sendCommandToStation(id, "unlock_screen", {
          occupantKind: "vip_desk",
          customerId: customer.id,
          customerName: customer.name,
          sessionId: session.id,
          timeBalanceSeconds: balance,
        });
        logEvent({
          level: "info",
          source: "admin",
          kind: "desk.liberar_balance",
          message: `${actorLabel(req)} liberou com saldo ${station.name} para ${customer.name}`,
          stationId: id,
          meta: {
            actor: actorLabel(req),
            customerId: customer.id,
            sessionId: session.id,
            timeBalanceSeconds: balance,
          },
        });
        broadcastAdmins({
          type: "desk_liberar",
          mode: "balance",
          station: { id: station.id, name: station.name },
          customer,
          session,
          timeBalanceSeconds: balance,
          at: new Date().toISOString(),
        });
        broadcastAdmins({
          type: "session_started",
          session,
          station: { id: station.id, name: station.name },
          customer,
          at: new Date().toISOString(),
        });
        return {
          ok: true,
          mode: "balance",
          customer,
          session,
          timeBalanceSeconds: balance,
          station: { id: station.id, name: station.name },
        };
      }

      if (body.amountReais == null && body.hours == null) {
        return reply.code(400).send({ error: "Informe valor em R$ ou horas para creditar" });
      }
      const sale = sellTime({
        customerId: customer.id,
        amountReais: body.amountReais,
        hours: body.hours,
      });
      const session = startSession(customer.id, id);
      const balance = getTimeBalance(customer.id);
      clearStaffUnlockWindow(id);
      sendCommandToStation(id, "unlock_screen", {
        occupantKind: "vip_desk",
        customerId: customer.id,
        customerName: customer.name,
        sessionId: session.id,
        timeBalanceSeconds: balance,
      });
      logEvent({
        level: "info",
        source: "admin",
        kind: "desk.liberar_sale",
        message: `${actorLabel(req)} vendeu e liberou ${station.name} para ${customer.name}`,
        stationId: id,
        meta: {
          actor: actorLabel(req),
          customerId: customer.id,
          amountReais: sale.amountReais,
          creditedSeconds: sale.creditedSeconds,
          sessionId: session.id,
        },
      });
      broadcastAdmins({
        type: "desk_liberar",
        mode: "sale",
        station: { id: station.id, name: station.name },
        customer: sale.customer,
        session,
        creditedSeconds: sale.creditedSeconds,
        amountReais: sale.amountReais,
        at: new Date().toISOString(),
      });
      broadcastAdmins({ type: "time_updated", customer: sale.customer });
      broadcastAdmins({
        type: "session_started",
        session,
        station: { id: station.id, name: station.name },
        customer: sale.customer,
        at: new Date().toISOString(),
      });
      let reviewAsk: Awaited<
        ReturnType<(typeof import("./whatsapp.js"))["afterDeskSaleMaybeAskReview"]>
      > | null = null;
      try {
        const wa = await import("./whatsapp.js");
        const hours =
          body.hours != null
            ? body.hours
            : sale.creditedSeconds != null
              ? Number(sale.creditedSeconds) / 3600
              : null;
        reviewAsk = await wa.afterDeskSaleMaybeAskReview(
          customer.id,
          Number(sale.amountReais) || 0,
          hours,
        );
      } catch {
        reviewAsk = null;
      }
      return {
        ok: true,
        mode: "sale",
        customer: sale.customer,
        session,
        creditedSeconds: sale.creditedSeconds,
        amountReais: sale.amountReais,
        timeBalanceSeconds: balance,
        station: { id: station.id, name: station.name },
        reviewAsk,
      };
    } catch (err) {
      return reply.code(400).send({ error: err instanceof Error ? err.message : "Erro" });
    }
  });

  app.get("/api/stations/lock-update/package", async (req, reply) => {
    const station = stationFromHeader(req);
    if (!station) return reply.code(401).send({ error: "Token de estação obrigatório" });
    const zip = lockPackagePath();
    if (!fs.existsSync(zip)) return reply.code(404).send({ error: "Pacote ainda não baixado no Central" });
    const stat = fs.statSync(zip);
    return reply
      .header("content-type", "application/zip")
      .header("content-length", String(stat.size))
      .header("content-disposition", 'attachment; filename="GeekLock-win-x64.zip"')
      .send(fs.createReadStream(zip));
  });
}
