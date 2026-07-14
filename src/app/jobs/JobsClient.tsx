"use client";

import { useState, useTransition, useEffect } from "react";
import { createPortal } from "react-dom";
import { Plus, X, Pencil, Trash2, MessageSquare, Receipt } from "lucide-react";
import Link from "next/link";
import { NewJobForm } from "./NewJobForm";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { StatusBadge, type Status } from "@/components/ui/StatusBadge";

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
      if (!res.ok) { toast.error((await res.json()).error ?? "Failed."); return; }
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
              <label className="text-sm font-medium">Quoted cost ($) <span className="font-normal text-slate-500">optional</span></label>
              <input type="number" inputMode="decimal" value={fields.quotedCost} onChange={(e) => set("quotedCost", e.target.value)} placeholder="1200" className={inp} />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Status</label>
            <select value={fields.status} onChange={(e) => set("status", e.target.value)} className={inp}>
              {STATUS_OPTS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
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

interface Communication {
  id: string;
  type: "client_call" | "internal_note" | "field_instruction";
  body: string;
  createdAt: string;
  author?: { name: string };
}

const COMMUNICATION_TYPE_LABELS: Record<Communication["type"], string> = {
  client_call: "Client call",
  internal_note: "Internal note",
  field_instruction: "Field instruction",
};

function CommunicationLogModal({ job, onClose }: { job: Job; onClose: () => void }) {
  const [entries, setEntries] = useState<Communication[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [type, setType] = useState<Communication["type"]>("internal_note");
  const [body, setBody] = useState("");
  const [isPending, startTransition] = useTransition();

  function load() {
    setLoadError(null);
    fetch(`/api/jobs/${job.id}/communications`)
      .then(async (res) => {
        if (!res.ok) throw new Error((await res.json()).error ?? "Failed to load log.");
        return res.json();
      })
      .then(setEntries)
      .catch((e: Error) => setLoadError(e.message));
  }

  useEffect(load, [job.id]);

  function submit() {
    if (!body.trim()) return;
    startTransition(async () => {
      const res = await fetch(`/api/jobs/${job.id}/communications`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, body }),
      });
      if (!res.ok) { toast.error((await res.json()).error ?? "Failed to save."); return; }
      setBody("");
      load();
    });
  }

  const inp = "w-full min-h-[44px] rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 text-base";

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40">
      <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 p-6 space-y-4 shadow-xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-lg font-semibold">Communication log</h2>
            <p className="text-sm text-slate-500 truncate">{job.siteName}</p>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"><X className="w-5 h-5" /></button>
        </div>

        <div className="overflow-y-auto space-y-2 min-h-[80px]">
          {loadError && <p className="text-sm text-red-600">{loadError}</p>}
          {!loadError && entries === null && <p className="text-sm text-slate-500">Loading…</p>}
          {entries?.length === 0 && <p className="text-sm text-slate-500">No entries yet.</p>}
          {entries?.map((e) => (
            <div key={e.id} className="rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 space-y-0.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-amber-600 dark:text-amber-400">{COMMUNICATION_TYPE_LABELS[e.type]}</span>
                <span className="text-xs text-slate-500 shrink-0">{new Date(e.createdAt).toLocaleString()}</span>
              </div>
              <p className="text-sm whitespace-pre-wrap">{e.body}</p>
              {e.author?.name && <p className="text-xs text-slate-500">— {e.author.name}</p>}
            </div>
          ))}
        </div>

        <div className="space-y-2 shrink-0 pt-2 border-t border-slate-300 dark:border-slate-700">
          <select value={type} onChange={(e) => setType(e.target.value as Communication["type"])} className={inp}>
            {(Object.keys(COMMUNICATION_TYPE_LABELS) as Communication["type"][]).map((t) => (
              <option key={t} value={t}>{COMMUNICATION_TYPE_LABELS[t]}</option>
            ))}
          </select>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Note details…"
            rows={2}
            className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-base"
          />
          <button
            onClick={submit}
            disabled={isPending || !body.trim()}
            className="w-full min-h-[44px] rounded-lg bg-amber-500 hover:bg-amber-600 text-white font-semibold text-sm disabled:opacity-40"
          >
            {isPending ? "Adding…" : "Add entry"}
          </button>
        </div>
      </div>
    </div>
  );
}

interface MaterialEntry {
  id: string;
  description: string;
  supplierName: string | null;
  estimatedCost: number;
  actualCost: number | null;
  status: "pending" | "received" | "reconciled";
}

function MaterialsModal({ job, canReconcile, onClose }: { job: Job; canReconcile: boolean; onClose: () => void }) {
  const [entries, setEntries] = useState<MaterialEntry[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [estimatedCost, setEstimatedCost] = useState("");
  const [reconcileValues, setReconcileValues] = useState<Record<string, string>>({});
  const [isPending, startTransition] = useTransition();

  function load() {
    setLoadError(null);
    fetch(`/api/jobs/${job.id}/materials`)
      .then(async (res) => {
        if (!res.ok) throw new Error((await res.json()).error ?? "Failed to load materials.");
        return res.json();
      })
      .then(setEntries)
      .catch((e: Error) => setLoadError(e.message));
  }

  useEffect(load, [job.id]);

  function submit() {
    const cost = parseFloat(estimatedCost);
    if (!description.trim() || Number.isNaN(cost)) return;
    startTransition(async () => {
      const res = await fetch(`/api/jobs/${job.id}/materials`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description, estimatedCost: cost }),
      });
      if (!res.ok) { toast.error((await res.json()).error ?? "Failed to save."); return; }
      setDescription("");
      setEstimatedCost("");
      load();
    });
  }

  function reconcile(entryId: string) {
    const cost = parseFloat(reconcileValues[entryId] ?? "");
    if (Number.isNaN(cost)) return;
    startTransition(async () => {
      const res = await fetch(`/api/materials/${entryId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actualCost: cost }),
      });
      if (res.ok) load();
    });
  }

  const totalEstimated = entries?.reduce((sum, e) => sum + e.estimatedCost, 0) ?? 0;
  const inp = "w-full min-h-[44px] rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 text-base";

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40">
      <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 p-6 space-y-4 shadow-xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-lg font-semibold">Materials &amp; costs</h2>
            <p className="text-sm text-slate-500 truncate">{job.siteName} — est. ${totalEstimated.toFixed(0)}</p>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"><X className="w-5 h-5" /></button>
        </div>

        <div className="overflow-y-auto space-y-2 min-h-[80px]">
          {loadError && <p className="text-sm text-red-600">{loadError}</p>}
          {!loadError && entries === null && <p className="text-sm text-slate-500">Loading…</p>}
          {entries?.length === 0 && <p className="text-sm text-slate-500">No materials logged yet.</p>}
          {entries?.map((e) => (
            <div key={e.id} className="rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 space-y-1">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium truncate">{e.description}</p>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full shrink-0 ${
                  e.status === "reconciled"
                    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400"
                    : "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300"
                }`}>
                  {e.status}
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Est. ${e.estimatedCost.toFixed(0)}{e.actualCost != null && ` — actual $${e.actualCost.toFixed(0)}`}
              </p>
              {canReconcile && e.status !== "reconciled" && (
                <div className="flex gap-2 pt-1">
                  <input
                    type="number"
                    inputMode="decimal"
                    placeholder="Actual cost"
                    value={reconcileValues[e.id] ?? ""}
                    onChange={(ev) => setReconcileValues((p) => ({ ...p, [e.id]: ev.target.value }))}
                    className="flex-1 min-h-[32px] rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-2 text-sm"
                  />
                  <button
                    onClick={() => reconcile(e.id)}
                    disabled={isPending}
                    className="px-3 min-h-[32px] rounded-lg bg-slate-100 dark:bg-slate-700 text-xs font-medium disabled:opacity-40"
                  >
                    Reconcile
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="space-y-2 shrink-0 pt-2 border-t border-slate-300 dark:border-slate-700">
          <input type="text" placeholder="Description (e.g. pump seal)" value={description} onChange={(e) => setDescription(e.target.value)} className={inp} />
          <input type="number" inputMode="decimal" placeholder="Estimated cost ($)" value={estimatedCost} onChange={(e) => setEstimatedCost(e.target.value)} className={inp} />
          <button
            onClick={submit}
            disabled={isPending || !description.trim() || !estimatedCost}
            className="w-full min-h-[44px] rounded-lg bg-amber-500 hover:bg-amber-600 text-white font-semibold text-sm disabled:opacity-40"
          >
            {isPending ? "Adding…" : "Add entry"}
          </button>
        </div>
      </div>
    </div>
  );
}

function JobActionButtons({ onMaterials, onLog, onEdit, onDelete }: {
  onMaterials: () => void;
  onLog: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <>
      <button onClick={onMaterials} aria-label="Materials & costs" title="Materials & costs" className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 hover:text-slate-900 dark:hover:text-slate-100">
        <Receipt className="w-3.5 h-3.5" />
      </button>
      <button onClick={onLog} aria-label="Communication log" title="Communication log" className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 hover:text-slate-900 dark:hover:text-slate-100">
        <MessageSquare className="w-3.5 h-3.5" />
      </button>
      <button onClick={onEdit} aria-label="Edit job" title="Edit job" className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 hover:text-slate-900 dark:hover:text-slate-100">
        <Pencil className="w-3.5 h-3.5" />
      </button>
      <button onClick={onDelete} aria-label="Delete job" title="Delete job" className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-slate-500 hover:text-red-600">
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </>
  );
}

// Shared by both the mobile card and desktop table row — same state,
// same modals (portaled to <body> so they render correctly regardless of
// whether the trigger lives inside a <div> or a <tr>), different layout.
function useJobCardState(job: Job) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [loggingOpen, setLoggingOpen] = useState(false);
  const [materialsOpen, setMaterialsOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function deleteJob() {
    setDeleteError(null);
    startTransition(async () => {
      const res = await fetch(`/api/jobs/${job.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setDeleteError(data?.error ?? "Failed to delete job. Try again.");
        return;
      }
      router.refresh();
    });
  }

  return {
    editing, setEditing, confirming, setConfirming, loggingOpen, setLoggingOpen,
    materialsOpen, setMaterialsOpen, deleteError, setDeleteError, isPending, deleteJob,
  };
}

function JobCardModals({ job, canEdit, state }: { job: Job; canEdit: boolean; state: ReturnType<typeof useJobCardState> }) {
  if (typeof document === "undefined") return null;
  return createPortal(
    <>
      {state.editing && <EditJobModal job={job} onClose={() => state.setEditing(false)} />}
      {state.loggingOpen && <CommunicationLogModal job={job} onClose={() => state.setLoggingOpen(false)} />}
      {state.materialsOpen && <MaterialsModal job={job} canReconcile={canEdit} onClose={() => state.setMaterialsOpen(false)} />}
    </>,
    document.body
  );
}

function JobCard({ job, canEdit }: { job: Job; canEdit: boolean }) {
  const state = useJobCardState(job);

  return (
    <>
      <div className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <Link href={`/jobs/${job.id}`} className="min-w-0 block hover:underline">
            <p className="font-semibold truncate">{job.customerName}</p>
            <p className="text-sm text-slate-500 truncate">{job.siteName}</p>
          </Link>
          <div className="flex items-center gap-2 shrink-0">
            <StatusBadge status={job.status as Status} />
            {canEdit && (
              <JobActionButtons
                onMaterials={() => state.setMaterialsOpen(true)}
                onLog={() => state.setLoggingOpen(true)}
                onEdit={() => state.setEditing(true)}
                onDelete={() => state.setConfirming(true)}
              />
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

        {state.confirming && (
          <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-3 py-3 space-y-2">
            <p className="text-sm text-red-700 dark:text-red-300 font-medium">Delete this job?</p>
            <p className="text-xs text-red-600 dark:text-red-400">This will remove all time entries and assignments.</p>
            {state.deleteError && <p className="text-xs text-red-700 dark:text-red-300 font-medium">{state.deleteError}</p>}
            <div className="flex gap-2">
              <button onClick={() => { state.setConfirming(false); state.setDeleteError(null); }} className="flex-1 min-h-[36px] rounded-lg border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-300">Cancel</button>
              <button onClick={state.deleteJob} disabled={state.isPending} className="flex-1 min-h-[36px] rounded-lg bg-red-600 text-white font-semibold text-sm disabled:opacity-40">
                {state.isPending ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        )}
      </div>
      <JobCardModals job={job} canEdit={canEdit} state={state} />
    </>
  );
}

// Desktop-only table row — same interactive state/modals as JobCard, laid
// out for a wide screen instead of a stacked card.
function JobRow({ job, canEdit }: { job: Job; canEdit: boolean }) {
  const state = useJobCardState(job);
  const pct = Math.min((job.loggedHours / job.quotedHours) * 100, 100);

  return (
    <>
      <tr className="hover:bg-slate-50 dark:hover:bg-slate-800/60">
        <td className="px-4 py-3 min-w-0">
          <Link href={`/jobs/${job.id}`} className="block hover:underline">
            <p className="font-semibold truncate">{job.customerName}</p>
            <p className="text-sm text-slate-500 truncate">{job.siteName}</p>
          </Link>
        </td>
        <td className="px-4 py-3">
          <StatusBadge status={job.status as Status} />
        </td>
        <td className="px-4 py-3 w-48">
          <div className="flex items-center justify-between text-xs mb-1">
            <span className={job.isOverQuota ? "text-red-600 font-semibold" : "text-slate-700 dark:text-slate-300"}>
              {job.loggedHours}h / {job.quotedHours}h{job.isOverQuota && " ⚠"}
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
            <div className={`h-full rounded-full ${job.isOverQuota ? "bg-red-500" : "bg-amber-400"}`} style={{ width: `${pct}%` }} />
          </div>
        </td>
        <td className="px-4 py-3 text-sm text-slate-500 max-w-[16rem] truncate">
          {job.crew.length > 0 ? job.crew.join(", ") : "—"}
        </td>
        <td className="px-4 py-3">
          {canEdit && (
            <div className="flex items-center gap-1 justify-end">
              <JobActionButtons
                onMaterials={() => state.setMaterialsOpen(true)}
                onLog={() => state.setLoggingOpen(true)}
                onEdit={() => state.setEditing(true)}
                onDelete={() => state.setConfirming(true)}
              />
            </div>
          )}
        </td>
      </tr>
      {state.confirming && (
        <tr>
          <td colSpan={5} className="px-4 py-3 bg-red-50 dark:bg-red-900/20 border-t border-red-200 dark:border-red-800">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm text-red-700 dark:text-red-300 font-medium">Delete this job?</p>
                <p className="text-xs text-red-600 dark:text-red-400">This will remove all time entries and assignments.{state.deleteError && ` ${state.deleteError}`}</p>
              </div>
              <div className="flex gap-2 shrink-0">
                <button onClick={() => { state.setConfirming(false); state.setDeleteError(null); }} className="min-h-[36px] px-3 rounded-lg border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-300">Cancel</button>
                <button onClick={state.deleteJob} disabled={state.isPending} className="min-h-[36px] px-3 rounded-lg bg-red-600 text-white font-semibold text-sm disabled:opacity-40">
                  {state.isPending ? "Deleting…" : "Delete"}
                </button>
              </div>
            </div>
          </td>
        </tr>
      )}
      <JobCardModals job={job} canEdit={canEdit} state={state} />
    </>
  );
}

interface JobsClientProps {
  jobs: Job[];
  canCreate: boolean;
}

export function JobsClient({ jobs, canCreate }: JobsClientProps) {
  const [showForm, setShowForm] = useState(false);
  const searchParams = useSearchParams();
  useEffect(() => {
    if (searchParams.get("new") === "1") setShowForm(true);
    // Only ever needs to fire once, on the params present at mount —
    // re-running on every searchParams change would re-open a form the
    // user just closed if any other param on this page changes later.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

      {jobs.length > 0 && (
        <>
          {/* Mobile / narrow screens: stacked cards */}
          <div className="lg:hidden space-y-3">
            {jobs.map((job) => (
              <JobCard key={job.id} job={job} canEdit={canCreate} />
            ))}
          </div>

          {/* Desktop: a real table instead of a stretched single-column list */}
          <div className="hidden lg:block overflow-x-auto rounded-xl border border-slate-300 dark:border-slate-700">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-300 dark:border-slate-700 text-left text-xs text-slate-500">
                  <th className="px-4 py-2.5 font-medium">Job</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5 font-medium">Hours</th>
                  <th className="px-4 py-2.5 font-medium">Crew</th>
                  <th className="px-4 py-2.5"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                {jobs.map((job) => (
                  <JobRow key={job.id} job={job} canEdit={canCreate} />
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

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
