/** Telemetria da estação → API (sem biometria / sem tokens em meta). */

type Level = "debug" | "info" | "warn" | "error";

type Payload = {
  level?: Level;
  kind: string;
  message: string;
  meta?: Record<string, unknown>;
};

const queue: Payload[] = [];
let flushing = false;

export function reportTelemetry(
  serverUrl: string,
  stationToken: string | undefined,
  payload: Payload,
) {
  if (!serverUrl || !stationToken) return;
  queue.push(payload);
  if (queue.length > 40) queue.splice(0, queue.length - 40);
  void flush(serverUrl, stationToken);
}

async function flush(serverUrl: string, token: string) {
  if (flushing || queue.length === 0) return;
  flushing = true;
  try {
    while (queue.length) {
      const item = queue.shift();
      if (!item) break;
      try {
        await fetch(`${serverUrl.replace(/\/$/, "")}/api/telemetry/events`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Station-Token": token,
          },
          body: JSON.stringify({
            level: item.level || "info",
            source: "geeklock",
            kind: item.kind,
            message: item.message,
            meta: item.meta,
          }),
        });
      } catch {
        queue.unshift(item);
        break;
      }
    }
  } finally {
    flushing = false;
  }
}
