import { useCallback, useEffect, useState } from "react";
import { api } from "../../api";

type Alert = { severity: "warn" | "error"; code: string; message: string };
type TelemetryRow = {
  id: string;
  created_at: string;
  level: string;
  source: string;
  kind: string;
  message: string;
  station_id: string | null;
};

type Diagnostics = {
  ok: boolean;
  time: string;
  faceService: boolean;
  host: {
    hostname: string;
    mem: { usedPct: number; freeBytes: number; totalBytes: number };
    disk: { freePct: number | null; freeBytes: number; totalBytes: number } | null;
    uptimeSec: number;
    loadAvg: number[];
  };
  stations: { total: number; connected: number; online: number };
  eventCounts24h: Record<string, number>;
  alerts: Alert[];
};

type Props = {
  onError: (msg: string) => void;
};

function fmtBytes(n: number) {
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(0)} MB`;
  return `${(n / 1024 ** 3).toFixed(1)} GB`;
}

export function SaudeTab({ onError }: Props) {
  const [diag, setDiag] = useState<Diagnostics | null>(null);
  const [events, setEvents] = useState<TelemetryRow[]>([]);
  const [level, setLevel] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const [d, t] = await Promise.all([
        api<Diagnostics>("/api/admin/diagnostics"),
        api<{ events: TelemetryRow[] }>(
          `/api/admin/telemetry?limit=80${level ? `&level=${encodeURIComponent(level)}` : ""}`,
        ),
      ]);
      setDiag(d);
      setEvents(t.events);
    } catch (e) {
      onError(e instanceof Error ? e.message : "Falha ao carregar saúde");
    } finally {
      setBusy(false);
    }
  }, [level, onError]);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 20_000);
    return () => clearInterval(t);
  }, [load]);

  return (
    <div className="grid-2" role="tabpanel" id="panel-saude" aria-labelledby="tab-saude">
      <section className="panel">
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ margin: 0 }}>Saúde do sistema</h2>
          <button className="btn ghost" type="button" disabled={busy} onClick={() => void load()}>
            Atualizar
          </button>
        </div>
        {!diag ? (
          <p className="muted">Carregando…</p>
        ) : (
          <>
            <p>
              <span className={`pill ${diag.ok ? "ok" : "bad"}`}>
                {diag.ok ? "Operacional" : "Atenção"}
              </span>{" "}
              <span className="muted">{new Date(diag.time).toLocaleString()}</span>
            </p>
            <ul className="muted" style={{ lineHeight: 1.7 }}>
              <li>
                Face-service:{" "}
                <strong className={diag.faceService ? "" : "error-text"}>
                  {diag.faceService ? "ok" : "fora"}
                </strong>
              </li>
              <li>
                Estações: {diag.stations.connected} WS · {diag.stations.online} online ·{" "}
                {diag.stations.total} cadastradas
              </li>
              <li>
                RAM: {diag.host.mem.usedPct}% usada ({fmtBytes(diag.host.mem.freeBytes)} livres)
              </li>
              <li>
                Disco:{" "}
                {diag.host.disk?.freePct != null
                  ? `${diag.host.disk.freePct}% livre (${fmtBytes(diag.host.disk.freeBytes)})`
                  : "n/d"}
              </li>
              <li>
                Host {diag.host.hostname} · uptime {Math.round(diag.host.uptimeSec / 3600)}h · load{" "}
                {diag.host.loadAvg.map((n) => n.toFixed(2)).join(" / ")}
              </li>
              <li>
                Eventos 24h:{" "}
                {Object.entries(diag.eventCounts24h)
                  .map(([k, v]) => `${k}=${v}`)
                  .join(" · ") || "nenhum"}
              </li>
            </ul>
            {diag.alerts.length > 0 && (
              <div style={{ marginTop: "0.75rem" }}>
                <h3 style={{ marginTop: 0 }}>Alertas</h3>
                {diag.alerts.map((a) => (
                  <p key={a.code} className={a.severity === "error" ? "error-text" : ""}>
                    <span className={`pill ${a.severity === "error" ? "bad" : ""}`}>{a.severity}</span>{" "}
                    {a.message}
                  </p>
                ))}
              </div>
            )}
          </>
        )}
      </section>

      <section className="panel">
        <h2>Logs de produção</h2>
        <p className="muted">
          Sem fotos, embeddings ou senhas — só eventos de operação para achar falhas cedo. Mostra os 15
          mais recentes.
        </p>
        <div className="row">
          <select value={level} onChange={(e) => setLevel(e.target.value)} aria-label="Filtrar nível">
            <option value="">Todos os níveis</option>
            <option value="error">error</option>
            <option value="warn">warn</option>
            <option value="info">info</option>
          </select>
        </div>
        <div style={{ maxHeight: 420, overflow: "auto", marginTop: "0.75rem" }}>
          <table>
            <thead>
              <tr>
                <th>Quando</th>
                <th>Nível</th>
                <th>Origem</th>
                <th>Evento</th>
              </tr>
            </thead>
            <tbody>
              {events.slice(0, 15).map((e) => (
                <tr key={e.id}>
                  <td className="muted" style={{ whiteSpace: "nowrap" }}>
                    {new Date(e.created_at).toLocaleString()}
                  </td>
                  <td>
                    <span className={`pill ${e.level === "error" ? "bad" : e.level === "warn" ? "" : "ok"}`}>
                      {e.level}
                    </span>
                  </td>
                  <td className="mono">{e.source}</td>
                  <td>
                    <strong>{e.kind}</strong>
                    <br />
                    <span className="muted">{e.message}</span>
                  </td>
                </tr>
              ))}
              {events.length === 0 && (
                <tr>
                  <td colSpan={4} className="muted">
                    Nenhum evento ainda
                  </td>
                </tr>
              )}
              {events.length > 15 && (
                <tr>
                  <td colSpan={4} className="muted">
                    Mostrando os 15 mais recentes · use o filtro de nível para focar
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
