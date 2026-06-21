"use client";

import { useState, useTransition } from "react";
import { Plus, X, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";

interface Assignment {
  id: string;
  assignedDate: string;
  user: { id: string; name: string };
  job: { id: string; customerName: string; siteName: string; status: string };
}

interface Technician {
  id: string;
  name: string;
}

interface Job {
  id: string;
  customerName: string;
  siteName: string;
}

interface ScheduleClientProps {
  assignments: Assignment[];
  technicians: Technician[];
  jobs: Job[];
}

function groupByDate(assignments: Assignment[]) {
  const map = new Map<string, Assignment[]>();
  for (const a of assignments) {
    const key = a.assignedDate.slice(0, 10);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(a);
  }
  return map;
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" });
}

function isToday(iso: string) {
  return iso.slice(0, 10) === new Date().toISOString().slice(0, 10);
}

function AssignmentRow({ a }: { a: Assignment }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);

  function remove() {
    startTransition(async () => {
      await fetch(`/api/schedule/assignments/${a.id}`, { method: "DELETE" });
      router.refresh();
    });
  }

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-3 space-y-2">
      <div className="flex items-center gap-3">
        <div className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="font-medium text-sm truncate">{a.user.name}</p>
          <p className="text-xs text-slate-500 truncate">
            {a.job.customerName} — {a.job.siteName}
          </p>
        </div>
        <span className={`shrink-0 text-xs font-medium px-2 py-0.5 rounded-full ${
          a.job.status === "active"
            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400"
            : "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300"
        }`}>
          {a.job.status}
        </span>
        <button
          onClick={() => setConfirming((v) => !v)}
          className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-slate-400 hover:text-red-500 shrink-0"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
      {confirming && (
        <div className="flex gap-2 pt-1 border-t border-slate-100 dark:border-slate-700">
          <button onClick={() => setConfirming(false)} className="flex-1 min-h-[32px] rounded-lg border border-slate-300 dark:border-slate-600 text-xs">Cancel</button>
          <button onClick={remove} disabled={isPending} className="flex-1 min-h-[32px] rounded-lg bg-red-600 text-white text-xs font-semibold disabled:opacity-40">
            {isPending ? "Removing…" : "Remove"}
          </button>
        </div>
      )}
    </div>
  );
}

export function ScheduleClient({ assignments, technicians, jobs }: ScheduleClientProps) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [userId, setUserId] = useState("");
  const [jobId, setJobId] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const grouped = groupByDate(assignments);
  const sortedDates = [...grouped.keys()].sort();

  function handleAssign() {
    if (!userId || !jobId || !date) { setError("Fill in all fields."); return; }
    setError(null);
    startTransition(async () => {
      const res = await fetch("/api/schedule/assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, jobId, assignedDate: new Date(date).toISOString() }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Failed to create assignment.");
        return;
      }
      setShowForm(false);
      setUserId(""); setJobId("");
      router.refresh();
    });
  }

  const sel = "w-full min-h-[44px] rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 text-base";

  return (
    <>
      <button
        onClick={() => setShowForm(true)}
        className="flex items-center gap-2 min-h-[44px] px-4 rounded-lg bg-amber-500 hover:bg-amber-600 text-white font-semibold text-sm"
      >
        <Plus className="w-4 h-4" />
        Assign technician
      </button>

      {assignments.length === 0 && (
        <p className="text-sm text-slate-500">No assignments in the next 14 days.</p>
      )}

      <div className="space-y-6">
        {sortedDates.map((dateKey) => (
          <div key={dateKey}>
            <h2 className={`text-sm font-semibold mb-2 ${isToday(dateKey) ? "text-amber-500" : "text-slate-500"}`}>
              {isToday(dateKey) ? "Today — " : ""}{formatDate(dateKey)}
            </h2>
            <div className="space-y-2">
              {grouped.get(dateKey)!.map((a) => (
                <AssignmentRow key={a.id} a={a} />
              ))}
            </div>
          </div>
        ))}
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40">
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Assign technician</h2>
              <button onClick={() => { setShowForm(false); setError(null); }} className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Date</label>
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={sel} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Technician</label>
                <select value={userId} onChange={(e) => setUserId(e.target.value)} className={sel}>
                  <option value="">Select…</option>
                  {technicians.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Job</label>
                <select value={jobId} onChange={(e) => setJobId(e.target.value)} className={sel}>
                  <option value="">Select…</option>
                  {jobs.map((j) => <option key={j.id} value={j.id}>{j.customerName} — {j.siteName}</option>)}
                </select>
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <div className="flex gap-3 pt-1">
                <button onClick={() => { setShowForm(false); setError(null); }} className="flex-1 min-h-[48px] rounded-lg border border-slate-300 dark:border-slate-600 text-sm font-medium">
                  Cancel
                </button>
                <button onClick={handleAssign} disabled={isPending} className="flex-1 min-h-[48px] rounded-lg bg-amber-500 hover:bg-amber-600 text-white font-semibold text-sm disabled:opacity-40">
                  {isPending ? "Saving…" : "Assign"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
