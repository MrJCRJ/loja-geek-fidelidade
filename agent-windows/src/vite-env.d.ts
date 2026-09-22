/// <reference types="vite/client" />

export type GeekLockConfig = {
  serverUrl: string;
  stationName: string;
  sharedSecret: string;
  staffPin: string;
  absentSecondsToLock: number;
  stationToken?: string;
  setupComplete?: boolean;
  openAtLogin?: boolean;
  _configPath?: string | null;
};

export type DiscoveryPeer = {
  lanIp: string;
  apiPort: number;
  unitName?: string;
  serverUrl: string;
  seenAt: number;
};

export type Customer = {
  id: string;
  name: string;
  level: string;
  points: number;
  timeBalanceSeconds?: number;
};

export type Session = {
  id: string;
  customer_id: string;
  station_id: string;
  started_at: string;
  ended_at?: string | null;
  last_seen_at: string;
  seconds_total: number;
  status: string;
  customer_name?: string;
  station_name?: string;
  time_balance_seconds?: number;
};

declare global {
  interface Window {
    geeklock: {
      getConfig: () => Promise<GeekLockConfig>;
      saveToken: (token: string) => Promise<GeekLockConfig>;
      saveConfig: (partial: Partial<GeekLockConfig>) => Promise<GeekLockConfig>;
      startDiscovery: () => Promise<{ ok: boolean; peers: DiscoveryPeer[] }>;
      getDiscoveryPeers: () => Promise<DiscoveryPeer[]>;
      stopDiscovery: () => Promise<{ ok: boolean }>;
      lock: () => Promise<{ locked: boolean }>;
      unlock: () => Promise<{ locked: boolean }>;
      quitWithPin: (pin: string) => Promise<{ ok: boolean; error?: string }>;
      staffUnlock: (pin: string) => Promise<{ ok: boolean; error?: string }>;
      getLastFailure: () => Promise<{ kind: string; message: string; at: string } | null>;
      clearLastFailure: () => Promise<{ ok: boolean }>;
      writeLastFailure: (payload: { kind?: string; message?: string }) => Promise<{ ok: boolean }>;
      onLockState: (cb: (data: { locked: boolean; paint?: boolean; prepare?: boolean }) => void) => () => void;
      onRequestEndSessionConfirmed: (cb: () => void) => () => void;
      onRequestQuit: (cb: () => void) => () => void;
      onRequestStaffPin: (cb: () => void) => () => void;
      onRequestLock: (cb: () => void) => () => void;
      updateTray: (payload: {
        phase: string;
        name?: string;
        mode?: string;
        elapsed?: number;
        present?: boolean;
        absentLeft?: number | null;
        balanceSeconds?: number | null;
        lowBalanceWarn?: boolean;
        billingPaused?: boolean;
      }) => void;
    };
  }
}

export {};
