"use client";

import { useState, useTransition } from "react";
import { LiveTimer } from "./LiveTimer";

interface Job {
  id: string;
  customerName: string;
  siteName: string;
  siteAddress: string;
}

interface ActiveEntry {
  id: string;
  jobId: string;
  clockInTime: string;
  job: { customerName: string; siteName: string };
}

interface ClockCardProps {
  jobs: Job[];
  activeEntry: ActiveEntry | null;
  usingFallback?: boolean;
}

export function ClockCard({ jobs, activeEntry, usingFallback = false }: ClockCardProps) {
  const [selectedJobId, setSelectedJobId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [currentEntry, setCurrentEntry] = useState(activeEntry);
  const [isPending, startTransition] = useTransition();

  async function handleClockIn() {
    if (!selectedJobId) {
      setError("Select a job first.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await fetch("/api/time/clock-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId: selectedJobId }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Clock-in failed.");
        return;
      }
      const entry = await res.json();
      const job = jobs.find((j) => j.id === entry.jobId)!;
      setCurrentEntry({
        ...entry,
        clockInTime: entry.clockInTime,
        job: { customerName: job.customerName, siteName: job.siteName },
      });
    });
  }

  async function handleClockOut() {
    if (!currentEntry) return;
    setError(null);
    startTransition(async () => {
      const res = await fetch("/api/time/clock-out", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entryId: currentEntry.id }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Clock-out failed.");
        return;
      }
      setCurrentEntry(null);
    });
  }

  if (currentEntry) {
    return (
      <div className="flex flex-col gap-6 p-5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
        <div>
          <p className="text-xs font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Clocked in
          </p>
          <p className="text-lg font-semibold mt-1">
            {currentEntry.job.customerName} — {currentEntry.job.siteName}
          </p>
          <div className="mt-2">
            <LiveTimer clockInTime={currentEntry.clockInTime} />
          </div>
        </div>

        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

        <button
          onClick={handleClockOut}
          disabled={isPending}
          className="w-full min-h-[52px] rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 font-semibold text-base disabled:opacity-50 active:scale-[0.98] transition-transform"
        >
          {isPending ? "Clocking out…" : "Clock Out"}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
      <p className="text-xs font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400">
        Not clocked in
      </p>

      {jobs.length === 0 ? (
        <p className="text-sm text-slate-500">No active jobs available.</p>
      ) : (
        <>
          {usingFallback && (
            <p className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 rounded-lg px-3 py-2">
              No assignment for today — select a job to clock in manually.
            </p>
          )}
          <label htmlFor="clock-job-select" className="sr-only">Select job to clock in</label>
          <select
            id="clock-job-select"
            value={selectedJobId}
            onChange={(e) => setSelectedJobId(e.target.value)}
            className="w-full min-h-[44px] rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 px-3 text-base"
          >
            <option value="">Select a job…</option>
            {jobs.map((job) => (
              <option key={job.id} value={job.id}>
                {job.customerName} — {job.siteName}
              </option>
            ))}
          </select>

          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

          <button
            onClick={handleClockIn}
            disabled={isPending || !selectedJobId}
            className="w-full min-h-[52px] rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-semibold text-base disabled:opacity-40 active:scale-[0.98] transition-transform"
          >
            {isPending ? "Clocking in…" : "Clock In"}
          </button>
        </>
      )}
    </div>
  );
}
