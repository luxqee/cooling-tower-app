import * as Sentry from "@sentry/nextjs";

// Inert by default — see sentry.client.config.ts.
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    tracesSampleRate: 0.1,
  });
}
