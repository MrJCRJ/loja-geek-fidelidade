import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, WebOrder } from "../api";
import BrandHeader from "../components/BrandHeader";
import OfflineBanner from "../components/OfflineBanner";
import { useProximityField } from "../hooks/useProximityField";
import { useReveal } from "../hooks/useReveal";

export default function CheckoutReturnPage() {
  const [params] = useSearchParams();
  const { setRef, rootRef, rootVersion } = useReveal();
  useProximityField(rootRef, {}, rootVersion);
  const status = params.get("status") || "pending";
  const orderId = params.get("orderId") || "";
  const [order, setOrder] = useState<WebOrder | null>(null);
  const [demo, setDemo] = useState(false);
  const [credited, setCredited] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(Boolean(orderId));

  useEffect(() => {
    if (!orderId) {
      setLoading(false);
      return;
    }
    api<{
      order: WebOrder;
      demo?: boolean;
      credited?: boolean;
    }>(`/api/portal/orders/${encodeURIComponent(orderId)}`)
      .then((res) => {
        setOrder(res.order);
        setDemo(Boolean(res.demo ?? res.order.demo));
        setCredited(Boolean(res.credited));
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Não foi possível consultar o pedido");
      })
      .finally(() => setLoading(false));
  }, [orderId]);

  const resolved = order?.status === "paid" || order?.status === "demo_ok";
  const isDemo = demo || order?.demo || order?.status === "demo_ok";

  let title = "Pagamento";
  let body = "Consultando status do pedido…";

  if (loading) {
    body = "Consultando status do pedido…";
  } else if (error) {
    title = "Erro";
    body = error;
  } else if (!orderId) {
    title = "Retorno do pagamento";
    body = "Pedido não informado na URL.";
  } else if (resolved && isDemo) {
    title = "Demonstração concluída";
    body = "Pagamento de teste recebido — saldo não alterado.";
  } else if (resolved && credited) {
    title = "Pagamento confirmado";
    body = "Crédito liberado na sua conta.";
  } else if (status === "failure" || order?.status === "failed") {
    title = "Pagamento não concluído";
    body = "Tente de novo ou fale no WhatsApp da lan.";
  } else if (status === "pending" || order?.status === "pending") {
    title = "Pagamento pendente";
    body = "Aguardando confirmação do Mercado Pago. Esta página atualiza quando você voltar.";
  } else if (status === "success") {
    title = "Quase lá";
    body = "Recebemos o retorno do Mercado Pago. Se o saldo não atualizar, aguarde alguns segundos.";
  }

  return (
    <div className="shell shell--ambient page-in" ref={setRef}>
      <OfflineBanner />
      <BrandHeader size="md" />
      <h1 className="display display--lg" style={{ marginBottom: "0.5rem" }}>
        {title}
      </h1>
      <p className="lead">{body}</p>
      {order ? (
        <div className={`card reveal${resolved && credited ? " card--highlight" : ""}`}>
          <p className="section-label">Pedido</p>
          <p className="muted" style={{ marginTop: 0 }}>
            {order.kind === "hours" ? "Horas" : "Assinatura"} · R$ {Number(order.amountReais).toFixed(2)}
            <br />
            Status: {order.status}
            {isDemo ? " · demonstração" : ""}
          </p>
        </div>
      ) : null}
      <div className="row page-in-cta">
        <Link className="btn prox" to="/dashboard">
          Minha conta
        </Link>
        {orderId && !loading ? (
          <button
            className="btn ghost prox"
            type="button"
            onClick={() => window.location.reload()}
          >
            Atualizar
          </button>
        ) : null}
      </div>
    </div>
  );
}
