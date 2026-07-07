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
};

export default withSerwist(nextConfig);
