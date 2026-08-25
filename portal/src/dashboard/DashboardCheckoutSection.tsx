import { Catalog, PortalCustomer } from "../api";
import { DEFAULT_HOUR_PACKS, WA_LAN } from "./types";

type Pack = { amountReais: number; label: string };

type Props = {
  me: PortalCustomer;
  catalog: Catalog | null;
  checkoutEnabled: boolean;
  checkoutDemo: boolean;
  pixMode: boolean | undefined;
  busy: boolean;
  onBuyHours: (amountReais: number) => void;
  onBuySub: (months: number) => void;
};

export function DashboardCheckoutSection({
  me,
  catalog,
  checkoutEnabled,
  checkoutDemo,
  pixMode,
  busy,
  onBuyHours,
  onBuySub,
}: Props) {
  const packs: Pack[] = catalog?.hourPacks || DEFAULT_HOUR_PACKS;
  const subPrice = catalog?.subscriptionMonthlyPrice ?? 49.9;

  return (
    <>
      <div className="packs-list reveal">
        <p className="section-label">Recarga</p>
        <h2>Comprar horas</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          {checkoutEnabled
            ? checkoutDemo
              ? "Modo demonstração — Pix e checkout Mercado Pago (sem crédito)."
              : pixMode
                ? "Pagamento via Pix ou checkout Mercado Pago."
                : "Crédito imediato (modo demo interno — configure MP_ACCESS_TOKEN na loja)."
            : "Em breve — recarregue na lan ou WhatsApp."}
        </p>
        {!checkoutEnabled ? (
          <div className="row" style={{ marginBottom: "0.75rem" }}>
            <a className="btn accent2 prox" href={WA_LAN} target="_blank" rel="noreferrer">
              WhatsApp lan
            </a>
          </div>
        ) : null}
        {packs.map((p) => (
          <div className="pack prox" key={p.amountReais}>
            <div>
              <strong>{p.label}</strong>
              <div className="muted">~{(p.amountReais / me.hourPrice).toFixed(1)}h na tarifa atual</div>
            </div>
            <button
              className={`btn prox${busy && checkoutEnabled ? " loading" : ""}`}
              type="button"
              disabled={!checkoutEnabled || busy}
              onClick={() => {
                if (!checkoutEnabled) return;
                onBuyHours(p.amountReais);
              }}
            >
              {!checkoutEnabled ? "Em breve" : busy ? "…" : checkoutDemo || pixMode ? "Pagar" : "Comprar"}
            </button>
          </div>
        ))}
      </div>

      <div className="card reveal">
        <p className="section-label">Plano</p>
        <h2>Assinatura</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          {checkoutEnabled
            ? checkoutDemo
              ? "Demonstração — assinatura via Mercado Pago (sem ativar de verdade)."
              : `−${me.subscriberDiscountPct}% nas horas · R$ ${subPrice.toFixed(2)}/mês`
            : "Em breve — assine no balcão ou WhatsApp."}
        </p>
        <div className="row">
          <button
            className={`btn accent2 prox${busy && checkoutEnabled ? " loading" : ""}`}
            type="button"
            disabled={!checkoutEnabled || busy}
            onClick={() => {
              if (!checkoutEnabled) return;
              onBuySub(1);
            }}
          >
            {!checkoutEnabled ? "Em breve" : busy ? "…" : "Assinar 1 mês"}
          </button>
          <button
            className="btn ghost prox"
            type="button"
            disabled={!checkoutEnabled || busy}
            onClick={() => {
              if (!checkoutEnabled) return;
              onBuySub(3);
            }}
          >
            {!checkoutEnabled ? "Em breve" : "3 meses"}
          </button>
        </div>
      </div>
    </>
  );
}
