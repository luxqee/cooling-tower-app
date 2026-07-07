"use client";

import { useState, useTransition } from "react";
import { Plus, X, Pencil, Trash2 } from "lucide-react";
import { NewJobForm } from "./NewJobForm";
import { useRouter } from "next/navigation";

interface Job {
  id: string;
  customerName: string;
  siteName: string;
  siteAddress?: string;
  quotedHours: number;
  quotedCost: number | null;
  loggedHours: number;
  isOverQuota: boolean;
  crew: string[];
  status: string;
}

const STATUS_OPTS = ["scheduled", "active", "complete", "cancelled"] as const;

function EditJobModal({ job, onClose }: { job: Job; onClose: () => void }) {
  const router = useRouter();
  const [fields, setFields] = useState({
    customerName: job.customerName,
    siteName: job.siteName,
    siteAddress: job.siteAddress ?? "",
    quotedHours: String(job.quotedHours),
    quotedCost: job.quotedCost != null ? String(job.quotedCost) : "",
    status: job.status,
  });
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function set(k: keyof typeof fields, v: string) {
    setFields((p) => ({ ...p, [k]: v }));
  }

  function save() {
    startTransition(async () => {
      const cost = fields.quotedCost ? parseFloat(fields.quotedCost) : null;
      const res = await fetch(`/api/jobs/${job.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...fields, quotedHours: parseFloat(fields.quotedHours), quotedCost: cost }),
      });
      if (!res.ok) { setError((await res.json()).error ?? "Failed."); return; }
      router.refresh();
      onClose();
    });
  }

  const inp = "w-full min-h-[44px] rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 text-base";

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40">
      <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 p-6 space-y-4 shadow-xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Edit job</h2>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"><X className="w-5 h-5" /></button>
        </div>
        <div className="space-y-3">
          {[
            { label: "Customer name", key: "customerName" as const },
            { label: "Site name", key: "siteName" as const },
            { label: "Site address", key: "siteAddress" as const },
          ].map(({ label, key }) => (
            <div key={key} className="space-y-1.5">
              <label className="text-sm font-medium">{label}</label>
              <input type="text" value={fields[key]} onChange={(e) => set(key, e.target.value)} className={inp} />
            </div>
          ))}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Quoted hours</label>
              <input type="number" value={fields.quotedHours} onChange={(e) => set("quotedHours", e.target.value)} className={inp} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Quoted cost ($) <span className="font-normal text-slate-400">optional</span></label>
              <input type="number" inputMode="decimal" value={fields.quotedCost} onChange={(e) => set("quotedCost", e.target.value)} placeholder="1200" className={inp} />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Status</label>
            <select value={fields.status} onChange={(e) => set("status", e.target.value)} className={inp}>
              {STATUS_OPTS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-3 pt-1">
            <button onClick={onClose} className="flex-1 min-h-[48px] rounded-lg border border-slate-300 dark:border-slate-600 text-sm font-medium">Cancel</button>
            <button onClick={save} disabled={isPending} className="flex-1 min-h-[48px] rounded-lg bg-amber-500 hover:bg-amber-600 text-white font-semibold text-sm disabled:opacity-40">
              {isPending ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function JobCard({ job, canEdit }: { job: Job; canEdit: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [isPending, startTransition] = useTransition();

  function deleteJob() {
    startTransition(async () => {
      await fetch(`/api/jobs/${job.id}`, { method: "DELETE" });
      router.refresh();
    });
  }

  return (
    <>
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-semibold truncate">{job.customerName}</p>
            <p className="text-sm text-slate-500 truncate">{job.siteName}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
              job.status === "active"
                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400"
                : job.status === "complete"
                  ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400"
                  : job.status === "cancelled"
                    ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400"
                    : "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300"
            }`}>
              {job.status}
            </span>
            {canEdit && (
              <>
                <button onClick={() => setEditing(true)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 hover:text-slate-900 dark:hover:text-slate-100">
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => setConfirming(true)} className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-slate-400 hover:text-red-600">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </>
            )}
          </div>
        </div>

        <div>
          <div className="flex justify-between text-xs mb-1">
            <span className="text-slate-500">Hours logged</span>
            <span className={job.isOverQuota ? "text-red-600 font-semibold" : "text-slate-700 dark:text-slate-300"}>
              {job.loggedHours}h / {job.quotedHours}h{job.isOverQuota && " ⚠"}
            </span>
          </div>
          <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
            <div
              className={`h-full rounded-full ${job.isOverQuota ? "bg-red-500" : "bg-amber-400"}`}
              style={{ width: `${Math.min((job.loggedHours / job.quotedHours) * 100, 100)}%` }}
            />
          </div>
        </div>

        {job.crew.length > 0 && <p className="text-xs text-slate-500">{job.crew.join(", ")}</p>}

        {confirming && (
          <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-3 py-3 space-y-2">
            <p className="text-sm text-red-700 dark:text-red-300 font-medium">Delete this job?</p>
            <p className="text-xs text-red-600 dark:text-red-400">This will remove all time entries and assignments.</p>
            <div className="flex gap-2">
              <button onClick={() => setConfirming(false)} className="flex-1 min-h-[36px] rounded-lg border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-300">Cancel</button>
              <button onClick={deleteJob} disabled={isPending} className="flex-1 min-h-[36px] rounded-lg bg-red-600 text-white font-semibold text-sm disabled:opacity-40">
                {isPending ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        )}
      </div>
      {editing && <EditJobModal job={job} onClose={() => setEditing(false)} />}
    </>
  );
}

interface JobsClientProps {
  jobs: Job[];
  canCreate: boolean;
}

export function JobsClient({ jobs, canCreate }: JobsClientProps) {
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

      {jobs.length === 0 && !showForm && <p className="text-sm text-slate-500">No active jobs.</p>}

      <div className="space-y-3">
        {jobs.map((job) => (
          <JobCard key={job.id} job={job} canEdit={canCreate} />
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
