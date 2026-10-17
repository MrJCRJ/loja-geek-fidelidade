import type { ReactNode } from "react";
import type { Customer, Station } from "../../api";
import { LiberarClientePainel } from "../components/LiberarClientePainel";
import { cardStatusLabel, formatDisplay, healthBits, moneyBit } from "../stationStatus";
import type { LiveStationStatus, OpenHourRequest } from "../types";

type ConfirmOpts = {
  title: string;
  message: string;
  danger?: boolean;
  confirmLabel?: string;
};

type Props = {
  stations: Station[];
  customers: Customer[];
  liveStatus: Record<string, LiveStationStatus>;
  openRequests: OpenHourRequest[];
  nowMs: number;
  onlineMap: Set<string>;
  hourPrice: number;
  remoteReadOnly?: boolean;
  liberarId: string | null;
  setLiberarId: (id: string | null) => void;
  pairBox: ReactNode;
  refresh: () => Promise<void>;
  onError: (msg: string) => void;
  onToast: (msg: string, kind?: "ok" | "error" | "info") => void;
  askConfirm: (opts: ConfirmOpts) => Promise<boolean>;
  decideOpen: (stationId: string, stationName: string, action: "approve" | "reject") => void;
  sendCmd: (stationId: string, command: string, text?: string, durationSec?: number) => void;
  sendPower: (stationId: string, stationName: string, command: "shutdown" | "hibernate") => void;
};

export function PcCardList({
  stations,
  customers,
  liveStatus,
  openRequests,
  nowMs,
  onlineMap,
  hourPrice,
  remoteReadOnly,
  liberarId,
  setLiberarId,
  pairBox,
  refresh,
  onError,
  onToast,
  askConfirm,
  decideOpen,
  sendCmd,
  sendPower,
}: Props) {
  return (
    <div role="tabpanel" id="panel-estacoes" aria-labelledby="tab-estacoes">
      <h2 style={{ marginTop: 0 }}>PCs</h2>
      {pairBox}
      {stations.length === 0 && <p className="muted">Nenhum PC pareado.</p>}
      <div className="pc-cards">
        {stations.map((s) => {
          const online = onlineMap.has(s.id) || Boolean(s.online);
          const st = liveStatus[s.id];
          const openReq = openRequests.find((r) => r.station_id === s.id);
          const modeLabel = cardStatusLabel(st, online, nowMs);
          const ver = s.lock_version || "?";
          const verHint = !s.lock_version ? "versão desconhecida" : online ? `v${ver}` : `v${ver} · desligado`;
          const bits = healthBits(s);
          const diskWarn = s.disk_free_pct != null && s.disk_free_pct < 15;
          return (
            <section key={s.id} className="panel pc-card">
              <div className="pc-card-head">
                <h2>{s.name}</h2>
                <span className={`status-pill ${online ? "ok" : "bad"}`}>{online ? "online" : "offline"}</span>
              </div>
              <p className="muted" style={{ margin: "0 0 0.75rem" }}>
                {modeLabel}
                {moneyBit(st, hourPrice)}
                <span className="mono" style={{ marginLeft: "0.5rem" }}>
                  {verHint}
                </span>
              </p>
              {bits.length > 0 && (
                <p className="muted" style={{ margin: "0 0 0.75rem", color: diskWarn ? "crimson" : undefined }}>
                  {bits.join(" · ")}
                  {diskWarn ? " · disco baixo" : ""}
                </p>
              )}
              <p className="muted mono" style={{ margin: "0 0 0.75rem" }}>
                {formatDisplay(s)}
              </p>
              {openReq && !remoteReadOnly && (
                <div className="panel" style={{ marginBottom: "0.75rem", boxShadow: "none" }}>
                  <p style={{ margin: "0 0 0.5rem" }}>
                    <strong>{openReq.customer_name}</strong> pediu hora em aberto
                  </p>
                  <div className="row" style={{ gap: "0.35rem", flexWrap: "wrap" }}>
                    <button className="btn" type="button" onClick={() => void decideOpen(s.id, s.name, "approve")}>
                      Liberar aberto
                    </button>
                    <button className="btn ghost" type="button" onClick={() => void decideOpen(s.id, s.name, "reject")}>
                      Recusar
                    </button>
                  </div>
                </div>
              )}
              {!remoteReadOnly ? (
                <>
                  {liberarId === s.id && (
                    <LiberarClientePainel
                      stationId={s.id}
                      stationName={s.name}
                      customers={customers}
                      refresh={refresh}
                      onError={onError}
                      onToast={onToast}
                      askConfirm={askConfirm}
                      onClose={() => setLiberarId(null)}
                    />
                  )}
                  <div className="pc-card-actions">
                    <button className="btn" type="button" onClick={() => setLiberarId(s.id)}>
                      Liberar cliente
                    </button>
                    <button className="btn ghost" type="button" onClick={() => sendCmd(s.id, "lock_screen")}>
                      Travar
                    </button>
                    <button className="btn ghost" type="button" onClick={() => sendCmd(s.id, "end_session")}>
                      Encerrar
                    </button>
                    <button className="btn ghost" type="button" onClick={() => void sendPower(s.id, s.name, "hibernate")}>
                      Hibernar
                    </button>
                    <button className="btn ghost" type="button" onClick={() => void sendPower(s.id, s.name, "shutdown")}>
                      Desligar
                    </button>
                  </div>
                </>
              ) : null}
            </section>
          );
        })}
      </div>
    </div>
  );
}
