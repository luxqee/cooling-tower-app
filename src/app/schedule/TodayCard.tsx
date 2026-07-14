"use client";

import Link from "next/link";
import { Clock } from "lucide-react";
import { cn } from "@/lib/utils/cn";

interface TodayCardAssignment {
  id: string;
  assignedDate: string;
  endDate: string | null;
  job: {
    id: string;
    customerName: string;
    siteName: string;
    siteAddress: string;
    status: string;
  };
}

interface TodayCardProps {
  assignments: TodayCardAssignment[];
  todayLabel: string;
}

export function TodayCard({ assignments, todayLabel }: TodayCardProps) {
  if (assignments.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-5 py-8 text-center space-y-2">
        <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">{todayLabel}</p>
        <p className="text-slate-500 dark:text-slate-500 text-sm">No jobs scheduled for today</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">{todayLabel}</p>
      {assignments.map((a) => {
        const isInactive = a.job.status === "complete" || a.job.status === "cancelled";
        return (
          <div
            key={a.id}
            className={cn(
              "rounded-2xl border px-5 py-5 space-y-4",
              isInactive
                ? "border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50"
                : "border-amber-200 dark:border-amber-700/50 bg-white dark:bg-slate-800"
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-0.5">
                <p className="font-semibold">{a.job.customerName}</p>
                <p className="text-sm text-slate-600 dark:text-slate-300">{a.job.siteName}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">{a.job.siteAddress}</p>
              </div>
              {isInactive && (
                <span className="shrink-0 text-xs font-medium px-2 py-0.5 rounded-full bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300 capitalize">
                  {a.job.status}
                </span>
              )}
            </div>
            {!isInactive && (
              <Link
                href="/time-tracking"
                className="flex items-center justify-center gap-2 min-h-[44px] w-full rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-semibold text-sm transition-colors"
              >
                <Clock className="w-4 h-4" />
                Clock In →
              </Link>
            )}
          </div>
        );
      })}
    </div>
  );
}
