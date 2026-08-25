export type CentralStatus = {
  phase: string;
  api: boolean;
  face: boolean;
  lanIp: string;
  apiPort: number;
  facePort: number;
  adminPassword: string;
  needsSetup?: boolean;
  setupComplete?: boolean;
  unitName?: string;
  openAtLogin?: boolean;
  bootDelayMs?: number;
  firewallOk?: boolean;
  firewallError?: string;
  startedAt?: number | null;
  uptimeMs?: number;
  faceError?: string;
  lastFaceCheck?: string;
  error: string;
  logs: string[];
};

export type SetupPeek = CentralStatus & {
  suggestedJwt?: string;
  suggestedStation?: string;
  firewallRuleDone?: boolean;
};

export type GeekCentralApi = {
  getStatus: () => Promise<CentralStatus>;
  peekSetup: () => Promise<SetupPeek>;
  completeSetup: (input: {
    adminPassword: string;
    jwtSecret?: string;
    stationSharedSecret?: string;
    unitName?: string;
  }) => Promise<{ ok: boolean; error?: string; status?: CentralStatus }>;
  restart: () => Promise<{ ok: boolean; error?: string; status?: CentralStatus }>;
  openAdmin: () => Promise<{ ok: boolean; url: string }>;
  openUrl: (url: string) => Promise<{ ok: boolean }>;
  getAutostart: () => Promise<{ openAtLogin: boolean; bootDelayMs: number }>;
  setAutostart: (enabled: boolean) => Promise<{ ok: boolean; openAtLogin: boolean; bootDelayMs: number }>;
  ensureFirewall: () => Promise<{ ok: boolean; error?: string }>;
  onStatus: (cb: (s: CentralStatus) => void) => () => void;
};

declare global {
  interface Window {
    geekcentral: GeekCentralApi;
  }
}

export {};
