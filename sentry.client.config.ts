import * as Sentry from "@sentry/nextjs";

// Inert by default — Sentry.init() is only called if NEXT_PUBLIC_SENTRY_DSN
// is set. No deployment target requires it; this is opt-in per environment.
if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    tracesSampleRate: 0.1,
  });
}
