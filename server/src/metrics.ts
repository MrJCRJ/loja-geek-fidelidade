import { getUnitSettings } from "./admin-ops.js";
import { listPendingOpenDues } from "./billing.js";
import { ensureConsoles } from "./consoles.js";
import { getDb } from "./db.js";
import { listConnectedStations } from "./hub.js";
import { listStations } from "./stations.js";
import { sessionStatsToday } from "./sessions.js";

type CountRow = { c: number };
type SumRow = { s: number | null };

function dayStartIso(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.toISOString();
}

function daysAgoIso(days: number) {
  const x = new Date();
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - days);
  return x.toISOString();
}

function countSince(sql: string, since: string): number {
  const row = getDb().prepare(sql).get(since) as CountRow | undefined;
  return Number(row?.c ?? 0);
}

function sumSince(sql: string, since: string): number {
  const row = getDb().prepare(sql).get(since) as SumRow | undefined;
  return Number(row?.s ?? 0);
}

type ConsoleUseRow = {
  id: string;
  console_id: string;
  console_name: string;
  customer_id: string;
  customer_name: string;
  mode: string;
  started_at: string;
  ends_at: string | null;
  granted_seconds: number;
  status: string;
  ended_at: string | null;
};

function consoleUsedSeconds(row: ConsoleUseRow, now = Date.now()): number {
  const granted = Math.max(0, Number(row.granted_seconds) || 0);
  if (row.mode === "open" || !row.ends_at) return 0;
  const ends = Date.parse(row.ends_at);
  if (!Number.isFinite(ends)) return 0;
  if (row.status === "active") {
    const left = Math.max(0, Math.floor((ends - now) / 1000));
    return Math.max(0, granted - left);
  }
  if (row.status === "expired") return granted;
  const ended = row.ended_at ? Date.parse(row.ended_at) : now;
  const leftover = Math.max(0, Math.floor((ends - ended) / 1000));
  return Math.max(0, granted - leftover);
}

function consoleRemainingSeconds(row: ConsoleUseRow, now = Date.now()): number {
  if (row.status !== "active" || !row.ends_at) return 0;
  const ends = Date.parse(row.ends_at);
  if (!Number.isFinite(ends)) return 0;
  return Math.max(0, Math.floor((ends - now) / 1000));
}

function loadConsoleSessions(): ConsoleUseRow[] {
  ensureConsoles();
  return getDb()
    .prepare(
      `SELECT s.id, s.console_id, c.name AS console_name, s.customer_id, cu.name AS customer_name,
              s.mode, s.started_at, s.ends_at, s.granted_seconds, s.status, s.ended_at
       FROM console_sessions s
       JOIN consoles c ON c.id = s.console_id
       JOIN customers cu ON cu.id = s.customer_id`,
    )
    .all() as ConsoleUseRow[];
}

/** Métricas de negócio para o dashboard do GeekCentral (além da aba Saúde). */
export function buildBusinessMetrics() {
  const db = getDb();
  const todaySince = dayStartIso();
  const weekSince = daysAgoIso(6);
  const unit = getUnitSettings();
  const sessionStats = sessionStatsToday();
  const consoleSessions = loadConsoleSessions();
  const nowMs = Date.now();
  const stations = listStations() as Array<{ id: string; online: number }>;
  const connected = listConnectedStations();

  const customers = (db.prepare("SELECT COUNT(*) AS c FROM customers").get() as CountRow).c;
  const withFace = (
    db
      .prepare(
        `SELECT COUNT(DISTINCT customer_id) AS c FROM face_embeddings`,
      )
      .get() as CountRow
  ).c;
  const subscribersActive = (
    db
      .prepare(
        `SELECT COUNT(*) AS c FROM customers
         WHERE subscription_status = 'active'
           AND (subscription_expires_at IS NULL OR subscription_expires_at > datetime('now'))`,
      )
      .get() as CountRow
  ).c;
  const timeBalanceSeconds = (
    db.prepare("SELECT COALESCE(SUM(time_balance_seconds), 0) AS s FROM customers").get() as SumRow
  ).s;

  const sessionsToday = countSince(
    `SELECT COUNT(*) AS c FROM machine_sessions WHERE started_at >= ?`,
    todaySince,
  );
  const secondsToday = sumSince(
    `SELECT COALESCE(SUM(seconds_total), 0) AS s FROM machine_sessions WHERE started_at >= ?`,
    todaySince,
  );
  const matchesToday = countSince(
    `SELECT COUNT(*) AS c FROM recognition_events WHERE created_at >= ? AND status = 'matched'`,
    todaySince,
  );
  const unknownToday = countSince(
    `SELECT COUNT(*) AS c FROM recognition_events WHERE created_at >= ? AND status != 'matched'`,
    todaySince,
  );
  const methodTotals = (from: string, to?: string) => {
    const sql = to
      ? `SELECT payment_method AS method, COALESCE(SUM(amount_reais), 0) AS s
         FROM time_ledger
         WHERE amount_reais > 0 AND payment_method IS NOT NULL AND (
           (reason = 'sale' AND created_at >= ? AND created_at < ?)
           OR (reason = 'open_due' AND paid_at >= ? AND paid_at < ?)
         )
         GROUP BY payment_method`
      : `SELECT payment_method AS method, COALESCE(SUM(amount_reais), 0) AS s
         FROM time_ledger
         WHERE amount_reais > 0 AND payment_method IS NOT NULL AND (
           (reason = 'sale' AND created_at >= ?)
           OR (reason = 'open_due' AND paid_at >= ?)
         )
         GROUP BY payment_method`;
    const rows = (to ? db.prepare(sql).all(from, to, from, to) : db.prepare(sql).all(from, from)) as Array<{
      method: string;
      s: number;
    }>;
    const out = { pix: 0, card: 0, cash: 0 };
    for (const row of rows) {
      if (row.method === "pix" || row.method === "card" || row.method === "cash") out[row.method] = Number(row.s) || 0;
    }
    return out;
  };
  const paymentsToday = methodTotals(todaySince);

  const salesReaisToday =
    sumSince(
      `SELECT COALESCE(SUM(amount_reais), 0) AS s FROM time_ledger
       WHERE created_at >= ? AND reason = 'sale' AND amount_reais > 0`,
      todaySince,
    ) +
    sumSince(
      `SELECT COALESCE(SUM(amount_reais), 0) AS s FROM time_ledger
       WHERE paid_at >= ? AND reason = 'open_due' AND amount_reais > 0`,
      todaySince,
    );
  const portalPaidToday = sumSince(
    `SELECT COALESCE(SUM(amount_reais), 0) AS s FROM web_orders
     WHERE paid_at >= ? AND status IN ('paid', 'demo_ok')`,
    todaySince,
  );
  const portalOrdersToday = countSince(
    `SELECT COUNT(*) AS c FROM web_orders
     WHERE paid_at >= ? AND status IN ('paid', 'demo_ok')`,
    todaySince,
  );

  const weekDays: Array<{
    day: string;
    sessions: number;
    seconds: number;
    salesReais: number;
    matches: number;
  }> = [];
  for (let i = 6; i >= 0; i--) {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - i);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    const from = start.toISOString();
    const to = end.toISOString();
    const day = from.slice(0, 10);
    const sessions = (
      db
        .prepare(
          `SELECT COUNT(*) AS c FROM machine_sessions WHERE started_at >= ? AND started_at < ?`,
        )
        .get(from, to) as CountRow
    ).c;
    const seconds = (
      db
        .prepare(
          `SELECT COALESCE(SUM(seconds_total), 0) AS s FROM machine_sessions
           WHERE started_at >= ? AND started_at < ?`,
        )
        .get(from, to) as SumRow
    ).s;
    const salesReais = (
      db
        .prepare(
          `SELECT COALESCE(SUM(amount_reais), 0) AS s FROM time_ledger
           WHERE created_at >= ? AND created_at < ? AND reason = 'sale' AND amount_reais > 0`,
        )
        .get(from, to) as SumRow
    ).s;
    const matches = (
      db
        .prepare(
          `SELECT COUNT(*) AS c FROM recognition_events
           WHERE created_at >= ? AND created_at < ? AND status = 'matched'`,
        )
        .get(from, to) as CountRow
    ).c;
    const dayConsoles = consoleSessions.filter((s) => s.started_at >= from && s.started_at < to);
    weekDays.push({
      day,
      sessions: Number(sessions) + dayConsoles.length,
      seconds: Number(seconds ?? 0) + dayConsoles.reduce((a, s) => a + consoleUsedSeconds(s, nowMs), 0),
      salesReais: Number(salesReais ?? 0),
      matches: Number(matches),
    });
  }

  const weekSeconds = weekDays.reduce((a, d) => a + d.seconds, 0);
  const weekSales = weekDays.reduce((a, d) => a + d.salesReais, 0);
  const weekSessions = weekDays.reduce((a, d) => a + d.sessions, 0);

  const monthSince = daysAgoIso(29);
  const monthSalesBalcao = sumSince(
    `SELECT COALESCE(SUM(amount_reais), 0) AS s FROM time_ledger
     WHERE created_at >= ? AND reason = 'sale' AND amount_reais > 0`,
    monthSince,
  );
  const monthPortalPaid = sumSince(
    `SELECT COALESCE(SUM(amount_reais), 0) AS s FROM web_orders
     WHERE paid_at >= ? AND status IN ('paid', 'demo_ok')`,
    monthSince,
  );
  const monthPortalOrders = countSince(
    `SELECT COUNT(*) AS c FROM web_orders
     WHERE paid_at >= ? AND status IN ('paid', 'demo_ok')`,
    monthSince,
  );
  const weekPortalPaid = sumSince(
    `SELECT COALESCE(SUM(amount_reais), 0) AS s FROM web_orders
     WHERE paid_at >= ? AND status IN ('paid', 'demo_ok')`,
    weekSince,
  );

  const consolesToday = consoleSessions.filter((s) => s.started_at >= todaySince);
  const consoleSecondsToday = consolesToday.reduce((a, s) => a + consoleUsedSeconds(s, nowMs), 0);
  const pcCustomerIds = new Set(
    (
      db
        .prepare(`SELECT DISTINCT customer_id AS id FROM machine_sessions WHERE started_at >= ?`)
        .all(todaySince) as Array<{ id: string }>
    ).map((r) => r.id),
  );
  for (const row of consolesToday) pcCustomerIds.add(row.customer_id);

  const openConsoles = consoleSessions.filter((s) => s.status === "active" || s.status === "expired");
  const secondsTodayAll = secondsToday + consoleSecondsToday;
  const sessionsTodayAll = sessionsToday + consolesToday.length;

  const vipSeconds = new Map<string, { name: string; level: string; seconds: number; sessions: number }>();
  for (const row of (sessionStats.byCustomer || []) as Array<{
    customer_id: string;
    customer_name: string;
    customer_level: string;
    seconds_total: number;
    sessions: number;
  }>) {
    vipSeconds.set(row.customer_id, {
      name: row.customer_name,
      level: row.customer_level,
      seconds: Number(row.seconds_total) || 0,
      sessions: Number(row.sessions) || 0,
    });
  }
  for (const row of consolesToday) {
    const used = consoleUsedSeconds(row, nowMs);
    const cur = vipSeconds.get(row.customer_id) || {
      name: row.customer_name,
      level: "bronze",
      seconds: 0,
      sessions: 0,
    };
    cur.seconds += used;
    cur.sessions += 1;
    cur.name = row.customer_name || cur.name;
    vipSeconds.set(row.customer_id, cur);
  }
  const topVipsToday = [...vipSeconds.entries()]
    .map(([customer_id, v]) => ({
      customer_id,
      customer_name: v.name,
      customer_level: v.level,
      seconds_total: v.seconds,
      sessions: v.sessions,
    }))
    .sort((a, b) => b.seconds_total - a.seconds_total)
    .slice(0, 8);

  const byConsole = new Map<string, { name: string; seconds: number; sessions: number }>();
  for (const row of consolesToday) {
    const cur = byConsole.get(row.console_id) || { name: row.console_name, seconds: 0, sessions: 0 };
    cur.seconds += consoleUsedSeconds(row, nowMs);
    cur.sessions += 1;
    byConsole.set(row.console_id, cur);
  }
  const topConsolesToday = [...byConsole.entries()]
    .map(([console_id, v]) => ({
      console_id,
      console_name: v.name,
      seconds_total: v.seconds,
      sessions: v.sessions,
    }))
    .sort((a, b) => b.seconds_total - a.seconds_total);

  const roster = db
    .prepare("SELECT id, name FROM consoles ORDER BY sort_order, name")
    .all() as Array<{ id: string; name: string }>;
  const consoles = roster.map((console) => {
    const session = openConsoles.find((s) => s.console_id === console.id);
    if (!session) {
      return {
        id: console.id,
        name: console.name,
        status: "free" as const,
        customerName: null as string | null,
        endsAt: null as string | null,
        remainingSeconds: 0,
        mode: null as string | null,
      };
    }
    const expired = session.status === "expired";
    return {
      id: console.id,
      name: console.name,
      status: session.mode === "open" ? ("open" as const) : expired ? ("expired" as const) : ("active" as const),
      customerName: session.customer_name,
      endsAt: session.ends_at,
      remainingSeconds: consoleRemainingSeconds(session, nowMs),
      mode: session.mode,
    };
  });

  const activeNow = [
    ...((sessionStats.active || []) as Array<{
      id: string;
      customer_name: string;
      station_name: string;
      seconds_total: number;
      started_at: string;
    }>).map((s) => ({
      id: s.id,
      customer_name: s.customer_name,
      place_name: s.station_name,
      kind: "pc" as const,
      seconds_total: Number(s.seconds_total) || 0,
      remaining_seconds: null as number | null,
      status: "active",
      started_at: s.started_at,
    })),
    ...openConsoles.map((s) => ({
      id: s.id,
      customer_name: s.customer_name,
      place_name: s.console_name,
      kind: "console" as const,
      seconds_total: consoleUsedSeconds(s, nowMs),
      remaining_seconds: s.mode === "open" ? null : consoleRemainingSeconds(s, nowMs),
      status: s.status,
      started_at: s.started_at,
    })),
  ];

  return {
    generatedAt: new Date().toISOString(),
    unit,
    today: {
      since: todaySince,
      sessions: sessionsTodayAll,
      secondsUsed: secondsTodayAll,
      hoursUsed: Math.round((secondsTodayAll / 3600) * 100) / 100,
      uniqueVips: pcCustomerIds.size,
      activeSessions: (sessionStats.active?.length ?? 0) + openConsoles.length,
      recognitionMatches: matchesToday,
      recognitionOther: unknownToday,
      salesReais: Math.round(salesReaisToday * 100) / 100,
      payments: {
        pix: Math.round(paymentsToday.pix * 100) / 100,
        card: Math.round(paymentsToday.card * 100) / 100,
        cash: Math.round(paymentsToday.cash * 100) / 100,
      },
      portalPaidReais: Math.round(portalPaidToday * 100) / 100,
      portalOrdersPaid: portalOrdersToday,
      totalRevenueReais: Math.round((salesReaisToday + portalPaidToday) * 100) / 100,
    },
    week: {
      since: weekSince,
      sessions: weekSessions,
      secondsUsed: weekSeconds,
      hoursUsed: Math.round((weekSeconds / 3600) * 100) / 100,
      salesReais: Math.round(weekSales * 100) / 100,
      portalPaidReais: Math.round(weekPortalPaid * 100) / 100,
      totalRevenueReais: Math.round((weekSales + weekPortalPaid) * 100) / 100,
      days: weekDays,
    },
    month: {
      since: monthSince,
      salesReais: Math.round(monthSalesBalcao * 100) / 100,
      portalPaidReais: Math.round(monthPortalPaid * 100) / 100,
      portalOrdersPaid: monthPortalOrders,
      totalRevenueReais: Math.round((monthSalesBalcao + monthPortalPaid) * 100) / 100,
    },
    inventory: {
      customers,
      withFace,
      subscribersActive,
      stationsTotal: stations.length,
      stationsOnline: stations.filter(
        (s) => Boolean(s.online) || connected.some((c) => c.stationId === s.id),
      ).length,
      timeBalanceHours: Math.round((Number(timeBalanceSeconds ?? 0) / 3600) * 100) / 100,
    },
    paymentsToday,
    openDuePending: listPendingOpenDues(),
    caixaToday: db
      .prepare(
        `SELECT l.id, c.name AS customer_name, l.reason, l.amount_reais, l.delta_seconds,
                l.payment_method, l.paid_at, l.created_at, l.meta
         FROM time_ledger l
         JOIN customers c ON c.id = l.customer_id
         WHERE l.amount_reais > 0 AND (
           (l.reason = 'sale' AND l.created_at >= ?)
           OR (l.reason = 'open_due' AND (l.created_at >= ? OR l.paid_at >= ?))
         )
         ORDER BY l.created_at DESC
         LIMIT 40`,
      )
      .all(todaySince, todaySince, todaySince)
      .map((row) => {
        const item = row as {
          id: string;
          customer_name: string;
          reason: string;
          amount_reais: number;
          delta_seconds: number;
          payment_method: string | null;
          paid_at: string | null;
          created_at: string;
          meta: string | null;
        };
        let openSeconds = item.delta_seconds;
        if (item.reason === "open_due") {
          try {
            openSeconds = Number(JSON.parse(item.meta || "{}").openSeconds || 0);
          } catch {
            openSeconds = 0;
          }
        }
        return {
          id: item.id,
          customerName: item.customer_name,
          kind: item.reason === "open_due" ? "aberto" : "venda",
          amountReais: item.amount_reais,
          seconds: openSeconds,
          paymentMethod: item.payment_method,
          paidAt: item.paid_at,
          createdAt: item.created_at,
        };
      }),
    topVipsToday,
    topStationsToday: (sessionStats.byStation || []).slice(0, 8),
    topConsolesToday,
    consoles,
    activeNow,
  };
}
