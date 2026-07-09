"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Camera, X, AlertCircle } from "lucide-react";
import { compressImage } from "@/lib/upload/compressImage";

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
  const [photos, setPhotos] = useState<Record<string, string[]>>({});
  const [uploadingPhotoFor, setUploadingPhotoFor] = useState<string | null>(null);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

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

  async function addPhoto(noteId: string, file: File) {
    setUploadingPhotoFor(noteId);
    setError(null);
    try {
      const compressed = await compressImage(file);
      const form = new FormData();
      form.append("file", compressed, "photo.jpg");
      const res = await fetch("/api/upload/photo", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Photo upload failed");
      setPhotos((prev) => ({ ...prev, [noteId]: [...(prev[noteId] ?? []), data.url] }));
    } catch {
      setError("Failed to attach photo. Try again.");
    } finally {
      setUploadingPhotoFor(null);
    }
  }

  function removePhoto(noteId: string, url: string) {
    setPhotos((prev) => ({ ...prev, [noteId]: (prev[noteId] ?? []).filter((u) => u !== url) }));
  }

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
        body: JSON.stringify({ transcript, photoUrls: photos[noteId] ?? [] }),
      });
      if (!res.ok) throw new Error("Send failed");
      setNotes((prev) => prev.filter((n) => n.id !== noteId));
      setPhotos((prev) => { const next = { ...prev }; delete next[noteId]; return next; });
    } catch {
      setError("Failed to send. Try again.");
    } finally {
      setSendingId(null);
    }
  }

  if (notes.length === 0) return null;

  return (
    <div className="space-y-3">
      <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">
        {notes.length === 1 ? "1 voice note needs to be reviewed and sent" : `${notes.length} voice notes need to be reviewed and sent`}
      </p>
      {notes.map((note) => (
        <div key={note.id} className="rounded-lg border-2 border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/10 p-3 space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-400">
            <AlertCircle className="w-3.5 h-3.5" />
            Action needed — check the transcript below, then press Send to submit it to the office
          </div>
          <textarea
            value={drafts[note.id] ?? note.transcript}
            onChange={(e) => setDrafts((prev) => ({ ...prev, [note.id]: e.target.value }))}
            rows={3}
            className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
          />

          {(photos[note.id]?.length ?? 0) > 0 && (
            <div className="flex gap-2 flex-wrap">
              {photos[note.id]!.map((url) => (
                <div key={url} className="relative">
                  <img
                    src={`/api/photos?url=${encodeURIComponent(url)}`}
                    alt="Attached"
                    className="w-16 h-16 object-cover rounded-lg border border-slate-200 dark:border-slate-700"
                  />
                  <button
                    type="button"
                    onClick={() => removePhoto(note.id, url)}
                    aria-label="Remove photo"
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-slate-900 text-white flex items-center justify-center"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <input
            ref={(el) => { fileInputRefs.current[note.id] = el; }}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) addPhoto(note.id, file);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            onClick={() => fileInputRefs.current[note.id]?.click()}
            disabled={uploadingPhotoFor === note.id}
            className="text-xs text-amber-700 dark:text-amber-400 flex items-center gap-1 disabled:opacity-40"
          >
            <Camera className="w-3.5 h-3.5" />
            {uploadingPhotoFor === note.id ? "Uploading…" : "Add photo"}
          </button>

          <button
            type="button"
            onClick={() => send(note.id)}
            disabled={sendingId === note.id || uploadingPhotoFor === note.id}
            className="w-full min-h-[40px] rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-semibold text-sm disabled:opacity-40"
          >
            {sendingId === note.id ? "Sending…" : uploadingPhotoFor === note.id ? "Waiting for photo…" : "Send"}
          </button>
        </div>
      ))}
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
