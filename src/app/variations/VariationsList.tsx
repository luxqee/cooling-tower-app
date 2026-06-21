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

interface VariationsListProps {
  initialVariations: Variation[];
}

export function VariationsList({ initialVariations }: VariationsListProps) {
  const [variations, setVariations] = useState(initialVariations);

  function handleDecided(id: string) {
    setVariations((prev) => prev.filter((v) => v.id !== id));
  }

  if (variations.length === 0) {
    return <p className="text-sm text-slate-500">No pending variations.</p>;
  }

  return (
    <div className="space-y-4">
      {variations.map((v) => (
        <VariationCard key={v.id} variation={v} onDecided={handleDecided} />
      ))}
    </div>
  );
}
