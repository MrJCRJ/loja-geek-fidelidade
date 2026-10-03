import { useMemo, useState } from "react";
import { api, formatClock, formatDuration, type Customer, type Station } from "../../api";
import { QrCode } from "../components/QrCode";
import { TimeDurationPicker, durationToSeconds } from "../components/TimeDurationPicker";
import { formatHours } from "../format";
import type { AdminSettings, LiveStationStatus } from "../types";

type LiberarMode = "sale" | "open";

type Props = {
  stations: Station[];
  customers: Customer[];
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
  customers,
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
  const [liberarMode, setLiberarMode] = useState<LiberarMode>("sale");
  const [vipQuery, setVipQuery] = useState("");
  const [selectedVip, setSelectedVip] = useState<Customer | null>(null);
  const [saleReais, setSaleReais] = useState("20");
  const [unlockH, setUnlockH] = useState(0);
  const [unlockM, setUnlockM] = useState(30);
  const [saleBy, setSaleBy] = useState<"hours" | "reais">("hours");
  const [liberarBusy, setLiberarBusy] = useState(false);
  const onlineMap = useMemo(() => new Set(connected.map((c) => c.stationId)), [connected]);
  const packs = settings.hourPacks || [];
  const baseHourPrice = settings.hourPriceReais || 10;
  const subscriberPct = settings.subscriberHourDiscountPct || 0;
  const vipIsSubscriber =
    selectedVip?.subscription_status === "active" &&
    (!selectedVip.subscription_expires_at ||
      Date.parse(selectedVip.subscription_expires_at) > Date.now());
  const hourPrice =
    vipIsSubscriber && subscriberPct > 0
      ? Math.max(0.01, baseHourPrice * (1 - Math.min(90, subscriberPct) / 100))
      : baseHourPrice;
  const durationSec = durationToSeconds(unlockH, unlockM);
  const estimatedReais = Math.round((durationSec / 3600) * hourPrice * 100) / 100;

  const vipMatches = useMemo(() => {
    const q = vipQuery.trim().toLowerCase();
    if (!q) return customers.slice(0, 8);
    return customers
      .filter((c) => `${c.name} ${c.phone || ""}`.toLowerCase().includes(q))
      .slice(0, 8);
  }, [customers, vipQuery]);

  const messageBody = () => ({
    command: "message" as const,
    text: messageText || "Aviso da central",
    title: messageTitle || undefined,
    level: messageLevel,
    durationSec: messageDuration,
  });

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

  const resetLiberarForm = () => {
    setLiberarId(null);
    setVipQuery("");
    setSelectedVip(null);
    setLiberarBusy(false);
  };

  const deskLiberar = async (stationId: string) => {
    const name = (selectedVip?.name || vipQuery).trim();
    if (name.length < 2) {
      onError("Informe o nome do cliente VIP");
      return;
    }
    if (liberarMode === "open") {
      const ok = await askConfirm({
        title: "Liberar aberto",
        message: `${name} fica na máquina até travar pelo Central. Sem cobrança de horas.`,
        confirmLabel: "Liberar aberto",
      });
      if (!ok) return;
    } else {
      const amountReais = saleBy === "reais" ? Number(saleReais) : undefined;
      const durationSec = durationToSeconds(unlockH, unlockM);
      if (saleBy === "reais" && (!amountReais || amountReais <= 0)) {
        onError("Informe o valor em R$");
        return;
      }
      if (saleBy === "hours" && durationSec < 5 * 60) {
        onError("Tempo mínimo: 5 minutos");
        return;
      }
      const ok = await askConfirm({
        title: "Vender e liberar",
        message:
          saleBy === "reais"
            ? `Creditar R$ ${amountReais!.toFixed(2)} para ${name} e liberar este PC?`
            : `Creditar ${unlockH}h ${String(unlockM).padStart(2, "0")}min (R$ ${estimatedReais.toFixed(2)}) para ${name} e liberar este PC?`,
        confirmLabel: "Vender e liberar",
      });
      if (!ok) return;
    }

    setLiberarBusy(true);
    try {
      const body: Record<string, unknown> = {
        mode: liberarMode,
        customerName: name,
      };
      if (selectedVip?.id) body.customerId = selectedVip.id;
      if (liberarMode === "sale") {
        if (saleBy === "reais") body.amountReais = Number(saleReais);
        else body.hours = durationToSeconds(unlockH, unlockM) / 3600;
      }
      const res = await api<{
        customer?: Customer;
        creditedSeconds?: number;
        amountReais?: number;
        mode?: string;
        reviewAsk?: {
          attempted?: boolean;
          sent?: boolean;
          waMeUrl?: string | null;
          skipped?: string;
        };
      }>(`/api/stations/${stationId}/desk-liberar`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      if (liberarMode === "sale") {
        onToast(
          `Liberado · ${res.customer?.name || name} · +${formatHours(res.creditedSeconds || 0)}`,
          "ok",
        );
        const ask = res.reviewAsk;
        if (ask?.sent) {
          onToast("Avaliação pedida no WhatsApp", "ok");
        } else if (ask?.attempted && ask.waMeUrl) {
          const openWa = await askConfirm({
            title: "Pedir avaliação?",
            message:
              "WhatsApp automático indisponível. Abrir conversa com o pedido educado de avaliação no Google?",
            confirmLabel: "Abrir WhatsApp",
          });
          if (openWa) {
            const customerId = res.customer?.id || selectedVip?.id;
            if (customerId) {
              await api(`/api/customers/${customerId}/ask-google-review`, {
                method: "POST",
                body: JSON.stringify({ force: true }),
              }).catch(() => undefined);
            }
            window.open(ask.waMeUrl, "_blank", "noopener,noreferrer");
          }
        }
      } else {
        onToast(`Aberto · ${res.customer?.name || name}`, "ok");
      }
      resetLiberarForm();
      await refresh();
    } catch (e) {
      onError(e instanceof Error ? e.message : "Falha ao liberar");
    } finally {
      setLiberarBusy(false);
    }
  };

  const liberarForm = (
    <div style={{ marginBottom: "0.75rem" }}>
      <p className="muted" style={{ margin: "0 0 0.35rem" }}>
        Tipo
      </p>
      <div className="row" style={{ flexWrap: "wrap", gap: "0.35rem", marginBottom: "0.5rem" }}>
        <button
          className={`btn ${liberarMode === "sale" ? "" : "ghost"}`}
          type="button"
          onClick={() => setLiberarMode("sale")}
        >
          Venda + liberar
        </button>
        <button
          className={`btn ${liberarMode === "open" ? "" : "ghost"}`}
          type="button"
          onClick={() => setLiberarMode("open")}
        >
          Aberto (só nome)
        </button>
      </div>
      <div className="field" style={{ marginBottom: "0.5rem" }}>
        <label>Cliente VIP</label>
        <input
          value={selectedVip ? selectedVip.name : vipQuery}
          onChange={(e) => {
            setSelectedVip(null);
            setVipQuery(e.target.value);
          }}
          placeholder="Buscar ou digitar nome novo"
          maxLength={80}
        />
        {vipMatches.length > 0 && !selectedVip && vipQuery.trim().length >= 1 && (
          <div className="row" style={{ flexWrap: "wrap", gap: "0.35rem", marginTop: "0.35rem" }}>
            {vipMatches.map((c) => (
              <button
                key={c.id}
                className="btn ghost"
                type="button"
                onClick={() => {
                  setSelectedVip(c);
                  setVipQuery(c.name);
                }}
              >
                {c.name}
                <span className="muted" style={{ marginLeft: "0.35rem" }}>
                  {formatHours(c.time_balance_seconds ?? 0)}
                </span>
              </button>
            ))}
          </div>
        )}
        {!selectedVip && vipQuery.trim().length >= 2 && (
          <p className="muted" style={{ margin: "0.35rem 0 0", fontSize: "0.85rem" }}>
            Se não existir, cria VIP só com este nome.
          </p>
        )}
      </div>
      {liberarMode === "sale" && (
        <>
          <div className="row" style={{ flexWrap: "wrap", gap: "0.35rem", marginBottom: "0.5rem" }}>
            <button
              className={`btn ${saleBy === "hours" ? "" : "ghost"}`}
              type="button"
              onClick={() => setSaleBy("hours")}
            >
              Tempo
            </button>
            <button
              className={`btn ${saleBy === "reais" ? "" : "ghost"}`}
              type="button"
              onClick={() => setSaleBy("reais")}
            >
              Valor R$
            </button>
          </div>
          {saleBy === "hours" ? (
            <div className="field">
              <label>Tempo a creditar (mín. 5 min)</label>
              <TimeDurationPicker
                hours={unlockH}
                minutes={unlockM}
                onChange={(h, m) => {
                  setUnlockH(h);
                  setUnlockM(m);
                }}
              />
              <p style={{ margin: "0.5rem 0 0", fontWeight: 600 }}>
                {unlockH}h {String(unlockM).padStart(2, "0")}min · R$ {estimatedReais.toFixed(2)}
              </p>
              <p className="muted" style={{ margin: "0.25rem 0 0", fontSize: "0.85rem" }}>
                Tarifa R$ {hourPrice.toFixed(2)}/h
                {vipIsSubscriber ? " (assinante)" : ""} · cobrado ao liberar
              </p>
            </div>
          ) : (
            <div className="field">
              <label>Valor (R$)</label>
              <input
                type="number"
                min="1"
                step="1"
                value={saleReais}
                onChange={(e) => setSaleReais(e.target.value)}
              />
              {packs.length > 0 && (
                <div className="row" style={{ flexWrap: "wrap", gap: "0.35rem", marginTop: "0.35rem" }}>
                  {packs.map((p) => (
                    <button
                      key={`${p.label}-${p.amountReais}`}
                      className="btn ghost"
                      type="button"
                      onClick={() => setSaleReais(String(p.amountReais))}
                    >
                      {p.label || `R$ ${p.amountReais}`}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
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
                ? st?.occupantKind === "staff_open" || st?.balanceSeconds == null
                  ? `Aberto · ${st.customerName || "equipe"} · ${formatClock(st.elapsed ?? 0)}`
                  : `Liberado · resta ${formatClock(st.balanceSeconds ?? st.elapsed ?? 0)}`
                : st?.mode === "vip"
                  ? st?.occupantKind === "vip_desk"
                    ? `VIP balcão · ${st.customerName || ""} · ${formatDuration(st.elapsed || 0)}`
                    : `VIP ${st.customerName || ""} · ${formatDuration(st.elapsed || 0)}`
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
            const diskPct = s.disk_free_pct;
            const diskWarn = diskPct != null && diskPct < 15;
            const healthBits = [
              diskPct != null ? `disco ${diskPct}% livre` : null,
              s.ram_used_pct != null ? `RAM ${s.ram_used_pct}%` : null,
              s.uptime_sec != null ? `ligado ${formatDuration(s.uptime_sec)}` : null,
            ].filter(Boolean);
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
                {healthBits.length > 0 && (
                  <p className="muted" style={{ margin: "0 0 0.75rem", color: diskWarn ? "crimson" : undefined }}>
                    {healthBits.join(" · ")}
                    {diskWarn ? " · disco baixo" : ""}
                  </p>
                )}
                {!remoteReadOnly && liberarId === s.id ? (
                  <div>
                    {liberarForm}
                    <button
                      className="btn"
                      type="button"
                      style={{ marginTop: "0.5rem", width: "100%" }}
                      disabled={liberarBusy}
                      onClick={() => void deskLiberar(s.id)}
                    >
                      {liberarBusy
                        ? "…"
                        : liberarMode === "open"
                          ? "Liberar aberto"
                          : saleBy === "hours"
                            ? `Liberar · R$ ${estimatedReais.toFixed(2)}`
                            : "Vender e liberar"}
                    </button>
                    <button
                      className="btn ghost"
                      type="button"
                      style={{ marginTop: "0.5rem", width: "100%" }}
                      disabled={liberarBusy}
                      onClick={() => resetLiberarForm()}
                    >
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
        <p className="muted" style={{ margin: "0 0 0.75rem" }}>
          Liberar: escolha o PC → cliente VIP → valor ou horas (ou só nome no aberto).
        </p>
        {liberarId && (
          <div className="panel" style={{ marginBottom: "1rem", boxShadow: "none" }}>
            <h3 style={{ marginTop: 0 }}>
              Liberar · {stations.find((x) => x.id === liberarId)?.name || "PC"}
            </h3>
            {liberarForm}
            <div className="row" style={{ gap: "0.5rem", flexWrap: "wrap" }}>
              <button
                className="btn"
                type="button"
                disabled={liberarBusy}
                onClick={() => void deskLiberar(liberarId)}
              >
                {liberarBusy
                  ? "…"
                  : liberarMode === "open"
                    ? "Liberar aberto"
                    : saleBy === "hours"
                      ? `Liberar · R$ ${estimatedReais.toFixed(2)}`
                      : "Vender e liberar"}
              </button>
              <button className="btn ghost" type="button" disabled={liberarBusy} onClick={() => resetLiberarForm()}>
                Cancelar
              </button>
            </div>
          </div>
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
              <th>Saúde</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {stations.length === 0 && (
              <tr>
                <td colSpan={7}>
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
                  ? st?.occupantKind === "staff_open" || st?.balanceSeconds == null
                    ? `Aberto · ${st.customerName || "equipe"} · ${formatClock(st.elapsed ?? 0)}`
                    : `Admin · resta ${formatClock(st.balanceSeconds ?? st.elapsed ?? 0)}`
                  : st?.mode === "vip"
                    ? st?.occupantKind === "vip_desk"
                      ? `VIP balcão · ${st.customerName || ""} · ${formatDuration(st.elapsed || 0)}`
                      : `VIP ${st.customerName || ""} · ${formatDuration(st.elapsed || 0)}`
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
                    <button className="btn ghost" type="button" onClick={() => sendCmd(s.id, "lock_screen")}>
                      Travar
                    </button>
                    <button className="btn ghost" type="button" onClick={() => setLiberarId(s.id)}>
                      Liberar
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
