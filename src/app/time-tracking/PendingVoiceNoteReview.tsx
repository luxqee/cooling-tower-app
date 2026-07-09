"use client";

import { useState, useEffect, useCallback } from "react";

interface PendingVoiceNoteReviewProps {
  jobId: string;
}

interface PendingNote {
  id: string;
  transcript: string;
  createdAt: string;
}

export function PendingVoiceNoteReview({ jobId }: PendingVoiceNoteReviewProps) {
  const [notes, setNotes] = useState<PendingNote[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const poll = useCallback(async () => {
    try {
      const res = await fetch(`/api/jobs/${jobId}/voice-notes/pending-review`);
      if (!res.ok) return;
      const data: PendingNote[] = await res.json();
      setNotes(data);
      setDrafts((prev) => {
        const next = { ...prev };
        for (const note of data) {
          if (!(note.id in next)) next[note.id] = note.transcript;
        }
        return next;
      });
    } catch {
      // Transient network hiccup during polling — the next tick retries.
    }
  }, [jobId]);

  useEffect(() => {
    poll();
    const interval = setInterval(poll, 3000);
    return () => clearInterval(interval);
  }, [poll]);

  async function send(noteId: string) {
    const transcript = drafts[noteId]?.trim();
    if (!transcript) {
      setError("Transcript can't be empty.");
      return;
    }
    setError(null);
    setSendingId(noteId);
    try {
      const res = await fetch(`/api/jobs/${jobId}/voice-notes/${noteId}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript }),
      });
      if (!res.ok) throw new Error("Send failed");
      setNotes((prev) => prev.filter((n) => n.id !== noteId));
    } catch {
      setError("Failed to send. Try again.");
    } finally {
      setSendingId(null);
    }
  }

  if (notes.length === 0) return null;

  return (
    <div className="space-y-3">
      {notes.map((note) => (
        <div key={note.id} className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/10 p-3 space-y-2">
          <p className="text-xs font-medium text-amber-700 dark:text-amber-400">Review your voice note</p>
          <textarea
            value={drafts[note.id] ?? note.transcript}
            onChange={(e) => setDrafts((prev) => ({ ...prev, [note.id]: e.target.value }))}
            rows={3}
            className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={() => send(note.id)}
            disabled={sendingId === note.id}
            className="w-full min-h-[40px] rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-semibold text-sm disabled:opacity-40"
          >
            {sendingId === note.id ? "Sending…" : "Send"}
          </button>
        </div>
      ))}
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
