/** Regras simples de ação + labels do feed do Dashboard. */

export type DashStation = {
  id: string;
  name: string;
  online: number;
  last_seen_at: string | null;
};

export type DashLive = {
  phase?: string;
  customerName?: string | null;
  present?: boolean;
};

export type DashMetricsLite = {
  today: {
    sessions: number;
    hoursUsed: number;
    salesReais: number;
    activeSessions: number;
    staleSessions?: number;
    staleSweepClosedToday?: number;
  };
  week: {
    hoursUsed: number;
    salesReais: number;
    days: Array<{ day: string; sessions: number; seconds: number; salesReais: number }>;
  };
  inventory: { stationsOnline: number; stationsTotal: number };
  openDuePending?: Array<{ id: string; customerName: string; amountReais: number }>;
};

export type TelemetryEvent = {
  id: string;
  created_at: string;
  level: string;
  source: string;
  kind: string;
  message: string;
  station_id?: string | null;
};

export type Insight = {
  id: string;
  tone: "action" | "warn" | "ok";
  title: string;
  detail: string;
};

const FEED_KINDS = new Set([
  "station.ws_offline",
  "ws.close",
  "command.quit_app",
  "command.shutdown",
  "command.end_session",
  "lock.update",
  "time.sale",
  "desk.liberar_balance",
  "open_due.paid",
]);

const OFFLINE_MS = 30 * 60 * 1000;

export function isDashboardFeedKind(kind: string) {
  return FEED_KINDS.has(kind);
}

export function filterDashboardEvents(events: TelemetryEvent[], limit = 24): TelemetryEvent[] {
  return events.filter((e) => isDashboardFeedKind(e.kind)).slice(0, limit);
}

export function eventFeedLabel(kind: string): string {
  switch (kind) {
    case "station.ws_offline":
      return "Caiu a conexão";
    case "ws.close":
      return "WebSocket fechou";
    case "command.quit_app":
      return "Encerrar app";
    case "command.shutdown":
      return "Desligar PC";
    case "command.end_session":
      return "Encerrar sessão";
    case "lock.update":
      return "Update Lock";
    case "time.sale":
      return "Venda de hora";
    case "desk.liberar_balance":
      return "Liberou VIP";
    case "open_due.paid":
      return "Aberto pago";
    default:
      return kind;
  }
}

export function eventTone(kind: string): "warn" | "info" | "ok" {
  if (kind === "station.ws_offline" || kind === "ws.close" || kind === "command.shutdown") return "warn";
  if (kind === "time.sale" || kind === "desk.liberar_balance" || kind === "open_due.paid") return "ok";
  return "info";
}

function ageMs(iso: string | null | undefined, nowMs: number) {
  if (!iso) return Number.POSITIVE_INFINITY;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return Number.POSITIVE_INFINITY;
  return Math.max(0, nowMs - t);
}

function countOfflineToday(events: TelemetryEvent[], nowMs: number) {
  const start = new Date(nowMs);
  start.setHours(0, 0, 0, 0);
  const since = start.toISOString();
  const byStation = new Map<string, number>();
  for (const e of events) {
    if (e.kind !== "station.ws_offline") continue;
    if (e.created_at < since) continue;
    const key = e.station_id || e.message;
    byStation.set(key, (byStation.get(key) || 0) + 1);
  }
  return byStation;
}

/** Até 3 insights, prioridade: pendência → PC sumido → quedas → ociosidade → ok. */
export function buildDashboardInsights(opts: {
  metrics: DashMetricsLite;
  stations: DashStation[];
  connectedIds: Set<string>;
  live: Record<string, DashLive>;
  events: TelemetryEvent[];
  nowMs?: number;
}): Insight[] {
  const nowMs = opts.nowMs ?? Date.now();
  const out: Insight[] = [];
  const dues = opts.metrics.openDuePending || [];

  if (dues.length > 0) {
    const total = dues.reduce((s, d) => s + (d.amountReais || 0), 0);
    out.push({
      id: "open-due",
      tone: "action",
      title: `Confirmar ${dues.length} hora(s) em aberto`,
      detail: `${dues.map((d) => d.customerName).slice(0, 3).join(", ")}${dues.length > 3 ? "…" : ""} · R$ ${total.toFixed(2).replace(".", ",")}`,
    });
  }

  const longOffline = opts.stations
    .filter((s) => {
      const ws = opts.connectedIds.has(s.id) || Boolean(s.online);
      if (ws) return false;
      return ageMs(s.last_seen_at, nowMs) >= OFFLINE_MS;
    })
    .sort((a, b) => ageMs(b.last_seen_at, nowMs) - ageMs(a.last_seen_at, nowMs));

  if (longOffline.length > 0) {
    const s = longOffline[0];
    const mins = Math.floor(ageMs(s.last_seen_at, nowMs) / 60_000);
    const label = mins >= 120 ? `${Math.floor(mins / 60)}h` : `${mins} min`;
    out.push({
      id: "offline-station",
      tone: "warn",
      title: `Religar ou parear ${s.name}`,
      detail:
        longOffline.length === 1
          ? `Sem sinal há ${label}. Abra o GeekLock ou re-pareie na aba Estações.`
          : `${longOffline.length} PCs offline (ex.: ${s.name}, ${label}).`,
    });
  }

  const drops = countOfflineToday(opts.events, nowMs);
  let worstName = "";
  let worstCount = 0;
  for (const s of opts.stations) {
    const c = drops.get(s.id) || 0;
    if (c > worstCount) {
      worstCount = c;
      worstName = s.name;
    }
  }
  if (worstCount >= 3) {
    out.push({
      id: "flaky-ws",
      tone: "warn",
      title: `${worstName} caiu ${worstCount}× hoje`,
      detail: "Cheque cabo/Wi‑Fi e se o GeekLock reiniciou sozinho.",
    });
  }

  const stale = opts.metrics.today.staleSessions ?? 0;
  if (stale > 0) {
    out.push({
      id: "stale",
      tone: "warn",
      title: `${stale} sessão(ões) sem sinal`,
      detail: "Cliente pode estar em outro PC ou o Lock travou — veja Ativas agora.",
    });
  }

  const hour = new Date(nowMs).getHours();
  const online = opts.metrics.inventory.stationsOnline;
  const busy = opts.metrics.today.activeSessions;
  if (hour >= 14 && hour <= 21 && online >= 2 && busy <= 1 && opts.metrics.today.hoursUsed < 2) {
    out.push({
      id: "idle-afternoon",
      tone: "action",
      title: "PCs ociosos agora",
      detail: "Boa hora de oferecer hora avulsa ou liberar VIP parado na fila.",
    });
  }

  const days = opts.metrics.week.days;
  if (days.length >= 5) {
    const sorted = [...days].sort((a, b) => a.seconds - b.seconds);
    const quiet = sorted[0];
    const peak = sorted[sorted.length - 1];
    if (peak.seconds > 0 && quiet.seconds < peak.seconds * 0.35) {
      const quietLabel = quiet.day.slice(5).replace("-", "/");
      out.push({
        id: "quiet-day",
        tone: "action",
        title: `Dia fraco na semana: ${quietLabel}`,
        detail: "Compare com o pico no gráfico — promo curta nesse dia da semana ajuda.",
      });
    }
  }

  if (out.length === 0) {
    out.push({
      id: "ok",
      tone: "ok",
      title: "Nada urgente",
      detail: "Foque em manter PCs online e registrar venda/liberação no caixa.",
    });
  }

  return out.slice(0, 3);
}

export type StationCardModel = {
  id: string;
  name: string;
  state: "online-free" | "online-busy" | "offline" | "stale";
  subtitle: string;
};

export function buildStationCards(opts: {
  stations: DashStation[];
  connectedIds: Set<string>;
  live: Record<string, DashLive>;
  activePlaceNames: Set<string>;
  nowMs?: number;
}): StationCardModel[] {
  const nowMs = opts.nowMs ?? Date.now();
  return [...opts.stations]
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
    .map((s) => {
      const connected = opts.connectedIds.has(s.id) || Boolean(s.online);
      const live = opts.live[s.id];
      const customer = live?.customerName || null;
      const busy =
        Boolean(customer) ||
        live?.phase === "unlocked" ||
        opts.activePlaceNames.has(s.name);
      if (!connected) {
        const mins = Math.floor(ageMs(s.last_seen_at, nowMs) / 60_000);
        const when =
          !Number.isFinite(mins) || mins > 60 * 24 * 14
            ? "sem histórico"
            : mins < 60
              ? `há ${mins} min`
              : `há ${Math.floor(mins / 60)}h`;
        return {
          id: s.id,
          name: s.name,
          state: "offline" as const,
          subtitle: `Offline · ${when}`,
        };
      }
      if (busy && customer) {
        return {
          id: s.id,
          name: s.name,
          state: "online-busy" as const,
          subtitle: customer,
        };
      }
      if (busy) {
        return {
          id: s.id,
          name: s.name,
          state: "online-busy" as const,
          subtitle: "Em uso",
        };
      }
      return {
        id: s.id,
        name: s.name,
        state: "online-free" as const,
        subtitle: "Livre",
      };
    });
}
