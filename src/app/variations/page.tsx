"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
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

export default function VariationsPage() {
  const [variations, setVariations] = useState<Variation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/variations")
      .then((r) => r.json())
      .then((data) => {
        setVariations(data);
        setLoading(false);
      });
  }, []);

  function handleDecided(id: string) {
    setVariations((prev) => prev.filter((v) => v.id !== id));
  }

  return (
    <AppShell>
      <div className="max-w-lg mx-auto px-4 py-6 space-y-5">
        <div>
          <h1 className="text-xl font-semibold">Variations</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Pending approvals
          </p>
        </div>

        {loading && <p className="text-sm text-slate-500">Loading…</p>}

        {!loading && variations.length === 0 && (
          <p className="text-sm text-slate-500">No pending variations.</p>
        )}

        <div className="space-y-4">
          {variations.map((v) => (
            <VariationCard key={v.id} variation={v} onDecided={handleDecided} />
          ))}
        </div>
      </div>
    </AppShell>
  );
}
