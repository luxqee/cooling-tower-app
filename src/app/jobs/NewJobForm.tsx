"use client";

import { useState, useTransition, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

interface CustomerOption {
  id:   string;
  name: string;
}

export function NewJobForm({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [jobTypeOptions, setJobTypeOptions] = useState<string[]>([]);
  const [jobTypeSelect, setJobTypeSelect] = useState("");

  // Customer search-and-select
  const [customerQuery, setCustomerQuery]   = useState("");
  const [customerId, setCustomerId]         = useState<string | null>(null);
  const [suggestions, setSuggestions]       = useState<CustomerOption[]>([]);
  const [showDropdown, setShowDropdown]     = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [fields, setFields] = useState({
    siteName:    "",
    siteAddress: "",
    quotedHours: "",
    quotedCost:  "",
    jobType:     "",
    status:      "scheduled" as "scheduled" | "active",
  });

  const [aiFlags, setAiFlags] = useState<{ field: string; severity: string; message: string; suggestion: string | null }[]>([]);

  // AI validation check — debounced, fires after the user pauses typing.
  useEffect(() => {
    const hasMinimumFields = fields.siteName.length >= 2 && fields.siteAddress.length >= 5 && fields.quotedHours;
    const customerName = customerId ? customerQuery : customerQuery.trim();
    if (!hasMinimumFields || customerName.length < 2) {
      setAiFlags([]);
      return;
    }
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      fetch("/api/ai/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: ctrl.signal,
        body: JSON.stringify({
          customerName,
          siteName: fields.siteName,
          siteAddress: fields.siteAddress,
          jobType: fields.jobType,
          quotedHours: parseFloat(fields.quotedHours) || 0,
          quotedCost: fields.quotedCost ? parseFloat(fields.quotedCost) : undefined,
        }),
      })
        .then((r) => (r.ok ? r.json() : { flags: [] }))
        .then((d) => setAiFlags(d.flags ?? []))
        .catch(() => {});
    }, 800);
    return () => { clearTimeout(timer); ctrl.abort(); };
  }, [fields.siteName, fields.siteAddress, fields.jobType, fields.quotedHours, fields.quotedCost, customerId, customerQuery]);

  useEffect(() => {
    fetch("/api/quotes/job-types")
      .then((r) => (r.ok ? r.json() : { jobTypes: [] }))
      .then((d) => setJobTypeOptions(d.jobTypes ?? []));
  }, []);

  // Debounced customer search
  useEffect(() => {
    if (customerId) return;
    if (customerQuery.trim().length < 2) {
      setSuggestions([]);
      setShowDropdown(false);
      return;
    }
    const ctrl  = new AbortController();
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

  // Close dropdown on outside click
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

  function set(key: keyof typeof fields, value: string) {
    setFields((prev) => ({ ...prev, [key]: value }));
  }

  function handleSubmit() {
    const newErrors: Record<string, string> = {};
    if (!customerId && customerQuery.trim().length < 2) newErrors.customer = "Customer name required";
    if (fields.siteName.length < 2)    newErrors.siteName    = "Required";
    if (fields.siteAddress.length < 5) newErrors.siteAddress = "Required";
    const hours = parseFloat(fields.quotedHours);
    if (!fields.quotedHours || isNaN(hours) || hours <= 0)
      newErrors.quotedHours = "Enter hours greater than 0";
    const cost = fields.quotedCost ? parseFloat(fields.quotedCost) : undefined;
    if (fields.quotedCost && (isNaN(cost!) || cost! < 0))
      newErrors.quotedCost = "Enter a valid dollar amount";
    if (!fields.jobType.trim()) newErrors.jobType = "Required";
    if (Object.keys(newErrors).length > 0) { setErrors(newErrors); return; }
    setErrors({});

    startTransition(async () => {
      const body: Record<string, unknown> = {
        ...fields,
        quotedHours: hours,
        quotedCost:  cost,
      };
      if (customerId) {
        body.customerId = customerId;
      } else {
        body.customerName = customerQuery.trim();
      }

      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setErrors({ submit: (data as { error?: string }).error ?? "Failed to create job." });
        return;
      }
      router.refresh();
      onClose();
    });
  }

  const inputClass =
    "w-full min-h-[44px] rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 text-base";

  return (
    <div className="space-y-4">
      {/* Customer search-and-select */}
      <div className="space-y-1.5" ref={dropdownRef}>
        <label className="text-sm font-medium">Customer name</label>
        <div className="relative">
          <input
            type="text"
            value={customerQuery}
            onChange={(e) => { if (!customerId) setCustomerQuery(e.target.value); }}
            onFocus={() => { if (!customerId && suggestions.length > 0) setShowDropdown(true); }}
            placeholder={customerId ? "" : "Search or type a name…"}
            readOnly={!!customerId}
            className={`${inputClass} pr-10 ${customerId ? "bg-slate-50 dark:bg-slate-800 cursor-default" : ""}`}
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
        {errors.customer && <p className="text-sm text-red-600">{errors.customer}</p>}
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium">Site name</label>
        <input
          type="text"
          value={fields.siteName}
          onChange={(e) => set("siteName", e.target.value)}
          placeholder="North wing"
          className={inputClass}
        />
        {errors.siteName && <p className="text-sm text-red-600">{errors.siteName}</p>}
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium">Site address</label>
        <input
          type="text"
          value={fields.siteAddress}
          onChange={(e) => set("siteAddress", e.target.value)}
          placeholder="123 Main St, Sydney NSW 2000"
          className={inputClass}
        />
        {errors.siteAddress && <p className="text-sm text-red-600">{errors.siteAddress}</p>}
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium">Job type</label>
        <select
          value={jobTypeSelect}
          onChange={(e) => {
            setJobTypeSelect(e.target.value);
            if (e.target.value !== "other") set("jobType", e.target.value);
            else set("jobType", "");
          }}
          className={inputClass}
        >
          <option value="">Select a job type…</option>
          {jobTypeOptions.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
          <option value="other">Other…</option>
        </select>
        {jobTypeSelect === "other" && (
          <input
            type="text"
            value={fields.jobType}
            onChange={(e) => set("jobType", e.target.value)}
            placeholder="Enter job type"
            className={inputClass}
          />
        )}
        {errors.jobType && <p className="text-sm text-red-600">{errors.jobType}</p>}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Quoted hours</label>
          <input
            type="number"
            inputMode="decimal"
            value={fields.quotedHours}
            onChange={(e) => set("quotedHours", e.target.value)}
            placeholder="8"
            className={inputClass}
          />
          {errors.quotedHours && <p className="text-sm text-red-600">{errors.quotedHours}</p>}
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium">
            Quoted cost ($) <span className="font-normal text-slate-500">optional</span>
          </label>
          <input
            type="number"
            inputMode="decimal"
            value={fields.quotedCost}
            onChange={(e) => set("quotedCost", e.target.value)}
            placeholder="1200"
            className={inputClass}
          />
          {errors.quotedCost && <p className="text-sm text-red-600">{errors.quotedCost}</p>}
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium">Status</label>
        <select
          value={fields.status}
          onChange={(e) => set("status", e.target.value as "scheduled" | "active")}
          className={inputClass}
        >
          <option value="scheduled">Scheduled</option>
          <option value="active">Active</option>
        </select>
      </div>

      {aiFlags.map((flag, i) => (
        <div key={i} className="rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 px-3 py-2 space-y-0.5">
          <p className="text-sm text-amber-800 dark:text-amber-300">{flag.message}</p>
          {flag.suggestion && <p className="text-xs text-amber-600 dark:text-amber-400">{flag.suggestion}</p>}
        </div>
      ))}

      {errors.submit && <p className="text-sm text-red-600">{errors.submit}</p>}

      <div className="flex gap-3 pt-1">
        <button
          type="button"
          onClick={onClose}
          className="flex-1 min-h-[48px] rounded-lg border border-slate-300 dark:border-slate-600 text-sm font-medium"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={isPending}
          className="flex-1 min-h-[48px] rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-semibold text-sm disabled:opacity-40"
        >
          {isPending ? "Creating…" : "Create job"}
        </button>
      </div>
    </div>
  );
}
