"use client";

import { useState } from "react";

interface BusinessProfile {
  name: string;
  abn: string;
  phone: string;
  email: string;
  address: string;
}

export function SettingsForm({ initial }: { initial: BusinessProfile }) {
  const [form, setForm] = useState<BusinessProfile>(initial);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const set = (field: keyof BusinessProfile) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm((f) => ({ ...f, [field]: e.target.value }));
    if (status !== "idle") setStatus("idle");
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setStatus("idle");

    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string };
        setErrorMsg(data.error ?? "Failed to save");
        setStatus("error");
      } else {
        setStatus("saved");
      }
    } catch {
      setErrorMsg("Network error — please try again");
      setStatus("error");
    } finally {
      setSaving(false);
    }
  }

  const inputClass =
    "w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent";

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
          Business Name <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={form.name}
          onChange={set("name")}
          required
          maxLength={100}
          placeholder="CT Field Ops"
          className={inputClass}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">ABN</label>
        <input
          type="text"
          value={form.abn}
          onChange={set("abn")}
          maxLength={20}
          placeholder="12 345 678 901"
          className={inputClass}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Phone</label>
          <input
            type="tel"
            value={form.phone}
            onChange={set("phone")}
            maxLength={30}
            placeholder="1300 123 456"
            className={inputClass}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Email</label>
          <input
            type="email"
            value={form.email}
            onChange={set("email")}
            maxLength={100}
            placeholder="admin@yourbusiness.com.au"
            className={inputClass}
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Address</label>
        <textarea
          value={form.address}
          onChange={set("address")}
          maxLength={200}
          rows={2}
          placeholder="123 Industrial Drive, Brisbane QLD 4000"
          className={inputClass + " resize-none"}
        />
      </div>

      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white text-sm font-semibold transition-colors"
        >
          {saving ? "Saving…" : "Save Changes"}
        </button>

        {status === "saved" && (
          <span className="text-sm text-emerald-600 dark:text-emerald-400 font-medium">✓ Saved</span>
        )}
        {status === "error" && (
          <span className="text-sm text-red-600 dark:text-red-400">{errorMsg}</span>
        )}
      </div>
    </form>
  );
}
