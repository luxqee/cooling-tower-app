"use client";

import { useEffect, useState, useCallback } from "react";
import { formatDuration, calcDurationMinutes } from "@/lib/time/utils";

interface CrewEntry {
  entryId: string;
  technicianId: string;
  technicianName: string;
  jobId: string;
  customerName: string;
  siteName: string;
  clockInTime: string;
}

export function CrewBoard() {
  const [entries, setEntries] = useState<CrewEntry[]>([]);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [error, setError] = useState(false);
  const [, forceRender] = useState(0);

  const fetchCrew = useCallback(async () => {
    try {
      const res = await fetch("/api/crew/live");
      if (!res.ok) throw new Error("fetch failed");
      const data = await res.json();
      setEntries(data);
      setLastUpdated(new Date());
      setError(false);
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    fetchCrew();
    const id = setInterval(fetchCrew, 5_000);
    return () => clearInterval(id);
  }, [fetchCrew]);

  useEffect(() => {
    const id = setInterval(() => forceRender((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">Live Crew</h2>
        {lastUpdated && (
          <span className="text-xs font-mono text-slate-400">
            {lastUpdated.toLocaleTimeString("en-AU", {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            })}
          </span>
        )}
      </div>

      {error && (
        <p className="text-sm text-red-600 dark:text-red-400">
          Failed to refresh — check your connection.
        </p>
      )}

      {entries.length === 0 && !error && (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          No technicians currently clocked in.
        </p>
      )}

      <ul className="space-y-2">
        {entries.map((e) => {
          const elapsed = calcDurationMinutes(new Date(e.clockInTime), new Date());
          return (
            <li
              key={e.entryId}
              className="flex items-start justify-between gap-4 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-3"
            >
              <div className="min-w-0">
                <p className="font-medium truncate">{e.technicianName}</p>
                <p className="text-sm text-slate-500 truncate">
                  {e.customerName} — {e.siteName}
                </p>
              </div>
              <span className="text-sm font-mono tabular-nums text-amber-500 shrink-0">
                {formatDuration(elapsed)}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
