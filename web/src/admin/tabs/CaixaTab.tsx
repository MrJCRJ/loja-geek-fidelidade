import { useState } from "react";
import { api, type Customer } from "../../api";
import { formatHours } from "../format";
import type { AdminSettings, TimeLedgerRow } from "../types";

type Props = {
  customers: Customer[];
  selected: Customer | null;
  setSelected: (c: Customer | null) => void;
  settings: AdminSettings;
  timeLedger: TimeLedgerRow[];
  refresh: () => Promise<void>;
  loadTimeForCustomer: (id: string) => Promise<void>;
  onError: (msg: string) => void;
  onToast: (msg: string, kind?: "ok" | "error" | "info") => void;
};

export function CaixaTab({
  customers,
  selected,
  setSelected,
  settings,
  timeLedger,
  refresh,
  loadTimeForCustomer,
  onError,
  onToast,
}: Props) {
  const [saleReais, setSaleReais] = useState("10");
  const [saleHours, setSaleHours] = useState("1");
  const [subMonths, setSubMonths] = useState("1");
  const [subPrice, setSubPrice] = useState("49.90");
  const [caixaMsg, setCaixaMsg] = useState("");

  return (
    <div className="grid-2" role="tabpanel" id="panel-caixa" aria-labelledby="tab-caixa">
      <section className="panel">
        <h2>Caixa — horas no PC</h2>
        <p className="muted">
          Tarifa padrão: R$ {settings.hourPriceReais.toFixed(2)} / hora. Assinante:{" "}
          {settings.subscriberHourDiscountPct}% de desconto na compra de horas.
        </p>
        <div className="field">
          <label>Cliente</label>
          <select
            value={selected?.id || ""}
            onChange={(e) => {
              const c = customers.find((x) => x.id === e.target.value) || null;
              setSelected(c);
              setCaixaMsg("");
              if (c) loadTimeForCustomer(c.id).catch(() => undefined);
            }}
          >
            <option value="">Selecione…</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.subscription_status === "active" ? " ★" : ""} — {formatHours(c.time_balance_seconds ?? 0)}
              </option>
            ))}
          </select>
        </div>
        {selected && (
          <>
            <p>
              Saldo: <strong>{formatHours(selected.time_balance_seconds ?? 0)}</strong>
              {selected.subscription_status === "active" && (
                <>
                  {" "}
                  · <span className="tag ouro">Assinante</span>
                </>
              )}
            </p>
            <div className="row" style={{ alignItems: "flex-end", flexWrap: "wrap", gap: 8 }}>
              <div className="field">
                <label>Vender (R$)</label>
                <input value={saleReais} onChange={(e) => setSaleReais(e.target.value)} />
              </div>
              <button
                className="btn"
                type="button"
                onClick={() => {
                  const amountReais = Number(saleReais);
                  if (!amountReais || amountReais <= 0) {
                    onError("Informe um valor em reais");
                    return;
                  }
                  api<{ customer?: Customer; creditedSeconds?: number }>(
                    `/api/customers/${selected.id}/time/sale`,
                    { method: "POST", body: JSON.stringify({ amountReais }) },
                  )
                    .then((res) => {
                      if (res.customer) setSelected(res.customer);
                      const msg = `Creditado ${formatHours(res.creditedSeconds || 0)} (R$ ${amountReais.toFixed(2)})`;
                      setCaixaMsg(msg);
                      onToast(msg, "ok");
                      refresh().catch(() => undefined);
                      loadTimeForCustomer(selected.id).catch(() => undefined);
                    })
                    .catch((e) => onError(e.message));
                }}
              >
                Vender por R$
              </button>
              <div className="field">
                <label>Vender (horas)</label>
                <input value={saleHours} onChange={(e) => setSaleHours(e.target.value)} />
              </div>
              <button
                className="btn ghost"
                type="button"
                onClick={() => {
                  const hours = Number(saleHours);
                  if (!hours || hours <= 0) {
                    onError("Informe horas");
                    return;
                  }
                  api<{ customer?: Customer; amountReais?: number }>(
                    `/api/customers/${selected.id}/time/sale`,
                    { method: "POST", body: JSON.stringify({ hours }) },
                  )
                    .then((res) => {
                      if (res.customer) setSelected(res.customer);
                      const msg = `Creditado ${hours}h (R$ ${(res.amountReais || 0).toFixed(2)})`;
                      setCaixaMsg(msg);
                      onToast(msg, "ok");
                      refresh().catch(() => undefined);
                      loadTimeForCustomer(selected.id).catch(() => undefined);
                    })
                    .catch((e) => onError(e.message));
                }}
              >
                Vender horas
              </button>
            </div>
            {caixaMsg && <p>{caixaMsg}</p>}
          </>
        )}
      </section>

      <section className="panel">
        <h2>Assinatura (interna)</h2>
        <p className="muted">Sem cartão nesta fase — marque o cliente como assinante.</p>
        {!selected && <p className="muted">Selecione um cliente no caixa.</p>}
        {selected && (
          <>
            <div className="row" style={{ alignItems: "flex-end", flexWrap: "wrap", gap: 8 }}>
              <div className="field">
                <label>Meses</label>
                <input value={subMonths} onChange={(e) => setSubMonths(e.target.value)} />
              </div>
              <div className="field">
                <label>Valor anotado (R$)</label>
                <input value={subPrice} onChange={(e) => setSubPrice(e.target.value)} />
              </div>
              <button
                className="btn"
                type="button"
                onClick={() => {
                  api<{ customer?: Customer }>(`/api/customers/${selected.id}/subscription`, {
                    method: "POST",
                    body: JSON.stringify({
                      status: "active",
                      months: Number(subMonths) || 1,
                      priceReais: Number(subPrice) || 0,
                      notes: "Ativação manual no caixa",
                    }),
                  })
                    .then((res) => {
                      if (res.customer) setSelected(res.customer);
                      setCaixaMsg("Assinatura ativada/renovada");
                      onToast("Assinatura ativada", "ok");
                      refresh().catch(() => undefined);
                    })
                    .catch((e) => onError(e.message));
                }}
              >
                Ativar / Renovar
              </button>
              <button
                className="btn ghost"
                type="button"
                onClick={() => {
                  api<{ customer?: Customer }>(`/api/customers/${selected.id}/subscription`, {
                    method: "POST",
                    body: JSON.stringify({ status: "paused" }),
                  })
                    .then((res) => {
                      if (res.customer) setSelected(res.customer);
                      onToast("Assinatura pausada", "info");
                      refresh().catch(() => undefined);
                    })
                    .catch((e) => onError(e.message));
                }}
              >
                Pausar
              </button>
              <button
                className="btn danger"
                type="button"
                onClick={() => {
                  api<{ customer?: Customer }>(`/api/customers/${selected.id}/subscription`, {
                    method: "POST",
                    body: JSON.stringify({ status: "none" }),
                  })
                    .then((res) => {
                      if (res.customer) setSelected(res.customer);
                      onToast("Assinatura removida", "ok");
                      refresh().catch(() => undefined);
                    })
                    .catch((e) => onError(e.message));
                }}
              >
                Remover
              </button>
            </div>
            <h3 style={{ marginTop: "1.2rem" }}>Histórico de horas</h3>
            <table className="table">
              <thead>
                <tr>
                  <th>Quando</th>
                  <th>Motivo</th>
                  <th>Δ</th>
                  <th>R$</th>
                </tr>
              </thead>
              <tbody>
                {timeLedger.map((row) => (
                  <tr key={row.id}>
                    <td>{new Date(row.created_at).toLocaleString("pt-BR")}</td>
                    <td>{row.reason}</td>
                    <td>
                      {formatHours(Math.abs(row.delta_seconds))}
                      {row.delta_seconds < 0 ? " −" : " +"}
                    </td>
                    <td>{Number(row.amount_reais || 0).toFixed(2)}</td>
                  </tr>
                ))}
                {timeLedger.length === 0 && (
                  <tr>
                    <td colSpan={4} className="muted">
                      Sem lançamentos
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </>
        )}
      </section>
    </div>
  );
}
