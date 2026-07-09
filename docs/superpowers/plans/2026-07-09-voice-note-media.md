# Voice Note Video & Photo Attachments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a technician record video (not just audio) for a voice note — still transcribed the same way — and attach one or more photos while reviewing/editing the transcript before sending. Add a clear, complete display of transcript + summary + video + photos on the job detail page.

**Architecture:** Maximum reuse of what already exists, per explicit instruction to avoid redundant work: the AssemblyAI transcription pipeline (`uploadAudioToAssemblyAI`/`submitTranscription`/`fetchTranscript`, the webhook route) is untouched — AssemblyAI accepts video files directly and extracts the audio track server-side, so a video-mode recording flows through the exact same functions as an audio-mode one. Photo upload reuses the existing `/api/upload/photo` route as-is (already private-blob, already used by Variations). Serving private video/photo blobs back to the browser reuses the existing `/api/photos` proxy route as-is (it already streams any private blob regardless of content type). The only new things: a `mediaType` column on `VoiceNote`, a new `VoiceNotePhoto` table, a widened upload-size/type allowlist for video, a `photoUrls` field on the send request, and client UI for the mode toggle and photo picker. Two small pieces of duplicated logic (image compression, blob-ownership validation) get extracted to shared files instead of copy-pasted, since this plan needs both a second time.

**Tech Stack:** Same as prior Voice Notes plans — Next.js 14 App Router, Prisma 7, Zod 4, browser `MediaRecorder`/`getUserMedia` (now with `video: true` as an option), Vitest.

## Global Constraints

- Follow `requireRole([...]).catch(() => null)` → 401 on every authenticated route.
- Every blob URL a client submits (audio/video recording, photos) must be validated as (a) actually hosted on `*.blob.vercel-storage.com` and (b) stored under that specific user's own folder prefix, before the server ever fetches it with `BLOB_READ_WRITE_TOKEN` attached — this is the same SSRF/credential-leak class of bug fixed earlier this session for `audioUrl`; the shared helper built in Task 2 must be used for every new URL-accepting field in this plan, not reimplemented ad hoc.
- TDD for every route and `lib` function. Client components (`VoiceRecorder.tsx`, `PendingVoiceNoteReview.tsx`, the job detail page) are not unit tested — matches this codebase's established, consistent convention (verified live, not via Vitest/jsdom).
- Do not build a new upload route for video — extend the existing `/api/upload/voice-note` route's allowlist/size limit. Do not build a new upload route for photos — reuse `/api/upload/photo` exactly as it is today. Do not build a new "serve a private blob" route — reuse `/api/photos?url=...` exactly as it is today.
- `AiAuditLog`/`summarizeTranscript`/`calculateCostUsd` are unchanged by this plan — video and audio notes are summarized identically, since AssemblyAI returns plain text either way.

---

## Task 1: Extract `compressImage` to a shared file

**Files:**
- Create: `src/lib/upload/compressImage.ts`
- Modify: `src/app/variations/VariationForm.tsx`

**Interfaces:**
- Produces: `compressImage(file: File): Promise<Blob>` — a browser-only (Canvas API) JPEG compressor, resizing to a max 2048px dimension at 0.75 quality. Consumed by Task 7 (the new photo-attach UI) as well as the existing `VariationForm.tsx`.

- [ ] **Step 1: Create the shared file**

Create `src/lib/upload/compressImage.ts` with exactly this content (moved verbatim from `VariationForm.tsx`, unchanged):

```typescript
export async function compressImage(file: File): Promise<Blob> {
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
```

No test for this file — it's browser-canvas-only, same convention as the rest of this plan's client code (see Global Constraints).

- [ ] **Step 2: Update `VariationForm.tsx` to import it instead of defining it locally**

In `src/app/variations/VariationForm.tsx`, replace the local function definition:

```typescript
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
```

With:

```typescript
"use client";

import { useState, useTransition, useRef } from "react";
import { compressImage } from "@/lib/upload/compressImage";
```

- [ ] **Step 3: Verify nothing broke**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npx vitest run`
Expected: all existing tests pass, count unchanged.

- [ ] **Step 4: Commit**

```bash
git add src/lib/upload/compressImage.ts src/app/variations/VariationForm.tsx
git commit -m "refactor: extract compressImage to a shared file"
```

---

## Task 2: Extract blob-ownership validation to a shared file

**Files:**
- Create: `src/lib/blob/ownership.ts`
- Test: `src/lib/blob/__tests__/ownership.test.ts`
- Modify: `src/app/api/jobs/[id]/voice-notes/route.ts`

**Interfaces:**
- Produces: `isOwnedBlobUrl(url: string, userId: string, folder: string): boolean` — true only if `url` is a real `*.blob.vercel-storage.com` URL AND its path starts with `/${folder}/${userId}/`. Consumed by the existing voice-notes create route (Task 2 of this task, migrated from its current inline copy) and by Task 5 (photo validation in the send route).

- [ ] **Step 1: Write the failing tests**

Create `src/lib/blob/__tests__/ownership.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { isOwnedBlobUrl } from "../ownership";

describe("isOwnedBlobUrl", () => {
  it("accepts a URL on the blob host, under the correct folder and user id", () => {
    const result = isOwnedBlobUrl(
      "https://example.blob.vercel-storage.com/voice-notes/user1/123.webm",
      "user1",
      "voice-notes"
    );
    expect(result).toBe(true);
  });

  it("rejects a URL on a different (non-blob-storage) host", () => {
    const result = isOwnedBlobUrl("https://attacker.example/collect", "user1", "voice-notes");
    expect(result).toBe(false);
  });

  it("rejects a URL under a different user's folder", () => {
    const result = isOwnedBlobUrl(
      "https://example.blob.vercel-storage.com/voice-notes/other-user/123.webm",
      "user1",
      "voice-notes"
    );
    expect(result).toBe(false);
  });

  it("rejects a URL under the wrong top-level folder", () => {
    const result = isOwnedBlobUrl(
      "https://example.blob.vercel-storage.com/photos/user1/123.jpg",
      "user1",
      "voice-notes"
    );
    expect(result).toBe(false);
  });

  it("rejects a malformed URL instead of throwing", () => {
    const result = isOwnedBlobUrl("not-a-url", "user1", "voice-notes");
    expect(result).toBe(false);
  });

  it("accepts a URL under a different folder when that folder is what's asked for (e.g. variations)", () => {
    const result = isOwnedBlobUrl(
      "https://example.blob.vercel-storage.com/variations/user1/123.jpg",
      "user1",
      "variations"
    );
    expect(result).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/blob/__tests__/ownership.test.ts`
Expected: FAIL — `Cannot find module '../ownership'`.

- [ ] **Step 3: Implement**

Create `src/lib/blob/ownership.ts`:

```typescript
// Prevents SSRF via substring bypass and ensures a caller can only reference
// blobs stored under their own folder — a server route that fetches a
// caller-supplied URL with BLOB_READ_WRITE_TOKEN attached would otherwise
// leak that credential (and other users' private files) to any URL a
// malicious request supplies.
export function isOwnedBlobUrl(url: string, userId: string, folder: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (!parsed.hostname.endsWith(".blob.vercel-storage.com")) return false;
  if (!parsed.pathname.startsWith(`/${folder}/${userId}/`)) return false;
  return true;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/blob/__tests__/ownership.test.ts`
Expected: PASS, all 6 tests.

- [ ] **Step 5: Migrate the existing inline copy to use the shared function**

In `src/app/api/jobs/[id]/voice-notes/route.ts`, replace:

```typescript
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/clerk";
import { db } from "@/lib/db/client";
import { validateVoiceNoteInput } from "@/lib/voice-notes/validate";
import { uploadAudioToAssemblyAI, submitTranscription } from "@/lib/ai/assemblyai";

// Prevents SSRF via substring bypass and ensures technicians can only reference
// blobs stored under their own voice-notes folder — the server fetches this URL
// with the BLOB_READ_WRITE_TOKEN attached, so a spoofed URL would leak that
// credential (and other technicians' audio) to an attacker-controlled host.
function isOwnedBlobUrl(audioUrl: string, userId: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(audioUrl);
  } catch {
    return false;
  }
  if (!parsed.hostname.endsWith(".blob.vercel-storage.com")) return false;
  if (!parsed.pathname.startsWith(`/voice-notes/${userId}/`)) return false;
  return true;
}
```

With:

```typescript
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/clerk";
import { db } from "@/lib/db/client";
import { validateVoiceNoteInput } from "@/lib/voice-notes/validate";
import { uploadAudioToAssemblyAI, submitTranscription } from "@/lib/ai/assemblyai";
import { isOwnedBlobUrl } from "@/lib/blob/ownership";
```

Then find the call site further down in the same file:

```typescript
  if (!isOwnedBlobUrl(audioUrl, user.id)) {
```

Replace it with:

```typescript
  if (!isOwnedBlobUrl(audioUrl, user.id, "voice-notes")) {
```

- [ ] **Step 6: Verify the existing route's tests still pass unmodified**

Run: `npx vitest run "src/app/api/jobs/[id]/voice-notes/__tests__/route.test.ts"`
Expected: PASS, all existing tests (this is a pure refactor — the function's behavior is identical, just relocated and given an explicit folder argument instead of a hardcoded one).

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/lib/blob/ownership.ts src/lib/blob/__tests__/ownership.test.ts "src/app/api/jobs/[id]/voice-notes/route.ts"
git commit -m "refactor: extract blob-ownership validation to a shared, folder-parameterized helper"
```

---

## Task 3: Schema — `mediaType` on `VoiceNote`, new `VoiceNotePhoto` table

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_add_voice_note_media/migration.sql`

**Interfaces:**
- Produces: `VoiceNoteMediaType` enum (`audio`, `video`), `VoiceNote.mediaType` (defaults `audio` — every existing row is audio, so the default backfills correctly), `VoiceNotePhoto` model (`id`, `voiceNoteId`, `photoUrl`, `createdAt`), back-relation `VoiceNote.photos`.

- [ ] **Step 1: Add the enum, column, and new model**

In `prisma/schema.prisma`, add this enum near the other `VoiceNote*` enums:

```prisma
enum VoiceNoteMediaType {
  audio
  video
}
```

Add `mediaType` to the existing `VoiceNote` model — find:

```prisma
model VoiceNote {
  id              String          @id @default(uuid())
  jobId           String
  technicianId    String
  audioUrl        String
  durationSeconds Int
  transcript      String?
  summary         String?
  actionItems     Json?
  status          VoiceNoteStatus @default(pending)
  assemblyaiId    String?         @unique
  createdAt       DateTime        @default(now())

  job        Job  @relation(fields: [jobId], references: [id])
  technician User @relation(fields: [technicianId], references: [id])

  @@index([jobId])
  @@index([status])
}
```

Replace it with (adds `mediaType` after `audioUrl`, adds the `photos` back-relation):

```prisma
model VoiceNote {
  id              String             @id @default(uuid())
  jobId           String
  technicianId    String
  audioUrl        String
  mediaType       VoiceNoteMediaType @default(audio)
  durationSeconds Int
  transcript      String?
  summary         String?
  actionItems     Json?
  status          VoiceNoteStatus    @default(pending)
  assemblyaiId    String?            @unique
  createdAt       DateTime           @default(now())

  job        Job              @relation(fields: [jobId], references: [id])
  technician User             @relation(fields: [technicianId], references: [id])
  photos     VoiceNotePhoto[]

  @@index([jobId])
  @@index([status])
}
```

Add a new model directly after it:

```prisma
model VoiceNotePhoto {
  id          String   @id @default(uuid())
  voiceNoteId String
  photoUrl    String
  createdAt   DateTime @default(now())

  voiceNote VoiceNote @relation(fields: [voiceNoteId], references: [id])

  @@index([voiceNoteId])
}
```

- [ ] **Step 2: Verify the schema compiles**

Run: `npx prisma generate`
Expected: `✔ Generated Prisma Client` with no errors.

- [ ] **Step 3: Preview the SQL diff (read-only, confirms purely additive)**

Run: `npx prisma migrate diff --from-config-datasource prisma.config.ts --to-schema prisma/schema.prisma --script`
Expected: `CREATE TYPE "VoiceNoteMediaType"`, `ALTER TABLE "VoiceNote" ADD COLUMN "mediaType" ... DEFAULT 'audio'`, `CREATE TABLE "VoiceNotePhoto"` plus its index and foreign key. No `DROP` anywhere, and the `ALTER TABLE` on `VoiceNote` only ADDs a column with a default (safe against existing rows) — it does not touch any other existing column. If anything else appears, stop and investigate before continuing.

- [ ] **Step 4: Write the migration file**

Generate a timestamp with `date -u +%Y%m%d%H%M%S`, then copy the exact SQL from Step 3's output into `prisma/migrations/<timestamp>_add_voice_note_media/migration.sql`.

- [ ] **Step 5: Apply it directly**

Run: `npx prisma db execute --file prisma/migrations/<timestamp>_add_voice_note_media/migration.sql`
Expected: `Script executed successfully.`

- [ ] **Step 6: Mark the migration as resolved**

Run: `npx prisma migrate resolve --applied <timestamp>_add_voice_note_media`
Expected: confirms the migration is recorded as applied.

- [ ] **Step 7: Verify live**

```bash
npx tsx --env-file .env.local -e '
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
const db = new PrismaClient({ adapter });
(async () => {
  const count = await db.voiceNotePhoto.count();
  const existing = await db.voiceNote.findFirst({ select: { mediaType: true } });
  console.log("VoiceNotePhoto row count:", count);
  console.log("An existing VoiceNote row's mediaType (should be \"audio\" via default backfill):", existing?.mediaType);
  await db.$disconnect();
})();
'
```
Expected: `VoiceNotePhoto row count: 0`, and the existing row's `mediaType` prints `audio` (proves the default correctly backfilled pre-existing rows, not left null).

- [ ] **Step 8: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat: add mediaType to VoiceNote and a new VoiceNotePhoto table"
```

---

## Task 4: Widen the upload route for video; accept `mediaType` when creating a voice note

**Files:**
- Modify: `src/app/api/upload/voice-note/route.ts`
- Modify: `src/app/api/upload/voice-note/__tests__/route.test.ts`
- Modify: `src/lib/voice-notes/validate.ts`
- Modify: `src/lib/voice-notes/__tests__/validate.test.ts`
- Modify: `src/app/api/jobs/[id]/voice-notes/route.ts`
- Modify: `src/app/api/jobs/[id]/voice-notes/__tests__/route.test.ts`

**Interfaces:**
- Produces: the upload route now accepts `video/webm`/`video/mp4` in addition to the existing audio types, with a 100 MB cap (was 25 MB). `validateVoiceNoteInput` gains a required `mediaType: "audio" | "video"` field. The create route stores it on the new `VoiceNote` row.

- [ ] **Step 1: Write the failing upload-route tests**

In `src/app/api/upload/voice-note/__tests__/route.test.ts`, find the existing size-limit test:

```typescript
  it("returns 413 when the file exceeds the size limit", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockTechnician as any);
    const bigChunk = new Uint8Array(26 * 1024 * 1024);
    const res = await POST(makeReq(new Blob([bigChunk], { type: "audio/webm" })));
    expect(res.status).toBe(413);
  });
```

Replace it with (same test, updated to the new 100 MB threshold):

```typescript
  it("returns 413 when the file exceeds the size limit", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockTechnician as any);
    const bigChunk = new Uint8Array(101 * 1024 * 1024);
    const res = await POST(makeReq(new Blob([bigChunk], { type: "audio/webm" })));
    expect(res.status).toBe(413);
  });
```

Then add two new tests at the end of the `describe` block, right before the closing `});`:

```typescript

  it("accepts a video/webm file (video recordings share the same upload route)", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockTechnician as any);
    vi.mocked(put).mockResolvedValue({ url: "https://example.blob.vercel-storage.com/voice-notes/t1/123.webm" } as any);

    const res = await POST(makeReq(new Blob(["video bytes"], { type: "video/webm" })));

    expect(res.status).toBe(201);
  });

  it("accepts a file just under the new 100 MB limit", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockTechnician as any);
    vi.mocked(put).mockResolvedValue({ url: "https://example.blob.vercel-storage.com/voice-notes/t1/123.webm" } as any);

    const okChunk = new Uint8Array(99 * 1024 * 1024);
    const res = await POST(makeReq(new Blob([okChunk], { type: "video/webm" })));

    expect(res.status).toBe(201);
  });
```

- [ ] **Step 2: Run tests to verify the new/changed ones fail**

Run: `npx vitest run src/app/api/upload/voice-note/__tests__/route.test.ts`
Expected: FAIL on the two new tests (`video/webm` currently rejected with 422; the 99 MB file currently rejected with 413 under the old 25 MB cap) and on the resized 413 test (101 MB currently accepted, since the old check is `> 25MB` not `> 100MB` — actually it would still correctly 413 since 101MB > 25MB; the important failures are the two new tests). Confirm at least the two new tests fail for the right reason (video type/size not yet allowed).

- [ ] **Step 3: Implement**

In `src/app/api/upload/voice-note/route.ts`, replace:

```typescript
const ALLOWED_TYPES = ["audio/webm", "audio/mp4", "audio/wav", "audio/mpeg", "audio/ogg"];
const MAX_BYTES = 25 * 1024 * 1024;
```

With:

```typescript
const ALLOWED_TYPES = [
  "audio/webm", "audio/mp4", "audio/wav", "audio/mpeg", "audio/ogg",
  "video/webm", "video/mp4",
];
const MAX_BYTES = 100 * 1024 * 1024;
```

Find the size-limit error message:

```typescript
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Recording too large. Maximum 25 MB (roughly 30 minutes)." }, { status: 413 });
  }
```

Replace with:

```typescript
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Recording too large. Maximum 100 MB." }, { status: 413 });
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/app/api/upload/voice-note/__tests__/route.test.ts`
Expected: PASS, all 9 tests (7 existing + 2 new).

- [ ] **Step 5: Write the failing validate.ts test for `mediaType`**

In `src/lib/voice-notes/__tests__/validate.test.ts`, find the `validateVoiceNoteInput` describe block's `valid` fixture:

```typescript
describe("validateVoiceNoteInput", () => {
  const valid = {
    audioUrl: "https://example.blob.vercel-storage.com/voice-notes/u1/123.webm",
    durationSeconds: 42,
  };

  it("accepts a valid payload", () => {
    expect(validateVoiceNoteInput(valid).success).toBe(true);
  });
```

Replace with (adds `mediaType` to the fixture, adds two new test cases):

```typescript
describe("validateVoiceNoteInput", () => {
  const valid = {
    audioUrl: "https://example.blob.vercel-storage.com/voice-notes/u1/123.webm",
    durationSeconds: 42,
    mediaType: "audio",
  };

  it("accepts a valid payload", () => {
    expect(validateVoiceNoteInput(valid).success).toBe(true);
  });

  it("accepts mediaType: video", () => {
    expect(validateVoiceNoteInput({ ...valid, mediaType: "video" }).success).toBe(true);
  });

  it("rejects an invalid mediaType value", () => {
    expect(validateVoiceNoteInput({ ...valid, mediaType: "photo" }).success).toBe(false);
  });
```

(Leave the rest of that `describe` block — the other existing test cases below it — unchanged; they already use `valid` via spread/destructure and will continue to pass with `mediaType` present.)

- [ ] **Step 6: Run tests to verify they fail**

Run: `npx vitest run src/lib/voice-notes/__tests__/validate.test.ts`
Expected: FAIL on the two new tests — `mediaType` isn't part of the schema yet, so `"photo"` isn't rejected specifically for that reason (it's just ignored by Zod's default non-strict object parsing) and there's nothing distinguishing `"video"` as valid either. (The existing "accepts a valid payload" test will still pass even with `mediaType` in the fixture, since Zod ignores unknown keys by default — that's expected and fine, it isn't testing the new behavior.)

- [ ] **Step 7: Implement**

In `src/lib/voice-notes/validate.ts`, replace:

```typescript
export const voiceNoteInputSchema = z.object({
  audioUrl: z.string().url(),
  durationSeconds: z.number().positive(),
});
```

With:

```typescript
export const voiceNoteInputSchema = z.object({
  audioUrl: z.string().url(),
  durationSeconds: z.number().positive(),
  mediaType: z.enum(["audio", "video"]),
});
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `npx vitest run src/lib/voice-notes/__tests__/validate.test.ts`
Expected: PASS, all 9 tests (4 original `validateVoiceNoteInput` cases + 2 new `mediaType` cases in this step + the 3 pre-existing `validateSendVoiceNoteInput` cases, which are untouched at this point in the plan — Task 5 adds more to that block later).

- [ ] **Step 9: Update the create-voice-note route and its tests to pass through `mediaType`**

In `src/app/api/jobs/[id]/voice-notes/__tests__/route.test.ts`, find `validBody`:

```typescript
const validBody = { audioUrl: "https://example.blob.vercel-storage.com/voice-notes/t1/123.webm", durationSeconds: 60 };
```

Replace with:

```typescript
const validBody = { audioUrl: "https://example.blob.vercel-storage.com/voice-notes/t1/123.webm", durationSeconds: 60, mediaType: "audio" };
```

Then find the success-path test's assertion on `db.voiceNote.create`:

```typescript
    expect(db.voiceNote.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ jobId: "job1", technicianId: "t1", status: "pending" }),
      })
    );
```

Replace with:

```typescript
    expect(db.voiceNote.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ jobId: "job1", technicianId: "t1", status: "pending", mediaType: "audio" }),
      })
    );
```

Add one new test at the end of the `describe` block, right before its closing `});`:

```typescript

  it("stores mediaType: video when a video recording is submitted", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockTechnician as any);
    vi.mocked(db.job.findFirst).mockResolvedValue({ id: "job1" } as any);
    vi.mocked(db.assignment.findFirst).mockResolvedValue({ id: "a1" } as any);
    vi.mocked(db.voiceNote.create).mockResolvedValue({ id: "vn1", jobId: "job1", technicianId: "t1", status: "pending" } as any);
    vi.mocked(uploadAudioToAssemblyAI).mockResolvedValue("https://cdn.assemblyai.com/upload/xyz");
    vi.mocked(submitTranscription).mockResolvedValue({ id: "transcript-abc" });
    vi.mocked(db.voiceNote.update).mockResolvedValue({} as any);

    await POST(makeReq({ ...validBody, mediaType: "video" }), { params: { id: "job1" } });

    expect(db.voiceNote.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ mediaType: "video" }) })
    );
  });
```

- [ ] **Step 10: Run tests to verify they fail**

Run: `npx vitest run "src/app/api/jobs/[id]/voice-notes/__tests__/route.test.ts"`
Expected: FAIL — the route doesn't pass `mediaType` through to `db.voiceNote.create` yet.

- [ ] **Step 11: Implement**

In `src/app/api/jobs/[id]/voice-notes/route.ts`, find:

```typescript
  const { audioUrl, durationSeconds } = parsed.data;
```

Replace with:

```typescript
  const { audioUrl, durationSeconds, mediaType } = parsed.data;
```

Then find:

```typescript
  const voiceNote = await db.voiceNote.create({
    data: { jobId: params.id, technicianId: user.id, audioUrl, durationSeconds, status: "pending" },
  });
```

Replace with:

```typescript
  const voiceNote = await db.voiceNote.create({
    data: { jobId: params.id, technicianId: user.id, audioUrl, durationSeconds, mediaType, status: "pending" },
  });
```

- [ ] **Step 12: Run tests to verify they pass**

Run: `npx vitest run "src/app/api/jobs/[id]/voice-notes/__tests__/route.test.ts"`
Expected: PASS, all tests (existing + 1 new).

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 13: Commit**

```bash
git add src/app/api/upload/voice-note/ src/lib/voice-notes/ "src/app/api/jobs/[id]/voice-notes/route.ts" "src/app/api/jobs/[id]/voice-notes/__tests__/route.test.ts"
git commit -m "feat: allow video uploads and record mediaType on voice notes"
```

---

## Task 5: Accept photo attachments in the send route

**Files:**
- Modify: `src/lib/voice-notes/validate.ts`
- Modify: `src/lib/voice-notes/__tests__/validate.test.ts`
- Modify: `src/app/api/jobs/[id]/voice-notes/[voiceNoteId]/send/route.ts`
- Modify: `src/app/api/jobs/[id]/voice-notes/[voiceNoteId]/send/__tests__/route.test.ts`

**Interfaces:**
- Consumes: `isOwnedBlobUrl` (Task 2).
- Produces: the send route now accepts an optional `photoUrls: string[]` (max 6) in its body; every URL is validated as owned by the caller under the `variations` folder (the existing photo-upload route's storage convention) before any are persisted; a `VoiceNotePhoto` row is created for each, in both the success and the Claude-failure-degradation paths (photos aren't dependent on summarization succeeding).

- [ ] **Step 1: Write the failing validate.ts tests**

In `src/lib/voice-notes/__tests__/validate.test.ts`, find:

```typescript
describe("validateSendVoiceNoteInput", () => {
  it("accepts a non-empty transcript", () => {
    const result = validateSendVoiceNoteInput({ transcript: "Replaced the fan belt." });
    expect(result.success).toBe(true);
  });
```

Replace with (adds three new cases after the existing one, leave the rest of that describe block below unchanged):

```typescript
describe("validateSendVoiceNoteInput", () => {
  it("accepts a non-empty transcript", () => {
    const result = validateSendVoiceNoteInput({ transcript: "Replaced the fan belt." });
    expect(result.success).toBe(true);
  });

  it("accepts photoUrls as an optional array of URLs", () => {
    const result = validateSendVoiceNoteInput({
      transcript: "Replaced the fan belt.",
      photoUrls: ["https://example.blob.vercel-storage.com/variations/u1/1.jpg"],
    });
    expect(result.success).toBe(true);
  });

  it("defaults photoUrls to an empty array when omitted", () => {
    const result = validateSendVoiceNoteInput({ transcript: "Replaced the fan belt." });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.photoUrls).toEqual([]);
  });

  it("rejects more than 6 photoUrls", () => {
    const urls = Array.from({ length: 7 }, (_, i) => `https://example.blob.vercel-storage.com/variations/u1/${i}.jpg`);
    const result = validateSendVoiceNoteInput({ transcript: "x", photoUrls: urls });
    expect(result.success).toBe(false);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/voice-notes/__tests__/validate.test.ts`
Expected: FAIL on the three new tests — `photoUrls` isn't part of the schema yet.

- [ ] **Step 3: Implement**

In `src/lib/voice-notes/validate.ts`, replace:

```typescript
export const sendVoiceNoteInputSchema = z.object({
  transcript: z.string().min(1),
});
```

With:

```typescript
export const sendVoiceNoteInputSchema = z.object({
  transcript: z.string().min(1),
  photoUrls: z.array(z.string().url()).max(6).optional().default([]),
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/voice-notes/__tests__/validate.test.ts`
Expected: PASS, all tests (existing + 3 new).

- [ ] **Step 5: Write the failing send-route tests**

In `src/app/api/jobs/[id]/voice-notes/[voiceNoteId]/send/__tests__/route.test.ts`, add `voiceNotePhoto` to the mocked `db` object — find:

```typescript
vi.mock("@/lib/db/client", () => ({
  db: {
    voiceNote: { findFirst: vi.fn(), update: vi.fn() },
    aiAuditLog: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}));
```

Replace with:

```typescript
vi.mock("@/lib/db/client", () => ({
  db: {
    voiceNote: { findFirst: vi.fn(), update: vi.fn() },
    voiceNotePhoto: { createMany: vi.fn() },
    aiAuditLog: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}));
```

Then add these three new tests at the end of the `describe` block, right before its closing `});`:

```typescript

  it("returns 400 when a photoUrl isn't owned by the caller", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockTechnician as any);
    vi.mocked(db.voiceNote.findFirst).mockResolvedValue({ id: "vn1", technicianId: "t1" } as any);

    const res = await POST(
      makeReq({ transcript: "x", photoUrls: ["https://example.blob.vercel-storage.com/variations/OTHER-USER/1.jpg"] }),
      { params: { id: "job1", voiceNoteId: "vn1" } }
    );

    expect(res.status).toBe(400);
    expect(db.voiceNote.update).not.toHaveBeenCalled();
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("creates VoiceNotePhoto rows for each photoUrl alongside a successful summary", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockTechnician as any);
    vi.mocked(db.voiceNote.findFirst).mockResolvedValue({ id: "vn1", technicianId: "t1" } as any);
    vi.mocked(summarizeTranscript).mockResolvedValue({
      summary: { summary: "Fixed it.", actionItems: [] },
      promptTokens: 100,
      outputTokens: 20,
    });
    vi.mocked(db.$transaction).mockResolvedValue([{}, {}]);
    vi.mocked(db.voiceNotePhoto.createMany).mockResolvedValue({ count: 1 } as any);

    const photoUrl = "https://example.blob.vercel-storage.com/variations/t1/1.jpg";
    await POST(makeReq({ transcript: "Fixed it.", photoUrls: [photoUrl] }), { params: { id: "job1", voiceNoteId: "vn1" } });

    expect(db.voiceNotePhoto.createMany).toHaveBeenCalledWith({
      data: [{ voiceNoteId: "vn1", photoUrl }],
    });
  });

  it("still creates VoiceNotePhoto rows even when Claude summarization fails", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockTechnician as any);
    vi.mocked(db.voiceNote.findFirst).mockResolvedValue({ id: "vn1", technicianId: "t1" } as any);
    vi.mocked(summarizeTranscript).mockRejectedValue(new Error("Claude API error"));
    vi.mocked(db.voiceNotePhoto.createMany).mockResolvedValue({ count: 1 } as any);

    const photoUrl = "https://example.blob.vercel-storage.com/variations/t1/1.jpg";
    const res = await POST(makeReq({ transcript: "x", photoUrls: [photoUrl] }), { params: { id: "job1", voiceNoteId: "vn1" } });

    expect(res.status).toBe(200);
    expect(db.voiceNotePhoto.createMany).toHaveBeenCalledWith({
      data: [{ voiceNoteId: "vn1", photoUrl }],
    });
  });
```

- [ ] **Step 6: Run tests to verify they fail**

Run: `npx vitest run "src/app/api/jobs/[id]/voice-notes/[voiceNoteId]/send/__tests__/route.test.ts"`
Expected: FAIL on the three new tests — the route doesn't validate or persist `photoUrls` yet.

- [ ] **Step 7: Implement**

Replace the full contents of `src/app/api/jobs/[id]/voice-notes/[voiceNoteId]/send/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/clerk";
import { db } from "@/lib/db/client";
import { validateSendVoiceNoteInput } from "@/lib/voice-notes/validate";
import { summarizeTranscript } from "@/lib/ai/voice-note";
import { calculateCostUsd } from "@/lib/ai/cost";
import { isOwnedBlobUrl } from "@/lib/blob/ownership";

export async function POST(
  req: Request,
  { params }: { params: { id: string; voiceNoteId: string } }
) {
  const user = await requireRole(["technician"]).catch(() => null);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = validateSendVoiceNoteInput(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  }
  const { transcript, photoUrls } = parsed.data;

  // Photos are uploaded via the existing /api/upload/photo route, which stores
  // them under "variations/<userId>/..." — same private-blob convention, just
  // a different folder than voice-note audio/video.
  const allPhotosOwned = photoUrls.every((url) => isOwnedBlobUrl(url, user.id, "variations"));
  if (!allPhotosOwned) {
    return NextResponse.json({ error: "Invalid photo URL" }, { status: 400 });
  }

  const voiceNote = await db.voiceNote.findFirst({
    where: { id: params.voiceNoteId, jobId: params.id, technicianId: user.id, status: "awaiting_review" },
  });
  if (!voiceNote) {
    return NextResponse.json({ error: "Voice note not found or already sent" }, { status: 404 });
  }

  const photoData = photoUrls.map((photoUrl) => ({ voiceNoteId: voiceNote.id, photoUrl }));

  try {
    const { summary, promptTokens, outputTokens } = await summarizeTranscript(transcript);
    const costUsd = calculateCostUsd("claude-haiku-4-5", promptTokens, outputTokens);

    await db.$transaction([
      db.voiceNote.update({
        where: { id: voiceNote.id },
        data: {
          transcript,
          summary: summary.summary,
          actionItems: summary.actionItems,
          status: "transcribed",
        },
      }),
      db.aiAuditLog.create({
        data: { userId: user.id, feature: "voice_note", promptTokens, outputTokens, costUsd },
      }),
    ]);
  } catch (err) {
    console.error("Voice note summarization failed:", err);
    // Same graceful-degradation contract as before: never lose the
    // technician-confirmed transcript even if the summarization step fails.
    await db.voiceNote.update({
      where: { id: voiceNote.id },
      data: { transcript, status: "transcribed" },
    });
  }

  // Photos aren't dependent on summarization succeeding — save them either way.
  await db.voiceNotePhoto.createMany({ data: photoData });

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `npx vitest run "src/app/api/jobs/[id]/voice-notes/[voiceNoteId]/send/__tests__/route.test.ts"`
Expected: PASS, all tests (existing + 3 new).

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add src/lib/voice-notes/ "src/app/api/jobs/[id]/voice-notes/[voiceNoteId]/send/"
git commit -m "feat: accept photo attachments in the send route"
```

---

## Task 6: Video recording mode in `VoiceRecorder`

**Files:**
- Modify: `src/app/time-tracking/VoiceRecorder.tsx`

**Interfaces:**
- No new exports — same `<VoiceRecorder jobId={string} />` component, now with an internal audio/video mode toggle. Sends `mediaType` in its create request, matching Task 4's route contract.

- [ ] **Step 1: Add the mode toggle, video capture, and live preview**

Replace the full contents of `src/app/time-tracking/VoiceRecorder.tsx`:

```tsx
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
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npx vitest run`
Expected: all existing tests still pass, count unchanged (no new tests for this file — see Global Constraints).

- [ ] **Step 3: Commit**

```bash
git add src/app/time-tracking/VoiceRecorder.tsx
git commit -m "feat: add video recording mode to the voice recorder"
```

---

## Task 7: Photo attachment in the review/edit UI

**Files:**
- Modify: `src/app/time-tracking/PendingVoiceNoteReview.tsx`

**Interfaces:**
- Consumes: `compressImage` (Task 1).
- Produces: the "Send" button's request now includes `photoUrls` for whichever photos were attached to that specific note before sending.

- [ ] **Step 1: Add photo picking, previewing, and inclusion in the Send request**

Replace the full contents of `src/app/time-tracking/PendingVoiceNoteReview.tsx`:

```tsx
"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Camera, X } from "lucide-react";
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
      {notes.map((note) => (
        <div key={note.id} className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/10 p-3 space-y-2">
          <p className="text-xs font-medium text-amber-700 dark:text-amber-400">Review your voice note</p>
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
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npx vitest run`
Expected: all existing tests still pass, count unchanged.

- [ ] **Step 3: Commit**

```bash
git add src/app/time-tracking/PendingVoiceNoteReview.tsx
git commit -m "feat: let a technician attach photos while reviewing a voice note"
```

---

## Task 8: Display video and photos on the job detail page

**Files:**
- Modify: `src/app/jobs/[id]/page.tsx`

**Interfaces:**
- None new — extends the existing "Voice notes" section's Prisma query and render with `mediaType`/`photos`.

- [ ] **Step 1: Add `photos` to the Prisma query**

In `src/app/jobs/[id]/page.tsx`, find:

```typescript
      voiceNotes: { include: { technician: { select: { name: true } } }, orderBy: { createdAt: "desc" } },
```

Replace with:

```typescript
      voiceNotes: { include: { technician: { select: { name: true } }, photos: true }, orderBy: { createdAt: "desc" } },
```

- [ ] **Step 2: Render the video player and photo thumbnails**

Find this block in the voice notes section:

```tsx
                  {note.transcript && <p className="text-slate-700 dark:text-slate-300">&ldquo;{note.transcript}&rdquo;</p>}
                  {note.summary && <p className="text-xs text-slate-500 dark:text-slate-400">{note.summary}</p>}
```

Replace with (adds the video player above the transcript, and a photo thumbnail row below the summary):

```tsx
                  {note.mediaType === "video" && (
                    <video controls className="w-full rounded-lg" src={`/api/photos?url=${encodeURIComponent(note.audioUrl)}`} />
                  )}
                  {note.transcript && <p className="text-slate-700 dark:text-slate-300">&ldquo;{note.transcript}&rdquo;</p>}
                  {note.summary && <p className="text-xs text-slate-500 dark:text-slate-400">{note.summary}</p>}
                  {note.photos.length > 0 && (
                    <div className="flex gap-2 flex-wrap">
                      {note.photos.map((photo) => (
                        <a key={photo.id} href={`/api/photos?url=${encodeURIComponent(photo.photoUrl)}`} target="_blank" rel="noopener noreferrer">
                          <img
                            src={`/api/photos?url=${encodeURIComponent(photo.photoUrl)}`}
                            alt="Attached"
                            className="w-16 h-16 object-cover rounded-lg border border-slate-200 dark:border-slate-700"
                          />
                        </a>
                      ))}
                    </div>
                  )}
```

- [ ] **Step 3: Verify it compiles and existing tests still pass**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npx vitest run`
Expected: all existing tests still pass, count unchanged.

- [ ] **Step 4: Commit**

```bash
git add "src/app/jobs/[id]/page.tsx"
git commit -m "feat: show video and attached photos on the job detail page"
```

---

## Task 9: Live verification

**Files:** None (verification only).

- [ ] **Step 1: Run the full test suite and typecheck**

Run: `npx vitest run && npx tsc --noEmit`
Expected: all tests pass, no type errors.

- [ ] **Step 2: Push and deploy**

Push `main` to `origin` (with explicit confirmation). No new Vercel env vars needed — this plan reuses every credential already configured.

- [ ] **Step 3: Manual browser check on the live site**

1. As a technician, clock into a job. Toggle to "Video", record a few seconds (confirm the live self-preview appears while recording), stop.
2. In the review box that appears, confirm the transcript came through, attach a photo via "Add photo" (confirm a thumbnail appears with a remove button), edit the transcript text, then tap Send.
3. Open the job's detail page — as a director, click the customer/site name from `/jobs` (not an icon) to get there. Confirm the "Voice notes" section shows: a playable video, the (possibly edited) transcript text in quotes, the AI summary (if `ANTHROPIC_API_KEY` is working on Vercel by this point), and the attached photo as a thumbnail that opens full-size when clicked.
4. Record a plain audio note (no video toggle) and confirm it still works exactly as before — no video player shown for it, just the transcript/summary/photos it has.

- [ ] **Step 4: Verify via the database**

```bash
npx tsx --env-file .env.local -e '
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
const db = new PrismaClient({ adapter });
(async () => {
  const notes = await db.voiceNote.findMany({ orderBy: { createdAt: "desc" }, take: 3, include: { photos: true } });
  console.log(JSON.stringify(notes, null, 2));
  await db.$disconnect();
})();
'
```
Expected: the video note shows `mediaType: "video"`; the sent note(s) show a non-empty `photos` array matching what was attached in the browser.
