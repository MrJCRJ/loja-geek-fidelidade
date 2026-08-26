import type { PortalCustomer } from "../api";
import { formatHours } from "../api";

type Props = {
  me: PortalCustomer;
  orderLabel: string;
  amountReais: number;
  hoursApprox?: number | null;
  demo?: boolean;
  paidAt?: string | null;
  onClose: () => void;
};

export function PaymentReceipt({
  me,
  orderLabel,
  amountReais,
  hoursApprox,
  demo,
  paidAt,
  onClose,
}: Props) {
  const when = paidAt ? new Date(paidAt) : new Date();

  return (
    <div className="card card--highlight reveal receipt-card" id="payment-receipt">
      <p className="section-label">Comprovante</p>
      <h2 style={{ marginTop: 0 }}>{demo ? "Demo — " : ""}
        {orderLabel}
      </h2>
      <p className="muted" style={{ marginTop: 0 }}>
        {when.toLocaleString("pt-BR")} · {me.name}
        {me.email ? ` · ${me.email}` : ""}
      </p>
      <ul style={{ lineHeight: 1.7, paddingLeft: "1.1rem" }}>
        <li>
          Valor: <strong>R$ {amountReais.toFixed(2)}</strong>
        </li>
        {hoursApprox != null ? (
          <li>
            Crédito ≈ <strong>{hoursApprox}h</strong> (saldo agora {formatHours(me.timeBalanceSeconds)})
          </li>
        ) : null}
        <li>Unidade: Lan House Geeks / portal geeks</li>
      </ul>
      {demo ? (
        <p className="muted">Demonstração — nenhuma hora creditada de verdade.</p>
      ) : (
        <p className="muted">Guarde este comprovante. Pode imprimir ou mandar no WhatsApp.</p>
      )}
      <div className="row">
        <button type="button" className="btn prox" onClick={() => window.print()}>
          Imprimir
        </button>
        <a
          className="btn ghost prox"
          href={`https://wa.me/5575988603747?text=${encodeURIComponent(
            `Comprovante geeks: ${orderLabel} · R$ ${amountReais.toFixed(2)}${
              hoursApprox != null ? ` ≈ ${hoursApprox}h` : ""
            } · ${when.toLocaleString("pt-BR")}`,
          )}`}
          target="_blank"
          rel="noreferrer"
        >
          WhatsApp
        </a>
        <button type="button" className="btn ghost prox" onClick={onClose}>
          Fechar
        </button>
      </div>
    </div>
  );
}
