"use client";

import { useState, useTransition } from "react";
import { Plus, X, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";

interface LineItem {
  description: string;
  qty: string;
  unitPrice: string;
}

const emptyLine = (): LineItem => ({ description: "", qty: "1", unitPrice: "" });

export function NewQuoteButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [siteName, setSiteName] = useState("");
  const [jobType, setJobType] = useState("");
  const [lines, setLines] = useState<LineItem[]>([emptyLine()]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const total = lines.reduce((sum, l) => sum + (parseFloat(l.qty) || 0) * (parseFloat(l.unitPrice) || 0), 0);

  function updateLine(i: number, field: keyof LineItem, value: string) {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, [field]: value } : l)));
  }

  function reset() {
    setCustomerName("");
    setSiteName("");
    setJobType("");
    setLines([emptyLine()]);
    setError(null);
  }

  function save() {
    startTransition(async () => {
      setError(null);
      const lineItems = lines
        .filter((l) => l.description.trim())
        .map((l) => ({ description: l.description, qty: parseFloat(l.qty) || 0, unitPrice: parseFloat(l.unitPrice) || 0 }));

      const res = await fetch("/api/quotes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerName, siteName, jobType, lineItems }),
      });
      if (!res.ok) { setError((await res.json()).error ?? "Failed to create quote."); return; }
      reset();
      setOpen(false);
      router.refresh();
    });
  }

  const inp = "w-full min-h-[44px] rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 text-base";

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 min-h-[44px] px-4 rounded-lg bg-amber-500 hover:bg-amber-600 text-white font-semibold text-sm"
      >
        <Plus className="w-4 h-4" />
        New quote
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40">
          <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-slate-900 p-6 space-y-4 shadow-xl max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between shrink-0">
              <h2 className="text-lg font-semibold">New quote</h2>
              <button onClick={() => setOpen(false)} className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"><X className="w-5 h-5" /></button>
            </div>

            <div className="overflow-y-auto space-y-3">
              <input type="text" placeholder="Customer name" value={customerName} onChange={(e) => setCustomerName(e.target.value)} className={inp} />
              <input type="text" placeholder="Site name" value={siteName} onChange={(e) => setSiteName(e.target.value)} className={inp} />
              <input type="text" placeholder="Job type (e.g. Annual service)" value={jobType} onChange={(e) => setJobType(e.target.value)} className={inp} />

              <div className="space-y-2">
                <label className="text-sm font-medium">Line items</label>
                {lines.map((line, i) => (
                  <div key={i} className="flex gap-2">
                    <input type="text" placeholder="Description" value={line.description} onChange={(e) => updateLine(i, "description", e.target.value)} className={`${inp} flex-1`} />
                    <input type="number" placeholder="Qty" value={line.qty} onChange={(e) => updateLine(i, "qty", e.target.value)} className={`${inp} w-16`} />
                    <input type="number" inputMode="decimal" placeholder="$/unit" value={line.unitPrice} onChange={(e) => updateLine(i, "unitPrice", e.target.value)} className={`${inp} w-24`} />
                    {lines.length > 1 && (
                      <button onClick={() => setLines((p) => p.filter((_, idx) => idx !== i))} className="p-2 text-slate-400 hover:text-red-600">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
                <button onClick={() => setLines((p) => [...p, emptyLine()])} className="text-xs font-medium text-amber-600 dark:text-amber-400 hover:underline">
                  + Add line item
                </button>
              </div>

              <p className="text-sm font-semibold text-right">Total: ${total.toFixed(2)}</p>
              {error && <p className="text-sm text-red-600">{error}</p>}
            </div>

            <button
              onClick={save}
              disabled={isPending || !customerName.trim() || !siteName.trim() || !jobType.trim() || total <= 0}
              className="w-full min-h-[44px] rounded-lg bg-amber-500 hover:bg-amber-600 text-white font-semibold text-sm disabled:opacity-40 shrink-0"
            >
              {isPending ? "Saving…" : "Save as draft"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
