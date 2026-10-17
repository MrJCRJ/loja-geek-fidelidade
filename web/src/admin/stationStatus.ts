import { formatClock, formatDuration, type Station } from "../api";
import type { LiveStationStatus } from "./types";

export function remainSeconds(st: LiveStationStatus | undefined, nowMs: number) {
  if (!st || st.balanceSeconds == null || st.billingPaused) return st?.balanceSeconds ?? null;
  const base = Math.max(0, Math.floor(st.balanceSeconds));
  if (!st.at) return base;
  const at = Date.parse(st.at);
  if (!Number.isFinite(at)) return base;
  return Math.max(0, base - Math.max(0, Math.floor((nowMs - at) / 1000)));
}

export function formatDisplay(s: Station): string {
  if (s.display_width == null || s.display_height == null) return "—";
  const scale = s.display_scale_pct != null ? ` · ${Math.round(s.display_scale_pct)}%` : "";
  return `${s.display_width}×${s.display_height}${scale}`;
}

export function moneyBit(st: LiveStationStatus | undefined, hourPrice: number) {
  if (!st) return "";
  if (st.occupantKind === "staff_open") {
    const reais = ((st.elapsed ?? 0) / 3600) * hourPrice;
    return ` · gasto est. R$ ${reais.toFixed(2)}`;
  }
  if ((st.balanceSeconds ?? 0) > 0) {
    const reais = ((st.balanceSeconds ?? 0) / 3600) * hourPrice;
    return ` · R$ ${reais.toFixed(2)}`;
  }
  return "";
}

export function cardStatusLabel(st: LiveStationStatus | undefined, online: boolean, nowMs: number) {
  if (st?.occupantKind === "open_hour") {
    return `${st.customerName || "Cliente"} · aberto ${formatClock(st.elapsed ?? 0)} · cobrar R$ ${Number(st.openReais || 0).toFixed(2)}`;
  }
  if (st?.mode === "admin") {
    if (st.occupantKind === "staff_open" || st.balanceSeconds == null) {
      return `Aberto · ${st.customerName || "equipe"} · ${formatClock(st.elapsed ?? 0)}`;
    }
    return `Liberado · resta ${formatClock(st.balanceSeconds ?? st.elapsed ?? 0)}`;
  }
  if (st?.mode === "vip") {
    return `${st.customerName || "Cliente"} · ${formatClock(remainSeconds(st, nowMs) ?? 0)}`;
  }
  if (st?.phase === "locked" || st?.phase === "boot") return "Travado";
  return online ? "Livre" : "Offline";
}

export function tableStatusLabel(st: LiveStationStatus | undefined, online: boolean, nowMs: number) {
  if (st?.occupantKind === "open_hour") {
    return `${st.customerName || "Cliente"} · aberto ${formatClock(st.elapsed ?? 0)} · cobrar R$ ${Number(st.openReais || 0).toFixed(2)}`;
  }
  if (st?.mode === "admin") {
    if (st.occupantKind === "staff_open" || st.balanceSeconds == null) {
      return `Aberto · ${st.customerName || "equipe"} · ${formatClock(st.elapsed ?? 0)}`;
    }
    return `Admin · resta ${formatClock(st.balanceSeconds ?? st.elapsed ?? 0)}`;
  }
  if (st?.mode === "vip") {
    return `${st.customerName || "Cliente"} · ${formatClock(remainSeconds(st, nowMs) ?? 0)}`;
  }
  if (st?.phase === "locked" || st?.phase === "boot") return "Travada";
  if (st?.phase === "offline") return "Offline (app)";
  return online ? "Conectada" : "—";
}

export function healthBits(s: Station) {
  return [
    s.disk_free_pct != null ? `disco ${s.disk_free_pct}% livre` : null,
    s.ram_used_pct != null ? `RAM ${s.ram_used_pct}%` : null,
    s.uptime_sec != null ? `ligado ${formatDuration(s.uptime_sec)}` : null,
  ].filter(Boolean) as string[];
}
