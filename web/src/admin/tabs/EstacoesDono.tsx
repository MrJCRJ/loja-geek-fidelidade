import { useEffect, useMemo, useState } from "react";
import { api, formatDuration, type Customer, type Station } from "../../api";
import { LiberarClientePainel } from "../components/LiberarClientePainel";
import { QrCode } from "../components/QrCode";
import { formatDisplay, moneyBit, tableStatusLabel } from "../stationStatus";
import type { AdminSettings, LiveStationStatus, OpenHourRequest } from "../types";

type ConfirmOpts = {
  title: string;
  message: string;
  danger?: boolean;
  confirmLabel?: string;
};

type Props = {
  stations: Station[];
  customers: Customer[];
  connected: Array<{ stationId: string; stationName: string }>;
  liveStatus: Record<string, LiveStationStatus>;
  openRequests: OpenHourRequest[];
  settings: AdminSettings;
  refresh: () => Promise<void>;
  onError: (msg: string) => void;
  onToast: (msg: string, kind?: "ok" | "error" | "info") => void;
  askConfirm: (opts: ConfirmOpts) => Promise<boolean>;
  remoteReadOnly?: boolean;
};

export function EstacoesDono({
  stations,
  customers,
  connected,
  liveStatus,
  openRequests,
  settings,
  refresh,
  onError,
  onToast,
  askConfirm,
  remoteReadOnly,
}: Props) {
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);
  const [stationName, setStationName] = useState("");
  const [messageText, setMessageText] = useState("Olá da central!");
  const [messageTitle, setMessageTitle] = useState("Aviso da loja");
  const [messageLevel, setMessageLevel] = useState<"info" | "warn" | "urgent">("info");
  const [messageDuration, setMessageDuration] = useState(15);
  const [createdToken, setCreatedToken] = useState<{ name: string; token: string } | null>(null);
  const [liberarId, setLiberarId] = useState<string | null>(null);
  const onlineMap = useMemo(() => new Set(connected.map((c) => c.stationId)), [connected]);
  const baseHourPrice = settings.hourPriceReais || 10;

  const messageBody = () => ({
    command: "message" as const,
    text: messageText || "Aviso da central",
    title: messageTitle || undefined,
    level: messageLevel,
    durationSec: messageDuration,
  });

  const decideOpen = async (stationId: string, name: string, action: "approve" | "reject") => {
    try {
      await api(`/api/stations/${stationId}/open-request/${action}`, { method: "POST", body: "{}" });
      onToast(action === "approve" ? `Hora em aberto liberada em ${name}` : `Pedido recusado em ${name}`, "ok");
      await refresh();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Falha no pedido");
    }
  };

  const sendCmd = (stationId: string, command: string, text?: string, durationSec?: number) =>
    api(`/api/stations/${stationId}/command`, {
      method: "POST",
      body: JSON.stringify(
        command === "message"
          ? { ...messageBody(), text: text || messageBody().text }
          : { command, text, durationSec },
      ),
    })
      .then(() => onToast(`Comando ${command} enviado`, "ok"))
      .catch((e) => onError(e instanceof Error ? e.message : "Falha no comando"));

  const sendPower = async (stationId: string, name: string, command: "shutdown" | "hibernate") => {
    const ok = await askConfirm({
      title: command === "shutdown" ? `Desligar ${name}?` : `Hibernar ${name}?`,
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

  const painelLiberar = (stationId: string, name: string) => {
    if (remoteReadOnly || liberarId !== stationId) return null;
    return (
      <LiberarClientePainel
        stationId={stationId}
        stationName={name}
        customers={customers}
        refresh={refresh}
        onError={onError}
        onToast={onToast}
        askConfirm={askConfirm}
        onClose={() => setLiberarId(null)}
      />
    );
  };

  const pairBox = !remoteReadOnly ? (
    <p className="muted" style={{ margin: "0 0 0.75rem" }}>
      GeekLock novo: na rede da loja ele acha o Central sozinho. Só ponha o nome do PC (ex. PC-02) e
      Conectar.
    </p>
  ) : null;

  return (
    <div className="grid-2" role="tabpanel" id="panel-estacoes" aria-labelledby="tab-estacoes">
      <section className="panel">
        <h2>Estações</h2>
        {pairBox}
        {remoteReadOnly && <p className="muted">De casa não dá para travar/destravar PC.</p>}
        {!remoteReadOnly && (
        <>
        <p className="muted" style={{ margin: "0 0 0.75rem" }}>
          Liberar cliente cadastrado neste PC. Venda de hora fica no Caixa.
        </p>
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            api<Station>("/api/stations", {
              method: "POST",
              body: JSON.stringify({ name: stationName }),
            })
              .then(async (s) => {
                setStationName("");
                if (s.token) setCreatedToken({ name: s.name, token: s.token });
                onToast(`Estação ${s.name} criada`, "ok");
                await refresh();
              })
              .catch((err) => onError(err.message));
          }}
        >
          <input
            placeholder="Nome (ex: Balcão 1)"
            value={stationName}
            onChange={(e) => setStationName(e.target.value)}
            required
          />
          <button className="btn" type="submit">
            Criar
          </button>
        </form>

        {createdToken && (
          <div className="panel token-panel" style={{ marginTop: "1rem", boxShadow: "none" }}>
            <h3 style={{ marginTop: 0 }}>Token — {createdToken.name}</h3>
            <p className="muted">Cole no GeekLock / página da estação. Guarde agora — não será mostrado de novo.</p>
            <p className="mono" style={{ wordBreak: "break-all" }}>
              {createdToken.token}
            </p>
            <div className="row" style={{ alignItems: "flex-start" }}>
              <QrCode value={createdToken.token} />
              <div className="row">
                <button
                  className="btn"
                  type="button"
                  onClick={() =>
                    navigator.clipboard.writeText(createdToken.token).then(
                      () => onToast("Token copiado", "ok"),
                      () => onError("Falha ao copiar"),
                    )
                  }
                >
                  Copiar token
                </button>
                <button className="btn ghost" type="button" onClick={() => setCreatedToken(null)}>
                  Fechar
                </button>
              </div>
            </div>
          </div>
        )}
        </>
        )}

        <div className="table-scroll">
        <table className="table">
          <thead>
            <tr>
              <th>Nome</th>
              <th>Conexão</th>
              <th>Estado ao vivo</th>
              <th>IP</th>
              <th>Versão</th>
              <th>Tela</th>
              <th>Saúde</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {stations.length === 0 && (
              <tr>
                <td colSpan={8}>
                  <div className="empty-state">
                    <strong>Nenhuma estação</strong>
                    <p>Crie uma acima ou pareie pelo GeekLock na LAN (nome + Conectar).</p>
                  </div>
                </td>
              </tr>
            )}
            {stations.map((s) => {
              const online = onlineMap.has(s.id) || Boolean(s.online);
              const st = liveStatus[s.id];
              const openReq = openRequests.find((r) => r.station_id === s.id);
              const modeLabel = tableStatusLabel(st, online, nowMs);

              return (
                <tr key={s.id}>
                  <td>{s.name}</td>
                  <td>
                    <span className={`status-pill ${online ? "ok" : "bad"}`}>
                      {online ? "online" : "offline"}
                    </span>
                  </td>
                  <td>
                    <div>
                      {modeLabel}
                      {moneyBit(st, baseHourPrice)}
                    </div>
                    {st?.occupantKind && <small className="muted">{st.occupantKind}</small>}
                    {st?.mode === "vip" && st.present === false && (
                      <small className="muted">Ausente {st.absentLeft ?? "…"}s</small>
                    )}
                  </td>
                  <td>{s.last_ip || "—"}</td>
                  <td className="mono">{s.lock_version || "—"}</td>
                  <td className="mono">{formatDisplay(s)}</td>
                  <td>
                    {s.disk_free_pct != null || s.ram_used_pct != null || s.uptime_sec != null ? (
                      <span style={{ color: s.disk_free_pct != null && s.disk_free_pct < 15 ? "crimson" : undefined }}>
                        {s.disk_free_pct != null ? `disco ${s.disk_free_pct}%` : "—"}
                        {s.ram_used_pct != null ? ` · RAM ${s.ram_used_pct}%` : ""}
                        {s.uptime_sec != null ? ` · ${formatDuration(s.uptime_sec)}` : ""}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="row" style={{ flexWrap: "wrap" }}>
                    {remoteReadOnly ? (
                      <span className="muted">só ver</span>
                    ) : (
                    <>
                    {painelLiberar(s.id, s.name)}
                    <button className="btn" type="button" onClick={() => setLiberarId(s.id)}>
                      Liberar cliente
                    </button>
                    {openReq && (
                      <>
                        <button className="btn" type="button" onClick={() => void decideOpen(s.id, s.name, "approve")}>
                          Liberar aberto
                        </button>
                        <button className="btn ghost" type="button" onClick={() => void decideOpen(s.id, s.name, "reject")}>
                          Recusar
                        </button>
                      </>
                    )}
                    <button className="btn ghost" type="button" onClick={() => sendCmd(s.id, "lock_screen")}>
                      Travar
                    </button>
                    <button className="btn ghost" type="button" onClick={() => sendCmd(s.id, "end_session")}>
                      Encerrar
                    </button>
                    <button
                      className="btn ghost"
                      type="button"
                      onClick={() => void sendPower(s.id, s.name, "hibernate")}
                    >
                      Hibernar
                    </button>
                    <button
                      className="btn ghost"
                      type="button"
                      onClick={() => void sendPower(s.id, s.name, "shutdown")}
                    >
                      Desligar
                    </button>
                    <button
                      className="btn danger"
                      type="button"
                      onClick={async () => {
                        const ok = await askConfirm({
                          title: "Encerrar GeekLock",
                          message: `Fechar o app na estação ${s.name}? Só volta abrindo de novo no PC.`,
                          danger: true,
                          confirmLabel: "Encerrar app",
                        });
                        if (!ok) return;
                        sendCmd(s.id, "quit_app");
                      }}
                    >
                      Encerrar app
                    </button>
                    <button
                      className="btn ghost"
                      type="button"
                      onClick={() => sendCmd(s.id, "message", messageText || "Olá da central!")}
                    >
                      Msg
                    </button>
                    <button className="btn ghost" type="button" onClick={() => sendCmd(s.id, "reload")}>
                      Reload
                    </button>
                    <button
                      className="btn danger"
                      type="button"
                      onClick={async () => {
                        const ok = await askConfirm({
                          title: "Remover estação",
                          message: `Remover ${s.name}?`,
                          danger: true,
                          confirmLabel: "Remover",
                        });
                        if (!ok) return;
                        api(`/api/stations/${s.id}`, { method: "DELETE" })
                          .then(() => {
                            onToast("Estação removida", "ok");
                            return refresh();
                          })
                          .catch((e) => onError(e.message));
                      }}
                    >
                      Del
                    </button>
                    </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      </section>
      {!remoteReadOnly && (
      <section className="panel">
        <h2>Comando global</h2>
        <div className="field">
          <label>Título</label>
          <input value={messageTitle} onChange={(e) => setMessageTitle(e.target.value)} />
        </div>
        <div className="field">
          <label>Texto da mensagem</label>
          <input value={messageText} onChange={(e) => setMessageText(e.target.value)} />
        </div>
        <div className="row">
          <div className="field" style={{ flex: 1 }}>
            <label>Nível</label>
            <select
              value={messageLevel}
              onChange={(e) => setMessageLevel(e.target.value as "info" | "warn" | "urgent")}
            >
              <option value="info">Info</option>
              <option value="warn">Aviso</option>
              <option value="urgent">Urgente</option>
            </select>
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label>Duração (s)</label>
            <input
              type="number"
              min={3}
              max={600}
              value={messageDuration}
              onChange={(e) => setMessageDuration(Number(e.target.value) || 12)}
            />
          </div>
        </div>
        <div className="row">
          <button
            className="btn"
            type="button"
            onClick={() =>
              api("/api/stations/command-all", {
                method: "POST",
                body: JSON.stringify(messageBody()),
              })
                .then(() => onToast("Mensagem enviada a todos", "ok"))
                .catch((e) => onError(e.message))
            }
          >
            Mensagem p/ todos
          </button>
          <button
            className="btn"
            type="button"
            onClick={() =>
              api("/api/stations/command-all", {
                method: "POST",
                body: JSON.stringify({ command: "reload" }),
              })
                .then(() => onToast("Reload enviado", "ok"))
                .catch((e) => onError(e.message))
            }
          >
            Reload todos
          </button>
          <button
            className="btn danger"
            type="button"
            onClick={() =>
              api("/api/stations/command-all", {
                method: "POST",
                body: JSON.stringify({ command: "lock_screen" }),
              })
                .then(() => onToast("Travar todos enviado", "ok"))
                .catch((e) => onError(e.message))
            }
          >
            Travar todos
          </button>
          <button
            className="btn danger"
            type="button"
            onClick={async () => {
              const ok = await askConfirm({
                title: "Encerrar GeekLock em todos",
                message: "Fecha o app em todas as estações online. Só voltam abrindo de novo em cada PC.",
                danger: true,
                confirmLabel: "Encerrar apps",
              });
              if (!ok) return;
              api("/api/stations/command-all", {
                method: "POST",
                body: JSON.stringify({ command: "quit_app" }),
              })
                .then(() => onToast("Encerrar apps enviado", "ok"))
                .catch((e) => onError(e.message));
            }}
          >
            Encerrar apps
          </button>
          <button
            className="btn"
            type="button"
            onClick={() =>
              api("/api/stations/command-all", {
                method: "POST",
                body: JSON.stringify({ command: "end_session" }),
              })
                .then(() => onToast("Encerrar todos enviado", "ok"))
                .catch((e) => onError(e.message))
            }
          >
            Encerrar todos
          </button>
        </div>
      </section>
      )}
    </div>
  );
}
