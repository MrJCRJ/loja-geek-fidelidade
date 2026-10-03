/// <reference types="vite/client" />

export type GeekLockConfig = {
  serverUrl: string;
  stationName: string;
  sharedSecret: string;
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
      quitFromCentral: () => Promise<{ ok: boolean }>;
      getLastFailure: () => Promise<{ kind: string; message: string; at: string } | null>;
      clearLastFailure: () => Promise<{ ok: boolean }>;
      writeLastFailure: (payload: { kind?: string; message?: string }) => Promise<{ ok: boolean }>;
      onLockState: (cb: (data: { locked: boolean; paint?: boolean; prepare?: boolean }) => void) => () => void;
      onRequestEndSessionConfirmed: (cb: () => void) => () => void;
      onRequestLock: (cb: () => void) => () => void;
      getAppVersion: () => Promise<string>;
      applyLockUpdate: () => Promise<{ ok: boolean; error?: string; willRelaunch?: boolean; already?: boolean }>;
      collectHardware?: () => Promise<{
        cpuName?: string | null;
        cpuCores?: number | null;
        cpuTdpW?: number | null;
        gpus?: Array<{ vendor: string; model: string; vramMb?: number | null }>;
        ramTotalMb?: number | null;
        osBuild?: string | null;
        diskFreePct?: number | null;
        diskTotalGb?: number | null;
        uptimeSec?: number | null;
        ramUsedPct?: number | null;
      }>;
      collectHealth?: () => Promise<{
        diskFreePct?: number | null;
        diskTotalGb?: number | null;
        uptimeSec?: number | null;
        ramUsedPct?: number | null;
      }>;
      collectLoadSample?: (opts?: { primaryGpuVendor?: string }) => Promise<{
        appProcess?: string | null;
        appTitle?: string | null;
        cpuPct?: number | null;
        gpuPct?: number | null;
        ramPct?: number | null;
        watts?: number | null;
        wattsSource?: "sensor" | "estimate" | null;
      }>;
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
