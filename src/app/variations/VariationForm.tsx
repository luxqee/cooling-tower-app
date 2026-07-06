"use client";

import { useState, useTransition, useRef } from "react";

async function compressImage(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const MAX_DIM = 2048;
      let { width, height } = img;
      const ratio = Math.min(MAX_DIM / width, MAX_DIM / height, 1);
      width = Math.round(width * ratio);
      height = Math.round(height * ratio);
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      canvas.getContext("2d")!.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("Compression failed"))),
        "image/jpeg",
        0.75
      );
    };
    img.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error("Could not read image")); };
    img.src = objectUrl;
  });
}

interface Job {
  id: string;
  customerName: string;
  siteName: string;
}

interface VariationFormProps {
  jobs: Job[];
}

export function VariationForm({ jobs }: VariationFormProps) {
  const [jobId, setJobId] = useState("");
  const [description, setDescription] = useState("");
  const [costEstimate, setCostEstimate] = useState("");
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const [isPending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  async function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadProgress(true);
    setErrors((prev) => { const n = { ...prev }; delete n.photo; return n; });
    try {
      const compressed = await compressImage(file);
      const form = new FormData();
      form.append("file", compressed, "photo.jpg");
      const res = await fetch("/api/upload/photo", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Upload failed");
      setPhotoUrl(data.url);
    } catch (err) {
      setErrors((prev) => ({
        ...prev,
        photo: (err as Error).message ?? "Photo upload failed. Try again.",
      }));
    } finally {
      setUploadProgress(false);
    }
  }

  function handleSubmit() {
    const newErrors: Record<string, string> = {};
    if (!jobId) newErrors.jobId = "Select a job.";
    if (!description.trim()) newErrors.description = "Please enter a description.";
    const cost = parseFloat(costEstimate);
    if (!costEstimate || isNaN(cost) || cost <= 0)
      newErrors.costEstimate = "Enter a cost greater than $0.";
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }
    setErrors({});

    startTransition(async () => {
      const res = await fetch("/api/variations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId, description, costEstimate: cost, photoUrl }),
      });
      if (!res.ok) {
        const data = await res.json();
        setErrors({ submit: data.error ?? "Submission failed." });
        return;
      }
      setSubmitted(true);
    });
  }

  if (submitted) {
    return (
      <div className="text-center py-12 space-y-3">
        <div className="text-4xl">✓</div>
        <p className="text-lg font-semibold">Variation submitted</p>
        <p className="text-sm text-slate-500">The director has been notified.</p>
        <button
          onClick={() => {
            setSubmitted(false);
            setJobId("");
            setDescription("");
            setCostEstimate("");
            setPhotoUrl(null);
            if (fileRef.current) fileRef.current.value = "";
          }}
          className="mt-4 text-sm text-amber-600 underline underline-offset-2"
        >
          Submit another
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <label htmlFor="variation-job" className="text-sm font-medium">Job</label>
        <select
          id="variation-job"
          value={jobId}
          onChange={(e) => setJobId(e.target.value)}
          className="w-full min-h-[44px] rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 text-base"
        >
          <option value="">Select a job…</option>
          {jobs.map((j) => (
            <option key={j.id} value={j.id}>
              {j.customerName} — {j.siteName}
            </option>
          ))}
        </select>
        {errors.jobId && <p className="text-sm text-red-600">{errors.jobId}</p>}
      </div>

      <div className="space-y-1.5">
        <label htmlFor="variation-description" className="text-sm font-medium">Description</label>
        <textarea
          id="variation-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
          placeholder="Describe the extra work found on site…"
          className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-base resize-none"
        />
        {errors.description && <p className="text-sm text-red-600">{errors.description}</p>}
      </div>

      <div className="space-y-1.5">
        <label htmlFor="variation-cost" className="text-sm font-medium">Cost Estimate ($AUD)</label>
        <input
          id="variation-cost"
          type="number"
          inputMode="decimal"
          value={costEstimate}
          onChange={(e) => setCostEstimate(e.target.value)}
          placeholder="0.00"
          className="w-full min-h-[44px] rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 text-base"
        />
        {errors.costEstimate && (
          <p className="text-sm text-red-600">{errors.costEstimate}</p>
        )}
      </div>

      <div className="space-y-1.5">
        <label htmlFor="variation-photo" className="text-sm font-medium">Photo (optional)</label>
        <input
          id="variation-photo"
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handlePhotoChange}
          className="w-full text-sm text-slate-500 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-slate-100 file:text-slate-700 dark:file:bg-slate-700 dark:file:text-slate-200"
        />
        {uploadProgress && <p className="text-sm text-slate-500">Uploading…</p>}
        {photoUrl && <p className="text-sm text-emerald-600">Photo uploaded ✓</p>}
        {errors.photo && <p className="text-sm text-red-600">{errors.photo}</p>}
      </div>

      {errors.submit && <p className="text-sm text-red-600">{errors.submit}</p>}

      <button
        onClick={handleSubmit}
        disabled={isPending || uploadProgress}
        className="w-full min-h-[52px] rounded-lg bg-amber-500 hover:bg-amber-600 text-white font-semibold text-base disabled:opacity-40 active:scale-[0.98] transition-transform"
      >
        {isPending ? "Submitting…" : "Submit Variation"}
      </button>
    </div>
  );
}
