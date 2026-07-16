"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { v4 as uuid } from "uuid";
import type { TemplateSections, TemplateField, TemplateSection, FieldType } from "@/lib/compliance/types";
import { getStatutorySections, RESERVED_FIELD_PREFIX } from "@/lib/compliance/statutorySections";
import { DOCUMENT_TYPES } from "@/lib/compliance/documentTypes";

// ─── TemplateBuilder ────────────────────────────────────────────────────────

const FIELD_TYPES: { value: FieldType; label: string }[] = [
  { value: "text",           label: "Short text"       },
  { value: "textarea",       label: "Long text"        },
  { value: "date",           label: "Date"             },
  { value: "checkbox",       label: "Checkbox"         },
  { value: "checklist",      label: "Checklist"        },
  { value: "signature",      label: "Signature"        },
  { value: "table",          label: "Table"            },
  { value: "signature-list", label: "Signature list"   },
];

interface TemplateBuilderProps {
  templateId?:  string;
  initialData?: {
    name:     string;
    type:     string;
    sections: TemplateSections;
  };
}

function emptyField(): TemplateField {
  return { id: uuid(), label: "", type: "text", required: false };
}

function emptySection(): TemplateSection {
  return { id: uuid(), title: "", fields: [] };
}

export function TemplateBuilder({ templateId, initialData }: TemplateBuilderProps) {
  const router = useRouter();
  const [name,     setName]     = useState(initialData?.name     ?? "");
  const [type,     setType]     = useState(initialData?.type     ?? "swms");
  const [sections, setSections] = useState<TemplateSections>(
    (initialData?.sections ?? []).length > 0 ? (initialData?.sections ?? []) : [emptySection()]
  );
  const [error,    setError]    = useState<string | null>(null);
  const [saved,    setSaved]    = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Section operations
  function updateSectionTitle(id: string, title: string) {
    setSections((prev) => prev.map((s) => s.id === id ? { ...s, title } : s));
  }
  function addSection() {
    setSections((prev) => [...prev, emptySection()]);
  }
  function deleteSection(id: string) {
    const section = sections.find((s) => s.id === id);
    if (section && section.fields.length > 0) {
      if (!window.confirm(`Delete section "${section.title || "Untitled"}" and its ${section.fields.length} field(s)?`)) return;
    }
    setSections((prev) => prev.filter((s) => s.id !== id));
  }
  function moveSectionUp(index: number) {
    if (index === 0) return;
    setSections((prev) => { const a = [...prev]; [a[index - 1], a[index]] = [a[index], a[index - 1]]; return a; });
  }
  function moveSectionDown(index: number) {
    setSections((prev) => { if (index === prev.length - 1) return prev; const a = [...prev]; [a[index], a[index + 1]] = [a[index + 1], a[index]]; return a; });
  }

  // Field operations
  function addField(sectionId: string) {
    setSections((prev) => prev.map((s) => s.id === sectionId ? { ...s, fields: [...s.fields, emptyField()] } : s));
  }
  function updateField(sectionId: string, fieldId: string, patch: Partial<TemplateField>) {
    setSections((prev) => prev.map((s) => s.id !== sectionId ? s : {
      ...s,
      fields: s.fields.map((f) => f.id === fieldId ? { ...f, ...patch } : f),
    }));
  }
  function deleteField(sectionId: string, fieldId: string) {
    setSections((prev) => prev.map((s) => s.id !== sectionId ? s : { ...s, fields: s.fields.filter((f) => f.id !== fieldId) }));
  }
  function moveFieldUp(sectionId: string, index: number) {
    if (index === 0) return;
    setSections((prev) => prev.map((s) => {
      if (s.id !== sectionId) return s;
      const fields = [...s.fields];
      [fields[index - 1], fields[index]] = [fields[index], fields[index - 1]];
      return { ...s, fields };
    }));
  }
  function moveFieldDown(sectionId: string, index: number) {
    setSections((prev) => prev.map((s) => {
      if (s.id !== sectionId) return s;
      if (index === s.fields.length - 1) return s;
      const fields = [...s.fields];
      [fields[index], fields[index + 1]] = [fields[index + 1], fields[index]];
      return { ...s, fields };
    }));
  }
  function updateChecklistOptions(sectionId: string, fieldId: string, rawOptions: string) {
    updateField(sectionId, fieldId, { options: rawOptions.split("\n").map((o) => o.trim()).filter(Boolean) });
  }

  function updateTableColumns(sectionId: string, fieldId: string, rawColumns: string) {
    const columns = rawColumns.split("\n").map((c) => c.trim()).filter(Boolean).map((label) => ({ id: uuid(), label }));
    updateField(sectionId, fieldId, { columns });
  }

  const statutorySections = getStatutorySections(type);

  async function handleSave() {
    setError(null);
    setSaved(false);
    if (!name.trim()) { setError("Template name is required."); return; }
    const hasFieldlessSections = sections.some((s) => s.fields.length === 0);
    if (sections.length === 0 || hasFieldlessSections) {
      setError("Each section must have at least one field."); return;
    }
    if (sections.some(s => !s.title.trim())) {
      setError("All sections must have a title."); return;
    }
    const reservedFieldUsed = sections.some((s) => s.fields.some((f) => f.id.startsWith(RESERVED_FIELD_PREFIX)));
    if (reservedFieldUsed) {
      setError("Field IDs starting with \"statutory_\" are reserved for legally-mandated content and can't be used here.");
      return;
    }
    setIsSubmitting(true);
    startTransition(async () => {
      try {
        const url    = templateId ? `/api/compliance/templates/${templateId}` : "/api/compliance/templates";
        const method = templateId ? "PATCH" : "POST";
        const res    = await fetch(url, {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: name.trim(), type, sections }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          setError((body as { error?: string }).error ?? "Failed to save.");
          return;
        }
        if (templateId) {
          setSaved(true);
        } else {
          router.push("/compliance/templates");
        }
      } catch {
        setError("Failed to save.");
      } finally {
        setIsSubmitting(false);
      }
    });
  }

  const inputCls = "w-full min-h-[40px] rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 text-sm";

  return (
    <div className="space-y-6">
      {/* Header fields */}
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2 space-y-1">
          <label className="text-xs font-medium text-slate-500">Template name</label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Standard SWMS" className={inputCls} />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-500">Document type</label>
          <select value={type} onChange={(e) => setType(e.target.value)} className={inputCls}>
            {DOCUMENT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
      </div>

      {/* Statutory (locked) content preview */}
      {statutorySections && (
        <div className="rounded-xl border-2 border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/10 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">
              Required by law — cannot be edited here
            </span>
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-400">
            Every document of this type automatically includes the following, ahead of the sections you build below.
          </p>
          <div className="space-y-2">
            {statutorySections.map((section) => (
              <div key={section.id}>
                <p className="text-sm font-medium">{section.title}</p>
                <ul className="text-xs text-slate-500 dark:text-slate-400 list-disc pl-5">
                  {section.fields.map((f) => <li key={f.id}>{f.label}</li>)}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sections */}
      <div className="space-y-4">
        <p className="text-sm font-semibold">{statutorySections ? "Additional sections" : "Sections"}</p>
        {sections.map((section, si) => (
          <div key={section.id} className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={section.title}
                onChange={(e) => updateSectionTitle(section.id, e.target.value)}
                placeholder="Section title"
                className="flex-1 min-h-[36px] rounded-lg border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 px-3 text-sm font-medium"
              />
              <button onClick={() => moveSectionUp(si)}   className="text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 text-lg leading-none px-1" title="Move up">↑</button>
              <button onClick={() => moveSectionDown(si)} className="text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 text-lg leading-none px-1" title="Move down">↓</button>
              <button onClick={() => deleteSection(section.id)} className="text-red-400 hover:text-red-600 text-sm px-1" title="Delete section">✕</button>
            </div>

            {/* Fields */}
            <div className="space-y-2 pl-2">
              {section.fields.map((field, fi) => (
                <div key={field.id} className="rounded-lg border border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={field.label}
                      onChange={(e) => updateField(section.id, field.id, { label: e.target.value })}
                      placeholder="Field label"
                      className="flex-1 min-h-[34px] rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 text-sm"
                    />
                    <select
                      value={field.type}
                      onChange={(e) => updateField(section.id, field.id, { type: e.target.value as FieldType })}
                      className="min-h-[34px] rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 text-sm"
                    >
                      {FIELD_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                    <label className="flex items-center gap-1 text-xs text-slate-500 cursor-pointer whitespace-nowrap">
                      <input type="checkbox" checked={field.required} onChange={(e) => updateField(section.id, field.id, { required: e.target.checked })} className="w-4 h-4 rounded" />
                      Req.
                    </label>
                    <button onClick={() => moveFieldUp(section.id, fi)}   className="text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 text-base leading-none" title="Move up">↑</button>
                    <button onClick={() => moveFieldDown(section.id, fi)} className="text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 text-base leading-none" title="Move down">↓</button>
                    <button onClick={() => deleteField(section.id, field.id)} className="text-red-400 hover:text-red-600 text-xs" title="Delete field">✕</button>
                  </div>
                  {field.type === "checklist" && (
                    <div className="space-y-1">
                      <label className="text-xs text-slate-500">Options (one per line)</label>
                      <textarea
                        value={(field.options ?? []).join("\n")}
                        onChange={(e) => updateChecklistOptions(section.id, field.id, e.target.value)}
                        rows={3}
                        placeholder={"Harness\nHelmet\nSafety glasses"}
                        className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 py-1 text-xs resize-none"
                      />
                    </div>
                  )}
                  {field.type === "table" && (
                    <div className="space-y-1">
                      <label className="text-xs text-slate-500">Columns (one per line)</label>
                      <textarea
                        value={(field.columns ?? []).map((c) => c.label).join("\n")}
                        onChange={(e) => updateTableColumns(section.id, field.id, e.target.value)}
                        rows={3}
                        placeholder={"Task\nHazard\nControl Measure"}
                        className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 py-1 text-xs resize-none"
                      />
                    </div>
                  )}
                </div>
              ))}
              <button
                onClick={() => addField(section.id)}
                className="text-xs text-amber-600 dark:text-amber-400 hover:underline"
              >
                + Add field
              </button>
            </div>
          </div>
        ))}
        <button
          onClick={addSection}
          className="w-full min-h-[40px] rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-600 text-sm text-slate-500 hover:border-amber-400 hover:text-amber-600 transition-colors"
        >
          + Add section
        </button>
      </div>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      {saved  && <p className="text-sm text-green-600 dark:text-green-400">✓ Saved</p>}

      <button
        onClick={handleSave}
        disabled={isPending || isSubmitting}
        className="w-full min-h-[44px] rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-semibold text-sm disabled:opacity-40"
      >
        {isPending || isSubmitting ? "Saving…" : "Save template"}
      </button>
    </div>
  );
}

// ─── DeleteTemplateButton ───────────────────────────────────────────────────

export function DeleteTemplateButton({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleDelete() {
    if (!confirm(`Delete template "${name}"? This cannot be undone.`)) return;
    startTransition(async () => {
      const res = await fetch(`/api/compliance/templates/${id}`, { method: "DELETE" });
      if (!res.ok) {
        alert("Failed to delete template. Please try again.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <button
      onClick={handleDelete}
      disabled={isPending}
      className="text-xs text-red-500 hover:text-red-700 dark:hover:text-red-400 underline underline-offset-2 disabled:opacity-40"
    >
      {isPending ? "Deleting…" : "Delete"}
    </button>
  );
}
