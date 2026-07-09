# Voice Recorder Review/Retry + Chat Message Formatting Design

**Goal:** Two small, independent UX fixes surfaced after the AI Company Assistant shipped: (1) `VoiceRecorder.tsx` currently uploads a recording the instant it stops, with no way to preview, discard, flip the camera, or retry a failed upload without losing the recording; (2) the AI chat widget renders assistant replies as raw text, so markdown the model produces (`**bold**`, bullet lists) shows up literally instead of being formatted.

**Architecture:** Both changes are scoped to their own files with no shared code between them — they're bundled into one spec only because they were raised together, not because they're related.

## Part 1: Voice Recorder — preview, discard, camera flip, retry

**Current behavior** (`src/app/time-tracking/VoiceRecorder.tsx`): pressing Stop calls `stopAndUpload()`, which stops the `MediaRecorder`, immediately builds a `Blob` from the collected chunks, and uploads it. If the upload fails, the blob is discarded and the UI falls back to the idle "Record" button — any recorded content is unrecoverable. Video mode always requests the browser's default camera (no `facingMode` constraint), so there's no way to choose or switch which camera records.

**New state machine:** insert a `reviewing` state between `recording` and `uploading`.

```
idle → recording → reviewing → uploading → done
                        ↑___________|
                     (upload failed, blob retained, retry)
```

- `stopAndUpload()` is split: stopping the recorder now builds the `Blob`, stores it in a new `recordedBlob` state (not just the transient `chunksRef`), creates an object URL for preview, and transitions to `reviewing` — no upload yet.
- `reviewing` renders a native `<video controls>` (video mode) or `<audio controls>` (audio mode) sourced from the object URL, plus two buttons: **Discard** and **Submit**.
  - Discard: revokes the object URL, clears `recordedBlob`, resets to `idle`.
  - Submit: transitions to `uploading`, performs the existing upload + voice-note-create fetch calls against `recordedBlob`.
- **Retry on failure:** if the upload fails, state returns to `reviewing` (not a dead-end error state) with an inline error message shown above the same Discard/Submit buttons. The blob is still in memory, so Submit retries the same upload; Discard is still available to abandon it.
- Object URLs are revoked on discard, on successful upload, and on component unmount (via a `useEffect` cleanup) to avoid leaking memory across repeated recordings.

**Camera flip:** a `facingMode: "environment" | "user"` toggle, shown only in `idle` when Video mode is selected, defaulting to `"environment"` (back camera). Two small pill buttons ("Back camera" / "Front camera") alongside the existing Audio/Video mode toggle. This is a pre-recording choice only (no mid-recording switch, per your earlier decision) — it just changes the constraint passed to `getUserMedia` when Record is pressed: `{ audio: true, video: { facingMode } }`.

**Testing:** no automated tests for this file — matches the codebase's established convention that interactive client components (this one included, already untested) are verified live rather than unit tested. Verification: record audio, preview, discard, re-record, submit; record video, flip camera, record, preview, submit; simulate a failed upload (e.g. by briefly disabling network) and confirm retry works without re-recording.

## Part 2: Chat message formatting

**Current behavior** (`src/components/assistant/ChatWidget.tsx:69`): `{m.content}` renders the assistant's raw reply string directly, so `**Job 123**` or a `- item` list shows up with literal asterisks/dashes instead of being formatted.

**New file:** `src/lib/chat/formatMessage.tsx`, exporting `renderFormattedMessage(content: string): React.ReactNode`.

Behavior:
1. Split `content` into lines.
2. Group consecutive lines starting with `-` or `* ` (with a space after) into a `<ul>` of `<li>` items (stripping the marker).
3. Non-list lines are grouped into paragraphs, with blank lines marking paragraph breaks (consecutive blank lines collapse to one break, matching normal markdown-ish behavior).
4. Within every line/paragraph (list items included), inline-parse `**bold**` spans via a regex split, alternating plain text nodes and `<strong>` nodes. Unmatched/lone `**` (an odd count) is left as literal text rather than swallowed.

This intentionally does **not** handle headings, code blocks, links, tables, or nested lists — Claude's replies in this chat context are short conversational answers, not documents, and the two patterns handled (bold + flat bullet lists) are what the model actually produces when listing job names or summarizing results. No new dependency is added.

`ChatWidget.tsx` calls `renderFormattedMessage(m.content)` only for `role === "assistant"` messages (line 69's `{m.content}` becomes conditional: assistant messages render through the formatter, user messages stay as plain text — no reason to parse markdown out of what the technician typed).

**Testing:** `renderFormattedMessage` is a pure function in `src/lib/`, so it gets real unit tests per the codebase's convention (logic in `lib/` is tested; the `ChatWidget` component itself, which just calls it, is not) — covering: plain text passthrough, a single bold span, multiple bold spans, a bullet list, mixed paragraph + bullet list content, and an unmatched lone `**` staying literal.

## Global Constraints

- No new npm dependencies.
- No API/schema changes — both fixes are pure client-side rendering/UX changes; the voice-note upload payload and the chat message request/response shapes are unchanged.
- `VoiceRecorder.tsx`'s existing recording/upload logic (MIME type selection, extension mapping, the `mediaType` field sent to the create endpoint) is preserved exactly — only *when* the upload fires changes, not *how*.
