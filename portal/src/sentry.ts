import * as Sentry from "@sentry/react";

const dsn = (import.meta.env.VITE_SENTRY_DSN as string | undefined)?.trim();

export function initPortalSentry() {
  if (!dsn) return;
  Sentry.init({
    dsn,
    environment: (import.meta.env.VITE_SENTRY_ENV as string | undefined) || "production",
    tracesSampleRate: 0.15,
    integrations: [Sentry.browserTracingIntegration()],
  });
}
