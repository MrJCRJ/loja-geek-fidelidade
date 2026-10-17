import { useEffect, useMemo, useState } from "react";
import { api, type Customer, type Station } from "../../api";
import { PcCardList } from "./PcCardList";
import { EstacoesDono } from "./EstacoesDono";
import type { AdminSettings, LiveStationStatus, OpenHourRequest } from "../types";

type Props = {
  stations: Station[];
  customers: Customer[];
  connected: Array<{ stationId: string; stationName: string }>;
  liveStatus: Record<string, LiveStationStatus>;
  openRequests?: OpenHourRequest[];
  settings: AdminSettings;
  refresh: () => Promise<void>;
  onError: (msg: string) => void;
  onToast: (msg: string, kind?: "ok" | "error" | "info") => void;
  askConfirm: (opts: {
    title: string;
    message: string;
    danger?: boolean;
    confirmLabel?: string;
  }) => Promise<boolean>;
  remoteReadOnly?: boolean;
  compact?: boolean;
};

export function EstacoesTab({
  stations,
  customers,
  connected,
  liveStatus,
  openRequests = [],
  settings,
  refresh,
  onError,
  onToast,
  askConfirm,
  remoteReadOnly,
  compact,
}: Props) {
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);
  const [liberarId, setLiberarId] = useState<string | null>(null);
  const onlineMap = useMemo(() => new Set(connected.map((c) => c.stationId)), [connected]);
  const baseHourPrice = settings.hourPriceReais || 10;

  const decideOpen = async (stationId: string, stationName: string, action: "approve" | "reject") => {
    try {
      await api(`/api/stations/${stationId}/open-request/${action}`, { method: "POST", body: "{}" });
      onToast(action === "approve" ? `Hora em aberto liberada em ${stationName}` : `Pedido recusado em ${stationName}`, "ok");
      await refresh();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Falha no pedido");
    }
  };

  const sendCmd = (stationId: string, command: string, text?: string, durationSec?: number) =>
    api(`/api/stations/${stationId}/command`, {
      method: "POST",
      body: JSON.stringify({ command, text, durationSec }),
    })
      .then(() => onToast(`Comando ${command} enviado`, "ok"))
      .catch((e) => onError(e instanceof Error ? e.message : "Falha no comando"));

  const sendPower = async (stationId: string, stationName: string, command: "shutdown" | "hibernate") => {
    const ok = await askConfirm({
      title: command === "shutdown" ? `Desligar ${stationName}?` : `Hibernar ${stationName}?`,
      message:
        command === "shutdown"
          ? "O Windows vai desligar. Só use se o PC estiver online no GeekLock."
          : "O PC hiberna. Acordar depois é local (botão/energia) — sem WoL nesta versão.",
      danger: command === "shutdown",
      confirmLabel: command === "shutdown" ? "Desligar" : "Hibernar",
    });
    if (!ok) return;
    sendCmd(stationId, command);
  };


  const pairBox = !remoteReadOnly ? (
    <p className="muted" style={{ margin: "0 0 0.75rem" }}>
      GeekLock novo: na rede da loja ele acha o Central sozinho. Só ponha o nome do PC (ex. PC-02) e
      Conectar.
    </p>
  ) : null;

  if (compact) {
    return (
      <PcCardList
        stations={stations}
        customers={customers}
        liveStatus={liveStatus}
        openRequests={openRequests}
        nowMs={nowMs}
        onlineMap={onlineMap}
        hourPrice={baseHourPrice}
        remoteReadOnly={remoteReadOnly}
        liberarId={liberarId}
        setLiberarId={setLiberarId}
        pairBox={pairBox}
        refresh={refresh}
        onError={onError}
        onToast={onToast}
        askConfirm={askConfirm}
        decideOpen={decideOpen}
        sendCmd={sendCmd}
        sendPower={sendPower}
      />
    );
  }

  return (
    <EstacoesDono
      stations={stations}
      customers={customers}
      connected={connected}
      liveStatus={liveStatus}
      openRequests={openRequests}
      settings={settings}
      refresh={refresh}
      onError={onError}
      onToast={onToast}
      askConfirm={askConfirm}
      remoteReadOnly={remoteReadOnly}
    />
  );
}
