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
        <table className="table">
          <thead>
            <tr>
              <th>VIP</th>
              <th>PC</th>
              <th>Tempo</th>
              <th>Início</th>
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
        )}

        <h3>Hoje por VIP</h3>
        <table className="table">
          <thead>
            <tr>
              <th>Cliente</th>
              <th>Nível</th>
              <th>Horas</th>
              <th>Sessões</th>
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
      </section>

      <section className="panel">
        <h2>Hoje por máquina</h2>
        <table className="table">
          <thead>
            <tr>
              <th>Estação</th>
              <th>Horas</th>
              <th>Sessões</th>
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

        <h3>Histórico recente</h3>
        <table className="table">
          <thead>
            <tr>
              <th>VIP</th>
              <th>PC</th>
              <th>Duração</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {sessions.map((s) => (
              <tr key={s.id}>
                <td>{s.customer_name}</td>
                <td>{s.station_name}</td>
                <td>{formatDuration(s.seconds_total)}</td>
                <td>{s.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
