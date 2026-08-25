import { Link } from "react-router-dom";
import { formatHours, PortalCustomer } from "../api";
import GoogleReviewCta from "../components/GoogleReviewCta";
import { LOW_BALANCE_SECONDS, WA_LAN, type PixState } from "./types";

type Props = {
  me: PortalCustomer;
  error: string;
  msg: string;
  showReview: boolean;
  checkoutDemo: boolean;
  pix: PixState | null;
  onDismissReview: () => void;
  onClosePix: () => void;
};

export function DashboardAlerts({
  me,
  error,
  msg,
  showReview,
  checkoutDemo,
  pix,
  onDismissReview,
  onClosePix,
}: Props) {
  const lowBalance = me.timeBalanceSeconds > 0 && me.timeBalanceSeconds < LOW_BALANCE_SECONDS;

  return (
    <>
      {error ? <div className="banner">{error}</div> : null}
      {msg ? <div className="banner ok">{msg}</div> : null}
      {showReview ? <GoogleReviewCta onDismiss={onDismissReview} /> : null}

      {lowBalance ? (
        <div className="banner warn reveal">
          Saldo baixo ({formatHours(me.timeBalanceSeconds)}). Recarregue ou fale no WhatsApp.
          <div className="row" style={{ marginTop: "0.5rem" }}>
            <a className="btn prox" href={WA_LAN} target="_blank" rel="noreferrer">
              WhatsApp
            </a>
          </div>
        </div>
      ) : null}

      {me.faceSamples === 0 ? (
        <div className="face-cta reveal">
          <p>Sem cadastro facial o GeekLock não libera o PC.</p>
          <Link className="btn prox" to="/enroll">
            Cadastrar rosto
          </Link>
        </div>
      ) : null}

      {checkoutDemo ? (
        <div className="banner warn">
          <strong>Demonstração</strong> — pagamento de teste via Mercado Pago. Nenhuma hora ou assinatura
          é creditada de verdade.
        </div>
      ) : null}

      {pix ? (
        <div className="card card--highlight reveal">
          <h2>
            {pix.demo ? "Demo — " : ""}
            {pix.label}
          </h2>
          <p className="muted" style={{ marginTop: 0 }}>
            {pix.demo
              ? "Escaneie o QR, abra o Pix ou use o checkout Mercado Pago. Saldo não muda."
              : "Escaneie o QR, abra o Pix ou o checkout Mercado Pago. Esta tela atualiza sozinha."}
          </p>
          {pix.info.qrCodeBase64 ? (
            <img
              className="pix-qr"
              src={`data:image/png;base64,${pix.info.qrCodeBase64}`}
              alt="QR Code Pix"
            />
          ) : null}
          {pix.info.qrCode ? <p className="pix-code muted">{pix.info.qrCode}</p> : null}
          <div className="row">
            {pix.info.ticketUrl ? (
              <a className="btn prox" href={pix.info.ticketUrl} target="_blank" rel="noreferrer">
                Abrir Pix
              </a>
            ) : null}
            {pix.checkoutUrl ? (
              <a className="btn accent2 prox" href={pix.checkoutUrl} target="_blank" rel="noreferrer">
                Checkout Mercado Pago
              </a>
            ) : null}
            <button type="button" className="btn ghost prox" onClick={onClosePix}>
              Fechar
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
