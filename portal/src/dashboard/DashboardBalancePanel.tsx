import { formatHours, PortalCustomer } from "../api";

type Props = {
  me: PortalCustomer;
};

export function DashboardBalancePanel({ me }: Props) {
  return (
    <div className="balance-panel reveal">
      <p className="section-label">Saldo</p>
      <p className="stat">{formatHours(me.timeBalanceSeconds)}</p>
      <p className="muted">
        Tarifa: R$ {me.hourPrice.toFixed(2)}/h
        {me.isSubscriber ? ` (−${me.subscriberDiscountPct}% assinante)` : ""}
      </p>
      <p className="muted">
        Face: {me.faceSamples}/{me.maxFaceSamples} amostras
      </p>
      <p className="muted">
        Assinatura:{" "}
        {me.isSubscriber
          ? `ativa até ${me.subscriptionExpiresAt ? new Date(me.subscriptionExpiresAt).toLocaleDateString("pt-BR") : "—"}`
          : "inativa"}
      </p>
    </div>
  );
}
