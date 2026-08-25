/// <reference types="vite/client" />

export type GeekLockConfig = {
  serverUrl: string;
  stationName: string;
  sharedSecret: string;
  staffPin: string;
  absentSecondsToLock: number;
  stationToken?: string;
  _configPath?: string | null;
};

export type Customer = {
  id: string;
  name: string;
  level: string;
  points: number;
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
};

declare global {
  interface Window {
    geeklock: {
      getConfig: () => Promise<GeekLockConfig>;
      saveToken: (token: string) => Promise<GeekLockConfig>;
      lock: () => Promise<{ locked: boolean }>;
      unlock: () => Promise<{ locked: boolean }>;
      quitWithPin: (pin: string) => Promise<{ ok: boolean; error?: string }>;
      staffUnlock: (pin: string) => Promise<{ ok: boolean; error?: string }>;
      onLockState: (cb: (data: { locked: boolean }) => void) => () => void;
      onRequestEndSession: (cb: () => void) => () => void;
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
      }) => void;
    };
  }
}

export {};
