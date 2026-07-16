import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isPublicRoute = createRouteMatcher([
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/api/webhooks(.*)",
  "/portal(.*)", // customer portal — auth is the token in the URL, not a Clerk session
  "/api/voice-notes/webhook", // AssemblyAI callback — verified via x-webhook-secret header, not Clerk
]);

export default clerkMiddleware(
  async (auth, request) => {
    if (!isPublicRoute(request)) {
      await auth.protect();
    }
  },
  {
    // Clerk's own guide (clerk.com/docs/security/clerk-csp) recommends this
    // built-in option over hand-writing the CSP header — it already knows its
    // own Frontend API / Cloudflare Turnstile domains. We only extend it with
    // this app's own third-party origins (Vercel Blob for photos/logos/voice
    // notes). Non-strict mode (no nonce) so it doesn't force ClerkProvider
    // into fully dynamic rendering app-wide.
    contentSecurityPolicy: {
      directives: {
        "img-src": ["*.public.blob.vercel-storage.com"],
        "media-src": ["*.public.blob.vercel-storage.com"],
        "connect-src": ["*.public.blob.vercel-storage.com"],
      },
    },
  }
);

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
