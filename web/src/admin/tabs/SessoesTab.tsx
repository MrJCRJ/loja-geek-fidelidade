import { formatDuration, type MachineSession, type SessionStats } from "../../api";

export function SessoesTab({
  sessions,
  sessionStats,
}: {
  sessions: MachineSession[];
  sessionStats: SessionStats | null;
}) {
  return (
    <div className="grid-2" role="tabpanel" id="panel-sessoes" aria-labelledby="tab-sessoes">
      <section className="panel">
        <h2>Ativas agora</h2>
        {(sessionStats?.active?.length ?? 0) === 0 ? (
          <div className="empty-state">
            <strong>Nenhuma máquina liberada</strong>
            <p>Quando o GeekLock reconhecer um VIP, a sessão aparece aqui.</p>
          </div>
        ) : (
          <div className="table-scroll">
            <table className="table table-compact">
              <thead>
                <tr>
                  <th>VIP</th>
                  <th>PC</th>
                  <th>
                    <span className="th-full">Tempo</span>
                    <span className="th-short">T</span>
                  </th>
                  <th>
                    <span className="th-full">Início</span>
                    <span className="th-short">Ini</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {(sessionStats?.active || []).map((s) => (
                  <tr key={s.id}>
                    <td>{s.customer_name}</td>
                    <td>{s.station_name}</td>
                    <td>{formatDuration(s.seconds_total)}</td>
                    <td>{new Date(s.started_at).toLocaleString("pt-BR")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <h3>Hoje por VIP</h3>
        <div className="table-scroll">
          <table className="table table-compact">
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Nível</th>
                <th>Horas</th>
                <th>
                  <span className="th-full">Sessões</span>
                  <span className="th-short">Ses</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {(sessionStats?.byCustomer || []).map((r) => (
                <tr key={r.customer_id}>
                  <td>{r.customer_name}</td>
                  <td>
                    <span className={`tag ${r.customer_level}`}>{r.customer_level}</span>
                  </td>
                  <td>{formatDuration(r.seconds_total)}</td>
                  <td>{r.sessions}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <h2>Hoje por máquina</h2>
        <div className="table-scroll">
          <table className="table table-compact">
            <thead>
              <tr>
                <th>Estação</th>
                <th>Horas</th>
                <th>
                  <span className="th-full">Sessões</span>
                  <span className="th-short">Ses</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {(sessionStats?.byStation || []).map((r) => (
                <tr key={r.station_id}>
                  <td>{r.station_name}</td>
                  <td>{formatDuration(r.seconds_total)}</td>
                  <td>{r.sessions}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h3>Histórico recente</h3>
        <p className="muted" style={{ marginTop: 0, fontSize: "0.85rem" }}>
          Últimas 15 sessões
        </p>
        <div className="table-scroll">
          <table className="table table-compact">
            <thead>
              <tr>
                <th>VIP</th>
                <th>PC</th>
                <th>
                  <span className="th-full">Duração</span>
                  <span className="th-short">Dur</span>
                </th>
                <th>
                  <span className="th-full">Status</span>
                  <span className="th-short">St</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {sessions.slice(0, 15).map((s) => (
                <tr key={s.id}>
                  <td>{s.customer_name}</td>
                  <td>{s.station_name}</td>
                  <td>{formatDuration(s.seconds_total)}</td>
                  <td>{s.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
