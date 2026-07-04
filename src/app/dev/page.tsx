import { notFound } from "next/navigation";
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
    technician:      "bg-blue-50    border-blue-200    text-blue-800",
    director:        "bg-purple-50  border-purple-200  text-purple-800",
    service_manager: "bg-emerald-50 border-emerald-200 text-emerald-800",
    admin:           "bg-red-50     border-red-200     text-red-800",
    sales_engineer:  "bg-amber-50   border-amber-200   text-amber-800",
    draftsman:       "bg-slate-50   border-slate-200   text-slate-800",
  };

  const TEST_USERS = [
    { role: "technician",      email: "test.technician@ctfieldops.dev",      what: "Clock in/out, fill compliance docs" },
    { role: "director",        email: "test.director@ctfieldops.dev",         what: "Full access, invite team, approve variations" },
    { role: "service_manager", email: "test.service_manager@ctfieldops.dev",  what: "All jobs, crew board, schedule" },
    { role: "admin",           email: "test.admin@ctfieldops.dev",            what: "Director + manage compliance templates" },
    { role: "sales_engineer",  email: "test.sales_engineer@ctfieldops.dev",   what: "Jobs and customer data" },
    { role: "draftsman",       email: "test.draftsman@ctfieldops.dev",        what: "Read-only access" },
  ];

  const SIGN_IN_URL = process.env.NEXT_PUBLIC_CLERK_SIGN_IN_URL ?? "/sign-in";

  const seeded = users.some((u) => u.email?.endsWith("@ctfieldops.dev"));

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-6">
      <div className="max-w-2xl mx-auto space-y-6">

        {/* Header */}
        <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3">
          <p className="text-sm font-semibold text-amber-800">⚙️ Developer Login Helper — not visible in production</p>
          {current && (
            <p className="text-xs text-amber-700 mt-0.5">
              Signed in as <strong>{current.name}</strong> ({current.role})
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

        {/* Test credentials */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 divide-y divide-slate-100 dark:divide-slate-700">
          <div className="px-4 py-3 flex items-center justify-between">
            <h2 className="font-semibold text-sm">Test accounts</h2>
            <span className="text-xs font-mono bg-slate-100 dark:bg-slate-900 px-2 py-0.5 rounded">
              Password: TestLogin123!
            </span>
          </div>

          {!seeded && (
            <div className="px-4 py-3 text-sm text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20">
              ⚠ No test accounts found. Run{" "}
              <code className="bg-amber-100 dark:bg-amber-900/40 px-1 rounded font-mono text-xs">pnpm seed</code>{" "}
              to create them.
            </div>
          )}

          {TEST_USERS.map(({ role, email, what }) => {
            const dbUser = users.find((u) => u.email === email);
            return (
              <div key={role} className="px-4 py-3 flex items-start gap-3">
                <span className={`shrink-0 mt-0.5 text-xs font-medium px-2 py-0.5 rounded-full border ${ROLE_COLOUR[role] ?? ""}`}>
                  {role.replace("_", " ")}
                </span>
                <div className="min-w-0 flex-1 space-y-0.5">
                  <p className="text-xs font-mono text-slate-700 dark:text-slate-300">{email}</p>
                  <p className="text-xs text-slate-400">{what}</p>
                </div>
                {dbUser ? (
                  <span className="shrink-0 text-xs text-emerald-600 dark:text-emerald-400 font-medium">✓ in DB</span>
                ) : (
                  <span className="shrink-0 text-xs text-slate-400">not seeded</span>
                )}
              </div>
            );
          })}
        </div>

        {/* How to switch roles */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-4 text-sm space-y-3">
          <h2 className="font-semibold">How to switch roles</h2>
          <ol className="space-y-1.5 text-slate-600 dark:text-slate-400 list-decimal list-inside">
            <li>Click <strong>Sign Out</strong> above</li>
            <li>Click <strong>→ Go to Sign In</strong></li>
            <li>Enter the email + password for the role you want to test</li>
          </ol>
          <p className="text-xs text-slate-400">
            Tip: open separate Chrome profiles — one per role — so you can test two sides
            simultaneously without signing out.
          </p>
        </div>

        {/* Scenario guide */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-4 space-y-3">
          <h2 className="font-semibold text-sm">What to test per role</h2>
          <div className="grid gap-2 text-sm">
            {[
              { scenario: "Clock in/out",                  role: "technician",      path: "/time-tracking" },
              { scenario: "Fill in a SWMS/JSA",            role: "any",             path: "/compliance/new" },
              { scenario: "Log a variation",               role: "technician",      path: "/variations/submit" },
              { scenario: "Approve/reject variations",     role: "director",        path: "/variations" },
              { scenario: "Live crew board",               role: "service_manager", path: "/dashboard" },
              { scenario: "Manage team / invite users",    role: "director",        path: "/team" },
              { scenario: "Create compliance templates",   role: "admin",           path: "/compliance/templates" },
              { scenario: "Create / edit jobs",            role: "director",        path: "/jobs" },
            ].map(({ scenario, role, path }) => (
              <div key={path + scenario} className="flex items-start gap-2">
                <Link href={path} className="text-amber-600 hover:underline font-mono text-xs shrink-0 pt-0.5">{path}</Link>
                <span className="text-slate-500">→ {scenario} <span className="text-slate-400">({role})</span></span>
              </div>
            ))}
          </div>
        </div>

        {/* All users in DB */}
        {users.length > 0 && (
          <div className="space-y-2">
            <h2 className="font-semibold text-sm text-slate-500 uppercase tracking-wider">
              All users in DB ({users.length})
            </h2>
            {users.map((u) => (
              <div
                key={u.id}
                className={`rounded-xl border px-4 py-3 flex items-start justify-between gap-3 bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 ${
                  u.id === current?.id ? "ring-2 ring-amber-400" : ""
                } ${!u.isActive ? "opacity-50" : ""}`}
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
        )}

        {/* Seed hint */}
        <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-600 px-4 py-4 text-sm text-slate-600 dark:text-slate-400 space-y-1">
          <p className="font-semibold text-slate-700 dark:text-slate-300">Re-seed at any time</p>
          <code className="block bg-slate-100 dark:bg-slate-900 rounded px-3 py-2 text-xs font-mono">
            pnpm seed
          </code>
          <p className="text-xs">Clears all data and recreates 4 jobs + 6 test accounts. Requires CLERK_SECRET_KEY in .env.local.</p>
        </div>

      </div>
    </div>
  );
}
