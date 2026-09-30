import type { AdminSettings } from "./types";

const DEFAULTS: AdminSettings = {
  faceMatchThreshold: 0.38,
  pointsPerReal: 1,
  hourPriceReais: 10,
  subscriberHourDiscountPct: 20,
  hourPacks: [
    { amountReais: 10, label: "R$ 10" },
    { amountReais: 20, label: "R$ 20" },
    { amountReais: 50, label: "R$ 50" },
  ],
  unitName: "Unidade 1",
  unitId: "unit-1",
  backupAutoEnabled: true,
  backupIntervalHours: 24,
  backupKeep: 20,
  recognitionEventsKeepDays: 90,
  publicApiUrl: "",
  peerCentrals: [],
  lowBalanceWarnSeconds: 300,
  staffUnlockMaxSeconds: 600,
  presenceMinFaceRatio: 0.12,
  energyTariffReaisPerKwh: 0.95,
  usageDetailedTitles: false,
  staffTimedMaxMinutes: 240,
  guestLabelRecents: [],
};

/** Normaliza resposta parcial da API / estado local. */
export function normalizeAdminSettings(s: Partial<AdminSettings> | null | undefined): AdminSettings {
  return {
    faceMatchThreshold: s?.faceMatchThreshold ?? DEFAULTS.faceMatchThreshold,
    pointsPerReal: s?.pointsPerReal ?? DEFAULTS.pointsPerReal,
    hourPriceReais: s?.hourPriceReais ?? DEFAULTS.hourPriceReais,
    subscriberHourDiscountPct: s?.subscriberHourDiscountPct ?? DEFAULTS.subscriberHourDiscountPct,
    hourPacks:
      Array.isArray(s?.hourPacks) && s.hourPacks.length > 0 ? s.hourPacks : DEFAULTS.hourPacks,
    unitName: s?.unitName || DEFAULTS.unitName,
    unitId: s?.unitId || DEFAULTS.unitId,
    backupAutoEnabled: s?.backupAutoEnabled !== false,
    backupIntervalHours: s?.backupIntervalHours ?? DEFAULTS.backupIntervalHours,
    backupKeep: s?.backupKeep ?? DEFAULTS.backupKeep,
    recognitionEventsKeepDays: s?.recognitionEventsKeepDays ?? DEFAULTS.recognitionEventsKeepDays,
    publicApiUrl: s?.publicApiUrl ?? DEFAULTS.publicApiUrl,
    peerCentrals: Array.isArray(s?.peerCentrals) ? s.peerCentrals : DEFAULTS.peerCentrals,
    lowBalanceWarnSeconds: s?.lowBalanceWarnSeconds ?? DEFAULTS.lowBalanceWarnSeconds,
    staffUnlockMaxSeconds: s?.staffUnlockMaxSeconds ?? DEFAULTS.staffUnlockMaxSeconds,
    presenceMinFaceRatio: s?.presenceMinFaceRatio ?? DEFAULTS.presenceMinFaceRatio,
    energyTariffReaisPerKwh: s?.energyTariffReaisPerKwh ?? DEFAULTS.energyTariffReaisPerKwh,
    usageDetailedTitles: Boolean(s?.usageDetailedTitles),
    staffTimedMaxMinutes: s?.staffTimedMaxMinutes ?? DEFAULTS.staffTimedMaxMinutes,
    guestLabelRecents: Array.isArray(s?.guestLabelRecents) ? s.guestLabelRecents : DEFAULTS.guestLabelRecents,
  };
}

export { DEFAULTS as defaultAdminSettings };
