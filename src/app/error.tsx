"use client";

import { SignOutButton } from "@clerk/nextjs";

interface Props {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function GlobalError({ error, reset }: Props) {
  // Re-throw redirect/notFound errors so Next.js framework handles them.
  // In production, error.message is sanitised to a generic string, but
  // error.digest is preserved. Redirect digests start with "NEXT_REDIRECT";
  // not-found digests are "NEXT_NOT_FOUND". Avoid internal Next.js imports
  // (next/dist/…) which may not be available in all build environments.
  const digest = error?.digest ?? "";
  if (digest.startsWith("NEXT_REDIRECT") || digest === "NEXT_NOT_FOUND") {
    throw error;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 px-4">
      <div className="text-center space-y-4">
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-50">
          Something went wrong
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          An unexpected error occurred. You can try again, or sign in again if that doesn&apos;t help.
        </p>
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={reset}
            className="inline-block px-5 py-2.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-semibold text-sm"
          >
            Try again
          </button>
          {/* Sign out first so Clerk doesn't immediately redirect back to this
              page in a loop. SignOutButton clears the session then follows
              redirectUrl. */}
          <SignOutButton redirectUrl="/sign-in">
            <button className="inline-block px-5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 font-semibold text-sm">
              Sign in again
            </button>
          </SignOutButton>
        </div>
      </div>
    </div>
  );
}
