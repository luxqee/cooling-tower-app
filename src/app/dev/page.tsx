import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db/client";
import { getSessionUser } from "@/lib/auth/clerk";

// Only available in development — 404 in production
export default async function DevLoginPage() {
  if (process.env.NODE_ENV === "production") notFound();

  const current = await getSessionUser();

  const users = await db.user.findMany({
    orderBy: { role: "asc" },
    select: { id: true, name: true, email: true, role: true, isActive: true },
  }).catch(() => []);

  const ROLE_COLOUR: Record<string, string> = {
    technician: "bg-blue-50 border-blue-200 text-blue-800",
    director: "bg-purple-50 border-purple-200 text-purple-800",
    service_manager: "bg-emerald-50 border-emerald-200 text-emerald-800",
    admin: "bg-red-50 border-red-200 text-red-800",
    sales_engineer: "bg-amber-50 border-amber-200 text-amber-800",
    draftsman: "bg-slate-50 border-slate-200 text-slate-800",
  };

  const SIGN_IN_URL = process.env.NEXT_PUBLIC_CLERK_SIGN_IN_URL ?? "/sign-in";

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-6">
      <div className="max-w-2xl mx-auto space-y-6">

        {/* Header */}
        <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3">
          <p className="text-sm font-semibold text-amber-800">⚙️ Developer Login Helper — not visible in production</p>
          {current && (
            <p className="text-xs text-amber-700 mt-0.5">
              Currently signed in as <strong>{current.name}</strong> ({current.role})
            </p>
          )}
        </div>

        <h1 className="text-xl font-semibold">Dev Login</h1>

        {/* Quick actions */}
        <div className="flex flex-wrap gap-3">
          <Link
            href={SIGN_IN_URL}
            className="inline-flex items-center gap-1.5 min-h-[40px] px-4 rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-sm font-semibold"
          >
            → Go to Sign In
          </Link>
          <Link
            href="/api/auth/signout"
            className="inline-flex items-center gap-1.5 min-h-[40px] px-4 rounded-lg border border-slate-300 text-sm font-medium"
          >
            Sign Out
          </Link>
        </div>

        {/* Role workflow guide */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-4 space-y-3">
          <h2 className="font-semibold text-sm">Scenario quick-guide</h2>
          <div className="grid gap-2 text-sm">
            {[
              { scenario: "Clock in/out", role: "technician", path: "/time-tracking" },
              { scenario: "Log a variation", role: "technician", path: "/variations/submit" },
              { scenario: "Approve/reject variations", role: "director", path: "/variations" },
              { scenario: "Live crew board", role: "service_manager or director", path: "/dashboard" },
              { scenario: "Hours vs quoted", role: "director", path: "/dashboard" },
              { scenario: "Manage team / assign roles", role: "director", path: "/team" },
              { scenario: "Create / edit jobs", role: "director or service_manager", path: "/jobs" },
              { scenario: "Assign staff to jobs", role: "director or service_manager", path: "/schedule" },
            ].map(({ scenario, role, path }) => (
              <div key={path} className="flex items-start gap-2">
                <Link href={path} className="text-amber-600 hover:underline font-mono text-xs shrink-0 pt-0.5">{path}</Link>
                <span className="text-slate-500">→ {scenario} <span className="text-slate-400">({role})</span></span>
              </div>
            ))}
          </div>
        </div>

        {/* Users in DB */}
        <div className="space-y-2">
          <h2 className="font-semibold text-sm text-slate-500 uppercase tracking-wider">
            Users in database ({users.length})
          </h2>

          {users.length === 0 && (
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-6 text-sm text-slate-500 text-center space-y-2">
              <p>No users yet. Sign in to create your account via JIT provisioning.</p>
              <p className="text-xs">Or run <code className="bg-slate-100 px-1 rounded">pnpm seed</code> to add example jobs first.</p>
            </div>
          )}

          {users.map((u) => (
            <div
              key={u.id}
              className={`rounded-xl border px-4 py-3 flex items-start justify-between gap-3 ${
                u.id === current?.id ? "ring-2 ring-amber-400" : ""
              } bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 ${
                !u.isActive ? "opacity-50" : ""
              }`}
            >
              <div className="min-w-0 space-y-0.5">
                <div className="flex items-center gap-2">
                  <p className="font-medium text-sm">{u.name}</p>
                  {u.id === current?.id && (
                    <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-medium">you</span>
                  )}
                </div>
                <p className="text-xs text-slate-500 font-mono">{u.email}</p>
              </div>
              <span className={`shrink-0 text-xs font-medium px-2 py-0.5 rounded-full border ${ROLE_COLOUR[u.role] ?? ""}`}>
                {u.role.replace("_", " ")}
              </span>
            </div>
          ))}
        </div>

        {/* Instructions */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-4 text-sm space-y-3">
          <h2 className="font-semibold">How to switch roles</h2>
          <ol className="space-y-1.5 text-slate-600 dark:text-slate-400 list-decimal list-inside">
            <li>Click <strong>Sign Out</strong> above (or via the sidebar avatar)</li>
            <li>Click <strong>→ Go to Sign In</strong></li>
            <li>Sign in with the Clerk account for the role you want</li>
            <li>Come back here to confirm you&apos;re signed in as the right user</li>
          </ol>
          <p className="text-xs text-slate-400">
            Tip: use separate Chrome profiles — one per role — so you can test both sides simultaneously
            without signing out. Assign each profile a colour in Chrome settings for easy identification.
          </p>
        </div>

        {/* Seed helper */}
        <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-600 px-4 py-4 text-sm space-y-2 text-slate-600 dark:text-slate-400">
          <p className="font-semibold text-slate-700 dark:text-slate-300">Need test data?</p>
          <p>Run the seed script to populate 4 example jobs (Rio Tinto, Coca-Cola, Queensland Health, BHP):</p>
          <code className="block bg-slate-100 dark:bg-slate-900 rounded px-3 py-2 text-xs font-mono">
            pnpm seed
          </code>
          <p className="text-xs">
            To also seed user accounts and assignments, add{" "}
            <code className="bg-slate-100 dark:bg-slate-900 px-1 rounded">SEED_DIRECTOR_CLERK_ID</code>{" "}
            and{" "}
            <code className="bg-slate-100 dark:bg-slate-900 px-1 rounded">SEED_TECHNICIAN_CLERK_ID</code>{" "}
            to your <code className="bg-slate-100 dark:bg-slate-900 px-1 rounded">.env.local</code> first.
          </p>
        </div>

      </div>
    </div>
  );
}
