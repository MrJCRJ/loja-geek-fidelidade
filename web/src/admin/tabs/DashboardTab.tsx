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
  activeNow: Array<{
    id: string;
    customer_name: string;
    station_name: string;
    seconds_total: number;
    started_at: string;
  }>;
};

type Props = {
  onError: (msg: string) => void;
};

function money(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function dayLabel(isoDay: string) {
  const [, , d] = isoDay.split("-");
  return d || isoDay;
}

export function DashboardTab({ onError }: Props) {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [usage, setUsage] = useState<{
    kwh: number;
    costReais: number;
    topApps: Array<{ process: string; minutes: number }>;
  } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const m = await api<Metrics>("/api/admin/metrics");
      setMetrics(m);
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
    } catch (e) {
      onError(e instanceof Error ? e.message : "Falha ao carregar métricas");
    } finally {
      setBusy(false);
    }
  }, [onError]);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 30_000);
    return () => clearInterval(t);
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
            <article className="metric-card">
              <p className="metric-label">Portal (pago) hoje</p>
              <p className="metric-value">{money(metrics.today.portalPaidReais)}</p>
              <p className="muted">{metrics.today.portalOrdersPaid} pedidos</p>
            </article>
            <article className="metric-card">
              <p className="metric-label">Energia 24h (est.)</p>
              <p className="metric-value">{usage ? `${usage.kwh.toFixed(2)} kWh` : "—"}</p>
              <p className="muted">{usage ? money(usage.costReais) : "Aba Uso"}</p>
            </article>
            <article className="metric-card">
              <p className="metric-label">Top app 24h</p>
              <p className="metric-value" style={{ fontSize: "1.1rem" }}>
                {usage?.topApps?.[0]?.process || "—"}
              </p>
              <p className="muted">
                {usage?.topApps?.[0] ? `${usage.topApps[0].minutes} min` : "Sem amostras"}
              </p>
            </article>
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
          </div>

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
                  <strong>Nenhuma sessão ativa</strong>
                  <p>Quando o GeekLock liberar um PC, aparece aqui.</p>
                </div>
              ) : (
                <div className="table-scroll">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>VIP</th>
                        <th>PC</th>
                        <th>Tempo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {metrics.activeNow.map((s) => (
                        <tr key={s.id}>
                          <td>{s.customer_name}</td>
                          <td>{s.station_name}</td>
                          <td>{formatDuration(s.seconds_total)}</td>
                        </tr>
                      ))}
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

          <section className="panel" style={{ marginTop: "1rem" }}>
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
        </>
      )}
    </div>
  );
}
