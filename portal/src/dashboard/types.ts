export type PixInfo = {
  paymentId: string;
  qrCode?: string;
  qrCodeBase64?: string;
  ticketUrl?: string;
  status: string;
};

export type PixState = {
  orderId: string;
  info: PixInfo;
  label: string;
  checkoutUrl?: string | null;
  demo?: boolean;
};

export const WA_LAN = "https://wa.me/5575988603747";
export const LOW_BALANCE_SECONDS = 15 * 60;

export const DEFAULT_HOUR_PACKS = [
  { amountReais: 10, label: "R$ 10" },
  { amountReais: 20, label: "R$ 20" },
  { amountReais: 50, label: "R$ 50" },
];
