import { api, type Customer } from "../api";

export type PayMethod = "" | "pix" | "card" | "cash";

type ConfirmOpts = {
  title: string;
  message: string;
  danger?: boolean;
  confirmLabel?: string;
};

export function saleDetail(name: string, input: { amountReais?: number; hours?: number }) {
  if (input.hours != null) {
    const minutes = String(Math.round((input.hours % 1) * 60)).padStart(2, "0");
    return `${Math.floor(input.hours)}h ${minutes}min para ${name}`;
  }
  return `R$ ${Number(input.amountReais).toFixed(2)} para ${name}`;
}

/** Confirma e credita hora na conta. Devolve null se a venda não foi feita. */
export async function sellCustomerTime(opts: {
  customer: Customer;
  payMethod: PayMethod;
  input: { amountReais?: number; hours?: number };
  askConfirm: (opts: ConfirmOpts) => Promise<boolean>;
  onError: (msg: string) => void;
  amountError: string;
}): Promise<{ customer?: Customer; creditedSeconds?: number } | null> {
  const { customer, payMethod, input, askConfirm, onError, amountError } = opts;
  if (!payMethod) {
    onError("Escolha Pix, cartão ou dinheiro");
    return null;
  }
  if (input.amountReais != null && (!input.amountReais || input.amountReais <= 0)) {
    onError(amountError);
    return null;
  }
  if (input.hours != null && input.hours < 5 / 60) {
    onError("Tempo mínimo: 5 minutos");
    return null;
  }
  const ok = await askConfirm({
    title: "Vender hora",
    message: `Creditar ${saleDetail(customer.name, input)}?`,
    confirmLabel: "Vender",
  });
  if (!ok) return null;
  return api<{ customer?: Customer; creditedSeconds?: number }>(`/api/customers/${customer.id}/time/sale`, {
    method: "POST",
    body: JSON.stringify({ ...input, paymentMethod: payMethod }),
  });
}
