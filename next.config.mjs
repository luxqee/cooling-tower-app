import withSerwistInit from "@serwist/next";
import { withSentryConfig } from "@sentry/nextjs";

const withSerwist = withSerwistInit({
  swSrc: "src/app/sw.ts",
  swDest: "public/sw.js",
  // Exclude manifest.json from precaching — Workbox aborts SW installation if
  // any precached URL returns a non-2xx, and PWA manifests are not required to
  // be cached offline since the browser fetches them directly.
  exclude: [/manifest\.json$/],
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Content-Security-Policy is set by clerkMiddleware() in src/middleware.ts
  // (Clerk's own recommended approach — it knows its own Frontend API /
  // Turnstile domains). Vercel already sets Strict-Transport-Security at the
  // edge for this deployment, so it's not duplicated here.
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

const configWithServiceWorker = withSerwist(nextConfig);

// Sentry is actively configured (real DSN, see sentry.*.config.ts) so this
// wraps unconditionally now — withSentryConfig does more than upload source
// maps, it's also what makes the App Router's automatic instrumentation
// (instrumentation.ts's onRequestError) actually register correctly. Without
// SENTRY_AUTH_TOKEN, the source-map-upload step alone is skipped gracefully
// (Sentry's own documented behavior) — the rest still applies.
export default withSentryConfig(configWithServiceWorker, {
  org: "luke-herod",
  project: "javascript-nextjs",

  // Only print logs for uploading source maps in CI
  silent: !process.env.CI,

  // Upload a larger set of source maps for prettier stack traces (increases build time)
  widenClientFileUpload: true,

  webpack: {
    // Enables automatic instrumentation of Vercel Cron Monitors. (Does not yet work with App Router route handlers.)
    automaticVercelMonitors: true,
    // Tree-shaking options for reducing bundle size
    treeshake: {
      removeDebugLogging: true,
    },
  },
});
