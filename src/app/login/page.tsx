import Link from "next/link";

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-950 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-amber-500 text-slate-950 font-mono font-bold">
            CT
          </div>
          <div>
            <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Field Ops
            </div>
            <div className="text-2xs font-mono uppercase tracking-wider text-slate-500">
              Cooling Tower Sales and Service
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
          <h1 className="mb-1 text-lg font-semibold text-slate-900 dark:text-slate-50">
            Sign in
          </h1>
          <p className="mb-6 text-sm text-slate-600 dark:text-slate-400">
            Authentication is not yet implemented.
          </p>

          <div className="mb-4 rounded-md border border-dashed border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/30 p-4">
            <p className="text-sm text-amber-900 dark:text-amber-200">
              Planned: PIN, biometric, or passkey login with role-based routing.
            </p>
          </div>

          <Link
            href="/dashboard"
            className="block w-full rounded-md bg-slate-900 dark:bg-slate-100 px-4 py-2.5 text-center text-sm font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-200 transition-colors"
          >
            Continue without auth
          </Link>
        </div>
      </div>
    </div>
  );
}
