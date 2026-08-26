import { useState } from "react";
import type { RecognitionEvent } from "../../api";
import type { LiveFeedItem } from "../types";

const PAGE = 15;

export function FeedTab({ live, events }: { live: LiveFeedItem[]; events: RecognitionEvent[] }) {
  const [histShown, setHistShown] = useState(PAGE);
  const liveShown = live.slice(0, PAGE);
  const histVisible = events.slice(0, histShown);
  const histHasMore = events.length > histShown;

  return (
    <div className="grid-2" role="tabpanel" id="panel-feed" aria-labelledby="tab-feed">
      <section className="panel">
        <h2>Ao vivo</h2>
        <p className="muted" style={{ marginTop: 0, fontSize: "0.85rem" }}>
          Últimas {PAGE} mensagens
        </p>
        <div aria-live="polite" aria-relevant="additions">
          {liveShown.length === 0 && (
            <div className="empty-state">
              <strong>Nada ao vivo ainda</strong>
              <p>Quando um VIP for reconhecido na estação, aparece aqui.</p>
            </div>
          )}
          {liveShown.map((item, i) => (
            <div className="feed-item" key={`${item.at}-${i}`}>
              <strong>{item.text}</strong>
              <div className="muted">{new Date(item.at).toLocaleString("pt-BR")}</div>
            </div>
          ))}
        </div>
      </section>
      <section className="panel">
        <h2>Histórico recente</h2>
        {events.length === 0 ? (
          <div className="empty-state">
            <strong>Sem histórico</strong>
            <p>Reconhecimentos recentes da loja aparecerão nesta lista.</p>
          </div>
        ) : (
          <>
            <p className="muted" style={{ marginTop: 0, fontSize: "0.85rem" }}>
              Mostrando os {Math.min(histShown, events.length)} mais recentes
              {events.length > PAGE ? ` (de ${events.length})` : ""}
            </p>
            <div className="table-scroll">
              <table className="table table-compact">
                <thead>
                  <tr>
                    <th>
                      <span className="th-full">Quando</span>
                      <span className="th-short">Hora</span>
                    </th>
                    <th>
                      <span className="th-full">Cliente</span>
                      <span className="th-short">VIP</span>
                    </th>
                    <th>
                      <span className="th-full">Estação</span>
                      <span className="th-short">PC</span>
                    </th>
                    <th>Score</th>
                  </tr>
                </thead>
                <tbody>
                  {histVisible.map((e) => (
                    <tr key={e.id}>
                      <td>{new Date(e.created_at).toLocaleString("pt-BR")}</td>
                      <td>{e.customer_name || "—"}</td>
                      <td>{e.station_name || "—"}</td>
                      <td>{e.status === "matched" ? `${(e.score * 100).toFixed(0)}%` : e.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {histHasMore ? (
              <button
                className="btn ghost"
                type="button"
                style={{ marginTop: "0.75rem" }}
                onClick={() => setHistShown((n) => n + PAGE)}
              >
                Ver mais
              </button>
            ) : null}
          </>
        )}
      </section>
    </div>
  );
}
