import { useCallback, useEffect, useRef } from "react";
import { formatDuration, wsUrl } from "../../api";
import type { LiveFeedItem, LiveStationStatus } from "../types";

type Handlers = {
  token: string | null;
  onLive: (updater: (prev: LiveFeedItem[]) => LiveFeedItem[]) => void;
  onLiveStatus: (updater: (prev: Record<string, LiveStationStatus>) => Record<string, LiveStationStatus>) => void;
  scheduleRefresh: () => void;
};

export function useAdminSocket({ token, onLive, onLiveStatus, scheduleRefresh }: Handlers) {
  const refreshRef = useRef(scheduleRefresh);
  refreshRef.current = scheduleRefresh;
  const onLiveRef = useRef(onLive);
  onLiveRef.current = onLive;
  const onLiveStatusRef = useRef(onLiveStatus);
  onLiveStatusRef.current = onLiveStatus;

  const pushLive = useCallback((text: string, at?: string) => {
    onLiveRef.current((prev) =>
      [{ text, at: at || new Date().toISOString() }, ...prev].slice(0, 15),
    );
  }, []);

  useEffect(() => {
    if (!token) return;
    let ws: WebSocket | null = null;
    let closed = false;
    let attempt = 0;
    let timer: number | undefined;

    const connect = () => {
      if (closed) return;
      ws = new WebSocket(wsUrl("admin", token));
      ws.onopen = () => {
        attempt = 0;
      };
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          if (msg.type === "vip_detected") {
            pushLive(
              `VIP ${msg.customer?.name} em ${msg.station?.name} (score ${(msg.score * 100).toFixed(0)}%)`,
              msg.at,
            );
            refreshRef.current();
          }
          if (msg.type === "session_started") {
            pushLive(
              `VIP ${msg.session?.customer_name || "?"} liberou ${msg.session?.station_name || msg.station?.name}`,
              msg.at,
            );
            refreshRef.current();
          }
          if (msg.type === "session_ended") {
            const secs = msg.session?.seconds_total ?? 0;
            pushLive(
              `Sessão encerrada — ${msg.session?.customer_name || "?"} em ${msg.session?.station_name || "?"} (${formatDuration(secs)})`,
              msg.at,
            );
            refreshRef.current();
          }
          if (msg.type === "station_online") {
            pushLive(`Estação online: ${msg.station?.name || "?"}`, msg.at);
            refreshRef.current();
          }
          if (msg.type === "station_offline") {
            pushLive(`Estação offline: ${msg.station?.name || "?"}`, msg.at);
            refreshRef.current();
          }
          if (msg.type === "station_status" && msg.station?.id) {
            onLiveStatusRef.current((prev) => ({
              ...prev,
              [msg.station.id]: {
                phase: msg.phase,
                mode: msg.mode,
                customerName: msg.customerName,
                elapsed: msg.elapsed,
                present: msg.present,
                absentLeft: msg.absentLeft,
                at: msg.at,
              },
            }));
          }
          if (msg.type === "station_heartbeat" || msg.type === "points_updated" || msg.type === "reward_redeemed") {
            refreshRef.current();
          }
        } catch {
          /* ignore */
        }
      };
      ws.onclose = () => {
        if (closed) return;
        attempt += 1;
        const delay = Math.min(15_000, 800 * 2 ** Math.min(attempt, 4));
        timer = window.setTimeout(connect, delay);
      };
      ws.onerror = () => {
        ws?.close();
      };
    };

    connect();
    return () => {
      closed = true;
      if (timer) window.clearTimeout(timer);
      ws?.close();
    };
  }, [token, pushLive]);
}
