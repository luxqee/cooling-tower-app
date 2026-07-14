"use client";

import { useState } from "react";
import { VariationCard } from "./VariationCard";

interface Variation {
  id: string;
  description: string;
  costEstimate: number;
  photoUrl: string | null;
  submittedAt: string;
  technician: { name: string };
  job: { customerName: string; siteName: string };
}

interface DecidedVariation {
  id: string;
  description: string;
  costEstimate: number;
  status: "approved" | "rejected" | "queried";
  decisionReason: string | null;
  decidedAt: string | null;
  submittedAt: string;
  technician: { name: string };
  job: { customerName: string; siteName: string };
}

interface VariationsListProps {
  initialVariations: Variation[];
  decidedVariations: DecidedVariation[];
}

const STATUS_STYLES: Record<string, string> = {
  approved: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400",
  rejected: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400",
  queried: "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300",
};

const STATUS_LABEL: Record<string, string> = {
  approved: "Approved",
  rejected: "Rejected",
  queried: "Sent back",
};

export function VariationsList({ initialVariations, decidedVariations }: VariationsListProps) {
  const [variations, setVariations] = useState(initialVariations);

  function handleDecided(id: string) {
    setVariations((prev) => prev.filter((v) => v.id !== id));
  }

  return (
    <div className="space-y-8">
      {/* Pending */}
      <section className="space-y-4">
        {variations.length === 0 ? (
          <p className="text-sm text-slate-500">No pending variations.</p>
        ) : (
          variations.map((v) => (
            <VariationCard key={v.id} variation={v} onDecided={handleDecided} />
          ))
        )}
      </section>

      {/* History */}
      {decidedVariations.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-base font-semibold text-slate-700 dark:text-slate-300 border-t border-slate-300 dark:border-slate-700 pt-6">
            History
          </h2>
          <div className="space-y-3">
            {decidedVariations.map((v) => (
              <div
                key={v.id}
                className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-4 space-y-2"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-sm">{v.technician.name}</p>
                    <p className="text-xs text-slate-500">
                      {v.job.customerName} — {v.job.siteName}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-base font-semibold text-slate-700 dark:text-slate-200">
                      ${v.costEstimate.toFixed(0)}
                    </span>
                    <span
                      className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_STYLES[v.status]}`}
                    >
                      {STATUS_LABEL[v.status]}
                    </span>
                  </div>
                </div>
                <p className="text-sm text-slate-600 dark:text-slate-400">{v.description}</p>
                {v.decisionReason && (
                  <p className="text-xs text-slate-500 italic border-l-2 border-slate-300 dark:border-slate-600 pl-2">
                    {v.decisionReason}
                  </p>
                )}
                <p className="text-xs text-slate-500 font-mono">
                  {v.decidedAt
                    ? new Date(v.decidedAt).toLocaleString("en-AU")
                    : new Date(v.submittedAt).toLocaleString("en-AU")}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
