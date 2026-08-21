export type CentralStatus = {
  phase: string;
  api: boolean;
  face: boolean;
  lanIp: string;
  apiPort: number;
  facePort: number;
  adminPassword: string;
  error: string;
  logs: string[];
};

export type GeekCentralApi = {
  getStatus: () => Promise<CentralStatus>;
  restart: () => Promise<{ ok: boolean; error?: string; status?: CentralStatus }>;
  openAdmin: () => Promise<{ ok: boolean; url: string }>;
  openUrl: (url: string) => Promise<{ ok: boolean }>;
  onStatus: (cb: (s: CentralStatus) => void) => () => void;
};

declare global {
  interface Window {
    geekcentral: GeekCentralApi;
  }
}

export {};
