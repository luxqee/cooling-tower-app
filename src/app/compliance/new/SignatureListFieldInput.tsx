"use client";

import { SignatureCanvas } from "./SignatureCanvas";
import type { SignatureListEntry } from "@/lib/compliance/types";

interface SignatureListFieldInputProps {
  entries: SignatureListEntry[];
  onChange: (entries: SignatureListEntry[]) => void;
}

export function SignatureListFieldInput({ entries, onChange }: SignatureListFieldInputProps) {
  function updateName(index: number, name: string) {
    onChange(entries.map((e, i) => (i === index ? { ...e, name } : e)));
  }

  function updateSignature(index: number, signature: string | null) {
    onChange(entries.map((e, i) => (i === index ? { ...e, signature: signature ?? "" } : e)));
  }

  function addEntry() {
    onChange([...entries, { name: "", signature: "" }]);
  }

  function removeEntry(index: number) {
    onChange(entries.filter((_, i) => i !== index));
  }

  return (
    <div className="space-y-3">
      {entries.map((entry, index) => (
        <div key={index} className="rounded-lg border border-slate-300 dark:border-slate-600 p-3 space-y-2">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={entry.name}
              onChange={(e) => updateName(index, e.target.value)}
              placeholder="Name"
              className="flex-1 min-h-[40px] rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-2 text-sm"
            />
            <button
              type="button"
              onClick={() => removeEntry(index)}
              className="text-xs text-red-500 hover:text-red-700 dark:hover:text-red-400 whitespace-nowrap"
            >
              Remove
            </button>
          </div>
          <SignatureCanvas onChange={(dataUrl) => updateSignature(index, dataUrl)} />
        </div>
      ))}
      <button
        type="button"
        onClick={addEntry}
        className="w-full min-h-[36px] rounded-lg border-2 border-dashed border-slate-300 dark:border-slate-600 text-xs text-slate-500 hover:border-amber-400 hover:text-amber-600 transition-colors"
      >
        + Add signature
      </button>
    </div>
  );
}
