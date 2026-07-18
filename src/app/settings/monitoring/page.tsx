import { AppShell } from "@/components/layout/AppShell";
import { requireRole } from "@/lib/auth/clerk";
import { PAGE_ACCESS } from "@/lib/permissions";
import { getMonitoringStats } from "@/lib/monitoring/getStats";
import { formatBytes } from "@/lib/utils/formatBytes";
import { redirect } from "next/navigation";
import Link from "next/link";

const AI_FEATURE_LABELS: Record<string, string> = {
  validation: "Job validation",
  voice_note: "Voice note summaries",
  company_assistant: "AI assistant chat",
};

export default async function MonitoringPage() {
  const user = await requireRole(PAGE_ACCESS.monitoring).catch(() => null);
  if (!user) redirect("/");

  const stats = await getMonitoringStats();

  return (
    <AppShell>
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        <div>
          <Link href="/settings" className="text-xs text-amber-600 dark:text-amber-400 hover:underline">
            ← Settings
          </Link>
          <h1 className="text-xl font-semibold mt-1">System health</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Database size, file storage, and AI usage — a snapshot, not a live feed.
          </p>
        </div>

        {/* Database */}
        <div className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-6 py-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Database</h2>
            <span className="font-mono text-sm text-slate-500 dark:text-slate-400">
              {stats.databaseSizePretty ?? "size unavailable"}
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-3">
            {stats.rowCounts.map((r) => (
              <div key={r.label}>
                <p className="text-lg font-semibold tabular-nums text-slate-900 dark:text-slate-100">{r.count.toLocaleString()}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">{r.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* File storage */}
        <div className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-6 py-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">File storage</h2>
            <span className="font-mono text-sm text-slate-500 dark:text-slate-400">
              {formatBytes(stats.blobTotalBytes)} · {stats.blobTotalCount.toLocaleString()} files
            </span>
          </div>
          {stats.blobUsage.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">No files stored yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-300 dark:border-slate-700">
                  <th className="pb-2 text-left text-xs font-medium text-slate-500 dark:text-slate-400">Type</th>
                  <th className="pb-2 text-right text-xs font-medium text-slate-500 dark:text-slate-400">Files</th>
                  <th className="pb-2 text-right text-xs font-medium text-slate-500 dark:text-slate-400">Size</th>
                </tr>
              </thead>
              <tbody>
                {stats.blobUsage
                  .slice()
                  .sort((a, b) => b.bytes - a.bytes)
                  .map((b) => (
                    <tr key={b.prefix} className="border-b border-slate-100 dark:border-slate-800 last:border-0">
                      <td className="py-2 capitalize">{b.prefix.replace(/-/g, " ")}</td>
                      <td className="py-2 text-right tabular-nums">{b.count.toLocaleString()}</td>
                      <td className="py-2 text-right tabular-nums">{formatBytes(b.bytes)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          )}
        </div>

        {/* AI usage & cost */}
        <div className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-6 py-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">AI usage &amp; cost</h2>
            <span className="font-mono text-sm text-slate-500 dark:text-slate-400">
              ${stats.aiTotalCostUsd.toFixed(4)} total
            </span>
          </div>
          {stats.aiCostByFeature.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">No AI calls recorded yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-300 dark:border-slate-700">
                  <th className="pb-2 text-left text-xs font-medium text-slate-500 dark:text-slate-400">Feature</th>
                  <th className="pb-2 text-right text-xs font-medium text-slate-500 dark:text-slate-400">Calls</th>
                  <th className="pb-2 text-right text-xs font-medium text-slate-500 dark:text-slate-400">Tokens (in/out)</th>
                  <th className="pb-2 text-right text-xs font-medium text-slate-500 dark:text-slate-400">Cost</th>
                </tr>
              </thead>
              <tbody>
                {stats.aiCostByFeature
                  .slice()
                  .sort((a, b) => b.costUsd - a.costUsd)
                  .map((f) => (
                    <tr key={f.feature} className="border-b border-slate-100 dark:border-slate-800 last:border-0">
                      <td className="py-2">{AI_FEATURE_LABELS[f.feature] ?? f.feature}</td>
                      <td className="py-2 text-right tabular-nums">{f.calls.toLocaleString()}</td>
                      <td className="py-2 text-right tabular-nums">
                        {f.promptTokens.toLocaleString()} / {f.outputTokens.toLocaleString()}
                      </td>
                      <td className="py-2 text-right tabular-nums">${f.costUsd.toFixed(4)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </AppShell>
  );
}
