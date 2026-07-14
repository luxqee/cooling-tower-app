"use client";

import { useState, useTransition, useEffect, useRef } from "react";
import { Plus, X, Trash2 } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";

interface LineItem {
  description: string;
  qty: string;
  unitPrice: string;
}

interface CustomerOption {
  id: string;
  name: string;
}

const emptyLine = (): LineItem => ({ description: "", qty: "1", unitPrice: "" });

export function NewQuoteButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const searchParams = useSearchParams();
  useEffect(() => {
    if (searchParams.get("new") === "1") setOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Customer search-and-select (same pattern as NewJobForm)
  const [customerQuery, setCustomerQuery] = useState("");
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<CustomerOption[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [siteName, setSiteName] = useState("");
  const [jobType, setJobType] = useState("");
  const [lines, setLines] = useState<LineItem[]>([emptyLine()]);
  const [isPending, startTransition] = useTransition();

  const total = lines.reduce((sum, l) => sum + (parseFloat(l.qty) || 0) * (parseFloat(l.unitPrice) || 0), 0);

  useEffect(() => {
    if (customerId) return;
    if (customerQuery.trim().length < 2) {
      setSuggestions([]);
      setShowDropdown(false);
      return;
    }
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      fetch(`/api/customers?q=${encodeURIComponent(customerQuery.trim())}`, { signal: ctrl.signal })
        .then((r) => (r.ok ? r.json() : []))
        .then((data: CustomerOption[]) => {
          setSuggestions(data);
          setShowDropdown(data.length > 0);
        })
        .catch(() => {});
    }, 200);
    return () => { clearTimeout(timer); ctrl.abort(); };
  }, [customerQuery, customerId]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function selectCustomer(option: CustomerOption) {
    setCustomerId(option.id);
    setCustomerQuery(option.name);
    setSuggestions([]);
    setShowDropdown(false);
  }

  function clearCustomer() {
    setCustomerId(null);
    setCustomerQuery("");
    setSuggestions([]);
    setShowDropdown(false);
  }

  function updateLine(i: number, field: keyof LineItem, value: string) {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, [field]: value } : l)));
  }

  function reset() {
    clearCustomer();
    setSiteName("");
    setJobType("");
    setLines([emptyLine()]);
  }

  function save() {
    startTransition(async () => {
      const lineItems = lines
        .filter((l) => l.description.trim())
        .map((l) => ({ description: l.description, qty: parseFloat(l.qty) || 0, unitPrice: parseFloat(l.unitPrice) || 0 }));

      const body: Record<string, unknown> = { siteName, jobType, lineItems };
      if (customerId) {
        body.customerId = customerId;
      } else {
        body.customerName = customerQuery.trim();
      }

      const res = await fetch("/api/quotes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) { toast.error((await res.json()).error ?? "Failed to create quote."); return; }
      reset();
      setOpen(false);
      router.refresh();
    });
  }

  const inp = "w-full min-h-[44px] rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 text-base";
  const hasCustomer = customerId ? true : customerQuery.trim().length > 0;

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
              <button onClick={() => setOpen(false)} className="h-11 w-11 flex items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"><X className="w-5 h-5" /></button>
            </div>

            <div className="overflow-y-auto space-y-3">
              <div className="relative" ref={dropdownRef}>
                <input
                  type="text"
                  value={customerQuery}
                  onChange={(e) => { if (!customerId) setCustomerQuery(e.target.value); }}
                  onFocus={() => { if (!customerId && suggestions.length > 0) setShowDropdown(true); }}
                  placeholder={customerId ? "" : "Customer name — search or type"}
                  readOnly={!!customerId}
                  className={`${inp} pr-10 ${customerId ? "bg-slate-50 dark:bg-slate-800 cursor-default" : ""}`}
                />
                {customerId && (
                  <button
                    type="button"
                    onClick={clearCustomer}
                    aria-label="Clear customer"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-600 dark:hover:text-slate-200 text-lg leading-none"
                  >
                    ✕
                  </button>
                )}
                {showDropdown && (
                  <ul className="absolute z-20 mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg max-h-48 overflow-y-auto">
                    {suggestions.map((s) => (
                      <li key={s.id}>
                        <button
                          type="button"
                          onClick={() => selectCustomer(s)}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-800"
                        >
                          {s.name}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
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
                      <button onClick={() => setLines((p) => p.filter((_, idx) => idx !== i))} className="p-2 text-slate-500 hover:text-red-600">
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
            </div>

            <button
              onClick={save}
              disabled={isPending || !hasCustomer || !siteName.trim() || !jobType.trim() || total <= 0}
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
