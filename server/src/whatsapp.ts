/**
 * WhatsApp outbound opcional via Evolution API (ou compatível).
 * Sem WHATSAPP_API_URL = desligado (só links wa.me no portal / Central).
 *
 * Evolution típico:
 *   POST {WHATSAPP_API_URL}/message/sendText/{instance}
 *   Header: apikey: WHATSAPP_API_KEY
 *   Body: { number: "5575...", text: "..." }
 */
import { config } from "./config.js";
import { GOOGLE_REVIEW_ASK_TEXT, GOOGLE_REVIEW_LOJA_URL } from "./google-review.js";
import {
  canAutoAskGoogleReview,
  canManualAskGoogleReview,
  getCustomer,
  markGoogleReviewAsked,
  type CustomerRow,
} from "./customers.js";
import { logEvent } from "./telemetry.js";

export function whatsappApiEnabled() {
  return Boolean(config.whatsappApiUrl && config.whatsappApiKey);
}

function digitsOnly(phone: string) {
  return String(phone || "").replace(/\D/g, "");
}

export function waMeUrl(phone: string, text: string) {
  const number = digitsOnly(phone);
  if (number.length < 10) return null;
  return `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
}

export async function sendWhatsAppText(input: {
  phone: string;
  text: string;
  kind?: string;
}): Promise<{ ok: boolean; skipped?: string; error?: string }> {
  if (!whatsappApiEnabled()) return { ok: false, skipped: "whatsapp_disabled" };
  const number = digitsOnly(input.phone);
  if (number.length < 10) return { ok: false, skipped: "bad_phone" };

  const url = `${config.whatsappApiUrl.replace(/\/$/, "")}/message/sendText/${encodeURIComponent(
    config.whatsappInstance,
  )}`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        apikey: config.whatsappApiKey,
      },
      body: JSON.stringify({ number, text: input.text }),
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      logEvent({
        level: "warn",
        source: "whatsapp",
        kind: input.kind || "whatsapp.send_fail",
        message: `WhatsApp HTTP ${res.status}`,
        meta: { status: res.status, body: body.slice(0, 200) },
      });
      return { ok: false, error: `http_${res.status}` };
    }
    logEvent({
      level: "info",
      source: "whatsapp",
      kind: input.kind || "whatsapp.sent",
      message: `WhatsApp enviado (${number.slice(-4)})`,
    });
    return { ok: true };
  } catch (err) {
    logEvent({
      level: "warn",
      source: "whatsapp",
      kind: "whatsapp.error",
      message: err instanceof Error ? err.message : "Falha WhatsApp",
    });
    return { ok: false, error: err instanceof Error ? err.message : "error" };
  }
}

function paidBaseText(input: {
  amountReais: number;
  hours?: number | null;
}) {
  const hoursPart = input.hours != null ? ` ≈ ${input.hours}h` : "";
  return `geeks — pagamento confirmado: R$ ${input.amountReais.toFixed(2)}${hoursPart}. Saldo liberado no portal. Bom jogo!`;
}

export async function notifyWhatsAppPaid(input: {
  phone?: string | null;
  name: string;
  amountReais: number;
  hours?: number | null;
  demo?: boolean;
  includeReviewAsk?: boolean;
}) {
  if (!input.phone || input.demo) return { ok: false, skipped: "no_phone_or_demo" as const };
  let text = paidBaseText(input);
  if (input.includeReviewAsk) {
    text = `${text}\n\n${GOOGLE_REVIEW_ASK_TEXT}`;
  }
  return sendWhatsAppText({
    phone: input.phone,
    kind: input.includeReviewAsk ? "whatsapp.paid_review" : "whatsapp.paid",
    text,
  });
}

export async function notifyWhatsAppLowBalance(input: {
  phone?: string | null;
  name: string;
  minutesLeft: number;
}) {
  if (!input.phone) return { ok: false, skipped: "no_phone" as const };
  return sendWhatsAppText({
    phone: input.phone,
    kind: "whatsapp.low_balance",
    text: `geeks — oi ${input.name.split(" ")[0]}! Restam ~${input.minutesLeft} min de PC. Recarregue no site ou no balcão.`,
  });
}

export type ReviewAskResult = {
  attempted: boolean;
  sent: boolean;
  skipped?: string;
  waMeUrl: string | null;
  reviewUrl: string;
};

/** Pedido automático pós-venda/Pix (respeita cooldown + opt-out). Inclui CTA na msg de pagamento se pedirem juntos. */
export async function notifyPaidAndMaybeAskReview(input: {
  customerId: string;
  amountReais: number;
  hours?: number | null;
  demo?: boolean;
}): Promise<ReviewAskResult> {
  const customer = getCustomer(input.customerId) as CustomerRow | undefined;
  const includeReview = !input.demo && canAutoAskGoogleReview(customer);
  const phone = customer?.phone || null;
  const base = paidBaseText(input);
  const fullText = includeReview ? `${base}\n\n${GOOGLE_REVIEW_ASK_TEXT}` : base;
  const link = phone ? waMeUrl(phone, fullText) : null;

  if (!phone || input.demo) {
    return {
      attempted: false,
      sent: false,
      skipped: "no_phone_or_demo",
      waMeUrl: link,
      reviewUrl: GOOGLE_REVIEW_LOJA_URL,
    };
  }

  const sent = await sendWhatsAppText({
    phone,
    kind: includeReview ? "whatsapp.paid_review" : "whatsapp.paid",
    text: fullText,
  });

  if (includeReview && (sent.ok || sent.skipped === "whatsapp_disabled")) {
    // Marca pedido mesmo se só gerou wa.me (Evolution off) — evita spam no próximo auto.
    // Só marca se Evolution enviou OU se vamos devolver waMe para o balcão abrir.
    if (sent.ok) markGoogleReviewAsked(input.customerId);
  }

  return {
    attempted: includeReview,
    sent: Boolean(sent.ok),
    skipped: sent.skipped || sent.error,
    waMeUrl: link,
    reviewUrl: GOOGLE_REVIEW_LOJA_URL,
  };
}

/** Só o pedido de avaliação (botão Central). force=true ignora cooldown. */
export async function askGoogleReviewWhatsApp(input: {
  customerId: string;
  force?: boolean;
}): Promise<ReviewAskResult> {
  const customer = getCustomer(input.customerId) as CustomerRow | undefined;
  const phone = customer?.phone || null;
  const eligible = input.force
    ? canManualAskGoogleReview(customer)
    : canAutoAskGoogleReview(customer);
  const text = `geeks — oi${customer?.name ? ` ${String(customer.name).split(" ")[0]}` : ""}!\n\n${GOOGLE_REVIEW_ASK_TEXT}`;
  const link = phone ? waMeUrl(phone, text) : null;

  if (!eligible) {
    return {
      attempted: false,
      sent: false,
      skipped: isOptOrCooldown(customer, input.force),
      waMeUrl: link,
      reviewUrl: GOOGLE_REVIEW_LOJA_URL,
    };
  }

  const sent = await sendWhatsAppText({
    phone: phone!,
    kind: "whatsapp.review_ask",
    text,
  });

  // Evolution ok, ou só wa.me (API off): conta como pedido para o cooldown.
  if (sent.ok || sent.skipped === "whatsapp_disabled") {
    markGoogleReviewAsked(input.customerId);
  }

  return {
    attempted: true,
    sent: Boolean(sent.ok),
    skipped: sent.skipped || sent.error,
    waMeUrl: link,
    reviewUrl: GOOGLE_REVIEW_LOJA_URL,
  };
}

function isOptOrCooldown(customer: CustomerRow | null | undefined, force?: boolean) {
  if (!customer?.phone) return "no_phone";
  if (Number(customer.review_ask_opt_out) === 1) return "opt_out";
  if (!force && !canAutoAskGoogleReview(customer)) return "cooldown";
  return "blocked";
}

/** Pós venda balcão: tenta Evolution; sempre devolve waMe se elegível. */
export async function afterDeskSaleMaybeAskReview(customerId: string, amountReais: number, hours?: number | null) {
  return notifyPaidAndMaybeAskReview({ customerId, amountReais, hours: hours ?? null, demo: false });
}
