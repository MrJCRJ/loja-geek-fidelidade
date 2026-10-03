import { config } from "./config.js";
import { getDb } from "./db.js";
import { createWebOrder, publicCustomerProfile } from "./customer-auth.js";
import { effectiveHourPrice, sellTime, setSubscription } from "./billing.js";

export type WebOrderRow = {
  id: string;
  customer_id: string;
  kind: string;
  amount_reais: number;
  hours: number | null;
  months: number | null;
  status: string;
  provider: string;
  provider_ref: string | null;
  created_at: string;
  paid_at: string | null;
};

export function mercadopagoEnabled() {
  return Boolean(config.mpAccessToken);
}

export function isDemoCheckout() {
  return config.portalCheckoutMode === "demo";
}

function shouldCreditOrder(order: WebOrderRow) {
  if (order.provider === "mercadopago_demo") return false;
  if (config.portalCheckoutMode === "demo") return false;
  return true;
}

export function listWebOrders(customerId: string, limit = 30): WebOrderRow[] {
  return getDb()
    .prepare(
      `SELECT * FROM web_orders WHERE customer_id = ? ORDER BY created_at DESC LIMIT ?`,
    )
    .all(customerId, limit) as WebOrderRow[];
}

export function getWebOrder(orderId: string): WebOrderRow | undefined {
  return getDb().prepare("SELECT * FROM web_orders WHERE id = ?").get(orderId) as
    | WebOrderRow
    | undefined;
}

export function getWebOrderByProviderRef(ref: string): WebOrderRow | undefined {
  return getDb()
    .prepare("SELECT * FROM web_orders WHERE provider_ref = ?")
    .get(ref) as WebOrderRow | undefined;
}

function markOrderPaid(orderId: string) {
  const now = new Date().toISOString();
  getDb()
    .prepare(`UPDATE web_orders SET status = 'paid', paid_at = ? WHERE id = ? AND status != 'paid'`)
    .run(now, orderId);
  return getWebOrder(orderId);
}

function markOrderDemoOk(orderId: string) {
  const now = new Date().toISOString();
  getDb()
    .prepare(
      `UPDATE web_orders SET status = 'demo_ok', paid_at = ? WHERE id = ? AND status NOT IN ('paid', 'demo_ok')`,
    )
    .run(now, orderId);
  return getWebOrder(orderId);
}

function markOrderFailed(orderId: string) {
  getDb().prepare(`UPDATE web_orders SET status = 'failed' WHERE id = ? AND status = 'pending'`).run(orderId);
  return getWebOrder(orderId);
}

function resolveApprovedOrder(orderId: string) {
  const order = getWebOrder(orderId);
  if (!order) throw new Error("Pedido não encontrado");
  if (order.status === "paid" || order.status === "demo_ok") {
    return {
      order,
      customer: publicCustomerProfile(order.customer_id),
      alreadyPaid: true,
      demo: order.status === "demo_ok",
      credited: order.status === "paid",
    };
  }
  if (order.status === "failed") throw new Error("Pedido falhou");

  if (!shouldCreditOrder(order)) {
    const demoOrder = markOrderDemoOk(orderId)!;
    return {
      order: demoOrder,
      customer: publicCustomerProfile(order.customer_id),
      alreadyPaid: false,
      demo: true,
      credited: false,
    };
  }

  if (order.kind === "hours") {
    const hours = Number(order.hours);
    if (hours > 0) {
      sellTime({ customerId: order.customer_id, hours });
    } else {
      sellTime({ customerId: order.customer_id, amountReais: order.amount_reais });
    }
  } else if (order.kind === "subscription") {
    const months = Math.max(1, Number(order.months) || 1);
    setSubscription({
      customerId: order.customer_id,
      status: "active",
      months,
      priceReais: order.amount_reais / months,
      notes: "Assinatura portal (Mercado Pago)",
    });
  }

  const paid = markOrderPaid(orderId)!;
  const customer = publicCustomerProfile(order.customer_id);
  void import("./whatsapp.js")
    .then((wa) =>
      wa.notifyPaidAndMaybeAskReview({
        customerId: order.customer_id,
        amountReais: Number(paid.amount_reais) || 0,
        hours: paid.hours != null ? Number(paid.hours) : null,
        demo: false,
      }),
    )
    .catch(() => undefined);
  return {
    order: paid,
    customer,
    alreadyPaid: false,
    demo: false,
    credited: true,
  };
}

/** Credita o pedido pending (horas ou assinatura). Idempotente se já paid/demo_ok. */
export function fulfillWebOrder(orderId: string) {
  return resolveApprovedOrder(orderId);
}

type MpPixResult = {
  paymentId: string;
  qrCode?: string;
  qrCodeBase64?: string;
  ticketUrl?: string;
  status: string;
};

type MpPreferenceResult = {
  preferenceId: string;
  checkoutUrl: string;
};

function mpHeaders(idempotencyKey?: string) {
  const token = config.mpAccessToken;
  if (!token) throw new Error("MP_ACCESS_TOKEN não configurado");
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
  if (idempotencyKey) headers["X-Idempotency-Key"] = idempotencyKey;
  return headers;
}

function checkoutReturnUrl(orderId: string, status: "success" | "pending" | "failure") {
  const base = config.portalPublicUrl;
  const q = new URLSearchParams({ status, orderId });
  return `${base}/checkout/return?${q.toString()}`;
}

async function createMpPixPayment(input: {
  amount: number;
  description: string;
  externalReference: string;
  payerEmail: string;
}): Promise<MpPixResult> {
  const res = await fetch("https://api.mercadopago.com/v1/payments", {
    method: "POST",
    headers: mpHeaders(`${input.externalReference}-pix`),
    body: JSON.stringify({
      transaction_amount: Math.round(input.amount * 100) / 100,
      description: input.description,
      payment_method_id: "pix",
      external_reference: input.externalReference,
      payer: { email: input.payerEmail },
    }),
  });

  const data = (await res.json()) as {
    id?: number | string;
    status?: string;
    message?: string;
    point_of_interaction?: {
      transaction_data?: {
        qr_code?: string;
        qr_code_base64?: string;
        ticket_url?: string;
      };
    };
  };

  if (!res.ok || data.id == null) {
    throw new Error(data.message || `Mercado Pago erro HTTP ${res.status}`);
  }

  const tx = data.point_of_interaction?.transaction_data;
  return {
    paymentId: String(data.id),
    qrCode: tx?.qr_code,
    qrCodeBase64: tx?.qr_code_base64,
    ticketUrl: tx?.ticket_url,
    status: data.status || "pending",
  };
}

async function createMpCheckoutPreference(input: {
  amount: number;
  title: string;
  externalReference: string;
  payerEmail: string;
}): Promise<MpPreferenceResult> {
  const orderId = input.externalReference;
  const res = await fetch("https://api.mercadopago.com/checkout/preferences", {
    method: "POST",
    headers: mpHeaders(`${orderId}-pref`),
    body: JSON.stringify({
      items: [
        {
          title: input.title,
          quantity: 1,
          unit_price: Math.round(input.amount * 100) / 100,
          currency_id: "BRL",
        },
      ],
      payer: { email: input.payerEmail },
      external_reference: orderId,
      back_urls: {
        success: checkoutReturnUrl(orderId, "success"),
        pending: checkoutReturnUrl(orderId, "pending"),
        failure: checkoutReturnUrl(orderId, "failure"),
      },
      auto_return: "approved",
    }),
  });

  const data = (await res.json()) as {
    id?: string;
    init_point?: string;
    sandbox_init_point?: string;
    message?: string;
  };

  if (!res.ok || !data.id) {
    throw new Error(data.message || `Mercado Pago preference erro HTTP ${res.status}`);
  }

  const token = config.mpAccessToken;
  const isTest = token.startsWith("TEST-");
  const checkoutUrl = (isTest ? data.sandbox_init_point : data.init_point) || data.init_point || data.sandbox_init_point;
  if (!checkoutUrl) throw new Error("Mercado Pago não retornou URL de checkout");

  return { preferenceId: data.id, checkoutUrl };
}

function mpPayerEmail(raw: string, customerId: string): string {
  const email = (raw || "").trim().toLowerCase();
  // MP sandbox /v1/payments: rejeita @testuser.com (4390) e TLDs inválidos (.local)
  const invalid =
    !email ||
    email.endsWith("@testuser.com") ||
    email.endsWith(".local") ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  if (invalid) {
    return `cliente+${customerId.slice(0, 12)}@example.com`;
  }
  return email;
}

async function checkoutWithMercadoPago(input: {
  customerId: string;
  kind: "hours" | "subscription";
  amountReais: number;
  hours?: number | null;
  months?: number | null;
  description: string;
  title: string;
  payerEmail: string;
}) {
  if (!mercadopagoEnabled()) {
    throw new Error("Modo demonstração exige MP_ACCESS_TOKEN (TEST-...) na loja");
  }

  const demo = isDemoCheckout();
  const order = createWebOrder({
    customerId: input.customerId,
    kind: input.kind,
    amountReais: input.amountReais,
    hours: input.hours ?? null,
    months: input.months ?? null,
    status: "pending",
    provider: demo ? "mercadopago_demo" : "mercadopago",
    providerRef: null,
  }) as WebOrderRow;

  const payerEmail = mpPayerEmail(input.payerEmail, input.customerId);

  const [pix, preference] = await Promise.all([
    createMpPixPayment({
      amount: input.amountReais,
      description: input.description,
      externalReference: order.id,
      payerEmail,
    }),
    createMpCheckoutPreference({
      amount: input.amountReais,
      title: input.title,
      externalReference: order.id,
      payerEmail,
    }),
  ]);

  getDb()
    .prepare(`UPDATE web_orders SET provider_ref = ? WHERE id = ?`)
    .run(pix.paymentId, order.id);

  return {
    stub: false as const,
    demo,
    order: getWebOrder(order.id),
    customer: publicCustomerProfile(input.customerId),
    pix,
    checkoutUrl: preference.checkoutUrl,
    preferenceId: preference.preferenceId,
    creditedSeconds: 0,
    amountReais: input.amountReais,
  };
}

export async function checkoutHours(
  customerId: string,
  input: { hours?: number; amountReais?: number },
  payerEmail: string,
) {
  const hourPrice = effectiveHourPrice(customerId);
  let amountReais = 0;
  let hours = 0;
  if (input.hours != null && input.hours > 0) {
    hours = input.hours;
    amountReais = Math.round(hours * hourPrice * 100) / 100;
  } else if (input.amountReais != null && input.amountReais > 0) {
    amountReais = input.amountReais;
    hours = Math.round((amountReais / hourPrice) * 100) / 100;
  } else {
    throw new Error("Informe hours ou amountReais");
  }

  const mode = config.portalCheckoutMode;
  if (mode === "demo") {
    const result = await checkoutWithMercadoPago({
      customerId,
      kind: "hours",
      amountReais,
      hours,
      description: `geeks — ${hours}h de PC`,
      title: `geeks — ${hours}h de PC`,
      payerEmail,
    });
    return { ...result, hourPrice };
  }

  if (!mercadopagoEnabled()) {
    const { checkoutHoursStub } = await import("./customer-auth.js");
    const result = checkoutHoursStub(customerId, input);
    return { ...result, stub: true as const, pix: null, demo: false, checkoutUrl: null };
  }

  const result = await checkoutWithMercadoPago({
    customerId,
    kind: "hours",
    amountReais,
    hours,
    description: `geeks — ${hours}h de PC`,
    title: `geeks — ${hours}h de PC`,
    payerEmail,
  });
  return { ...result, hourPrice, demo: false };
}

export async function checkoutSubscription(
  customerId: string,
  input: { months?: number; priceReais?: number },
  payerEmail: string,
) {
  const months = Math.max(1, Math.min(36, input.months ?? 1));
  const price = input.priceReais ?? config.subscriptionMonthlyPrice;
  const amountReais = Math.round(price * months * 100) / 100;

  const mode = config.portalCheckoutMode;
  if (mode === "demo") {
    return checkoutWithMercadoPago({
      customerId,
      kind: "subscription",
      amountReais,
      months,
      description: `geeks — assinatura ${months} mês(es)`,
      title: `geeks — assinatura ${months} mês(es)`,
      payerEmail,
    });
  }

  if (!mercadopagoEnabled()) {
    const { checkoutSubscriptionStub } = await import("./customer-auth.js");
    const result = checkoutSubscriptionStub(customerId, { months, priceReais: price });
    return { ...result, stub: true as const, pix: null, demo: false, checkoutUrl: null };
  }

  return checkoutWithMercadoPago({
    customerId,
    kind: "subscription",
    amountReais,
    months,
    description: `geeks — assinatura ${months} mês(es)`,
    title: `geeks — assinatura ${months} mês(es)`,
    payerEmail,
  });
}

export async function handleMercadoPagoWebhook(body: unknown) {
  const payload = body as {
    type?: string;
    action?: string;
    data?: { id?: string | number };
  };
  const paymentId = payload?.data?.id != null ? String(payload.data.id) : null;
  if (!paymentId) {
    return { ok: true, ignored: true, reason: "sem payment id" };
  }

  const token = config.mpAccessToken;
  if (!token) {
    return { ok: false, error: "MP_ACCESS_TOKEN ausente" };
  }

  const res = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const payment = (await res.json()) as {
    id?: number;
    status?: string;
    external_reference?: string;
  };
  if (!res.ok) throw new Error(`Falha ao consultar pagamento ${paymentId}`);

  const orderId = payment.external_reference;
  if (!orderId) return { ok: true, ignored: true, reason: "sem external_reference" };

  const order = getWebOrder(orderId);
  if (!order) return { ok: true, ignored: true, reason: "pedido desconhecido" };

  if (payment.status === "approved") {
    const result = resolveApprovedOrder(orderId);
    return {
      ok: true,
      fulfilled: true,
      orderId,
      alreadyPaid: result.alreadyPaid,
      demo: result.demo,
      credited: result.credited,
    };
  }
  if (payment.status === "cancelled" || payment.status === "rejected") {
    markOrderFailed(orderId);
    return { ok: true, failed: true, orderId, status: payment.status };
  }
  return { ok: true, pending: true, status: payment.status };
}

export async function syncOrderPaymentStatus(orderId: string) {
  const order = getWebOrder(orderId);
  if (!order) throw new Error("Pedido não encontrado");
  if (order.status === "paid" || order.status === "demo_ok") {
    return {
      order,
      customer: publicCustomerProfile(order.customer_id),
      demo: order.status === "demo_ok",
      credited: order.status === "paid",
    };
  }
  if (order.provider !== "mercadopago" && order.provider !== "mercadopago_demo") {
    return { order, customer: publicCustomerProfile(order.customer_id), demo: false, credited: false };
  }
  if (!order.provider_ref || !mercadopagoEnabled()) {
    return { order, customer: publicCustomerProfile(order.customer_id), demo: isDemoCheckout(), credited: false };
  }

  const token = config.mpAccessToken!;
  const res = await fetch(`https://api.mercadopago.com/v1/payments/${order.provider_ref}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const payment = (await res.json()) as { status?: string };
  if (payment.status === "approved") {
    const result = resolveApprovedOrder(orderId);
    return {
      order: result.order,
      customer: result.customer,
      demo: result.demo,
      credited: result.credited,
    };
  }
  if (payment.status === "cancelled" || payment.status === "rejected") {
    markOrderFailed(orderId);
  }
  return {
    order: getWebOrder(orderId)!,
    customer: publicCustomerProfile(order.customer_id),
    demo: isDemoCheckout(),
    credited: false,
  };
}
