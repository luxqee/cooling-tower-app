import withSerwistInit from "@serwist/next";

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

export default withSerwist(nextConfig);
