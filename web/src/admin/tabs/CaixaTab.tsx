import { useMemo, useState } from "react";
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

const QUICK_REAIS = [10, 20, 50];
const QUICK_HOURS = [1, 2, 5];

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
  const [filter, setFilter] = useState("");
  const [busy, setBusy] = useState(false);

  const filteredCustomers = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter((c) => {
      const hay = `${c.name} ${c.phone || ""} ${c.email || ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [customers, filter]);

  const sellReais = (amountReais: number) => {
    if (!selected) return;
    if (!amountReais || amountReais <= 0) {
      onError("Informe um valor em reais");
      return;
    }
    setBusy(true);
    api<{ customer?: Customer; creditedSeconds?: number }>(`/api/customers/${selected.id}/time/sale`, {
      method: "POST",
      body: JSON.stringify({ amountReais }),
    })
      .then((res) => {
        if (res.customer) setSelected(res.customer);
        const msg = `Creditado ${formatHours(res.creditedSeconds || 0)} (R$ ${amountReais.toFixed(2)})`;
        setCaixaMsg(msg);
        onToast(msg, "ok");
        refresh().catch(() => undefined);
        loadTimeForCustomer(selected.id).catch(() => undefined);
      })
      .catch((e) => onError(e.message))
      .finally(() => setBusy(false));
  };

  const sellHours = (hours: number) => {
    if (!selected) return;
    if (!hours || hours <= 0) {
      onError("Informe horas");
      return;
    }
    setBusy(true);
    api<{ customer?: Customer; amountReais?: number }>(`/api/customers/${selected.id}/time/sale`, {
      method: "POST",
      body: JSON.stringify({ hours }),
    })
      .then((res) => {
        if (res.customer) setSelected(res.customer);
        const msg = `Creditado ${hours}h (R$ ${(res.amountReais || 0).toFixed(2)})`;
        setCaixaMsg(msg);
        onToast(msg, "ok");
        refresh().catch(() => undefined);
        loadTimeForCustomer(selected.id).catch(() => undefined);
      })
      .catch((e) => onError(e.message))
      .finally(() => setBusy(false));
  };

  return (
    <div className="grid-2" role="tabpanel" id="panel-caixa" aria-labelledby="tab-caixa">
      <section className="panel">
        <h2>Caixa — PDV rápido</h2>
        <p className="muted">
          Tarifa: R$ {settings.hourPriceReais.toFixed(2)}/h · Assinante: −
          {settings.subscriberHourDiscountPct}% nas horas (não é ilimitado).
        </p>
        <div className="field">
          <label>Buscar cliente</label>
          <input
            placeholder="Nome, WhatsApp…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>
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
            {filteredCustomers.map((c) => (
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

            <p className="muted" style={{ marginBottom: "0.35rem", fontSize: "0.85rem" }}>
              Atalhos R$
            </p>
            <div className="row" style={{ flexWrap: "wrap", gap: 8, marginBottom: "0.75rem" }}>
              {QUICK_REAIS.map((v) => (
                <button
                  key={v}
                  className="btn"
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setSaleReais(String(v));
                    sellReais(v);
                  }}
                >
                  R$ {v}
                </button>
              ))}
              {(settings.hourPacks || []).map((p) =>
                QUICK_REAIS.includes(p.amountReais) ? null : (
                  <button
                    key={`pack-${p.amountReais}`}
                    className="btn ghost"
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setSaleReais(String(p.amountReais));
                      sellReais(p.amountReais);
                    }}
                  >
                    {p.label}
                  </button>
                ),
              )}
            </div>

            <p className="muted" style={{ marginBottom: "0.35rem", fontSize: "0.85rem" }}>
              Atalhos horas
            </p>
            <div className="row" style={{ flexWrap: "wrap", gap: 8, marginBottom: "0.75rem" }}>
              {QUICK_HOURS.map((h) => (
                <button
                  key={h}
                  className="btn ghost"
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setSaleHours(String(h));
                    sellHours(h);
                  }}
                >
                  {h}h
                </button>
              ))}
            </div>

            <div className="row" style={{ alignItems: "flex-end", flexWrap: "wrap", gap: 8 }}>
              <div className="field">
                <label>Vender (R$)</label>
                <input value={saleReais} onChange={(e) => setSaleReais(e.target.value)} />
              </div>
              <button
                className="btn"
                type="button"
                disabled={busy}
                onClick={() => sellReais(Number(saleReais))}
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
                disabled={busy}
                onClick={() => sellHours(Number(saleHours))}
              >
                Vender horas
              </button>
            </div>
            {caixaMsg && <p>{caixaMsg}</p>}
          </>
        )}
        {!selected && (
          <div className="empty-state" style={{ marginTop: "1rem" }}>
            <strong>Escolha um VIP</strong>
            <p>Busque pelo nome e use os atalhos para creditar horas no balcão.</p>
          </div>
        )}
      </section>

      <section className="panel">
        <h2>Assinatura (balcão)</h2>
        <p className="muted">
          Assinatura = <strong>desconto na tarifa</strong> das horas, não crédito ilimitado. Sem cartão
          nesta tela — marque manualmente.
        </p>
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
            <h3 style={{ marginTop: "1.2rem" }}>Últimos 15 — histórico de horas</h3>
            <div className="table-scroll">
              <table className="table table-compact">
                <thead>
                  <tr>
                    <th>Quando</th>
                    <th>Motivo</th>
                    <th>Δ</th>
                    <th>R$</th>
                  </tr>
                </thead>
                <tbody>
                  {timeLedger.slice(0, 15).map((row) => (
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
            </div>
          </>
        )}
      </section>
    </div>
  );
}
