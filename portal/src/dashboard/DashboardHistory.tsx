import { useState } from "react";
import { formatHours, TimeLedgerEntry, WebOrder } from "../api";

type Props = {
  orders: WebOrder[];
  timeLedger: TimeLedgerEntry[];
};

const PAGE = 15;

export function DashboardHistory({ orders, timeLedger }: Props) {
  const [ordersShown, setOrdersShown] = useState(PAGE);

  return (
    <>
      {orders.length > 0 ? (
        <div className="card reveal">
          <p className="section-label">Extrato</p>
          <h2>Compras no portal</h2>
          <p className="muted" style={{ marginTop: 0, fontSize: "0.85rem" }}>
            Últimas {Math.min(ordersShown, orders.length)} compras
          </p>
          {orders.slice(0, ordersShown).map((o) => (
            <div className="pack" key={o.id}>
              <div>
                <strong>
                  {o.kind === "hours" ? "Horas" : "Assinatura"} · R$ {Number(o.amountReais).toFixed(2)}
                </strong>
                <div className="muted">
                  {new Date(o.createdAt).toLocaleString("pt-BR")} · {o.status}
                  {o.demo ? " · demo" : ""}
                  {o.hours ? ` · ${o.hours}h` : ""}
                  {o.months ? ` · ${o.months} mês(es)` : ""}
                </div>
              </div>
            </div>
          ))}
          {orders.length > ordersShown ? (
            <button className="btn ghost" type="button" onClick={() => setOrdersShown((n) => n + PAGE)}>
              Ver anteriores
            </button>
          ) : null}
        </div>
      ) : null}

      {timeLedger.length > 0 ? (
        <div className="card reveal">
          <p className="section-label">Lan</p>
          <h2>Consumo na lan</h2>
          <p className="muted" style={{ marginTop: 0 }}>
            Movimentações de horas (compra, sessão, ajuste no balcão).
          </p>
          {timeLedger.slice(0, 15).map((e) => {
            const secs = Number(e.deltaSeconds) || 0;
            const sign = secs >= 0 ? "+" : "−";
            return (
              <div className="pack" key={e.id}>
                <div>
                  <strong>
                    {sign}
                    {formatHours(Math.abs(secs))}
                  </strong>
                  <div className="muted">
                    {e.reason || "ajuste"} · {new Date(e.createdAt).toLocaleString("pt-BR")}
                    {e.amountReais ? ` · R$ ${Number(e.amountReais).toFixed(2)}` : ""}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </>
  );
}
