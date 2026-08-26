import type {
  Customer,
  MachineSession,
  RecognitionEvent,
  Reward,
  SessionStats,
  Station,
} from "../api";

export type Tab =
  | "feed"
  | "clientes"
  | "caixa"
  | "estacoes"
  | "sessoes"
  | "recompensas"
  | "saude"
  | "config";

export type LiveStationStatus = {
  phase?: string;
  mode?: string;
  customerName?: string | null;
  elapsed?: number;
  present?: boolean;
  absentLeft?: number | null;
  at?: string;
};

export type LiveFeedItem = { text: string; at: string };

export type AdminSettings = {
  faceMatchThreshold: number;
  pointsPerReal: number;
  hourPriceReais: number;
  subscriberHourDiscountPct: number;
  unitName: string;
  unitId: string;
  backupAutoEnabled: boolean;
  backupIntervalHours: number;
  backupKeep: number;
  recognitionEventsKeepDays: number;
};

export type TimeLedgerRow = {
  id: string;
  delta_seconds: number;
  amount_reais: number;
  reason: string;
  created_at: string;
};

export type PointsLedgerRow = {
  id: string;
  delta: number;
  reason: string;
  created_at: string;
};

export type AdminData = {
  customers: Customer[];
  stations: Station[];
  connected: Array<{ stationId: string; stationName: string }>;
  liveStatus: Record<string, LiveStationStatus>;
  rewards: Reward[];
  events: RecognitionEvent[];
  sessions: MachineSession[];
  sessionStats: SessionStats | null;
  settings: AdminSettings;
  health: { ok: boolean; faceService: boolean; time?: string } | null;
};

export type ToastKind = "ok" | "error" | "info";
export type ToastItem = { id: number; kind: ToastKind; text: string };
