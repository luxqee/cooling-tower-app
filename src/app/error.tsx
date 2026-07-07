"use client";

import { isRedirectError } from "next/dist/client/components/redirect";
import { isNotFoundError } from "next/dist/client/components/not-found";
import { SignOutButton } from "@clerk/nextjs";

interface Props {
  error: Error;
}

export default function GlobalError({ error }: Props) {
  // Re-throw redirect/notFound errors so Next.js framework handles them.
  // Must use isRedirectError/isNotFoundError which check error.digest — in
  // production, error.message is sanitised to a generic string and cannot be
  // matched, but error.digest is preserved.
  if (isRedirectError(error) || isNotFoundError(error)) throw error;

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 px-4">
      <div className="text-center space-y-4">
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-50">
          Something went wrong
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Your session may have expired. Please sign in again.
        </p>
        {/* Sign out first so Clerk doesn't immediately redirect back to this
            page in a loop. SignOutButton clears the session then follows
            redirectUrl. */}
        <SignOutButton redirectUrl="/sign-in">
          <button className="inline-block px-5 py-2.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-semibold text-sm">
            Sign in again
          </button>
        </SignOutButton>
      </div>
    </div>
  );
}
