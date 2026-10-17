import { useMemo, useState } from "react";
import { api, type Customer } from "../../api";
import { formatHours } from "../format";

type ConfirmOpts = {
  title: string;
  message: string;
  danger?: boolean;
  confirmLabel?: string;
};

type Props = {
  stationId: string;
  stationName: string;
  customers: Customer[];
  refresh: () => Promise<void>;
  onError: (msg: string) => void;
  onToast: (msg: string, kind?: "ok" | "error" | "info") => void;
  askConfirm: (opts: ConfirmOpts) => Promise<boolean>;
  onClose: () => void;
};

export function LiberarClientePainel({
  stationId,
  stationName,
  customers,
  refresh,
  onError,
  onToast,
  askConfirm,
  onClose,
}: Props) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Customer | null>(null);
  const [busy, setBusy] = useState(false);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return customers.slice(0, 8);
    return customers
      .filter((c) => `${c.name} ${c.username || ""} ${c.phone || ""}`.toLowerCase().includes(q))
      .slice(0, 8);
  }, [customers, query]);

  const liberar = async () => {
    if (!selected) {
      onError("Escolha um cliente já cadastrado");
      return;
    }
    const bal = selected.time_balance_seconds ?? 0;
    if (bal <= 0) {
      onError("Esse cliente está sem hora. Venda no Caixa e depois libere aqui.");
      return;
    }
    const ok = await askConfirm({
      title: `Liberar ${stationName}`,
      message: `${selected.name} entra neste PC com ${formatHours(bal)}.`,
      confirmLabel: "Liberar",
    });
    if (!ok) return;
    setBusy(true);
    try {
      await api(`/api/stations/${stationId}/desk-liberar`, {
        method: "POST",
        body: JSON.stringify({
          mode: "balance",
          customerId: selected.id,
          customerName: selected.name,
        }),
      });
      onToast(`${stationName} liberado para ${selected.name}`, "ok");
      onClose();
      await refresh();
    } catch (e) {
      onError(e instanceof Error ? e.message : "Falha ao liberar");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="liberar-panel panel" style={{ boxShadow: "none", width: "100%", flexBasis: "100%" }}>
      <div className="field" style={{ marginBottom: "0.5rem" }}>
        <label>Cliente cadastrado</label>
        <input
          value={selected ? selected.name : query}
          onChange={(e) => {
            setSelected(null);
            setQuery(e.target.value);
          }}
          placeholder="Nome ou usuário"
          maxLength={80}
        />
        {matches.length > 0 && !selected && (
          <div className="row" style={{ flexWrap: "wrap", gap: "0.35rem", marginTop: "0.35rem" }}>
            {matches.map((c) => (
              <button
                key={c.id}
                className="btn ghost"
                type="button"
                onClick={() => {
                  setSelected(c);
                  setQuery(c.name);
                }}
              >
                {c.name}
                <span className="muted" style={{ marginLeft: "0.35rem" }}>
                  {formatHours(c.time_balance_seconds ?? 0)}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
      {selected && (
        <p style={{ margin: "0 0 0.5rem", fontWeight: 600 }}>
          Saldo: {formatHours(selected.time_balance_seconds ?? 0)}
        </p>
      )}
      <div className="row" style={{ gap: "0.35rem", flexWrap: "wrap" }}>
        <button className="btn" type="button" disabled={busy} onClick={() => void liberar()}>
          Liberar neste PC
        </button>
        <button className="btn ghost" type="button" onClick={onClose}>
          Cancelar
        </button>
      </div>
    </div>
  );
}
