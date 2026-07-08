"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface CustomerData {
  id:            string;
  name:          string;
  abn:           string | null;
  contactPerson: string | null;
  email:         string | null;
  phone:         string | null;
  address:       string | null;
  notes:         string | null;
}

interface CustomerFormProps {
  initial?:  CustomerData;
  onSave?:   () => void;
  onCancel?: () => void;
}

export function CustomerForm({ initial, onSave, onCancel }: CustomerFormProps) {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [fields, setFields] = useState({
    name:          initial?.name          ?? "",
    abn:           initial?.abn           ?? "",
    contactPerson: initial?.contactPerson ?? "",
    email:         initial?.email         ?? "",
    phone:         initial?.phone         ?? "",
    address:       initial?.address       ?? "",
    notes:         initial?.notes         ?? "",
  });

  const isEdit = !!initial;

  function set(key: keyof typeof fields, value: string) {
    setFields((prev) => ({ ...prev, [key]: value }));
  }

  function handleSubmit() {
    const newErrors: Record<string, string> = {};
    if (fields.name.trim().length < 2) newErrors.name = "Customer name required (min 2 chars)";
    if (fields.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email.trim())) {
      newErrors.email = "Invalid email address";
    }
    if (Object.keys(newErrors).length > 0) { setErrors(newErrors); return; }
    setErrors({});

    setIsPending(true);
    (async () => {
      try {
        let body: Record<string, unknown>;
        if (isEdit) {
          // Send all fields so the user can clear optional fields by blanking them
          body = {
            name:          fields.name.trim(),
            abn:           fields.abn.trim()           || null,
            contactPerson: fields.contactPerson.trim() || null,
            email:         fields.email.trim()         || null,
            phone:         fields.phone.trim()         || null,
            address:       fields.address.trim()       || null,
            notes:         fields.notes.trim()         || null,
          };
        } else {
          // Only include non-empty optional fields for creation
          body = { name: fields.name.trim() };
          if (fields.abn.trim())           body.abn           = fields.abn.trim();
          if (fields.contactPerson.trim()) body.contactPerson = fields.contactPerson.trim();
          if (fields.email.trim())         body.email         = fields.email.trim();
          if (fields.phone.trim())         body.phone         = fields.phone.trim();
          if (fields.address.trim())       body.address       = fields.address.trim();
          if (fields.notes.trim())         body.notes         = fields.notes.trim();
        }

        const url    = isEdit ? `/api/customers/${initial.id}` : "/api/customers";
        const method = isEdit ? "PATCH" : "POST";

        const res = await fetch(url, {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setErrors({ submit: (data as { error?: string }).error ?? "Failed to save customer." });
          return;
        }

        if (isEdit) {
          onSave?.();
          router.refresh();
        } else {
          const created = await res.json();
          router.push(`/customers/${created.id}`);
        }
      } finally {
        setIsPending(false);
      }
    })();
  }

  const inputClass =
    "w-full min-h-[44px] rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 text-base";

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <label className="text-sm font-medium">Customer name *</label>
        <input
          type="text"
          value={fields.name}
          onChange={(e) => set("name", e.target.value)}
          placeholder="Rio Tinto"
          className={inputClass}
        />
        {errors.name && <p className="text-sm text-red-600">{errors.name}</p>}
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium">
          ABN <span className="font-normal text-slate-400">optional</span>
        </label>
        <input
          type="text"
          value={fields.abn}
          onChange={(e) => set("abn", e.target.value)}
          placeholder="12 345 678 901"
          className={inputClass}
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium">
          Contact person <span className="font-normal text-slate-400">optional</span>
        </label>
        <input
          type="text"
          value={fields.contactPerson}
          onChange={(e) => set("contactPerson", e.target.value)}
          placeholder="Jane Smith"
          className={inputClass}
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium">
          Email <span className="font-normal text-slate-400">optional</span>
        </label>
        <input
          type="email"
          value={fields.email}
          onChange={(e) => set("email", e.target.value)}
          placeholder="contact@company.com"
          className={inputClass}
        />
        {errors.email && <p className="text-sm text-red-600">{errors.email}</p>}
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium">
          Phone <span className="font-normal text-slate-400">optional</span>
        </label>
        <input
          type="tel"
          value={fields.phone}
          onChange={(e) => set("phone", e.target.value)}
          placeholder="0400 000 000"
          className={inputClass}
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium">
          Address <span className="font-normal text-slate-400">optional</span>
        </label>
        <input
          type="text"
          value={fields.address}
          onChange={(e) => set("address", e.target.value)}
          placeholder="123 Main St, Brisbane QLD 4000"
          className={inputClass}
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium">
          Notes <span className="font-normal text-slate-400">optional</span>
        </label>
        <textarea
          value={fields.notes}
          onChange={(e) => set("notes", e.target.value)}
          placeholder="Access instructions, parking, site-specific notes…"
          rows={4}
          className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-base resize-none"
        />
      </div>

      {errors.submit && <p className="text-sm text-red-600">{errors.submit}</p>}

      <div className="flex gap-3 pt-1">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 min-h-[48px] rounded-lg border border-slate-300 dark:border-slate-600 text-sm font-medium"
          >
            Cancel
          </button>
        )}
        <button
          type="button"
          onClick={handleSubmit}
          disabled={isPending}
          className="flex-1 min-h-[48px] rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-semibold text-sm disabled:opacity-40"
        >
          {isPending ? "Saving…" : isEdit ? "Save changes" : "Create customer"}
        </button>
      </div>
    </div>
  );
}
