import { getSetting, setSetting } from "./customers.js";

export type HourPack = { amountReais: number; label: string };

export const DEFAULT_HOUR_PACKS: HourPack[] = [
  { amountReais: 10, label: "R$ 10" },
  { amountReais: 20, label: "R$ 20" },
  { amountReais: 50, label: "R$ 50" },
];

function sanitizePacks(raw: unknown): HourPack[] {
  if (!Array.isArray(raw)) return DEFAULT_HOUR_PACKS;
  const packs: HourPack[] = [];
  for (const item of raw.slice(0, 12)) {
    if (!item || typeof item !== "object") continue;
    const amountReais = Number((item as { amountReais?: unknown }).amountReais);
    const label = String((item as { label?: unknown }).label || "").trim();
    if (!Number.isFinite(amountReais) || amountReais < 1 || amountReais > 5000) continue;
    packs.push({
      amountReais: Math.round(amountReais * 100) / 100,
      label: label || `R$ ${amountReais}`,
    });
  }
  return packs.length ? packs : DEFAULT_HOUR_PACKS;
}

export function getHourPacks(): HourPack[] {
  const raw = getSetting("portal_hour_packs", "");
  if (!raw) return DEFAULT_HOUR_PACKS;
  try {
    return sanitizePacks(JSON.parse(raw));
  } catch {
    return DEFAULT_HOUR_PACKS;
  }
}

export function setHourPacks(packs: HourPack[]) {
  const next = sanitizePacks(packs);
  setSetting("portal_hour_packs", JSON.stringify(next));
  return next;
}
