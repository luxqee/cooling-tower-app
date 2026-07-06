"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { SignatureCanvas } from "./SignatureCanvas";
import type { TemplateSections, DocumentValues } from "@/lib/compliance/types";

interface Job      { id: string; customerName: string; siteName: string; }
interface Template { id: string; name: string; type: string; sections: unknown; }

interface ComplianceFormProps {
  jobs:      Job[];
  templates: Template[];
}

type Step = "job" | "template" | "form";

const TYPE_LABELS: Record<string, string>  = { swms: "SWMS", jsa: "JSA", whs: "WHS" };
const TYPE_COLOURS: Record<string, string> = {
  swms: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  jsa:  "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  whs:  "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
};

export function ComplianceForm({ jobs, templates }: ComplianceFormProps) {
  const router = useRouter();
  const [step, setStep]               = useState<Step>("job");
  const [jobId, setJobId]             = useState("");
  const [template, setTemplate]       = useState<Template | null>(null);
  const [values, setValues]           = useState<DocumentValues>({});
  const [error, setError]             = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPending, startTransition]  = useTransition();

  function setValue(fieldId: string, value: DocumentValues[string]) {
    setValues((prev) => ({ ...prev, [fieldId]: value }));
  }

  function submit() {
    if (!template || !jobId) return;
    setError(null);

    // Fix 3: Validate required fields before submitting
    const sections = Array.isArray(template?.sections) ? (template.sections as TemplateSections) : [];
    const missingRequired = sections.flatMap(s => s.fields)
      .filter(f => f.required)
      .filter(f => {
        const val = values[f.id];
        if (val === null || val === undefined || val === "" || val === false) return true;
        if (Array.isArray(val) && val.length === 0) return true;
        return false;
      });
    if (missingRequired.length > 0) {
      setError(`Please fill in all required fields: ${missingRequired.map(f => f.label).join(", ")}`);
      return;
    }

    setIsSubmitting(true);
    startTransition(async () => {
      try {
        const res = await fetch("/api/compliance/documents", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jobId, templateId: template.id, values }),
        });
        if (!res.ok) {
          let errorMsg = "Failed to submit. Please try again.";
          try {
            const data = await res.json();
            errorMsg = data?.error ?? errorMsg;
          } catch {
            // non-JSON body, use default message
          }
          setError(errorMsg);
          return;
        }
        router.push("/compliance");
        router.refresh();
      } finally {
        setIsSubmitting(false);
      }
    });
  }

  // Step 1 — pick job
  if (step === "job") {
    return (
      <div className="space-y-4">
        <div className="space-y-1">
          <label htmlFor="compliance-job-select" className="text-sm font-medium">Select job</label>
          <select
            id="compliance-job-select"
            value={jobId}
            onChange={(e) => setJobId(e.target.value)}
            className="w-full min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 text-base"
          >
            <option value="">— Choose a job —</option>
            {jobs.map((j) => (
              <option key={j.id} value={j.id}>{j.customerName} — {j.siteName}</option>
            ))}
          </select>
        </div>
        <button
          disabled={!jobId}
          onClick={() => setStep("template")}
          className="w-full min-h-[44px] rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-semibold text-sm disabled:opacity-40"
        >
          Next
        </button>
      </div>
    );
  }

  // Step 2 — pick template
  if (step === "template") {
    return (
      <div className="space-y-4">
        <p className="text-sm font-medium">Select document type</p>
        <div className="space-y-2">
          {templates.map((t) => (
            <div key={t.id} className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-amber-400 dark:hover:border-amber-500 transition-colors">
              <button
                onClick={() => { setTemplate(t); setValues({}); setStep("form"); }}
                className="w-full text-left px-4 pt-4 pb-3"
              >
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${TYPE_COLOURS[t.type] ?? ""}`}>
                    {TYPE_LABELS[t.type] ?? t.type}
                  </span>
                  <span className="font-medium">{t.name}</span>
                </div>
              </button>
              <div className="px-4 pb-3">
                <a
                  href={`/api/compliance/templates/${t.id}/preview`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-slate-400 hover:text-amber-600 dark:hover:text-amber-400 underline underline-offset-2"
                  onClick={(e) => e.stopPropagation()}
                >
                  Preview PDF ↗
                </a>
              </div>
            </div>
          ))}
        </div>
        <button
          onClick={() => setStep("job")}
          className="text-sm text-slate-500 underline underline-offset-2"
        >
          ← Back
        </button>
      </div>
    );
  }

  // Step 3 — fill in form
  // Fix 4: guard against non-array JSON values from DB
  const sections = Array.isArray(template?.sections) ? (template.sections as TemplateSections) : [];

  return (
    <div className="space-y-6">
      {sections.map((section) => (
        <div key={section.id} className="space-y-3">
          <h3 className="font-semibold text-sm border-b border-slate-200 dark:border-slate-700 pb-2">{section.title}</h3>
          {section.fields.map((field) => (
            <div key={field.id} className="space-y-1">
              <label htmlFor={`field-${field.id}`} className="text-sm font-medium text-slate-700 dark:text-slate-300">
                {field.label}{field.required && <span className="text-red-500 ml-0.5">*</span>}
              </label>

              {field.type === "text" && (
                <input
                  id={`field-${field.id}`}
                  type="text"
                  value={(values[field.id] as string) ?? ""}
                  onChange={(e) => setValue(field.id, e.target.value)}
                  className="w-full min-h-[44px] rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 text-base"
                />
              )}

              {field.type === "textarea" && (
                <textarea
                  id={`field-${field.id}`}
                  value={(values[field.id] as string) ?? ""}
                  onChange={(e) => setValue(field.id, e.target.value)}
                  rows={3}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-base resize-none"
                />
              )}

              {field.type === "date" && (
                <input
                  id={`field-${field.id}`}
                  type="date"
                  value={(values[field.id] as string) ?? ""}
                  onChange={(e) => setValue(field.id, e.target.value)}
                  className="w-full min-h-[44px] rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 text-base"
                />
              )}

              {field.type === "checkbox" && (
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={(values[field.id] as boolean) ?? false}
                    onChange={(e) => setValue(field.id, e.target.checked)}
                    className="w-5 h-5 rounded"
                  />
                  <span className="text-sm">Yes</span>
                </label>
              )}

              {field.type === "checklist" && (
                <div className="space-y-1">
                  {(field.options ?? []).map((opt) => {
                    const checked = ((values[field.id] as string[]) ?? []).includes(opt);
                    return (
                      <label key={opt} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            const current = (values[field.id] as string[]) ?? [];
                            setValue(field.id, e.target.checked ? [...current, opt] : current.filter((v) => v !== opt));
                          }}
                          className="w-5 h-5 rounded"
                        />
                        <span className="text-sm">{opt}</span>
                      </label>
                    );
                  })}
                </div>
              )}

              {field.type === "signature" && (
                <SignatureCanvas onChange={(dataUrl) => setValue(field.id, dataUrl)} />
              )}
            </div>
          ))}
        </div>
      ))}

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      <div className="flex gap-3 pt-2">
        <button
          onClick={() => setStep("template")}
          disabled={isPending || isSubmitting}
          className="flex-1 min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-600 text-sm disabled:opacity-40"
        >
          ← Back
        </button>
        <button
          onClick={submit}
          disabled={isPending || isSubmitting}
          className="flex-1 min-h-[44px] rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-semibold text-sm disabled:opacity-40"
        >
          {isPending || isSubmitting ? "Generating PDF…" : "Submit"}
        </button>
      </div>
    </div>
  );
}
