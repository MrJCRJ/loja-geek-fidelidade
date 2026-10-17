import { useMemo, useState } from "react";
import { OpenDueList, PayMethodPicker } from "../components/OpenDueList";
import { VendaHora } from "../components/VendaHora";
import { api, type Customer } from "../../api";
import { formatHours } from "../format";
import { sellCustomerTime, type PayMethod } from "../sellTime";
import type { AdminSettings } from "../types";

type Props = {
  customers: Customer[];
  settings: AdminSettings;
  refresh: () => Promise<void>;
  onError: (msg: string) => void;
  onToast: (msg: string, kind?: "ok" | "error" | "info") => void;
  askConfirm: (opts: {
    title: string;
    message: string;
    danger?: boolean;
    confirmLabel?: string;
  }) => Promise<boolean>;
  remoteReadOnly?: boolean;
};

export function CaixaCurta({
  customers,
  settings,
  refresh,
  onError,
  onToast,
  askConfirm,
  remoteReadOnly,
}: Props) {
  const [filter, setFilter] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [removeHours, setRemoveHours] = useState("1");
  const [payMethod, setPayMethod] = useState<PayMethod>("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter((c) =>
      `${c.name} ${c.username || ""} ${c.phone || ""}`.toLowerCase().includes(q),
    );
  }, [customers, filter]);

  const selected = customers.find((c) => c.id === selectedId) || null;

  const after = (text: string, customer?: Customer) => {
    if (customer) setSelectedId(customer.id);
    setMsg(text);
    onToast(text, "ok");
    refresh().catch(() => undefined);
  };

  const vender = async (input: { amountReais?: number; hours?: number }) => {
    if (!selected) return;
    setBusy(true);
    try {
      const res = await sellCustomerTime({
        customer: selected,
        payMethod,
        input,
        askConfirm,
        onError,
        amountError: "Informe um valor",
      });
      if (res) after(`Creditou ${formatHours(res.creditedSeconds || 0)}`, res.customer);
    } catch (e) {
      onError(e instanceof Error ? e.message : "Falha ao vender");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div role="tabpanel" id="panel-caixa" aria-labelledby="tab-caixa">
    <OpenDueList onError={onError} onToast={onToast} remoteReadOnly={remoteReadOnly} />
    <section className="panel">
      <h2>Caixa</h2>
      <p className="muted">Tarifa R$ {settings.hourPriceReais.toFixed(2)}/h. Escolha o cliente e venda por horário ou por dinheiro.</p>
      <div className="field">
        <label>Buscar</label>
        <input placeholder="Nome ou usuário" value={filter} onChange={(e) => setFilter(e.target.value)} />
      </div>
      <div className="field">
        <label>Cliente</label>
        <select value={selectedId} onChange={(e) => { setSelectedId(e.target.value); setMsg(""); }}>
          <option value="">Selecione…</option>
          {filtered.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {c.username ? ` (${c.username})` : ""} — {formatHours(c.time_balance_seconds ?? 0)}
            </option>
          ))}
        </select>
      </div>
      {selected && (
        <p>
          Saldo: <strong>{formatHours(selected.time_balance_seconds ?? 0)}</strong>
        </p>
      )}
      {remoteReadOnly && <p className="muted">De casa só dá para ver.</p>}
      {selected && !remoteReadOnly && (
        <>
          <p className="muted" style={{ marginBottom: "0.35rem" }}>Como foi pago</p>
          <PayMethodPicker value={payMethod} onChange={setPayMethod} />
          <VendaHora
            hourPrice={settings.hourPriceReais || 10}
            packs={settings.hourPacks}
            busy={busy}
            onSellHours={(hours) => void vender({ hours })}
            onSellReais={(amountReais) => void vender({ amountReais })}
          />
          <div className="row" style={{ alignItems: "flex-end", flexWrap: "wrap", gap: 8, marginTop: "0.75rem" }}>
            <div className="field">
              <label>Tirar horas a mais</label>
              <input value={removeHours} onChange={(e) => setRemoveHours(e.target.value)} />
            </div>
            <button
              className="btn ghost"
              type="button"
              disabled={busy}
              onClick={() => {
                const n = Number(removeHours);
                if (!n || n <= 0) {
                  onError("Informe as horas a tirar");
                  return;
                }
                setBusy(true);
                api<{ customer?: Customer }>(`/api/customers/${selected.id}/time/adjust`, {
                  method: "POST",
                  body: JSON.stringify({
                    deltaSeconds: -Math.round(n * 3600),
                    note: "Caixa: horas lançadas a mais",
                  }),
                })
                  .then((res) => after(`Tirou ${n}h. Esse tempo não volta como crédito.`, res.customer))
                  .catch((e) => onError(e.message))
                  .finally(() => setBusy(false));
              }}
            >
              Tirar horas
            </button>
          </div>
          <button
            className="btn danger"
            type="button"
            disabled={busy}
            style={{ marginTop: "0.75rem" }}
            onClick={() => {
              if (!selected) return;
              void (async () => {
                const ok = await askConfirm({
                  title: `Remover ${selected.name}`,
                  message: "Apaga a conta, a senha e o saldo. Não dá para desfazer.",
                  danger: true,
                  confirmLabel: "Remover",
                });
                if (!ok) return;
                setBusy(true);
                try {
                  await api(`/api/customers/${selected.id}`, { method: "DELETE" });
                  setSelectedId("");
                  setMsg("");
                  onToast(`${selected.name} removido`, "ok");
                  await refresh();
                } catch (e) {
                  onError(e instanceof Error ? e.message : "Falha ao remover");
                } finally {
                  setBusy(false);
                }
              })();
            }}
          >
            Remover cliente
          </button>
          {msg && <p>{msg}</p>}
        </>
      )}
    </section>
    </div>
  );
}
