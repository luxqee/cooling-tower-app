"use client";

import { useState, useTransition } from "react";
import { cn } from "@/lib/utils/cn";

function photoSrc(url: string) {
  return `/api/photos?url=${encodeURIComponent(url)}`;
}

interface Variation {
  id: string;
  description: string;
  costEstimate: number;
  photoUrl: string | null;
  submittedAt: string;
  technician: { name: string };
  job: { customerName: string; siteName: string };
}

interface VariationCardProps {
  variation: Variation;
  onDecided: (id: string) => void;
}

export function VariationCard({ variation, onDecided }: VariationCardProps) {
  const [action, setAction] = useState<"approved" | "rejected" | "queried" | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSelect(a: "approved" | "rejected" | "queried") {
    setAction(a);
    setError(null);
  }

  function handleSubmit() {
    if (!action) return;
    if ((action === "rejected" || action === "queried") && reason.length < 10) {
      setError("Provide at least 10 characters.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/variations/${variation.id}/decision`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision: action, decisionReason: reason || undefined }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Failed to save decision.");
        return;
      }
      onDecided(variation.id);
    });
  }

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 overflow-hidden">
      <div className="px-4 py-4 space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-semibold">{variation.technician.name}</p>
            <p className="text-sm text-slate-500">
              {variation.job.customerName} — {variation.job.siteName}
            </p>
          </div>
          <p className="text-lg font-semibold text-amber-500 shrink-0">
            ${Number(variation.costEstimate).toFixed(2)}
          </p>
        </div>
        <p className="text-sm leading-relaxed">{variation.description}</p>
        <p className="text-xs text-slate-400 font-mono">
          {new Date(variation.submittedAt).toLocaleString("en-AU")}
        </p>
      </div>

      {variation.photoUrl && (
        <div className="w-full bg-slate-100 dark:bg-slate-900 overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={photoSrc(variation.photoUrl)}
            alt="Variation photo"
            className="w-full max-h-64 object-contain"
          />
        </div>
      )}

      <div className="px-4 py-4 space-y-3 border-t border-slate-100 dark:border-slate-700">
        <div className="flex gap-2">
          {(["approved", "rejected", "queried"] as const).map((a) => (
            <button
              key={a}
              onClick={() => handleSelect(a)}
              className={cn(
                "flex-1 min-h-[44px] rounded-lg text-sm font-medium capitalize border transition-colors",
                action === a
                  ? a === "approved"
                    ? "bg-emerald-600 text-white border-emerald-600"
                    : a === "rejected"
                      ? "bg-red-600 text-white border-red-600"
                      : "bg-slate-600 text-white border-slate-600"
                  : "border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-300 bg-transparent"
              )}
            >
              {a === "queried" ? "Send back" : a}
            </button>
          ))}
        </div>

        {(action === "rejected" || action === "queried") && (
          <div className="space-y-1">
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={
                action === "rejected"
                  ? "Reason for rejection…"
                  : "What do you need to clarify?"
              }
              rows={3}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm resize-none"
            />
            {error && <p className="text-xs text-red-600">{error}</p>}
          </div>
        )}

        {action && (
          <button
            onClick={handleSubmit}
            disabled={isPending}
            className="w-full min-h-[44px] rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 font-semibold text-sm disabled:opacity-50"
          >
            {isPending ? "Saving…" : `Confirm ${action}`}
          </button>
        )}
      </div>
    </div>
  );
}
