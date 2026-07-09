# Voice Recorder Review/Retry + Chat Message Formatting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the design in `docs/superpowers/specs/2026-07-09-voice-recorder-review-and-chat-formatting-design.md` — a preview/discard/retry/camera-flip flow for voice/video note recording, and markdown-aware rendering of AI assistant chat replies.

**Architecture:** Two independent, single-file-scoped changes bundled into one plan because they were requested together, not because they share code. Task 1 adds a small pure-function markdown-lite renderer and wires it into the chat widget. Task 2 rewrites `VoiceRecorder.tsx`'s state machine to insert a review step between recording and uploading.

**Tech Stack:** Next.js 14 App Router, React (client components), Tailwind CSS, Vitest, `react-dom/server` for testing a JSX-returning pure function without adding a new testing-library dependency.

## Global Constraints

- No new npm dependencies for either task.
- No API/schema changes — both fixes are pure client-side rendering/UX changes; the voice-note upload payload (`audioUrl`, `durationSeconds`, `mediaType`) and the chat message request/response shapes (`{ sessionId, message }` / `{ sessionId, reply }`) are unchanged.
- `VoiceRecorder.tsx`'s existing recording/upload mechanics (MIME type selection via `MediaRecorder.isTypeSupported`, extension mapping, the exact fields sent to `POST /api/jobs/[id]/voice-notes`) are preserved exactly — only *when* the upload fires changes, not *how*.
- No automated tests for `VoiceRecorder.tsx` or `ChatWidget.tsx` — matches this codebase's established convention that interactive client components are verified live, not unit tested. `formatMessage.tsx` IS a pure function and gets real unit tests, per the same convention (logic in `src/lib/` is tested).

---

## Task 1: Chat message formatting

**Files:**
- Create: `src/lib/chat/formatMessage.tsx`
- Test: `src/lib/chat/__tests__/formatMessage.test.tsx`
- Modify: `src/components/assistant/ChatWidget.tsx`

**Interfaces:**
- Produces: `renderFormattedMessage(content: string): ReactElement` — consumed by `ChatWidget.tsx`.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/chat/__tests__/formatMessage.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { renderFormattedMessage } from "../formatMessage";

function renderToHtml(content: string): string {
  return renderToStaticMarkup(renderFormattedMessage(content));
}

describe("renderFormattedMessage", () => {
  it("renders plain text with no formatting as-is, with no <strong>", () => {
    const html = renderToHtml("Job 123 is complete.");
    expect(html).toContain("Job 123 is complete.");
    expect(html).not.toContain("<strong>");
  });

  it("renders a single bold span as <strong>", () => {
    const html = renderToHtml("The job is **Job 123**.");
    expect(html).toContain("<strong>Job 123</strong>");
  });

  it("renders multiple bold spans in one line", () => {
    const html = renderToHtml("**Job A** and **Job B** are active.");
    expect(html).toContain("<strong>Job A</strong>");
    expect(html).toContain("<strong>Job B</strong>");
  });

  it("renders a bullet list as <ul><li>", () => {
    const html = renderToHtml("Active jobs:\n- Job A\n- Job B");
    expect(html).toMatch(/<ul[^>]*>/);
    expect(html).toContain("Job A");
    expect(html).toContain("Job B");
    const liCount = (html.match(/<li/g) ?? []).length;
    expect(liCount).toBe(2);
  });

  it("renders mixed paragraph and bullet list content, with the surrounding text preserved", () => {
    const html = renderToHtml(
      "Here are the jobs:\n\n- Job A\n- Job B\n\nLet me know if you need more."
    );
    expect(html).toMatch(/<p[^>]*>/);
    expect(html).toMatch(/<ul[^>]*>/);
    expect(html).toContain("Here are the jobs:");
    expect(html).toContain("Let me know if you need more.");
  });

  it("leaves an unmatched lone ** as literal text, not a <strong>", () => {
    const html = renderToHtml("This has a lone ** marker in it.");
    expect(html).toContain("**");
    expect(html).not.toContain("<strong>");
  });

  it("does not treat a bold-opening line as a bullet list item", () => {
    const html = renderToHtml("**Job A** is currently active.");
    expect(html).not.toMatch(/<ul[^>]*>/);
    expect(html).toContain("<strong>Job A</strong>");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/chat/__tests__/formatMessage.test.tsx`
Expected: FAIL — `Cannot find module '../formatMessage'`.

- [ ] **Step 3: Implement formatMessage.tsx**

Create `src/lib/chat/formatMessage.tsx`:

```tsx
import type { ReactElement, ReactNode } from "react";

function parseInline(text: string, keyPrefix: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts
    .filter((part) => part.length > 0)
    .map((part, i) => {
      if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
        return <strong key={`${keyPrefix}-b-${i}`}>{part.slice(2, -2)}</strong>;
      }
      return <span key={`${keyPrefix}-t-${i}`}>{part}</span>;
    });
}

export function renderFormattedMessage(content: string): ReactElement {
  const lines = content.split("\n");
  const blocks: ReactNode[] = [];
  let currentParagraph: string[] = [];
  let currentList: string[] = [];
  let blockKey = 0;

  function flushParagraph() {
    if (currentParagraph.length === 0) return;
    const text = currentParagraph.join(" ");
    blocks.push(<p key={`p-${blockKey}`}>{parseInline(text, `p-${blockKey}`)}</p>);
    blockKey++;
    currentParagraph = [];
  }

  function flushList() {
    if (currentList.length === 0) return;
    blocks.push(
      <ul key={`ul-${blockKey}`} className="list-disc pl-4">
        {currentList.map((item, i) => (
          <li key={i}>{parseInline(item, `li-${blockKey}-${i}`)}</li>
        ))}
      </ul>
    );
    blockKey++;
    currentList = [];
  }

  for (const line of lines) {
    const trimmed = line.trim();
    const bulletMatch = trimmed.match(/^[-*]\s+(.*)$/);
    if (bulletMatch) {
      flushParagraph();
      currentList.push(bulletMatch[1]);
    } else if (trimmed === "") {
      flushParagraph();
      flushList();
    } else {
      flushList();
      currentParagraph.push(trimmed);
    }
  }
  flushParagraph();
  flushList();

  return <>{blocks}</>;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/chat/__tests__/formatMessage.test.tsx`
Expected: PASS, all 7 tests.

- [ ] **Step 5: Wire the formatter into ChatWidget**

Read `src/components/assistant/ChatWidget.tsx` first to confirm its current content matches what's shown below (it was last touched by the AI Company Assistant batch and shouldn't have changed since).

Add the import at the top, alongside the existing `lucide-react` import:

```tsx
import { renderFormattedMessage } from "@/lib/chat/formatMessage";
```

Find this block (around line 66-72):

```tsx
        {messages.map((m, i) => (
          <div key={i} className={`text-sm ${m.role === "user" ? "text-right" : "text-left"}`}>
            <span className={`inline-block px-3 py-2 rounded-lg max-w-[85%] ${m.role === "user" ? "bg-amber-600 text-white" : "bg-slate-100 dark:bg-slate-700"}`}>
              {m.content}
            </span>
          </div>
        ))}
```

Replace with:

```tsx
        {messages.map((m, i) => (
          <div key={i} className={`text-sm ${m.role === "user" ? "text-right" : "text-left"}`}>
            <span className={`inline-block px-3 py-2 rounded-lg max-w-[85%] ${m.role === "user" ? "bg-amber-600 text-white" : "bg-slate-100 dark:bg-slate-700"}`}>
              {m.role === "assistant" ? renderFormattedMessage(m.content) : m.content}
            </span>
          </div>
        ))}
```

- [ ] **Step 6: Verify**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npx vitest run`
Expected: all tests pass, count increased by exactly 7 (the new formatMessage tests) versus the pre-task baseline.

- [ ] **Step 7: Commit**

```bash
git add src/lib/chat/formatMessage.tsx src/lib/chat/__tests__/formatMessage.test.tsx src/components/assistant/ChatWidget.tsx
git commit -m "feat: render assistant chat replies with bold/bullet-list formatting instead of raw markdown"
```

---

## Task 2: Voice recorder — preview, discard, retry, camera flip

**Files:**
- Modify: `src/app/time-tracking/VoiceRecorder.tsx` (full-file rewrite)

**Interfaces:**
- No exports change — `VoiceRecorder({ jobId }: VoiceRecorderProps)` keeps the same props and default export shape. This task only changes internal state/behavior.

- [ ] **Step 1: Read the current file**

Read `src/app/time-tracking/VoiceRecorder.tsx` in full first and confirm it matches the version this task assumes (the AI Company Assistant batch did not touch this file, so it should still match the last voice-note-media batch's output — state machine `idle | recording | uploading | done | error`, a single `stopAndUpload` function, no camera facing-mode selection, no preview/review step).

- [ ] **Step 2: Replace the full file content**

Replace the entire content of `src/app/time-tracking/VoiceRecorder.tsx` with:

```tsx
"use client";

import { useState, useRef, useEffect } from "react";
import { Mic, Video, Square } from "lucide-react";

interface VoiceRecorderProps {
  jobId: string;
}

type RecorderState = "idle" | "recording" | "reviewing" | "uploading" | "done" | "error";
type RecordingMode = "audio" | "video";
type FacingMode = "environment" | "user";

export function VoiceRecorder({ jobId }: VoiceRecorderProps) {
  const [state, setState] = useState<RecorderState>("idle");
  const [mode, setMode] = useState<RecordingMode>("audio");
  const [facingMode, setFacingMode] = useState<FacingMode>("environment");
  const [error, setError] = useState<string | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startTimeRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isStoppingRef = useRef(false);
  const videoPreviewRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  async function startRecording() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: mode === "video" ? { facingMode } : false,
      });
      streamRef.current = stream;
      const candidateType = mode === "video" ? "video/webm" : "audio/webm";
      const fallbackType = mode === "video" ? "video/mp4" : "audio/mp4";
      const mimeType = MediaRecorder.isTypeSupported(candidateType) ? candidateType : fallbackType;
      const recorder = new MediaRecorder(stream, { mimeType });
      chunksRef.current = [];
      isStoppingRef.current = false;
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.start();
      mediaRecorderRef.current = recorder;
      startTimeRef.current = Date.now();
      setElapsedSeconds(0);
      timerRef.current = setInterval(() => {
        setElapsedSeconds(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }, 1000);
      setState("recording");
    } catch {
      setError("Microphone/camera access denied or unavailable.");
      setState("error");
    }
  }

  useEffect(() => {
    if (state === "recording" && mode === "video" && videoPreviewRef.current && streamRef.current) {
      videoPreviewRef.current.srcObject = streamRef.current;
    }
  }, [state, mode]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  async function stopRecording() {
    if (isStoppingRef.current) return;
    isStoppingRef.current = true;
    const recorder = mediaRecorderRef.current;
    if (!recorder) return;
    if (timerRef.current) clearInterval(timerRef.current);

    await new Promise<void>((resolve) => {
      recorder.onstop = () => {
        recorder.stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        resolve();
      };
      recorder.stop();
    });

    const mimeType = recorder.mimeType || (mode === "video" ? "video/webm" : "audio/webm");
    const blob = new Blob(chunksRef.current, { type: mimeType });
    setRecordedBlob(blob);
    setPreviewUrl(URL.createObjectURL(blob));
    setState("reviewing");
  }

  function discardRecording() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setRecordedBlob(null);
    setError(null);
    setState("idle");
  }

  async function submitRecording() {
    if (!recordedBlob) return;
    setState("uploading");
    const mimeType = recordedBlob.type || (mode === "video" ? "video/webm" : "audio/webm");
    const extension = mimeType.includes("webm") ? "webm" : "mp4";
    const formData = new FormData();
    formData.append("file", recordedBlob, `voice-note.${extension}`);

    try {
      const uploadRes = await fetch("/api/upload/voice-note", { method: "POST", body: formData });
      if (!uploadRes.ok) throw new Error("Upload failed");
      const { url } = await uploadRes.json();

      const createRes = await fetch(`/api/jobs/${jobId}/voice-notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audioUrl: url, durationSeconds: elapsedSeconds, mediaType: mode }),
      });
      if (!createRes.ok) throw new Error("Failed to save voice note");

      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
      setRecordedBlob(null);
      setState("done");
    } catch {
      setError("Failed to upload. Your recording is still here — try again.");
      setState("reviewing");
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
        <>
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
          {mode === "video" && (
            <div className="flex gap-2 text-xs">
              <button
                type="button"
                onClick={() => setFacingMode("environment")}
                className={`flex-1 min-h-[32px] rounded-lg border font-medium ${facingMode === "environment" ? "border-amber-500 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400" : "border-slate-300 dark:border-slate-600 text-slate-500"}`}
              >
                Back camera
              </button>
              <button
                type="button"
                onClick={() => setFacingMode("user")}
                className={`flex-1 min-h-[32px] rounded-lg border font-medium ${facingMode === "user" ? "border-amber-500 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400" : "border-slate-300 dark:border-slate-600 text-slate-500"}`}
              >
                Front camera
              </button>
            </div>
          )}
        </>
      )}

      {state === "recording" && mode === "video" && (
        <video ref={videoPreviewRef} autoPlay muted playsInline className="w-full rounded-lg bg-black aspect-video" />
      )}

      {state === "recording" ? (
        <button
          type="button"
          onClick={stopRecording}
          className="w-full min-h-[48px] rounded-lg bg-red-600 hover:bg-red-700 text-white font-semibold text-sm flex items-center justify-center gap-2"
        >
          <Square className="w-4 h-4" fill="currentColor" />
          Stop recording ({Math.floor(elapsedSeconds / 60)}:{String(elapsedSeconds % 60).padStart(2, "0")})
        </button>
      ) : state === "reviewing" ? (
        <div className="space-y-2">
          {mode === "video" ? (
            <video src={previewUrl ?? undefined} controls playsInline className="w-full rounded-lg bg-black aspect-video" />
          ) : (
            <audio src={previewUrl ?? undefined} controls className="w-full" />
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={discardRecording}
              className="flex-1 min-h-[44px] rounded-lg border border-slate-300 dark:border-slate-600 font-semibold text-sm"
            >
              Discard
            </button>
            <button
              type="button"
              onClick={submitRecording}
              className="flex-1 min-h-[44px] rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-semibold text-sm"
            >
              Submit
            </button>
          </div>
        </div>
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
```

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npx vitest run`
Expected: all tests pass, same count as after Task 1 (no new tests expected from this task — matches the established convention that this interactive component isn't unit tested).

- [ ] **Step 4: Commit**

```bash
git add src/app/time-tracking/VoiceRecorder.tsx
git commit -m "feat: add review/discard/retry step and camera flip to voice/video recording"
```

---

## Task 3: Live verification

**Files:** None (verification only).

- [ ] **Step 1: Run the full test suite and typecheck**

Run: `npx vitest run && npx tsc --noEmit`
Expected: all tests pass, no type errors.

- [ ] **Step 2: Manual browser check — chat formatting**

As an office/management role, open the assistant chat (bubble or `/dashboard` panel) and ask a question likely to produce a list or emphasized job names, e.g. "Which jobs are active?" or "What can you help me with?" — confirm bold text renders as actual bold (no literal `**`) and any list renders as real bullet points, not `- ` prefixed lines.

- [ ] **Step 3: Manual browser check — voice recorder, audio**

As a technician on `/time-tracking`, record a short voice note. Confirm: after stopping, a review screen appears with audio playback controls (not an immediate upload). Play it back. Press Discard — confirm it returns to the idle recorder with no note created. Record again, this time press Submit — confirm the existing behavior (voice note saved, "transcribing now" message) still works.

- [ ] **Step 4: Manual browser check — voice recorder, video + camera flip**

Switch to Video mode — confirm the Back camera / Front camera toggle appears, defaulting to Back camera selected. Record a short video with each camera choice (on a device/browser with two cameras, e.g. a phone) and confirm the live preview during recording reflects the chosen camera. After stopping, confirm the review screen shows a video playback element with controls, and Discard/Submit both work as with audio.

- [ ] **Step 5: Manual browser check — retry on failed upload**

Record a short note, then before pressing Submit, disable network access (e.g. browser dev tools "Offline" mode) and press Submit. Confirm an error message appears ("Failed to upload. Your recording is still here — try again.") while the review screen (with playback and Discard/Submit) remains visible — re-enable network and press Submit again, confirming the same recording uploads successfully without needing to re-record.
