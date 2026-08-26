import { formatHours, PortalCustomer } from "../api";

type Props = {
  me: PortalCustomer;
};

export function DashboardBalancePanel({ me }: Props) {
  return (
    <div className="balance-panel reveal">
      <p className="section-label">Saldo de horas</p>
      <p className="stat">{formatHours(me.timeBalanceSeconds)}</p>
      <p className="muted">
        Tarifa: R$ {me.hourPrice.toFixed(2)}/h
        {me.isSubscriber ? ` (−${me.subscriberDiscountPct}% assinante)` : ""}
      </p>
      {me.isSubscriber ? (
        <p className="muted tip-box">
          Assinatura dá <strong>desconto</strong> na hora — não é tempo ilimitado. O PC usa o saldo
          acima.
        </p>
      ) : (
        <p className="muted tip-box">
          Cada PC consome este saldo. Confira antes de sentar para não travar no meio do jogo.
        </p>
      )}
      <p className="muted">
        Face: {me.faceSamples}/{me.maxFaceSamples} amostras
        {me.faceSamples < 3 ? " — cadastre mais fotos com boa luz para liberar melhor" : ""}
      </p>
      <p className="muted">
        Assinatura:{" "}
        {me.isSubscriber
          ? `ativa até ${me.subscriptionExpiresAt ? new Date(me.subscriptionExpiresAt).toLocaleDateString("pt-BR") : "—"}`
          : "inativa"}
      </p>
      <p className="muted tip-box">
        Conta e face são pessoais: não compartilhe com familiares no mesmo cadastro facial.
      </p>
    </div>
  );
}
