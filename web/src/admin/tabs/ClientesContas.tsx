import { useMemo, useState } from "react";
import { api, type Customer } from "../../api";
import { formatHours } from "../format";

type Props = {
  customers: Customer[];
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

export function ClientesContas({ customers, refresh, onError, onToast, askConfirm, remoteReadOnly }: Props) {
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = q
      ? customers.filter((c) => `${c.name} ${c.username || ""} ${c.phone || ""}`.toLowerCase().includes(q))
      : customers;
    return [...rows].sort((a, b) => a.name.localeCompare(b.name, "pt"));
  }, [customers, query]);

  const remove = async (customer: Customer) => {
    const ok = await askConfirm({
      title: `Remover ${customer.name}`,
      message: "Apaga a conta, a senha e o saldo. Não dá para desfazer.",
      danger: true,
      confirmLabel: "Remover",
    });
    if (!ok) return;
    setBusyId(customer.id);
    try {
      await api(`/api/customers/${customer.id}`, { method: "DELETE" });
      onToast(`${customer.name} removido`, "ok");
      await refresh();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Falha ao remover");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="panel">
      <h2 style={{ marginTop: 0 }}>Clientes</h2>
      <p className="muted">Contas cadastradas. Remover apaga a conta deste cliente.</p>
      <div className="field">
        <label>Buscar</label>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Nome ou usuário"
        />
      </div>
      {list.length === 0 ? <p className="muted">Nenhum cliente.</p> : null}
      <div className="pc-cards">
        {list.map((c) => (
          <article key={c.id} className="console-card">
            <div className="pc-card-head">
              <h3 style={{ margin: 0 }}>{c.name}</h3>
              <span className="tag">{formatHours(c.time_balance_seconds ?? 0)}</span>
            </div>
            <p className="muted" style={{ margin: "0.35rem 0 0.75rem" }}>
              {c.username ? `@${c.username}` : "Sem usuário"}
            </p>
            {remoteReadOnly ? null : (
              <button
                className="btn danger"
                type="button"
                disabled={busyId === c.id}
                onClick={() => void remove(c)}
              >
                Remover
              </button>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
