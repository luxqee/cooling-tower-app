"use client";

import { useState } from "react";
import Link from "next/link";

interface InvoiceRow {
  id: string;
  invoiceNumber: string | null;
  status: "draft" | "sent" | "paid";
  totalAmount: number;
  sentAt: string | null;
  paidAt: string | null;
  createdAt: string;
  job: { id: string; customerName: string; siteName: string; jobType: string };
}

interface InvoiceListProps {
  invoices: InvoiceRow[];
}

type Tab = "all" | "draft" | "sent" | "paid";

const STATUS_BADGE: Record<string, string> = {
  draft: "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300",
  sent:  "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  paid:  "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400",
};

export function InvoiceList({ invoices }: InvoiceListProps) {
  const [tab, setTab] = useState<Tab>("all");

  const filtered = tab === "all" ? invoices : invoices.filter((inv) => inv.status === tab);

  const tabs: { key: Tab; label: string }[] = [
    { key: "all",   label: `All (${invoices.length})` },
    { key: "draft", label: `Draft (${invoices.filter((i) => i.status === "draft").length})` },
    { key: "sent",  label: `Sent (${invoices.filter((i) => i.status === "sent").length})` },
    { key: "paid",  label: `Paid (${invoices.filter((i) => i.status === "paid").length})` },
  ];

  return (
    <div className="space-y-4">
      {/* Status tabs */}
      <div className="flex gap-1 border-b border-slate-200 dark:border-slate-700">
        {tabs.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === key
                ? "border-amber-500 text-amber-600 dark:text-amber-400"
                : "border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {filtered.length === 0 && (
        <p className="text-sm text-slate-500 dark:text-slate-400 py-4">No invoices in this category.</p>
      )}

      {/* Table */}
      {filtered.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-700">
                {["Invoice #", "Customer — Site", "Job type", "Total", "Status", "Date"].map((h) => (
                  <th key={h} className="pb-2 pr-4 text-left text-xs font-medium text-slate-500 dark:text-slate-400 whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((inv) => (
                <tr key={inv.id} className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40">
                  <td className="py-3 pr-4">
                    <Link href={`/invoices/${inv.id}`} className="font-mono text-amber-600 dark:text-amber-400 hover:underline">
                      {inv.invoiceNumber ?? "—"}
                    </Link>
                  </td>
                  <td className="py-3 pr-4">
                    <Link href={`/invoices/${inv.id}`} className="hover:underline">
                      {inv.job.customerName} — {inv.job.siteName}
                    </Link>
                  </td>
                  <td className="py-3 pr-4 text-slate-500">{inv.job.jobType}</td>
                  <td className="py-3 pr-4 font-semibold">${inv.totalAmount.toFixed(2)}</td>
                  <td className="py-3 pr-4">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${STATUS_BADGE[inv.status]}`}>
                      {inv.status}
                    </span>
                  </td>
                  <td className="py-3 pr-4 text-slate-500">
                    {new Date(inv.createdAt).toLocaleDateString("en-AU")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
