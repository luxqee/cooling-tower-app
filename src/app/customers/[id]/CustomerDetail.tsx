"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CustomerForm } from "../CustomerForm";

interface CustomerProps {
  id:            string;
  name:          string;
  abn:           string | null;
  contactPerson: string | null;
  email:         string | null;
  phone:         string | null;
  address:       string | null;
  notes:         string | null;
}

interface JobRow {
  id:           string;
  customerName: string;
  siteName:     string;
  status:       "scheduled" | "active" | "complete" | "cancelled";
  createdAt:    string;
  jobType:      string;
}

interface AssetRow {
  id:           string;
  serialNumber: string;
  assetType:    string;
  location:     string | null;
}

interface CustomerDetailProps {
  customer:        CustomerProps;
  jobs:            JobRow[];
  assets:          AssetRow[];
  canEdit:         boolean;
  canManageAssets: boolean;
}

function AssetsSection({ customerId, assets, canManage }: { customerId: string; assets: AssetRow[]; canManage: boolean }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [serialNumber, setSerialNumber] = useState("");
  const [assetType, setAssetType] = useState("");
  const [location, setLocation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      setError(null);
      const res = await fetch("/api/assets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerId, serialNumber, assetType, location: location || undefined }),
      });
      if (!res.ok) { setError((await res.json()).error ?? "Failed to add asset."); return; }
      setSerialNumber("");
      setAssetType("");
      setLocation("");
      setAdding(false);
      router.refresh();
    });
  }

  const inp = "w-full min-h-[40px] rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 text-sm";

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-slate-700 dark:text-slate-300">
          Assets ({assets.length})
        </h2>
        {canManage && !adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="text-xs font-medium text-amber-600 dark:text-amber-400 hover:underline"
          >
            + Add asset
          </button>
        )}
      </div>

      {adding && (
        <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-3 space-y-2">
          <input type="text" placeholder="Serial number" value={serialNumber} onChange={(e) => setSerialNumber(e.target.value)} className={inp} />
          <input type="text" placeholder="Asset type (e.g. BAC VT1-40)" value={assetType} onChange={(e) => setAssetType(e.target.value)} className={inp} />
          <input type="text" placeholder="Location (optional)" value={location} onChange={(e) => setLocation(e.target.value)} className={inp} />
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button type="button" onClick={() => setAdding(false)} className="flex-1 min-h-[36px] rounded-lg border border-slate-300 dark:border-slate-600 text-sm">Cancel</button>
            <button
              type="button"
              onClick={save}
              disabled={isPending || !serialNumber.trim() || !assetType.trim()}
              className="flex-1 min-h-[36px] rounded-lg bg-amber-500 hover:bg-amber-600 text-white font-semibold text-sm disabled:opacity-40"
            >
              {isPending ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      )}

      {assets.length === 0 && !adding && (
        <p className="text-sm text-slate-500 dark:text-slate-400">No assets recorded for this customer yet.</p>
      )}
      {assets.length > 0 && (
        <div className="rounded-lg border border-slate-200 dark:border-slate-700 divide-y divide-slate-200 dark:divide-slate-700">
          {assets.map((a) => (
            <div key={a.id} className="px-4 py-2.5 text-sm flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium truncate">{a.serialNumber}</p>
                <p className="text-xs text-slate-500 truncate">{a.assetType}{a.location ? ` — ${a.location}` : ""}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const STATUS_BADGE: Record<string, string> = {
  scheduled: "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300",
  active:    "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  complete:  "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400",
  cancelled: "bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400",
};

export function CustomerDetail({ customer, jobs, assets, canEdit, canManageAssets }: CustomerDetailProps) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <div className="space-y-6">
        <h1 className="text-xl font-semibold">{customer.name}</h1>
        <CustomerForm
          initial={customer}
          onSave={() => setEditing(false)}
          onCancel={() => setEditing(false)}
        />
      </div>
    );
  }

  const contactFields = [
    { label: "ABN",            value: customer.abn },
    { label: "Contact person", value: customer.contactPerson },
    { label: "Email",          value: customer.email },
    { label: "Phone",          value: customer.phone },
    { label: "Address",        value: customer.address },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">{customer.name}</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Customer record</p>
        </div>
        {canEdit && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="px-4 min-h-[38px] rounded-lg border border-slate-300 dark:border-slate-600 text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-800 shrink-0"
          >
            Edit
          </button>
        )}
      </div>

      {/* Contact details */}
      <div className="rounded-lg border border-slate-200 dark:border-slate-700 divide-y divide-slate-200 dark:divide-slate-700">
        {contactFields.map(({ label, value }) => (
          <div key={label} className="flex px-4 py-3 text-sm">
            <span className="w-36 text-slate-500 dark:text-slate-400 shrink-0">{label}</span>
            <span className="text-slate-900 dark:text-slate-100 break-all">{value ?? "—"}</span>
          </div>
        ))}
      </div>

      {/* Notes */}
      {customer.notes && (
        <div className="space-y-1.5">
          <h2 className="text-sm font-medium text-slate-700 dark:text-slate-300">Notes</h2>
          <p className="text-sm text-slate-600 dark:text-slate-400 whitespace-pre-wrap bg-slate-50 dark:bg-slate-800/50 rounded-lg px-4 py-3">
            {customer.notes}
          </p>
        </div>
      )}

      <AssetsSection customerId={customer.id} assets={assets} canManage={canManageAssets} />

      {/* Linked jobs */}
      <div className="space-y-2">
        <h2 className="text-sm font-medium text-slate-700 dark:text-slate-300">
          Linked jobs ({jobs.length})
        </h2>
        {jobs.length === 0 && (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            No jobs linked to this customer yet.
          </p>
        )}
        {jobs.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700">
                  {["Site", "Type", "Status", "Created"].map((h) => (
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
                {jobs.map((j) => (
                  <tr
                    key={j.id}
                    className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40"
                  >
                    <td className="py-3 pr-4">
                      <Link
                        href={`/jobs/${j.id}`}
                        className="text-amber-600 dark:text-amber-400 hover:underline"
                      >
                        {j.siteName}
                      </Link>
                    </td>
                    <td className="py-3 pr-4 text-slate-500">{j.jobType}</td>
                    <td className="py-3 pr-4">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${STATUS_BADGE[j.status]}`}>
                        {j.status}
                      </span>
                    </td>
                    <td className="py-3 pr-4 text-slate-500">
                      {new Date(j.createdAt).toLocaleDateString("en-AU")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
