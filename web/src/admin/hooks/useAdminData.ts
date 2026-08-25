import { useCallback, useRef, useState } from "react";
import {
  api,
  type Customer,
  type MachineSession,
  type RecognitionEvent,
  type Reward,
  type SessionStats,
  type Station,
} from "../../api";
import type { AdminSettings, LiveStationStatus, TimeLedgerRow, PointsLedgerRow } from "../types";

const defaultSettings: AdminSettings = {
  faceMatchThreshold: 0.38,
  pointsPerReal: 1,
  hourPriceReais: 10,
  subscriberHourDiscountPct: 20,
  unitName: "Unidade 1",
  unitId: "unit-1",
};

export function useAdminData(token: string | null) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [stations, setStations] = useState<Station[]>([]);
  const [connected, setConnected] = useState<Array<{ stationId: string; stationName: string }>>([]);
  const [liveStatus, setLiveStatus] = useState<Record<string, LiveStationStatus>>({});
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [events, setEvents] = useState<RecognitionEvent[]>([]);
  const [sessions, setSessions] = useState<MachineSession[]>([]);
  const [sessionStats, setSessionStats] = useState<SessionStats | null>(null);
  const [settings, setSettings] = useState<AdminSettings>(defaultSettings);
  const [health, setHealth] = useState<{ ok: boolean; faceService: boolean; time?: string } | null>(null);
  const [timeLedger, setTimeLedger] = useState<TimeLedgerRow[]>([]);
  const [pointsLedger, setPointsLedger] = useState<PointsLedgerRow[]>([]);

  const refreshInFlight = useRef<Promise<void> | null>(null);
  const debounceTimer = useRef<number | undefined>(undefined);

  const refreshNow = useCallback(async () => {
    if (!token) return;
    if (refreshInFlight.current) return refreshInFlight.current;
    refreshInFlight.current = (async () => {
      const [c, s, r, ev, st, sess, h] = await Promise.all([
        api<Customer[]>("/api/customers"),
        api<{
          stations: Station[];
          connected: Array<{ stationId: string; stationName: string }>;
          live?: Record<string, LiveStationStatus>;
        }>("/api/stations"),
        api<Reward[]>("/api/rewards"),
        api<RecognitionEvent[]>("/api/events/recognition"),
        api<AdminSettings>("/api/settings"),
        api<{ sessions: MachineSession[]; stats: SessionStats }>("/api/sessions"),
        api<{ ok: boolean; faceService: boolean; time: string }>("/api/health").catch(() => null),
      ]);
      setCustomers(c);
      setStations(s.stations);
      setConnected(s.connected);
      if (s.live) setLiveStatus(s.live);
      setRewards(r);
      setEvents(ev);
      setSettings({
        faceMatchThreshold: st.faceMatchThreshold,
        pointsPerReal: st.pointsPerReal,
        hourPriceReais: st.hourPriceReais ?? 10,
        subscriberHourDiscountPct: st.subscriberHourDiscountPct ?? 20,
        unitName: st.unitName || "Unidade 1",
        unitId: st.unitId || "unit-1",
      });
      setSessions(sess.sessions);
      setSessionStats(sess.stats);
      if (h) setHealth(h);
    })().finally(() => {
      refreshInFlight.current = null;
    });
    return refreshInFlight.current;
  }, [token]);

  const scheduleRefresh = useCallback(() => {
    if (debounceTimer.current) window.clearTimeout(debounceTimer.current);
    debounceTimer.current = window.setTimeout(() => {
      refreshNow().catch(() => undefined);
    }, 450);
  }, [refreshNow]);

  const loadTimeForCustomer = useCallback(
    async (customerId: string) => {
      if (!token) return;
      const [summary, pts] = await Promise.all([
        api<{ ledger: TimeLedgerRow[] }>(`/api/customers/${customerId}/time`),
        api<PointsLedgerRow[]>(`/api/customers/${customerId}/ledger`).catch(() => []),
      ]);
      setTimeLedger(summary.ledger || []);
      setPointsLedger(Array.isArray(pts) ? pts : []);
    },
    [token],
  );

  return {
    customers,
    stations,
    connected,
    liveStatus,
    setLiveStatus,
    rewards,
    events,
    sessions,
    sessionStats,
    settings,
    setSettings,
    health,
    timeLedger,
    pointsLedger,
    refreshNow,
    scheduleRefresh,
    loadTimeForCustomer,
  };
}
