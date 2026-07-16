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

// Inert by default: withSentryConfig's build-time work (source map upload,
// server/edge instrumentation) needs an auth token to do anything useful,
// so it's only applied when one is configured. Without SENTRY_AUTH_TOKEN
// the exported config is exactly configWithServiceWorker, unmodified.
export default process.env.SENTRY_AUTH_TOKEN
  ? withSentryConfig(configWithServiceWorker, {
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      authToken: process.env.SENTRY_AUTH_TOKEN,
      silent: !process.env.CI,
    })
  : configWithServiceWorker;
