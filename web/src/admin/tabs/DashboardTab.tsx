import { useCallback, useEffect, useMemo, useState } from "react";
import { api, formatDuration } from "../../api";
import { formatHours } from "../format";

type Metrics = {
  generatedAt: string;
  unit: { unitId: string; unitName: string };
  today: {
    sessions: number;
    hoursUsed: number;
    secondsUsed: number;
    uniqueVips: number;
    activeSessions: number;
    recognitionMatches: number;
    recognitionOther: number;
    salesReais: number;
    payments?: { pix: number; card: number; cash: number };
    portalPaidReais: number;
    portalOrdersPaid: number;
    totalRevenueReais?: number;
  };
  week: {
    hoursUsed: number;
    sessions: number;
    salesReais: number;
    portalPaidReais?: number;
    totalRevenueReais?: number;
    days: Array<{ day: string; sessions: number; seconds: number; salesReais: number; matches: number }>;
  };
  month?: {
    salesReais: number;
    portalPaidReais: number;
    portalOrdersPaid: number;
    totalRevenueReais: number;
  };
  inventory: {
    customers: number;
    withFace: number;
    subscribersActive: number;
    stationsTotal: number;
    stationsOnline: number;
    timeBalanceHours: number;
  };
  topVipsToday: Array<{
    customer_id: string;
    customer_name: string;
    customer_level: string;
    seconds_total: number;
    sessions: number;
  }>;
  topStationsToday: Array<{
    station_id: string;
    station_name: string;
    seconds_total: number;
    sessions: number;
  }>;
  topConsolesToday: Array<{
    console_id: string;
    console_name: string;
    seconds_total: number;
    sessions: number;
  }>;
  consoles: Array<{
    id: string;
    name: string;
    status: "free" | "active" | "expired" | "open";
    customerName: string | null;
    endsAt: string | null;
    remainingSeconds: number;
    mode: string | null;
  }>;
  paymentsToday?: { pix: number; card: number; cash: number };
  openDuePending?: Array<{
    id: string;
    customerName: string;
    amountReais: number;
    openSeconds: number;
    createdAt: string;
  }>;
  caixaToday?: Array<{
    id: string;
    customerName: string;
    kind: string;
    amountReais: number;
    seconds: number;
    paymentMethod: string | null;
    paidAt: string | null;
    createdAt: string;
  }>;
  activeNow: Array<{
    id: string;
    customer_name: string;
    place_name: string;
    kind: "pc" | "console";
    seconds_total: number;
    remaining_seconds: number | null;
    status: string;
    started_at: string;
  }>;
};

type Props = {
  onError: (msg: string) => void;
  team?: boolean;
};

function money(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function dayLabel(isoDay: string) {
  const [, , d] = isoDay.split("-");
  return d || isoDay;
}

function payLabel(method: string | null) {
  if (method === "pix") return "Pix";
  if (method === "card") return "Cartão";
  if (method === "cash") return "Dinheiro";
  return "—";
}

function clock(total: number) {
  const s = Math.max(0, Math.floor(total));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

export function DashboardTab({ onError, team }: Props) {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [usage, setUsage] = useState<{
    kwh: number;
    costReais: number;
    topApps: Array<{ process: string; minutes: number }>;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const m = await api<Metrics>("/api/admin/metrics");
      setMetrics(m);
      if (team) {
        setUsage(null);
      } else {
      try {
        const u = await api<{
          kwh: number;
          costReais: number;
          topApps: Array<{ process: string; minutes: number }>;
        }>("/api/admin/usage?hours=24");
        setUsage({ kwh: u.kwh, costReais: u.costReais, topApps: u.topApps || [] });
      } catch {
        setUsage(null);
      }
      }
    } catch (e) {
      onError(e instanceof Error ? e.message : "Falha ao carregar métricas");
    } finally {
      setBusy(false);
    }
  }, [onError, team]);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 30_000);
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearInterval(t);
      clearInterval(tick);
    };
  }, [load]);

  const maxWeekSessions = useMemo(() => {
    if (!metrics?.week.days.length) return 1;
    return Math.max(1, ...metrics.week.days.map((d) => d.sessions));
  }, [metrics]);

  return (
    <div role="tabpanel" id="panel-dashboard" aria-labelledby="tab-dashboard">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
        <div>
          <h2 style={{ margin: 0 }}>Dashboard</h2>
          <p className="muted" style={{ margin: "0.25rem 0 0" }}>
            {metrics
              ? `${metrics.unit.unitName} · atualizado ${new Date(metrics.generatedAt).toLocaleTimeString("pt-BR")}`
              : "Métricas do dia e da semana"}
          </p>
        </div>
        <button className="btn ghost" type="button" disabled={busy} onClick={() => void load()}>
          Atualizar
        </button>
      </div>

      {!metrics ? (
        <p className="muted">Carregando…</p>
      ) : (
        <>
          <div className="console-strip">
            {(metrics.consoles || []).map((c) => {
              const left =
                c.endsAt && c.status === "active"
                  ? Math.max(0, Math.floor((Date.parse(c.endsAt) - now) / 1000))
                  : c.remainingSeconds;
              const expired = c.status === "expired" || (c.status === "active" && c.mode !== "open" && left <= 0);
              const label = !c.customerName
                ? "Livre"
                : c.status === "open"
                  ? "Aberto"
                  : expired
                    ? "Tempo acabou"
                    : clock(left);
              return (
                <article
                  key={c.id}
                  className={`console-card${c.customerName ? " is-busy" : ""}${expired ? " is-expired" : ""}`}
                >
                  <strong>{c.name}</strong>
                  <p className="console-clock" style={{ fontSize: "1.35rem" }}>{label}</p>
                  <p className="muted" style={{ margin: 0 }}>{c.customerName || "Ninguém"}</p>
                </article>
              );
            })}
          </div>

          <div className="metrics-grid">
            <article className="metric-card">
              <p className="metric-label">Sessões hoje</p>
              <p className="metric-value">{metrics.today.sessions}</p>
              <p className="muted">{metrics.today.uniqueVips} VIPs · {metrics.today.activeSessions} ativas</p>
            </article>
            <article className="metric-card">
              <p className="metric-label">Horas usadas hoje</p>
              <p className="metric-value">{metrics.today.hoursUsed.toFixed(1)}h</p>
              <p className="muted">Semana: {metrics.week.hoursUsed.toFixed(1)}h</p>
            </article>
            <article className="metric-card">
              <p className="metric-label">Caixa balcão hoje</p>
              <p className="metric-value">{money(metrics.today.salesReais)}</p>
              <p className="muted">Semana: {money(metrics.week.salesReais)}</p>
            </article>
            {!team && (
            <article className="metric-card">
              <p className="metric-label">Portal (pago) hoje</p>
              <p className="metric-value">{money(metrics.today.portalPaidReais)}</p>
              <p className="muted">{metrics.today.portalOrdersPaid} pedidos</p>
            </article>
            )}
            {!team && (
            <article className="metric-card">
              <p className="metric-label">Energia 24h (est.)</p>
              <p className="metric-value">{usage ? `${usage.kwh.toFixed(2)} kWh` : "—"}</p>
              <p className="muted">{usage ? money(usage.costReais) : "Aba Uso"}</p>
            </article>
            )}
            {!team && (
            <article className="metric-card">
              <p className="metric-label">Top app 24h</p>
              <p className="metric-value" style={{ fontSize: "1.1rem" }}>
                {usage?.topApps?.[0]?.process || "—"}
              </p>
              <p className="muted">
                {usage?.topApps?.[0] ? `${usage.topApps[0].minutes} min` : "Sem amostras"}
              </p>
            </article>
            )}
            {!team && (
            <>
            <article className="metric-card">
              <p className="metric-label">Faturamento hoje</p>
              <p className="metric-value">
                {money(metrics.today.totalRevenueReais ?? metrics.today.salesReais + metrics.today.portalPaidReais)}
              </p>
              <p className="muted">
                Semana:{" "}
                {money(
                  metrics.week.totalRevenueReais ??
                    metrics.week.salesReais + (metrics.week.portalPaidReais || 0),
                )}
              </p>
            </article>
            <article className="metric-card">
              <p className="metric-label">Faturamento 30 dias</p>
              <p className="metric-value">
                {money(metrics.month?.totalRevenueReais ?? 0)}
              </p>
              <p className="muted">
                Balcão {money(metrics.month?.salesReais ?? 0)} · Portal{" "}
                {money(metrics.month?.portalPaidReais ?? 0)}
              </p>
            </article>
            <article className="metric-card">
              <p className="metric-label">Reconhecimentos</p>
              <p className="metric-value">{metrics.today.recognitionMatches}</p>
              <p className="muted">{metrics.today.recognitionOther} sem match</p>
            </article>
            <article className="metric-card">
              <p className="metric-label">Estações</p>
              <p className="metric-value">
                {metrics.inventory.stationsOnline}/{metrics.inventory.stationsTotal}
              </p>
              <p className="muted">online agora</p>
            </article>
            <article className="metric-card">
              <p className="metric-label">VIPs cadastrados</p>
              <p className="metric-value">{metrics.inventory.customers}</p>
              <p className="muted">
                {metrics.inventory.withFace} com face · {metrics.inventory.subscribersActive} assinantes
              </p>
            </article>
            <article className="metric-card">
              <p className="metric-label">Saldo horas (estoque)</p>
              <p className="metric-value">{metrics.inventory.timeBalanceHours.toFixed(1)}h</p>
              <p className="muted">crédito total nos VIPs</p>
            </article>
            </>
            )}
          </div>

          <section className="panel" style={{ marginTop: "1rem" }}>
            <h3 style={{ marginTop: 0 }}>Caixa hoje</h3>
            <div className="metrics-grid">
              <article className="metric-card">
                <p className="metric-label">Pix</p>
                <p className="metric-value">{money(metrics.today.payments?.pix || metrics.paymentsToday?.pix || 0)}</p>
              </article>
              <article className="metric-card">
                <p className="metric-label">Cartão</p>
                <p className="metric-value">{money(metrics.today.payments?.card || metrics.paymentsToday?.card || 0)}</p>
              </article>
              <article className="metric-card">
                <p className="metric-label">Dinheiro</p>
                <p className="metric-value">{money(metrics.today.payments?.cash || metrics.paymentsToday?.cash || 0)}</p>
              </article>
            </div>
            <h4>A receber — hora em aberto</h4>
            {(metrics.openDuePending || []).length === 0 ? (
              <p className="muted">Nada pendente.</p>
            ) : (
              <ul>
                {(metrics.openDuePending || []).map((due) => (
                  <li key={due.id}>
                    {due.customerName} · {formatDuration(due.openSeconds)} · {money(due.amountReais)} · falta confirmar
                  </li>
                ))}
              </ul>
            )}
            <h4>Lançamentos</h4>
            {(metrics.caixaToday || []).length === 0 ? (
              <p className="muted">Sem venda nem hora em aberto hoje.</p>
            ) : (
              <div className="table-scroll">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Hora</th>
                      <th>Cliente</th>
                      <th>Tipo</th>
                      <th>Tempo</th>
                      <th>Forma</th>
                      <th>Valor</th>
                      <th>Situação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(metrics.caixaToday || []).map((row) => (
                      <tr key={row.id}>
                        <td>{new Date(row.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</td>
                        <td>{row.customerName}</td>
                        <td>{row.kind === "aberto" ? "Hora em aberto" : "Venda"}</td>
                        <td>{formatDuration(row.seconds)}</td>
                        <td>{payLabel(row.paymentMethod)}</td>
                        <td>{money(row.amountReais)}</td>
                        <td>{row.kind === "aberto" ? (row.paidAt ? "Pago" : "A receber") : "Pago"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="panel" style={{ marginTop: "1rem" }}>
            <h3 style={{ marginTop: 0 }}>Sessões — últimos 7 dias</h3>
            <div className="spark-bars" role="img" aria-label="Sessões por dia">
              {metrics.week.days.map((d) => (
                <div key={d.day} className="spark-col">
                  <div
                    className="spark-bar"
                    style={{ height: `${Math.max(6, (d.sessions / maxWeekSessions) * 100)}%` }}
                    title={`${d.day}: ${d.sessions} sessões`}
                  />
                  <span className="spark-label">{dayLabel(d.day)}</span>
                  <span className="spark-n muted">{d.sessions}</span>
                </div>
              ))}
            </div>
          </section>

          <div className="grid-2" style={{ marginTop: "1rem" }}>
            <section className="panel">
              <h3 style={{ marginTop: 0 }}>Ativas agora</h3>
              {metrics.activeNow.length === 0 ? (
                <div className="empty-state">
                  <strong>Ninguém jogando</strong>
                  <p>Quando um PC ou console estiver em uso, aparece aqui.</p>
                </div>
              ) : (
                <div className="table-scroll">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Cliente</th>
                        <th>Onde</th>
                        <th>Tempo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {metrics.activeNow.map((s) => {
                        const left =
                          s.kind === "console" && s.status === "active" && s.remaining_seconds != null
                            ? s.remaining_seconds
                            : null;
                        const timeLabel =
                          s.kind === "console" && s.status === "expired"
                            ? "Acabou"
                            : s.kind === "console" && left == null
                              ? "Aberto"
                              : s.kind === "console"
                                ? clock(left || 0)
                                : formatDuration(s.seconds_total);
                        return (
                          <tr key={s.id}>
                            <td>{s.customer_name}</td>
                            <td>{s.place_name}</td>
                            <td>{timeLabel}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="panel">
              <h3 style={{ marginTop: 0 }}>Top VIPs hoje</h3>
              {metrics.topVipsToday.length === 0 ? (
                <p className="muted">Sem uso ainda hoje.</p>
              ) : (
                <div className="table-scroll">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Cliente</th>
                        <th>Horas</th>
                        <th>Sessões</th>
                      </tr>
                    </thead>
                    <tbody>
                      {metrics.topVipsToday.map((r) => (
                        <tr key={r.customer_id}>
                          <td>
                            {r.customer_name}{" "}
                            <span className={`tag ${r.customer_level}`}>{r.customer_level}</span>
                          </td>
                          <td>{formatHours(r.seconds_total)}</td>
                          <td>{r.sessions}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>

          <div className="grid-2" style={{ marginTop: "1rem" }}>
            <section className="panel">
              <h3 style={{ marginTop: 0 }}>Top PCs hoje</h3>
            {metrics.topStationsToday.length === 0 ? (
              <p className="muted">Sem uso ainda hoje.</p>
            ) : (
              <div className="table-scroll">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Estação</th>
                      <th>Horas</th>
                      <th>Sessões</th>
                    </tr>
                  </thead>
                  <tbody>
                    {metrics.topStationsToday.map((r) => (
                      <tr key={r.station_id}>
                        <td>{r.station_name}</td>
                        <td>{formatHours(r.seconds_total)}</td>
                        <td>{r.sessions}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            </section>
            <section className="panel">
              <h3 style={{ marginTop: 0 }}>Top consoles hoje</h3>
              {(metrics.topConsolesToday || []).length === 0 ? (
                <p className="muted">Sem uso ainda hoje.</p>
              ) : (
                <div className="table-scroll">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Console</th>
                        <th>Horas</th>
                        <th>Sessões</th>
                      </tr>
                    </thead>
                    <tbody>
                      {metrics.topConsolesToday.map((r) => (
                        <tr key={r.console_id}>
                          <td>{r.console_name}</td>
                          <td>{formatHours(r.seconds_total)}</td>
                          <td>{r.sessions}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}
