/**
 * Cliente WebSocket da estação GeekLock → GeekCentral.
 * Reconnect automático; envia station_status; recebe commands.
 */

export type StationCommand =
  | "lock_screen"
  | "unlock_screen"
  | "end_session"
  | "message"
  | "reload";

export type StationStatusPayload = {
  phase: string;
  customerName?: string | null;
  mode?: "locked" | "vip" | "admin" | "offline";
  elapsed?: number;
  present?: boolean;
  absentLeft?: number | null;
};

type Handlers = {
  onCommand?: (command: StationCommand, text?: string) => void;
  onOpen?: () => void;
  onClose?: () => void;
};

function toWsUrl(serverUrl: string, token: string): string {
  const u = new URL(serverUrl);
  const proto = u.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${u.host}/ws?role=station&token=${encodeURIComponent(token)}`;
}

export class StationSocket {
  private ws: WebSocket | null = null;
  private closed = false;
  private retryMs = 1500;
  private lastStatusKey = "";
  private lastStatusAt = 0;

  constructor(
    private serverUrl: string,
    private token: string,
    private handlers: Handlers = {},
  ) {}

  connect() {
    this.closed = false;
    this.open();
  }

  disconnect() {
    this.closed = true;
    try {
      this.ws?.close();
    } catch {
      /* ignore */
    }
    this.ws = null;
  }

  sendStatus(payload: StationStatusPayload) {
    const key = [
      payload.phase,
      payload.mode,
      payload.customerName || "",
      payload.present === false ? "0" : "1",
      Math.floor((payload.elapsed || 0) / 5),
    ].join("|");
    const now = Date.now();
    if (key === this.lastStatusKey && now - this.lastStatusAt < 1000) return;
    this.lastStatusKey = key;
    this.lastStatusAt = now;

    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(
      JSON.stringify({
        type: "station_status",
        ...payload,
        at: new Date().toISOString(),
      }),
    );
  }

  private open() {
    if (this.closed) return;
    try {
      this.ws?.close();
    } catch {
      /* ignore */
    }
    const url = toWsUrl(this.serverUrl, this.token);
    const ws = new WebSocket(url);
    this.ws = ws;

    ws.onopen = () => {
      this.retryMs = 1500;
      this.handlers.onOpen?.();
    };

    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(String(ev.data)) as {
          type?: string;
          command?: StationCommand;
          text?: string;
        };
        if (msg.type === "command" && msg.command) {
          this.handlers.onCommand?.(msg.command, msg.text);
        }
      } catch {
        /* ignore */
      }
    };

    ws.onclose = () => {
      this.handlers.onClose?.();
      if (this.closed) return;
      const wait = this.retryMs;
      this.retryMs = Math.min(this.retryMs * 1.5, 15000);
      window.setTimeout(() => this.open(), wait);
    };

    ws.onerror = () => {
      try {
        ws.close();
      } catch {
        /* ignore */
      }
    };
  }
}
