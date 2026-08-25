import type { RecognitionEvent } from "../../api";
import type { LiveFeedItem } from "../types";

export function FeedTab({ live, events }: { live: LiveFeedItem[]; events: RecognitionEvent[] }) {
  return (
    <div className="grid-2" role="tabpanel" id="panel-feed" aria-labelledby="tab-feed">
      <section className="panel">
        <h2>Ao vivo</h2>
        <div aria-live="polite" aria-relevant="additions">
          {live.length === 0 && <p className="muted">Aguardando reconhecimentos...</p>}
          {live.map((item, i) => (
            <div className="feed-item" key={`${item.at}-${i}`}>
              <strong>{item.text}</strong>
              <div className="muted">{new Date(item.at).toLocaleString("pt-BR")}</div>
            </div>
          ))}
        </div>
      </section>
      <section className="panel">
        <h2>Histórico recente</h2>
        <table className="table">
          <thead>
            <tr>
              <th>Quando</th>
              <th>Cliente</th>
              <th>Estação</th>
              <th>Score</th>
            </tr>
          </thead>
          <tbody>
            {events.map((e) => (
              <tr key={e.id}>
                <td>{new Date(e.created_at).toLocaleString("pt-BR")}</td>
                <td>{e.customer_name || "—"}</td>
                <td>{e.station_name || "—"}</td>
                <td>{e.status === "matched" ? `${(e.score * 100).toFixed(0)}%` : e.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
