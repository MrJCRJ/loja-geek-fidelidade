/**
 * WhatsApp outbound opcional via Evolution API (ou compatível).
 * Sem WHATSAPP_API_URL = desligado (só links wa.me no portal).
 *
 * Evolution típico:
 *   POST {WHATSAPP_API_URL}/message/sendText/{instance}
 *   Header: apikey: WHATSAPP_API_KEY
 *   Body: { number: "5575...", text: "..." }
 */
import { config } from "./config.js";
import { logEvent } from "./telemetry.js";

export function whatsappApiEnabled() {
  return Boolean(config.whatsappApiUrl && config.whatsappApiKey);
}

function digitsOnly(phone: string) {
  return String(phone || "").replace(/\D/g, "");
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

export async function notifyWhatsAppPaid(input: {
  phone?: string | null;
  name: string;
  amountReais: number;
  hours?: number | null;
  demo?: boolean;
}) {
  if (!input.phone || input.demo) return { ok: false, skipped: "no_phone_or_demo" as const };
  const hoursPart = input.hours != null ? ` ≈ ${input.hours}h` : "";
  return sendWhatsAppText({
    phone: input.phone,
    kind: "whatsapp.paid",
    text: `geeks — pagamento confirmado: R$ ${input.amountReais.toFixed(2)}${hoursPart}. Saldo liberado no portal. Bom jogo!`,
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
