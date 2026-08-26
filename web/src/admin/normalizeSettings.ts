import type { AdminSettings } from "./types";

const DEFAULTS: AdminSettings = {
  faceMatchThreshold: 0.38,
  pointsPerReal: 1,
  hourPriceReais: 10,
  subscriberHourDiscountPct: 20,
  unitName: "Unidade 1",
  unitId: "unit-1",
  backupAutoEnabled: true,
  backupIntervalHours: 24,
  backupKeep: 20,
  recognitionEventsKeepDays: 90,
};

/** Normaliza resposta parcial da API / estado local. */
export function normalizeAdminSettings(s: Partial<AdminSettings> | null | undefined): AdminSettings {
  return {
    faceMatchThreshold: s?.faceMatchThreshold ?? DEFAULTS.faceMatchThreshold,
    pointsPerReal: s?.pointsPerReal ?? DEFAULTS.pointsPerReal,
    hourPriceReais: s?.hourPriceReais ?? DEFAULTS.hourPriceReais,
    subscriberHourDiscountPct: s?.subscriberHourDiscountPct ?? DEFAULTS.subscriberHourDiscountPct,
    unitName: s?.unitName || DEFAULTS.unitName,
    unitId: s?.unitId || DEFAULTS.unitId,
    backupAutoEnabled: s?.backupAutoEnabled !== false,
    backupIntervalHours: s?.backupIntervalHours ?? DEFAULTS.backupIntervalHours,
    backupKeep: s?.backupKeep ?? DEFAULTS.backupKeep,
    recognitionEventsKeepDays: s?.recognitionEventsKeepDays ?? DEFAULTS.recognitionEventsKeepDays,
  };
}

export { DEFAULTS as defaultAdminSettings };
