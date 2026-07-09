"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";

interface DeleteVoiceNoteButtonProps {
  jobId: string;
  noteId: string;
}

export function DeleteVoiceNoteButton({ jobId, noteId }: DeleteVoiceNoteButtonProps) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    if (!window.confirm("Delete this voice note? This can't be undone.")) return;
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/jobs/${jobId}/voice-notes/${noteId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      router.refresh();
    } catch {
      setError("Failed to delete. Try again.");
      setDeleting(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-0.5">
      <button
        type="button"
        onClick={handleDelete}
        disabled={deleting}
        aria-label="Delete voice note"
        title="Delete voice note"
        className="p-1 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-40"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
