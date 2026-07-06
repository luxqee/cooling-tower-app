"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";

export function NewJobForm({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [jobTypeOptions, setJobTypeOptions] = useState<string[]>([]);

  const [jobTypeSelect, setJobTypeSelect] = useState("");

  const [fields, setFields] = useState({
    customerName: "",
    siteName: "",
    siteAddress: "",
    quotedHours: "",
    jobType: "",
    status: "scheduled" as "scheduled" | "active",
  });

  useEffect(() => {
    fetch("/api/quotes/job-types")
      .then((r) => (r.ok ? r.json() : { jobTypes: [] }))
      .then((d) => setJobTypeOptions(d.jobTypes ?? []));
  }, []);

  function set(key: keyof typeof fields, value: string) {
    setFields((prev) => ({ ...prev, [key]: value }));
  }

  function handleSubmit() {
    const newErrors: Record<string, string> = {};
    if (fields.customerName.length < 2) newErrors.customerName = "Required";
    if (fields.siteName.length < 2) newErrors.siteName = "Required";
    if (fields.siteAddress.length < 5) newErrors.siteAddress = "Required";
    const hours = parseFloat(fields.quotedHours);
    if (!fields.quotedHours || isNaN(hours) || hours <= 0)
      newErrors.quotedHours = "Enter hours greater than 0";
    if (!fields.jobType.trim()) newErrors.jobType = "Required";
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }
    setErrors({});

    startTransition(async () => {
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...fields, quotedHours: hours }),
      });
      if (!res.ok) {
        const data = await res.json();
        setErrors({ submit: data.error ?? "Failed to create job." });
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
      <div className="space-y-1.5">
        <label className="text-sm font-medium">Customer name</label>
        <input
          type="text"
          value={fields.customerName}
          onChange={(e) => set("customerName", e.target.value)}
          placeholder="Acme Corp"
          className={inputClass}
        />
        {errors.customerName && <p className="text-sm text-red-600">{errors.customerName}</p>}
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium">Site name</label>
        <input
          type="text"
          value={fields.siteName}
          onChange={(e) => set("siteName", e.target.value)}
          placeholder="North cooling tower"
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
      </div>

      {errors.submit && <p className="text-sm text-red-600">{errors.submit}</p>}

      <div className="flex gap-3 pt-1">
        <button
          onClick={onClose}
          className="flex-1 min-h-[48px] rounded-lg border border-slate-300 dark:border-slate-600 text-sm font-medium"
        >
          Cancel
        </button>
        <button
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
