"use client";

import { useState, useRef } from "react";
import { Mic, Video, Square } from "lucide-react";

interface VoiceRecorderProps {
  jobId: string;
}

type RecorderState = "idle" | "recording" | "uploading" | "done" | "error";
type RecordingMode = "audio" | "video";

export function VoiceRecorder({ jobId }: VoiceRecorderProps) {
  const [state, setState] = useState<RecorderState>("idle");
  const [mode, setMode] = useState<RecordingMode>("audio");
  const [error, setError] = useState<string | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startTimeRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isStoppingRef = useRef(false);
  const videoPreviewRef = useRef<HTMLVideoElement | null>(null);

  async function startRecording() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: mode === "video" });
      const candidateType = mode === "video" ? "video/webm" : "audio/webm";
      const fallbackType = mode === "video" ? "video/mp4" : "audio/mp4";
      const mimeType = MediaRecorder.isTypeSupported(candidateType) ? candidateType : fallbackType;
      const recorder = new MediaRecorder(stream, { mimeType });
      chunksRef.current = [];
      isStoppingRef.current = false;
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => stream.getTracks().forEach((t) => t.stop());
      recorder.start();
      mediaRecorderRef.current = recorder;
      startTimeRef.current = Date.now();
      setElapsedSeconds(0);
      timerRef.current = setInterval(() => {
        setElapsedSeconds(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }, 1000);
      setState("recording");
      if (mode === "video" && videoPreviewRef.current) {
        videoPreviewRef.current.srcObject = stream;
      }
    } catch {
      setError("Microphone/camera access denied or unavailable.");
      setState("error");
    }
  }

  async function stopAndUpload() {
    if (isStoppingRef.current) return;
    isStoppingRef.current = true;
    const recorder = mediaRecorderRef.current;
    if (!recorder) return;
    if (timerRef.current) clearInterval(timerRef.current);
    const durationSeconds = elapsedSeconds;

    await new Promise<void>((resolve) => {
      recorder.onstop = () => {
        recorder.stream.getTracks().forEach((t) => t.stop());
        resolve();
      };
      recorder.stop();
    });

    setState("uploading");
    const mimeType = recorder.mimeType || (mode === "video" ? "video/webm" : "audio/webm");
    const extension = mimeType.includes("webm") ? "webm" : "mp4";
    const blob = new Blob(chunksRef.current, { type: mimeType });
    const formData = new FormData();
    formData.append("file", blob, `voice-note.${extension}`);

    try {
      const uploadRes = await fetch("/api/upload/voice-note", { method: "POST", body: formData });
      if (!uploadRes.ok) throw new Error("Upload failed");
      const { url } = await uploadRes.json();

      const createRes = await fetch(`/api/jobs/${jobId}/voice-notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audioUrl: url, durationSeconds, mediaType: mode }),
      });
      if (!createRes.ok) throw new Error("Failed to save voice note");

      setState("done");
    } catch {
      setError("Failed to upload voice note. It was not saved.");
      setState("error");
    }
  }

  if (state === "done") {
    return (
      <div className="space-y-1">
        <p className="text-sm text-emerald-600 dark:text-emerald-400">Voice note saved — transcribing now.</p>
        <button
          type="button"
          onClick={() => setState("idle")}
          className="text-xs text-amber-600 dark:text-amber-400 hover:underline"
        >
          Record another note
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {state === "idle" && (
        <div className="flex gap-2 text-xs">
          <button
            type="button"
            onClick={() => setMode("audio")}
            className={`flex-1 min-h-[32px] rounded-lg border font-medium ${mode === "audio" ? "border-amber-500 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400" : "border-slate-300 dark:border-slate-600 text-slate-500"}`}
          >
            Audio only
          </button>
          <button
            type="button"
            onClick={() => setMode("video")}
            className={`flex-1 min-h-[32px] rounded-lg border font-medium ${mode === "video" ? "border-amber-500 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400" : "border-slate-300 dark:border-slate-600 text-slate-500"}`}
          >
            Video
          </button>
        </div>
      )}

      {state === "recording" && mode === "video" && (
        <video ref={videoPreviewRef} autoPlay muted playsInline className="w-full rounded-lg bg-black aspect-video" />
      )}

      {state === "recording" ? (
        <button
          type="button"
          onClick={stopAndUpload}
          className="w-full min-h-[48px] rounded-lg bg-red-600 hover:bg-red-700 text-white font-semibold text-sm flex items-center justify-center gap-2"
        >
          <Square className="w-4 h-4" fill="currentColor" />
          Stop recording ({Math.floor(elapsedSeconds / 60)}:{String(elapsedSeconds % 60).padStart(2, "0")})
        </button>
      ) : (
        <button
          type="button"
          onClick={startRecording}
          disabled={state === "uploading"}
          className="w-full min-h-[48px] rounded-lg border border-slate-300 dark:border-slate-600 font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-40"
        >
          {mode === "video" ? <Video className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
          {state === "uploading" ? "Saving…" : mode === "video" ? "Record video" : "Record voice note"}
        </button>
      )}
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
