"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { NewJobForm } from "./NewJobForm";

interface Job {
  id: string;
  customerName: string;
  siteName: string;
  quotedHours: number;
  loggedHours: number;
  isOverQuota: boolean;
  crew: string[];
  status: string;
}

interface JobsClientProps {
  jobs: Job[];
  canCreate: boolean;
}

export function JobsClient({ jobs: initialJobs, canCreate }: JobsClientProps) {
  const [showForm, setShowForm] = useState(false);

  return (
    <>
      {canCreate && (
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 min-h-[44px] px-4 rounded-lg bg-amber-500 hover:bg-amber-600 text-white font-semibold text-sm"
        >
          <Plus className="w-4 h-4" />
          New job
        </button>
      )}

      {initialJobs.length === 0 && !showForm && (
        <p className="text-sm text-slate-500">No active jobs.</p>
      )}

      <div className="space-y-3">
        {initialJobs.map((job) => (
          <div
            key={job.id}
            className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-4 space-y-3"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold truncate">{job.customerName}</p>
                <p className="text-sm text-slate-500 truncate">{job.siteName}</p>
              </div>
              <span
                className={`shrink-0 text-xs font-medium px-2 py-0.5 rounded-full ${
                  job.status === "active"
                    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400"
                    : "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300"
                }`}
              >
                {job.status}
              </span>
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-slate-500">Hours logged</span>
                <span className={job.isOverQuota ? "text-red-600 font-semibold" : "text-slate-700 dark:text-slate-300"}>
                  {job.loggedHours}h / {job.quotedHours}h
                  {job.isOverQuota && " ⚠"}
                </span>
              </div>
              <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
                <div
                  className={`h-full rounded-full ${job.isOverQuota ? "bg-red-500" : "bg-amber-400"}`}
                  style={{ width: `${Math.min((job.loggedHours / job.quotedHours) * 100, 100)}%` }}
                />
              </div>
            </div>

            {job.crew.length > 0 && (
              <p className="text-xs text-slate-500">{job.crew.join(", ")}</p>
            )}
          </div>
        ))}
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40">
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 p-6 space-y-5 shadow-xl">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">New job</h2>
              <button onClick={() => setShowForm(false)} className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">
                <X className="w-5 h-5" />
              </button>
            </div>
            <NewJobForm onClose={() => setShowForm(false)} />
          </div>
        </div>
      )}
    </>
  );
}
