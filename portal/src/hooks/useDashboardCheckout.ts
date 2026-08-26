import { useEffect, useState } from "react";
import { api, PortalCustomer } from "../api";
import type { PixInfo, PixState } from "../dashboard/types";

export type CheckoutReceipt = {
  label: string;
  amountReais: number;
  hoursApprox: number | null;
  demo?: boolean;
  paidAt: string;
};

type Args = {
  load: () => Promise<void>;
  setMe: (c: PortalCustomer) => void;
  setError: (msg: string) => void;
  onPaid: () => void;
};

function makeReceipt(
  label: string,
  amountReais: number,
  hours: number | null | undefined,
  demo?: boolean,
): CheckoutReceipt {
  return {
    label,
    amountReais,
    hoursApprox: hours ?? null,
    demo,
    paidAt: new Date().toISOString(),
  };
}

function amountFromLabel(label: string) {
  const m = /R\$\s*([\d.,]+)/.exec(label);
  if (!m) return 0;
  return Number(m[1].replace(/\./g, "").replace(",", ".")) || Number(m[1].replace(",", ".")) || 0;
}

export function useDashboardCheckout({ load, setMe, setError, onPaid }: Args) {
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [pix, setPix] = useState<PixState | null>(null);
  const [receipt, setReceipt] = useState<CheckoutReceipt | null>(null);

  useEffect(() => {
    if (!pix) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await api<{
          order: {
            status: string;
            hours?: number | null;
            amountReais?: number;
            amount_reais?: number;
          };
          customer: PortalCustomer;
          demo?: boolean;
          credited?: boolean;
        }>(`/api/portal/orders/${pix.orderId}`);
        if (cancelled) return;
        if (res.order.status === "demo_ok" || (res.demo && res.order.status !== "pending")) {
          setMsg("Pagamento de teste confirmado — saldo não alterado.");
          setReceipt(makeReceipt(pix.label, amountFromLabel(pix.label), res.order.hours, true));
          setPix(null);
          load().catch(() => undefined);
        } else if (res.order.status === "paid" && res.credited !== false) {
          setMe(res.customer);
          setMsg(`${pix.label} confirmado — crédito liberado.`);
          const amt =
            Number(res.order.amountReais ?? res.order.amount_reais) || amountFromLabel(pix.label);
          setReceipt(makeReceipt(pix.label, amt, res.order.hours, false));
          setPix(null);
          onPaid();
          load().catch(() => undefined);
        } else if (res.order.status === "failed") {
          setError("Pagamento não concluído. Tente de novo.");
          setPix(null);
        }
      } catch {
        /* ignore poll errors */
      }
    };
    poll();
    const id = window.setInterval(poll, 4000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [pix, load, setMe, setError, onPaid]);

  async function buyHours(input: { amountReais?: number; hours?: number }) {
    setBusy(true);
    setError("");
    setMsg("");
    try {
      const body =
        input.hours != null && input.hours > 0
          ? { hours: input.hours }
          : { amountReais: input.amountReais };
      const res = await api<{
        customer: PortalCustomer;
        creditedSeconds?: number;
        order?: { id?: string; hours?: number | null; amount_reais?: number };
        stub?: boolean;
        demo?: boolean;
        pix?: PixInfo | null;
        checkoutUrl?: string | null;
      }>("/api/portal/checkout/hours", {
        method: "POST",
        body: JSON.stringify(body),
      });
      if (res.pix && res.order?.id && !res.stub) {
        const labelAmt =
          input.amountReais != null
            ? `R$ ${input.amountReais.toFixed(2)}`
            : input.hours != null
              ? `${input.hours}h`
              : "horas";
        setPix({
          orderId: res.order.id,
          info: res.pix,
          label: `Compra de ${labelAmt}`,
          checkoutUrl: res.checkoutUrl,
          demo: res.demo,
        });
        setMsg(
          res.demo
            ? "Demonstração — pague no Pix ou abra o checkout Mercado Pago (sem crédito de horas)."
            : "Pague o Pix abaixo ou abra o checkout Mercado Pago — o crédito cai automaticamente.",
        );
      } else if (res.stub) {
        setMe(res.customer);
        const hours =
          res.order?.hours ?? Math.round(((res.creditedSeconds || 0) / 3600) * 100) / 100;
        setMsg(`Crédito de ${hours}h adicionado.`);
        setReceipt(
          makeReceipt(
            `Crédito ${hours}h`,
            Number(res.order?.amount_reais) ||
              input.amountReais ||
              hours * (res.customer.hourPrice || 0),
            hours,
            false,
          ),
        );
        onPaid();
        load().catch(() => undefined);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha na compra");
    } finally {
      setBusy(false);
    }
  }

  async function buySub(months: number) {
    setBusy(true);
    setError("");
    setMsg("");
    try {
      const res = await api<{
        customer: PortalCustomer;
        stub?: boolean;
        demo?: boolean;
        order?: { id?: string; amount_reais?: number };
        pix?: PixInfo | null;
        checkoutUrl?: string | null;
      }>("/api/portal/checkout/subscription", {
        method: "POST",
        body: JSON.stringify({ months }),
      });
      if (res.pix && res.order?.id && !res.stub) {
        setPix({
          orderId: res.order.id,
          info: res.pix,
          label: `Assinatura ${months} mês(es)`,
          checkoutUrl: res.checkoutUrl,
          demo: res.demo,
        });
        setMsg(
          res.demo
            ? "Demonstração — Pix ou checkout Mercado Pago (assinatura não ativa de verdade)."
            : "Pague o Pix ou abra o checkout — ativa após confirmação.",
        );
      } else if (res.stub) {
        setMe(res.customer);
        setMsg(`Assinatura ativada por ${months} mês(es).`);
        setReceipt(
          makeReceipt(`Assinatura ${months} mês(es)`, Number(res.order?.amount_reais) || 0, null, false),
        );
        onPaid();
        load().catch(() => undefined);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha na assinatura");
    } finally {
      setBusy(false);
    }
  }

  return { msg, busy, pix, setPix, buyHours, buySub, receipt, setReceipt };
}
