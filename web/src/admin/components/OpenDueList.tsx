import { useCallback, useEffect, useState } from "react";
import { api, formatClock } from "../../api";

type Due = {
  id: string;
  customerName: string;
  amountReais: number;
  openSeconds: number;
  createdAt: string;
};

type Method = "pix" | "card" | "cash";

const METHODS: Array<[Method, string]> = [
  ["pix", "Pix"],
  ["card", "Cartão"],
  ["cash", "Dinheiro"],
];

type Props = {
  onError: (msg: string) => void;
  onToast: (msg: string, kind?: "ok" | "error" | "info") => void;
  remoteReadOnly?: boolean;
};

export function OpenDueList({ onError, onToast, remoteReadOnly }: Props) {
  const [dues, setDues] = useState<Due[]>([]);

  const load = useCallback(() => {
    api<{ dues: Due[] }>("/api/caixa/open-dues")
      .then((res) => setDues(res.dues || []))
      .catch((e) => onError(e instanceof Error ? e.message : "Falha ao listar hora em aberto"));
  }, [onError]);

  useEffect(() => {
    load();
  }, [load]);

  const pay = (due: Due, paymentMethod: Method) => {
    const label = METHODS.find(([id]) => id === paymentMethod)?.[1] || paymentMethod;
    api(`/api/caixa/open-dues/${due.id}/pay`, {
      method: "POST",
      body: JSON.stringify({ paymentMethod }),
    })
      .then(() => {
        onToast(`${due.customerName}: R$ ${due.amountReais.toFixed(2)} confirmado no ${label}`, "ok");
        load();
      })
      .catch((e) => onError(e instanceof Error ? e.message : "Falha ao confirmar"));
  };

  return (
    <section className="panel">
      <h2>Hora em aberto — confirmar pagamento</h2>
      <p className="muted">A equipe marca como pago quando o dinheiro entrar. Isso não devolve hora para a conta.</p>
      {dues.length === 0 ? (
        <p className="muted">Nada pendente.</p>
      ) : (
        dues.map((due) => (
          <div key={due.id} className="panel" style={{ boxShadow: "none", marginBottom: "0.75rem" }}>
            <p style={{ margin: "0 0 0.35rem" }}>
              <strong>{due.customerName}</strong> · {formatClock(due.openSeconds)} · R${" "}
              {due.amountReais.toFixed(2)}
            </p>
            {!remoteReadOnly && (
              <div className="row" style={{ gap: "0.35rem", flexWrap: "wrap" }}>
                {METHODS.map(([id, label]) => (
                  <button key={id} className="btn" type="button" onClick={() => pay(due, id)}>
                    Pago no {label}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))
      )}
    </section>
  );
}

export function PayMethodPicker({
  value,
  onChange,
}: {
  value: Method | "";
  onChange: (method: Method) => void;
}) {
  return (
    <div className="row" style={{ gap: "0.35rem", flexWrap: "wrap", marginBottom: "0.75rem" }}>
      {METHODS.map(([id, label]) => (
        <button
          key={id}
          className={`btn ${value === id ? "" : "ghost"}`}
          type="button"
          onClick={() => onChange(id)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
