"use client";

import { useRef, useState } from "react";

interface BusinessProfile {
  name: string;
  abn: string;
  phone: string;
  email: string;
  address: string;
  hourlyRate: number | null;
  paymentTerms: string;
  industryDescription: string;
}

interface SettingsFormProps {
  initial: BusinessProfile;
  initialLogoUrl: string | null;
}

export function SettingsForm({ initial, initialLogoUrl }: SettingsFormProps) {
  const [form, setForm] = useState<BusinessProfile>({
    ...initial,
    hourlyRate: initial.hourlyRate ?? null,
    paymentTerms: initial.paymentTerms ?? "",
    industryDescription: initial.industryDescription ?? "field service maintenance",
  });
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const [logoUrl, setLogoUrl] = useState<string | null>(initialLogoUrl);
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoError, setLogoError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const set = (field: keyof BusinessProfile) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm((f) => ({ ...f, [field]: e.target.value }));
    if (status !== "idle") setStatus("idle");
  };

  const setNum = (field: "hourlyRate") => (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value === "" ? null : Number(e.target.value);
    setForm((f) => ({ ...f, [field]: val }));
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

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoUploading(true);
    setLogoError(null);
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await fetch("/api/settings/logo", { method: "POST", body: formData });
      const data = await res.json() as { logoUrl?: string; error?: string };
      if (!res.ok) { setLogoError(data.error ?? "Upload failed"); }
      else { setLogoUrl(data.logoUrl ?? null); }
    } catch {
      setLogoError("Upload failed — please try again");
    } finally {
      setLogoUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleLogoRemove() {
    setLogoUploading(true);
    setLogoError(null);
    try {
      await fetch("/api/settings/logo", { method: "DELETE" });
      setLogoUrl(null);
    } catch {
      setLogoError("Remove failed — please try again");
    } finally {
      setLogoUploading(false);
    }
  }

  const inputClass =
    "w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent";

  return (
    <div className="space-y-8">
      {/* Logo */}
      <div>
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">Business Logo</h3>
        <div className="flex items-start gap-4">
          {logoUrl ? (
            <div className="w-20 h-20 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 flex items-center justify-center overflow-hidden shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={logoUrl} alt="Business logo" className="w-full h-full object-contain p-1" />
            </div>
          ) : (
            <div className="w-20 h-20 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 flex items-center justify-center shrink-0">
              <span className="text-2xl text-slate-300 dark:text-slate-600">🏢</span>
            </div>
          )}

          <div className="space-y-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={handleLogoUpload}
              disabled={logoUploading}
            />
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                disabled={logoUploading}
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors"
              >
                {logoUploading ? "Uploading…" : logoUrl ? "Replace logo" : "Upload logo"}
              </button>
              {logoUrl && !logoUploading && (
                <button
                  type="button"
                  onClick={handleLogoRemove}
                  className="text-sm text-red-500 hover:text-red-700 dark:hover:text-red-400 underline underline-offset-2"
                >
                  Remove
                </button>
              )}
            </div>
            <p className="text-xs text-slate-500">PNG, JPG, or WebP — max 2 MB. Shown in PDF headers.</p>
            {logoError && <p className="text-xs text-red-600 dark:text-red-400">{logoError}</p>}
          </div>
        </div>
      </div>

      {/* Business details */}
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

        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
            What does your business do?
          </label>
          <input
            type="text"
            value={form.industryDescription}
            onChange={set("industryDescription")}
            maxLength={100}
            placeholder="e.g. cooling tower maintenance, HVAC servicing, electrical contracting"
            className={inputClass}
          />
          <p className="mt-1 text-xs text-slate-500">Used by the AI assistant and voice-note summaries to understand your work — not shown on customer documents.</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Hourly rate ($) <span className="font-normal text-slate-500">optional</span>
            </label>
            <input
              type="number"
              inputMode="decimal"
              value={form.hourlyRate ?? ""}
              onChange={setNum("hourlyRate")}
              min={0}
              step={0.01}
              placeholder="145.00"
              className={inputClass}
            />
            <p className="mt-1 text-xs text-slate-500">Used to pre-fill the labour calculator on invoices.</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Payment terms <span className="font-normal text-slate-500">optional</span>
            </label>
            <input
              type="text"
              value={form.paymentTerms}
              onChange={set("paymentTerms")}
              maxLength={200}
              placeholder="Payment due 14 days from invoice date"
              className={inputClass}
            />
            <p className="mt-1 text-xs text-slate-500">Shown in the footer of invoice PDFs.</p>
          </div>
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
    </div>
  );
}
