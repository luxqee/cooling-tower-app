"use client";

import { useState, useTransition } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";

interface Technician {
  id: string;
  name: string;
}

interface Job {
  id: string;
  customerName: string;
  siteName: string;
}

interface ScheduleAssignment {
  id: string;
  assignedDate: string;
  endDate: string | null;
  user: { id: string; name: string; role: string };
  job: { id: string; customerName: string; siteName: string; siteAddress: string; status: string };
}

interface AssignNewModalProps {
  prefilledUserId?: string;
  prefilledDate: string; // YYYY-MM-DD
  technicians: Technician[];
  jobs: Job[];
  onClose: () => void;
  onCreated: (assignment: ScheduleAssignment) => void;
  onConflict: (warning: string) => void;
}

const sel =
  "w-full min-h-[44px] rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 text-base";

export function AssignNewModal({
  prefilledUserId,
  prefilledDate,
  technicians,
  jobs,
  onClose,
  onCreated,
  onConflict,
}: AssignNewModalProps) {
  const [userId, setUserId] = useState(prefilledUserId ?? "");
  const [jobId, setJobId] = useState("");
  const [endDate, setEndDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit() {
    if (!userId) { setError("Select a technician."); return; }
    if (!jobId) { setError("Select a job."); return; }
    setError(null);
    startTransition(async () => {
      const body: Record<string, string> = {
        userId,
        jobId,
        assignedDate: new Date(prefilledDate).toISOString(),
      };
      if (endDate) body.endDate = new Date(endDate).toISOString();

      const res = await fetch("/api/schedule/assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Failed to create assignment.");
        return;
      }
      if (data.warning) onConflict(data.warning);
      onCreated(data as ScheduleAssignment);
      onClose();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40">
      <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 p-6 space-y-4 shadow-xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Assign job</h2>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Start date</label>
            <input type="date" value={prefilledDate} readOnly className={sel + " opacity-60 cursor-default"} />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">
              End date <span className="font-normal text-slate-500">(optional — for multi-day)</span>
            </label>
            <input
              type="date"
              value={endDate}
              min={prefilledDate}
              onChange={(e) => setEndDate(e.target.value)}
              className={sel}
            />
          </div>
          {!prefilledUserId && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Technician</label>
              <select value={userId} onChange={(e) => setUserId(e.target.value)} className={sel}>
                <option value="">Select…</option>
                {technicians.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
          )}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Job</label>
            <select value={jobId} onChange={(e) => setJobId(e.target.value)} className={sel}>
              <option value="">Select…</option>
              {jobs.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.customerName} — {j.siteName}
                </option>
              ))}
            </select>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-3 pt-1">
            <button
              onClick={onClose}
              className="flex-1 min-h-[48px] rounded-lg border border-slate-300 dark:border-slate-600 text-sm font-medium"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={isPending}
              className="flex-1 min-h-[48px] rounded-lg bg-amber-500 hover:bg-amber-600 text-white font-semibold text-sm disabled:opacity-40"
            >
              {isPending ? "Saving…" : "Assign"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
