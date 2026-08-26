import { getUnitSettings } from "./admin-ops.js";
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

/** Métricas de negócio para o dashboard do GeekCentral (além da aba Saúde). */
export function buildBusinessMetrics() {
  const db = getDb();
  const todaySince = dayStartIso();
  const weekSince = daysAgoIso(6);
  const unit = getUnitSettings();
  const sessionStats = sessionStatsToday();
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
  const uniqueVipsToday = countSince(
    `SELECT COUNT(DISTINCT customer_id) AS c FROM machine_sessions WHERE started_at >= ?`,
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
  const salesReaisToday = sumSince(
    `SELECT COALESCE(SUM(amount_reais), 0) AS s FROM time_ledger
     WHERE created_at >= ? AND reason = 'sale' AND amount_reais > 0`,
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
    weekDays.push({
      day,
      sessions: Number(sessions),
      seconds: Number(seconds ?? 0),
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

  return {
    generatedAt: new Date().toISOString(),
    unit,
    today: {
      since: todaySince,
      sessions: sessionsToday,
      secondsUsed: secondsToday,
      hoursUsed: Math.round((secondsToday / 3600) * 100) / 100,
      uniqueVips: uniqueVipsToday,
      activeSessions: sessionStats.active?.length ?? 0,
      recognitionMatches: matchesToday,
      recognitionOther: unknownToday,
      salesReais: Math.round(salesReaisToday * 100) / 100,
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
    topVipsToday: (sessionStats.byCustomer || []).slice(0, 8),
    topStationsToday: (sessionStats.byStation || []).slice(0, 8),
    activeNow: sessionStats.active || [],
  };
}
