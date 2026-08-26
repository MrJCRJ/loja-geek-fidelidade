/** Sentry opcional — só ativa com SENTRY_DSN no ambiente. */
let enabled = false;

export async function initSentry() {
  const dsn = (process.env.SENTRY_DSN || "").trim();
  if (!dsn) return;
  try {
    const Sentry = await import("@sentry/node");
    Sentry.init({
      dsn,
      environment: process.env.SENTRY_ENV || process.env.NODE_ENV || "development",
      tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE || 0.1),
    });
    enabled = true;
  } catch (err) {
    console.warn("[sentry] não inicializado:", err instanceof Error ? err.message : err);
  }
}

export function captureException(err: unknown) {
  if (!enabled) return;
  void import("@sentry/node")
    .then((Sentry) => Sentry.captureException(err))
    .catch(() => undefined);
}

export function isSentryEnabled() {
  return enabled;
}
