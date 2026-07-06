"use client";

import { useState, useEffect } from "react";

interface QuoteRow {
  id: string;
  customerName: string;
  siteName: string;
  siteAddress: string;
  jobType: string;
  quotedHours: number;
  actualHours: number;
  overagePct: number | null;
  variationCount: number;
  variationTotal: number;
  createdAt: string;
}

interface QuoteStats {
  count: number;
  avgQuotedHours: number;
  avgActualHours: number;
  avgOveragePct: number | null;
  avgVariationTotal: number;
}

export function QuotesClient() {
  const [jobType, setJobType] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [results, setResults] = useState<QuoteRow[]>([]);
  const [stats, setStats] = useState<QuoteStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [jobTypes, setJobTypes] = useState<string[]>([]);

  useEffect(() => {
    fetch("/api/quotes/job-types")
      .then((r) => (r.ok ? r.json() : { jobTypes: [] }))
      .then((d) => setJobTypes(d.jobTypes ?? []));
    fetchResults({ jobType: "", customerName: "", dateFrom: "", dateTo: "" });
  }, []);

  async function fetchResults(filters: {
    jobType: string;
    customerName: string;
    dateFrom: string;
    dateTo: string;
  }) {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.jobType) params.set("jobType", filters.jobType);
      if (filters.customerName) params.set("customerName", filters.customerName);
      if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
      if (filters.dateTo) params.set("dateTo", filters.dateTo);
      const res = await fetch(`/api/quotes/search?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setResults(data.jobs ?? []);
        setStats(data.stats ?? null);
      }
    } finally {
      setLoading(false);
    }
  }

  function handleSearch() {
    fetchResults({ jobType, customerName, dateFrom, dateTo });
  }

  const inputClass =
    "min-h-[44px] rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 text-sm";

  return (
    <div className="space-y-6">
      {/* Filter bar */}
      <div className="flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-[140px] space-y-1">
          <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
            Job type
          </label>
          <input
            type="text"
            list="quote-job-type-options"
            value={jobType}
            onChange={(e) => setJobType(e.target.value)}
            placeholder="All types"
            className={`w-full ${inputClass}`}
          />
          <datalist id="quote-job-type-options">
            {jobTypes.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </div>

        <div className="flex-1 min-w-[140px] space-y-1">
          <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
            Customer
          </label>
          <input
            type="text"
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            placeholder="All customers"
            className={`w-full ${inputClass}`}
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-600 dark:text-slate-400">From</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className={inputClass}
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-600 dark:text-slate-400">To</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className={inputClass}
          />
        </div>

        <button
          onClick={handleSearch}
          disabled={loading}
          className="min-h-[44px] px-5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-semibold text-sm disabled:opacity-40"
        >
          {loading ? "Searching…" : "Search"}
        </button>
      </div>

      {/* Stats card */}
      {stats && stats.count > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {[
            { label: "Avg quoted hrs", value: stats.avgQuotedHours.toFixed(1) },
            { label: "Avg actual hrs", value: stats.avgActualHours.toFixed(1) },
            {
              label: "Avg overage",
              value:
                stats.avgOveragePct != null
                  ? `${stats.avgOveragePct >= 0 ? "+" : ""}${stats.avgOveragePct.toFixed(1)}%`
                  : "—",
            },
            { label: "Avg variation total", value: `$${stats.avgVariationTotal.toFixed(2)}` },
            { label: "Jobs", value: String(stats.count) },
          ].map(({ label, value }) => (
            <div
              key={label}
              className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4"
            >
              <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
              <p className="mt-1 text-xl font-semibold">{value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && results.length === 0 && (
        <p className="text-slate-500 dark:text-slate-400 text-sm">
          No completed jobs match your filters.
        </p>
      )}

      {/* Results table */}
      {results.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-700">
                {[
                  "Customer",
                  "Site",
                  "Type",
                  "Quoted hrs",
                  "Actual hrs",
                  "Overage",
                  "Variation total",
                ].map((h) => (
                  <th
                    key={h}
                    className="pb-2 pr-4 text-left text-xs font-medium text-slate-500 dark:text-slate-400 whitespace-nowrap"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {results.map((row) => {
                const overageClass =
                  row.overagePct === null
                    ? "text-slate-400"
                    : row.overagePct > 0
                    ? "text-red-600 dark:text-red-400"
                    : "text-green-600 dark:text-green-400";
                const overageText =
                  row.overagePct === null
                    ? "—"
                    : `${row.overagePct >= 0 ? "+" : ""}${row.overagePct.toFixed(1)}%`;
                return (
                  <tr key={row.id} className="border-b border-slate-100 dark:border-slate-800">
                    <td className="py-2.5 pr-4">{row.customerName}</td>
                    <td className="py-2.5 pr-4">{row.siteName}</td>
                    <td className="py-2.5 pr-4">{row.jobType}</td>
                    <td className="py-2.5 pr-4">{row.quotedHours.toFixed(1)}</td>
                    <td className="py-2.5 pr-4">{row.actualHours.toFixed(1)}</td>
                    <td className={`py-2.5 pr-4 font-medium ${overageClass}`}>{overageText}</td>
                    <td
                      className={`py-2.5 pr-4 ${row.variationTotal === 0 ? "text-slate-400" : ""}`}
                    >
                      ${row.variationTotal.toFixed(2)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
