import { useMemo, useState } from "react";
import { api, formatClock, formatDuration, type Station } from "../../api";
import { QrCode } from "../components/QrCode";
import { TimeDurationPicker, durationToSeconds } from "../components/TimeDurationPicker";
import type { AdminSettings, LiveStationStatus } from "../types";

type UnlockKind = "staff_timed" | "staff_open" | "guest_named";

type Props = {
  stations: Station[];
  connected: Array<{ stationId: string; stationName: string }>;
  liveStatus: Record<string, LiveStationStatus>;
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
  connected,
  liveStatus,
  settings,
  refresh,
  onError,
  onToast,
  askConfirm,
  remoteReadOnly,
  compact,
}: Props) {
  const [stationName, setStationName] = useState("");
  const [messageText, setMessageText] = useState("Olá da central!");
  const [messageTitle, setMessageTitle] = useState("Aviso da loja");
  const [messageLevel, setMessageLevel] = useState<"info" | "warn" | "urgent">("info");
  const [messageDuration, setMessageDuration] = useState(15);
  const [createdToken, setCreatedToken] = useState<{ name: string; token: string } | null>(null);
  const [liberarId, setLiberarId] = useState<string | null>(null);
  const [unlockH, setUnlockH] = useState(0);
  const [unlockM, setUnlockM] = useState(30);
  const [unlockKind, setUnlockKind] = useState<UnlockKind>("staff_timed");
  const [guestLabel, setGuestLabel] = useState("");
  const [guestOpen, setGuestOpen] = useState(false);
  const onlineMap = useMemo(() => new Set(connected.map((c) => c.stationId)), [connected]);
  const recents = settings.guestLabelRecents || [];
  const maxMin = settings.staffTimedMaxMinutes || 240;

  const messageBody = () => ({
    command: "message" as const,
    text: messageText || "Aviso da central",
    title: messageTitle || undefined,
    level: messageLevel,
    durationSec: messageDuration,
  });

  const unlockPayload = (durationSec?: number) => {
    if (unlockKind === "staff_open") {
      return { command: "unlock_screen" as const, occupantKind: "staff_open" as const };
    }
    if (unlockKind === "guest_named") {
      return {
        command: "unlock_screen" as const,
        occupantKind: "guest_named" as const,
        guestLabel: guestLabel.trim(),
        durationSec: guestOpen ? undefined : durationSec,
      };
    }
    return {
      command: "unlock_screen" as const,
      occupantKind: "staff_timed" as const,
      durationSec,
    };
  };

  const sendCmd = (stationId: string, command: string, text?: string, durationSec?: number) =>
    api(`/api/stations/${stationId}/command`, {
      method: "POST",
      body: JSON.stringify(
        command === "message"
          ? { ...messageBody(), text: text || messageBody().text }
          : command === "unlock_screen"
            ? unlockPayload(durationSec)
            : { command, text, durationSec },
      ),
    })
      .then(() => {
        if (command === "unlock_screen" && unlockKind === "staff_open") {
          onToast("Liberado aberto (só trava pelo Central)", "ok");
          return;
        }
        if (command === "unlock_screen" && durationSec) {
          const h = Math.floor(durationSec / 3600);
          const m = Math.round((durationSec % 3600) / 60);
          onToast(h ? `Liberado por ${h}h ${String(m).padStart(2, "0")}m` : `Liberado por ${m} min`, "ok");
          return;
        }
        onToast(`Comando ${command} enviado`, "ok");
      })
      .catch((e) => onError(e instanceof Error ? e.message : "Falha no comando"));

  const liberarPor = async (stationId: string, sec: number) => {
    if (unlockKind === "staff_open") {
      const ok = await askConfirm({
        title: "Destrave aberto",
        message: "O PC fica liberado até alguém travar pelo Central. Confirma?",
        confirmLabel: "Destravar aberto",
      });
      if (!ok) return;
      setLiberarId(null);
      sendCmd(stationId, "unlock_screen");
      return;
    }
    if (unlockKind === "guest_named" && guestLabel.trim().length < 2) {
      onError("Digite um rótulo de convidado (mín. 2 caracteres)");
      return;
    }
    const capped = Math.min(maxMin * 60, Math.max(sec, 60));
    setLiberarId(null);
    sendCmd(stationId, "unlock_screen", undefined, guestOpen ? undefined : capped);
  };

  const unlockKindControls = (
    <div style={{ marginBottom: "0.75rem" }}>
      <p className="muted" style={{ margin: "0 0 0.35rem" }}>
        Tipo de liberação
      </p>
      <div className="row" style={{ flexWrap: "wrap", gap: "0.35rem", marginBottom: "0.5rem" }}>
        {(
          [
            ["staff_timed", "Staff (tempo)"],
            ["staff_open", "Staff (aberto)"],
            ["guest_named", "Convidado"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            className={`btn ${unlockKind === id ? "" : "ghost"}`}
            type="button"
            onClick={() => setUnlockKind(id)}
          >
            {label}
          </button>
        ))}
      </div>
      {unlockKind === "guest_named" && (
        <div className="field" style={{ marginBottom: "0.5rem" }}>
          <label>Rótulo do convidado</label>
          <input
            value={guestLabel}
            onChange={(e) => setGuestLabel(e.target.value)}
            placeholder="Ex.: João (amigo)"
            maxLength={40}
          />
          {recents.length > 0 && (
            <div className="row" style={{ flexWrap: "wrap", gap: "0.35rem", marginTop: "0.35rem" }}>
              {recents.map((r) => (
                <button key={r} className="btn ghost" type="button" onClick={() => setGuestLabel(r)}>
                  {r}
                </button>
              ))}
            </div>
          )}
          <label className="row" style={{ gap: "0.5rem", alignItems: "center", marginTop: "0.5rem" }}>
            <input type="checkbox" checked={guestOpen} onChange={(e) => setGuestOpen(e.target.checked)} />
            Sem tempo (até travar)
          </label>
        </div>
      )}
    </div>
  );

  const pairBox = !remoteReadOnly ? (
    <p className="muted" style={{ margin: "0 0 0.75rem" }}>
      GeekLock novo: na rede da loja ele acha o Central sozinho. Só ponha o nome do PC (ex. PC-02) e
      Conectar.
    </p>
  ) : null;

  if (compact) {
    return (
      <div role="tabpanel" id="panel-estacoes" aria-labelledby="tab-estacoes">
        {pairBox}
        {stations.length === 0 && <p className="muted">Nenhum PC pareado.</p>}
        <div className="pc-cards">
          {stations.map((s) => {
            const online = onlineMap.has(s.id) || Boolean(s.online);
            const st = liveStatus[s.id];
            const modeLabel =
              st?.mode === "admin"
                ? `Liberado · ${formatClock(st.balanceSeconds ?? st.elapsed ?? 0)}`
                : st?.mode === "vip"
                  ? `VIP ${st.customerName || ""} · ${formatDuration(st.elapsed || 0)}`
                  : st?.phase === "locked" || st?.phase === "boot"
                    ? "Travado"
                    : online
                      ? "Livre"
                      : "Offline";
            const ver = s.lock_version || "?";
            const verHint = !s.lock_version
              ? "versão desconhecida"
              : online
                ? `v${ver}`
                : `v${ver} · desligado`;
            return (
              <section key={s.id} className="panel pc-card">
                <div className="pc-card-head">
                  <h2>{s.name}</h2>
                  <span className={`status-pill ${online ? "ok" : "bad"}`}>{online ? "online" : "offline"}</span>
                </div>
                <p className="muted" style={{ margin: "0 0 0.75rem" }}>
                  {modeLabel}
                  <span className="mono" style={{ marginLeft: "0.5rem" }}>
                    {verHint}
                  </span>
                </p>
                {!remoteReadOnly && liberarId === s.id ? (
                  <div>
                    {unlockKindControls}
                    {unlockKind !== "staff_open" && !guestOpen && (
                      <>
                        <p className="muted" style={{ margin: "0 0 0.5rem" }}>
                          Tempo (mín. 30 min, máx. {maxMin} min)
                        </p>
                        <TimeDurationPicker
                          hours={unlockH}
                          minutes={unlockM}
                          onChange={(h, m) => {
                            setUnlockH(h);
                            setUnlockM(m);
                          }}
                        />
                      </>
                    )}
                    <button
                      className="btn"
                      type="button"
                      style={{ marginTop: "0.5rem", width: "100%" }}
                      onClick={() => void liberarPor(s.id, durationToSeconds(unlockH, unlockM))}
                    >
                      {unlockKind === "staff_open" || guestOpen
                        ? "Liberar aberto"
                        : `Liberar ${unlockH}h ${String(unlockM).padStart(2, "0")}min`}
                    </button>
                    <button className="btn ghost" type="button" style={{ marginTop: "0.5rem", width: "100%" }} onClick={() => setLiberarId(null)}>
                      Cancelar
                    </button>
                  </div>
                ) : !remoteReadOnly ? (
                  <div className="pc-card-actions">
                    <button className="btn" type="button" onClick={() => setLiberarId(s.id)}>
                      Liberar
                    </button>
                    <button className="btn ghost" type="button" onClick={() => sendCmd(s.id, "lock_screen")}>
                      Travar
                    </button>
                    <button className="btn ghost" type="button" onClick={() => sendCmd(s.id, "end_session")}>
                      Encerrar
                    </button>
                  </div>
                ) : null}
              </section>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="grid-2" role="tabpanel" id="panel-estacoes" aria-labelledby="tab-estacoes">
      <section className="panel">
        <h2>Estações</h2>
        {pairBox}
        {remoteReadOnly && <p className="muted">De casa não dá para travar/destravar PC.</p>}
        {!remoteReadOnly && (
        <>
        {unlockKindControls}
        {unlockKind !== "staff_open" && !guestOpen && (
          <>
            <p className="muted" style={{ margin: "0 0 0.5rem" }}>
              Tempo ao Liberar / Destravar (mín. 30 min, máx. {maxMin} min)
            </p>
            <TimeDurationPicker
              hours={unlockH}
              minutes={unlockM}
              onChange={(h, m) => {
                setUnlockH(h);
                setUnlockM(m);
              }}
            />
          </>
        )}
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
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {stations.length === 0 && (
              <tr>
                <td colSpan={6}>
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
              const modeLabel =
                st?.mode === "admin"
                  ? `Admin · ${formatClock(st.balanceSeconds ?? st.elapsed ?? 0)}`
                  : st?.mode === "guest"
                    ? `Convidado ${st.customerName || ""}`
                    : st?.mode === "vip"
                      ? `VIP ${st.customerName || ""} · ${formatDuration(st.elapsed || 0)}`
                      : st?.phase === "locked" || st?.phase === "boot"
                        ? "Travada"
                        : st?.phase === "offline"
                          ? "Offline (app)"
                          : online
                            ? "Conectada"
                            : "—";

              return (
                <tr key={s.id}>
                  <td>{s.name}</td>
                  <td>
                    <span className={`status-pill ${online ? "ok" : "bad"}`}>
                      {online ? "online" : "offline"}
                    </span>
                  </td>
                  <td>
                    <div>{modeLabel}</div>
                    {st?.occupantKind && <small className="muted">{st.occupantKind}</small>}
                    {st?.mode === "vip" && st.present === false && (
                      <small className="muted">Ausente {st.absentLeft ?? "…"}s</small>
                    )}
                  </td>
                  <td>{s.last_ip || "—"}</td>
                  <td className="mono">{s.lock_version || "—"}</td>
                  <td className="row" style={{ flexWrap: "wrap" }}>
                    {remoteReadOnly ? (
                      <span className="muted">só ver</span>
                    ) : (
                    <>
                    <button className="btn ghost" type="button" onClick={() => sendCmd(s.id, "lock_screen")}>
                      Travar
                    </button>
                    <button
                      className="btn ghost"
                      type="button"
                      onClick={() => void liberarPor(s.id, durationToSeconds(unlockH, unlockM))}
                    >
                      Destravar
                    </button>
                    <button className="btn ghost" type="button" onClick={() => sendCmd(s.id, "end_session")}>
                      Encerrar
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
                body: JSON.stringify({
                  command: "unlock_screen",
                  durationSec: durationToSeconds(unlockH, unlockM),
                }),
              })
                .then(() => onToast("Destravar todos enviado", "ok"))
                .catch((e) => onError(e.message))
            }
          >
            Destravar todos
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
