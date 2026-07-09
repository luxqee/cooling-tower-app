# Voice Note Review & Edit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a technician see, correct, and confirm the raw AssemblyAI transcript of their voice note before Claude summarizes it — instead of Claude summarizing whatever AssemblyAI heard (right or wrong) automatically and invisibly.

**Architecture:** The `VoiceNoteStatus` lifecycle gains a step: `pending → awaiting_review → transcribed` (or `failed`). The AssemblyAI webhook (built in the prior Voice Notes plan) now stops after saving the raw transcript — it no longer calls Claude. A new technician-only "Send" endpoint does that instead, using whatever text is in the edit box at send time. The time-tracking page polls a small "pending review" endpoint every few seconds while the technician is clocked in, and shows an editable textarea + Send button for anything awaiting review on that job. A new hourly cron auto-finalizes (using the original, unedited transcript) anything left un-reviewed for 24+ hours, so nothing is ever stuck waiting forever if a technician forgets or clocks out.

**Tech Stack:** Same as the prior Voice Notes plan — Next.js 14 App Router, Prisma 7, Zod 4, `@anthropic-ai/sdk` (existing `summarizeTranscript`/`calculateCostUsd`/`AiAuditLog` from that plan, unchanged), Vitest.

## Global Constraints

- Follow the existing `requireRole([...]).catch(() => null)` → 401 pattern on every authenticated route.
- Technician authorization for job-scoped actions matches the established pattern: job `status: { in: ["active", "scheduled"] }` where relevant, technician has an `Assignment` row for the job. The "pending-review" and "send" routes additionally scope every query by `technicianId: user.id` — a technician can only ever see or send their own notes, never a teammate's.
- TDD throughout for every API route and `lib` function. The two client components this plan touches (`VoiceRecorder.tsx`, and the new `PendingVoiceNoteReview.tsx`) are NOT unit tested — this matches this codebase's existing, consistent convention (no client component in this app has a test file; `ClockCard.tsx`, `JobsClient.tsx`, `NewJobForm.tsx`, and the original `VoiceRecorder.tsx` are all verified live/manually, not via Vitest). Verify these two files only via `tsc --noEmit` + the existing suite still passing, then a live browser check (Task 9).
- `AiAuditLog.feature` for every Claude call in this plan is `"voice_note"` (same convention as before) — both the "send" route and the new cron write through it identically.
- The "send" route and the cron's auto-finalize path share the exact same success/failure logic (call `summarizeTranscript`, write `VoiceNote` + `AiAuditLog` together in `db.$transaction([...])` on success, degrade to saving the transcript with `status: "transcribed"` and no summary if Claude throws) — this was the established graceful-degradation behavior from the prior plan's webhook route, now relocated to these two call sites instead of the webhook.
- New cron routes in this codebase follow `src/app/api/cron/cleanup-jobs/route.ts`'s exact pattern: `Authorization: Bearer ${process.env.CRON_SECRET}` check, registered in `vercel.json`'s `crons` array. `CRON_SECRET` already exists as a Vercel env var (used by the existing cleanup-jobs cron) — nothing new to configure there.

---

## Task 1: Add `awaiting_review` to `VoiceNoteStatus`

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_add_voice_note_awaiting_review/migration.sql`

**Interfaces:**
- Produces: a fourth `VoiceNoteStatus` enum value, `awaiting_review`, consumed by every task in this plan.

- [ ] **Step 1: Add the enum value**

In `prisma/schema.prisma`, find the existing `VoiceNoteStatus` enum:

```prisma
enum VoiceNoteStatus {
  pending
  transcribed
  failed
}
```

Add `awaiting_review` as a fourth value (append it — do not reorder the existing three, since Postgres enum-value insertion is simplest and safest as a plain append):

```prisma
enum VoiceNoteStatus {
  pending
  transcribed
  failed
  awaiting_review
}
```

- [ ] **Step 2: Verify the schema compiles**

Run: `npx prisma generate`
Expected: `✔ Generated Prisma Client` with no errors.

- [ ] **Step 3: Preview the SQL diff (read-only, confirms purely additive)**

Run: `npx prisma migrate diff --from-config-datasource prisma.config.ts --to-schema prisma/schema.prisma --script`
Expected: Only `ALTER TYPE "VoiceNoteStatus" ADD VALUE 'awaiting_review';` — no `ALTER`/`DROP` touching any existing table or column. If anything else appears, stop and investigate before continuing.

- [ ] **Step 4: Write the migration file**

Generate a timestamp with `date -u +%Y%m%d%H%M%S`, then copy the exact SQL from Step 3's output into `prisma/migrations/<timestamp>_add_voice_note_awaiting_review/migration.sql`.

- [ ] **Step 5: Apply it directly**

Run: `npx prisma db execute --file prisma/migrations/<timestamp>_add_voice_note_awaiting_review/migration.sql`
Expected: `Script executed successfully.`

- [ ] **Step 6: Mark the migration as resolved**

Run: `npx prisma migrate resolve --applied <timestamp>_add_voice_note_awaiting_review`
Expected: confirms the migration is recorded as applied.

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat: add awaiting_review status to VoiceNote lifecycle"
```

---

## Task 2: Webhook stops summarizing — saves raw transcript for review instead

**Files:**
- Modify: `src/app/api/voice-notes/webhook/route.ts`
- Modify: `src/app/api/voice-notes/webhook/__tests__/route.test.ts`

**Interfaces:**
- Consumes: `fetchTranscript` from `src/lib/ai/assemblyai.ts` (unchanged, existing).
- Produces: on a completed AssemblyAI transcription, the webhook now sets `VoiceNote.status = "awaiting_review"` and saves `transcript` — it no longer calls `summarizeTranscript`, `calculateCostUsd`, or writes `AiAuditLog`. Those move to Task 5 (the new "send" route) and Task 6 (the cron).

- [ ] **Step 1: Write the failing tests**

Replace the full contents of `src/app/api/voice-notes/webhook/__tests__/route.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/db/client", () => ({
  db: {
    voiceNote: { findUnique: vi.fn(), update: vi.fn() },
  },
}));
vi.mock("@/lib/ai/assemblyai", () => ({ fetchTranscript: vi.fn() }));

import { db } from "@/lib/db/client";
import { fetchTranscript } from "@/lib/ai/assemblyai";
import { POST } from "../route";

const originalSecret = process.env.ASSEMBLYAI_WEBHOOK_SECRET;

function makeReq(body: unknown, secret = "correct-secret") {
  return new Request("http://localhost/api/voice-notes/webhook", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-webhook-secret": secret },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.ASSEMBLYAI_WEBHOOK_SECRET = "correct-secret";
});

afterEach(() => {
  process.env.ASSEMBLYAI_WEBHOOK_SECRET = originalSecret;
});

describe("POST /api/voice-notes/webhook", () => {
  it("returns 401 when the shared secret header is wrong", async () => {
    const res = await POST(makeReq({ transcript_id: "t1" }, "wrong-secret"));
    expect(res.status).toBe(401);
  });

  it("returns 400 when transcript_id is missing", async () => {
    const res = await POST(makeReq({}));
    expect(res.status).toBe(400);
  });

  it("returns 404 when no VoiceNote matches the transcript id", async () => {
    vi.mocked(db.voiceNote.findUnique).mockResolvedValue(null);
    const res = await POST(makeReq({ transcript_id: "t1" }));
    expect(res.status).toBe(404);
  });

  it("marks the voice note failed when AssemblyAI reports an error status", async () => {
    vi.mocked(db.voiceNote.findUnique).mockResolvedValue({ id: "vn1" } as any);
    vi.mocked(fetchTranscript).mockResolvedValue({ status: "error", text: null, error: "Transcoding failed" });

    const res = await POST(makeReq({ transcript_id: "t1" }));

    expect(res.status).toBe(200);
    expect(db.voiceNote.update).toHaveBeenCalledWith({ where: { id: "vn1" }, data: { status: "failed" } });
  });

  it("marks the voice note failed when AssemblyAI reports completed but with no text", async () => {
    vi.mocked(db.voiceNote.findUnique).mockResolvedValue({ id: "vn1" } as any);
    vi.mocked(fetchTranscript).mockResolvedValue({ status: "completed", text: null, error: null });

    const res = await POST(makeReq({ transcript_id: "t1" }));

    expect(res.status).toBe(200);
    expect(db.voiceNote.update).toHaveBeenCalledWith({ where: { id: "vn1" }, data: { status: "failed" } });
  });

  it("saves the raw transcript and marks awaiting_review on a completed transcription", async () => {
    vi.mocked(db.voiceNote.findUnique).mockResolvedValue({ id: "vn1" } as any);
    vi.mocked(fetchTranscript).mockResolvedValue({ status: "completed", text: "Replaced fan belt on Tower 3.", error: null });

    const res = await POST(makeReq({ transcript_id: "t1" }));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toEqual({ ok: true });
    expect(db.voiceNote.update).toHaveBeenCalledWith({
      where: { id: "vn1" },
      data: { transcript: "Replaced fan belt on Tower 3.", status: "awaiting_review" },
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/app/api/voice-notes/webhook/__tests__/route.test.ts`
Expected: FAIL — the two new/changed tests fail because the current implementation still calls `summarizeTranscript` (unmocked here, so it will throw) and sets `status: "transcribed"` instead of `"awaiting_review"`.

- [ ] **Step 3: Implement**

Replace the full contents of `src/app/api/voice-notes/webhook/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { fetchTranscript } from "@/lib/ai/assemblyai";

export async function POST(req: Request) {
  const secret = req.headers.get("x-webhook-secret");
  if (secret !== process.env.ASSEMBLYAI_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const transcriptId = body.transcript_id as string | undefined;
  if (!transcriptId) return NextResponse.json({ error: "Missing transcript_id" }, { status: 400 });

  const voiceNote = await db.voiceNote.findUnique({ where: { assemblyaiId: transcriptId } });
  if (!voiceNote) return NextResponse.json({ error: "Voice note not found" }, { status: 404 });

  const result = await fetchTranscript(transcriptId);

  if (result.status === "error" || !result.text) {
    await db.voiceNote.update({ where: { id: voiceNote.id }, data: { status: "failed" } });
    return NextResponse.json({ ok: true });
  }

  // Raw transcript is ready — hand off to the technician for review before
  // any AI summarization happens. Claude runs later, at Send time
  // (POST .../voice-notes/:voiceNoteId/send), on whatever text the
  // technician confirms — not necessarily this raw AssemblyAI output.
  await db.voiceNote.update({
    where: { id: voiceNote.id },
    data: { transcript: result.text, status: "awaiting_review" },
  });

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/app/api/voice-notes/webhook/__tests__/route.test.ts`
Expected: PASS, all 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/voice-notes/webhook/route.ts src/app/api/voice-notes/webhook/__tests__/route.test.ts
git commit -m "refactor: webhook saves raw transcript for review instead of auto-summarizing"
```

---

## Task 3: Extend voice-notes validation with a "send" schema

**Files:**
- Modify: `src/lib/voice-notes/validate.ts`
- Modify: `src/lib/voice-notes/__tests__/validate.test.ts`

**Interfaces:**
- Produces: `validateSendVoiceNoteInput(input: unknown)`, a Zod `safeParse` wrapper returning `{ success: true; data: { transcript: string } } | { success: false; error }`. Consumed by Task 5 (the send route).

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/voice-notes/__tests__/validate.test.ts` (add the import to the existing import line, then add this new `describe` block at the end of the file):

Change the top import line from:
```typescript
import { validateVoiceNoteInput } from "../validate";
```
to:
```typescript
import { validateVoiceNoteInput, validateSendVoiceNoteInput } from "../validate";
```

Then add at the end of the file:

```typescript

describe("validateSendVoiceNoteInput", () => {
  it("accepts a non-empty transcript", () => {
    const result = validateSendVoiceNoteInput({ transcript: "Replaced the fan belt." });
    expect(result.success).toBe(true);
  });

  it("rejects an empty transcript", () => {
    const result = validateSendVoiceNoteInput({ transcript: "" });
    expect(result.success).toBe(false);
  });

  it("rejects a missing transcript", () => {
    const result = validateSendVoiceNoteInput({});
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/voice-notes/__tests__/validate.test.ts`
Expected: FAIL — `validateSendVoiceNoteInput is not a function`.

- [ ] **Step 3: Implement**

Append to `src/lib/voice-notes/validate.ts`:

```typescript

export const sendVoiceNoteInputSchema = z.object({
  transcript: z.string().min(1),
});

export function validateSendVoiceNoteInput(input: unknown) {
  return sendVoiceNoteInputSchema.safeParse(input);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/voice-notes/__tests__/validate.test.ts`
Expected: PASS, all 7 tests (4 existing + 3 new).

- [ ] **Step 5: Commit**

```bash
git add src/lib/voice-notes/validate.ts src/lib/voice-notes/__tests__/validate.test.ts
git commit -m "feat: add send voice note input validation"
```

---

## Task 4: List a technician's own pending-review notes for a job

**Files:**
- Create: `src/app/api/jobs/[id]/voice-notes/pending-review/route.ts`
- Test: `src/app/api/jobs/[id]/voice-notes/pending-review/__tests__/route.test.ts`

**Interfaces:**
- Produces: `GET /api/jobs/:id/voice-notes/pending-review` — returns `Array<{ id: string; transcript: string; createdAt: string }>` for the authenticated technician's own `awaiting_review` notes on that job, oldest first. Consumed by Task 8 (client polling component).

- [ ] **Step 1: Write the failing tests**

Create `src/app/api/jobs/[id]/voice-notes/pending-review/__tests__/route.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/clerk", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/db/client", () => ({
  db: { voiceNote: { findMany: vi.fn() } },
}));

import { requireRole } from "@/lib/auth/clerk";
import { db } from "@/lib/db/client";
import { GET } from "../route";

const mockTechnician = { id: "t1", role: "technician" as const, name: "Jake", clerkId: "c1", email: "j@t.com", isActive: true };

function makeReq() {
  return new Request("http://localhost/api/jobs/job1/voice-notes/pending-review");
}

beforeEach(() => vi.clearAllMocks());

describe("GET /api/jobs/[id]/voice-notes/pending-review", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireRole).mockRejectedValue(new Error("Unauthorized"));
    const res = await GET(makeReq(), { params: { id: "job1" } });
    expect(res.status).toBe(401);
  });

  it("scopes the query to this job, this technician, and awaiting_review status only", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockTechnician as any);
    vi.mocked(db.voiceNote.findMany).mockResolvedValue([]);

    await GET(makeReq(), { params: { id: "job1" } });

    expect(db.voiceNote.findMany).toHaveBeenCalledWith({
      where: { jobId: "job1", technicianId: "t1", status: "awaiting_review" },
      orderBy: { createdAt: "asc" },
      select: { id: true, transcript: true, createdAt: true },
    });
  });

  it("returns the matching notes", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockTechnician as any);
    vi.mocked(db.voiceNote.findMany).mockResolvedValue([
      { id: "vn1", transcript: "Replaced fan belt.", createdAt: new Date("2026-07-09T00:00:00Z") },
    ] as any);

    const res = await GET(makeReq(), { params: { id: "job1" } });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toHaveLength(1);
    expect(data[0].id).toBe("vn1");
    expect(data[0].transcript).toBe("Replaced fan belt.");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run "src/app/api/jobs/[id]/voice-notes/pending-review/__tests__/route.test.ts"`
Expected: FAIL — `Cannot find module '../route'`.

- [ ] **Step 3: Implement**

Create `src/app/api/jobs/[id]/voice-notes/pending-review/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/clerk";
import { db } from "@/lib/db/client";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const user = await requireRole(["technician"]).catch(() => null);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const notes = await db.voiceNote.findMany({
    where: { jobId: params.id, technicianId: user.id, status: "awaiting_review" },
    orderBy: { createdAt: "asc" },
    select: { id: true, transcript: true, createdAt: true },
  });

  return NextResponse.json(notes);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run "src/app/api/jobs/[id]/voice-notes/pending-review/__tests__/route.test.ts"`
Expected: PASS, all 3 tests.

- [ ] **Step 5: Commit**

```bash
git add "src/app/api/jobs/[id]/voice-notes/pending-review/route.ts" "src/app/api/jobs/[id]/voice-notes/pending-review/__tests__/route.test.ts"
git commit -m "feat: add GET /api/jobs/:id/voice-notes/pending-review"
```

---

## Task 5: Send route — technician confirms/edits transcript, triggers Claude summary

**Files:**
- Create: `src/app/api/jobs/[id]/voice-notes/[voiceNoteId]/send/route.ts`
- Test: `src/app/api/jobs/[id]/voice-notes/[voiceNoteId]/send/__tests__/route.test.ts`

**Interfaces:**
- Consumes: `validateSendVoiceNoteInput` (Task 3), `summarizeTranscript` from `src/lib/ai/voice-note.ts` (existing, prior plan), `calculateCostUsd` from `src/lib/ai/cost.ts` (existing, prior plan).
- Produces: `POST /api/jobs/:id/voice-notes/:voiceNoteId/send` — on success, `VoiceNote.status` becomes `"transcribed"` with `summary`/`actionItems` populated and an `AiAuditLog` row written; on Claude failure, `status` still becomes `"transcribed"` (with the edited transcript saved) but no summary — same graceful-degradation contract the webhook used to have.

- [ ] **Step 1: Write the failing tests**

Create `src/app/api/jobs/[id]/voice-notes/[voiceNoteId]/send/__tests__/route.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/clerk", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/db/client", () => ({
  db: {
    voiceNote: { findFirst: vi.fn(), update: vi.fn() },
    aiAuditLog: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}));
vi.mock("@/lib/ai/voice-note", () => ({ summarizeTranscript: vi.fn() }));

import { requireRole } from "@/lib/auth/clerk";
import { db } from "@/lib/db/client";
import { summarizeTranscript } from "@/lib/ai/voice-note";
import { POST } from "../route";

const mockTechnician = { id: "t1", role: "technician" as const, name: "Jake", clerkId: "c1", email: "j@t.com", isActive: true };

function makeReq(body: unknown) {
  return new Request("http://localhost/api/jobs/job1/voice-notes/vn1/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => vi.clearAllMocks());

describe("POST /api/jobs/[id]/voice-notes/[voiceNoteId]/send", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireRole).mockRejectedValue(new Error("Unauthorized"));
    const res = await POST(makeReq({ transcript: "x" }), { params: { id: "job1", voiceNoteId: "vn1" } });
    expect(res.status).toBe(401);
  });

  it("returns 400 for an empty transcript", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockTechnician as any);
    const res = await POST(makeReq({ transcript: "" }), { params: { id: "job1", voiceNoteId: "vn1" } });
    expect(res.status).toBe(400);
  });

  it("returns 404 when no matching awaiting_review note exists for this technician/job", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockTechnician as any);
    vi.mocked(db.voiceNote.findFirst).mockResolvedValue(null);

    const res = await POST(makeReq({ transcript: "Replaced fan belt." }), { params: { id: "job1", voiceNoteId: "vn1" } });

    expect(res.status).toBe(404);
    expect(db.voiceNote.findFirst).toHaveBeenCalledWith({
      where: { id: "vn1", jobId: "job1", technicianId: "t1", status: "awaiting_review" },
    });
  });

  it("summarizes the EDITED transcript (not any original) and writes VoiceNote + AiAuditLog together on success", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockTechnician as any);
    vi.mocked(db.voiceNote.findFirst).mockResolvedValue({ id: "vn1", technicianId: "t1" } as any);
    vi.mocked(summarizeTranscript).mockResolvedValue({
      summary: { summary: "Replaced fan belt on Tower 3, corrected from technician edit.", actionItems: ["Order spare belt"] },
      promptTokens: 120,
      outputTokens: 35,
    });
    vi.mocked(db.$transaction).mockResolvedValue([{}, {}]);

    const res = await POST(makeReq({ transcript: "Replaced fan belt on Tower 3 (technician-corrected text)." }), { params: { id: "job1", voiceNoteId: "vn1" } });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toEqual({ ok: true });
    expect(summarizeTranscript).toHaveBeenCalledWith("Replaced fan belt on Tower 3 (technician-corrected text).");
    expect(db.$transaction).toHaveBeenCalled();
  });

  it("degrades gracefully when Claude throws: saves the edited transcript, marks transcribed, no audit log", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockTechnician as any);
    vi.mocked(db.voiceNote.findFirst).mockResolvedValue({ id: "vn1", technicianId: "t1" } as any);
    vi.mocked(summarizeTranscript).mockRejectedValue(new Error("Claude API error"));

    const res = await POST(makeReq({ transcript: "Replaced fan belt on Tower 3." }), { params: { id: "job1", voiceNoteId: "vn1" } });

    expect(res.status).toBe(200);
    expect(db.voiceNote.update).toHaveBeenCalledWith({
      where: { id: "vn1" },
      data: { transcript: "Replaced fan belt on Tower 3.", status: "transcribed" },
    });
    expect(db.aiAuditLog.create).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run "src/app/api/jobs/[id]/voice-notes/[voiceNoteId]/send/__tests__/route.test.ts"`
Expected: FAIL — `Cannot find module '../route'`.

- [ ] **Step 3: Implement**

Create `src/app/api/jobs/[id]/voice-notes/[voiceNoteId]/send/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/clerk";
import { db } from "@/lib/db/client";
import { validateSendVoiceNoteInput } from "@/lib/voice-notes/validate";
import { summarizeTranscript } from "@/lib/ai/voice-note";
import { calculateCostUsd } from "@/lib/ai/cost";

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
  const { transcript } = parsed.data;

  const voiceNote = await db.voiceNote.findFirst({
    where: { id: params.voiceNoteId, jobId: params.id, technicianId: user.id, status: "awaiting_review" },
  });
  if (!voiceNote) {
    return NextResponse.json({ error: "Voice note not found or already sent" }, { status: 404 });
  }

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

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run "src/app/api/jobs/[id]/voice-notes/[voiceNoteId]/send/__tests__/route.test.ts"`
Expected: PASS, all 5 tests.

- [ ] **Step 5: Commit**

```bash
git add "src/app/api/jobs/[id]/voice-notes/[voiceNoteId]/send/route.ts" "src/app/api/jobs/[id]/voice-notes/[voiceNoteId]/send/__tests__/route.test.ts"
git commit -m "feat: add POST /api/jobs/:id/voice-notes/:voiceNoteId/send"
```

---

## Task 6: Safety-net cron — auto-finalize abandoned reviews after 24h

**Files:**
- Create: `src/app/api/cron/finalize-voice-notes/route.ts`
- Test: `src/app/api/cron/finalize-voice-notes/__tests__/route.test.ts`
- Modify: `vercel.json`

**Interfaces:**
- Consumes: `summarizeTranscript`, `calculateCostUsd` (existing).
- Produces: an hourly cron endpoint that finds `VoiceNote` rows stuck in `awaiting_review` for 24h+ (using `createdAt` as the staleness clock — the gap between "recorded" and "transcript ready" is at most a minute or two, so this is an accurate-enough proxy without needing a second timestamp column) and finalizes each one using its original, unedited transcript.

- [ ] **Step 1: Write the failing tests**

Create `src/app/api/cron/finalize-voice-notes/__tests__/route.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/db/client", () => ({
  db: {
    voiceNote: { findMany: vi.fn(), update: vi.fn() },
    aiAuditLog: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}));
vi.mock("@/lib/ai/voice-note", () => ({ summarizeTranscript: vi.fn() }));

import { db } from "@/lib/db/client";
import { summarizeTranscript } from "@/lib/ai/voice-note";
import { GET } from "../route";

const originalSecret = process.env.CRON_SECRET;

function makeReq(secret = "cron-secret-123") {
  return new Request("http://localhost/api/cron/finalize-voice-notes", {
    headers: { authorization: `Bearer ${secret}` },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = "cron-secret-123";
});

afterEach(() => {
  process.env.CRON_SECRET = originalSecret;
});

describe("GET /api/cron/finalize-voice-notes", () => {
  it("returns 401 with the wrong secret", async () => {
    const res = await GET(makeReq("wrong"));
    expect(res.status).toBe(401);
  });

  it("returns finalized: 0 when there are no stale notes", async () => {
    vi.mocked(db.voiceNote.findMany).mockResolvedValue([]);
    const res = await GET(makeReq());
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data).toEqual({ finalized: 0, checked: 0 });
  });

  it("summarizes a stale note's original transcript and writes VoiceNote + AiAuditLog together", async () => {
    vi.mocked(db.voiceNote.findMany).mockResolvedValue([
      { id: "vn1", technicianId: "t1", transcript: "Replaced fan belt." },
    ] as any);
    vi.mocked(summarizeTranscript).mockResolvedValue({
      summary: { summary: "Replaced fan belt on Tower 3.", actionItems: [] },
      promptTokens: 100,
      outputTokens: 20,
    });
    vi.mocked(db.$transaction).mockResolvedValue([{}, {}]);

    const res = await GET(makeReq());
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toEqual({ finalized: 1, checked: 1 });
    expect(summarizeTranscript).toHaveBeenCalledWith("Replaced fan belt.");
    expect(db.$transaction).toHaveBeenCalled();
  });

  it("handles a Claude failure for one note without blocking the others", async () => {
    vi.mocked(db.voiceNote.findMany).mockResolvedValue([
      { id: "vn1", technicianId: "t1", transcript: "First note." },
      { id: "vn2", technicianId: "t2", transcript: "Second note." },
    ] as any);
    vi.mocked(summarizeTranscript)
      .mockRejectedValueOnce(new Error("Claude API error"))
      .mockResolvedValueOnce({
        summary: { summary: "Second note summarized.", actionItems: [] },
        promptTokens: 90,
        outputTokens: 15,
      });
    vi.mocked(db.$transaction).mockResolvedValue([{}, {}]);

    const res = await GET(makeReq());
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toEqual({ finalized: 2, checked: 2 });
    // First note: graceful-degradation update (no summary), not the $transaction path.
    expect(db.voiceNote.update).toHaveBeenCalledWith({ where: { id: "vn1" }, data: { status: "transcribed" } });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run "src/app/api/cron/finalize-voice-notes/__tests__/route.test.ts"`
Expected: FAIL — `Cannot find module '../route'`.

- [ ] **Step 3: Implement**

Create `src/app/api/cron/finalize-voice-notes/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { summarizeTranscript } from "@/lib/ai/voice-note";
import { calculateCostUsd } from "@/lib/ai/cost";

// Called hourly by Vercel Cron (see vercel.json). Safety net: if a technician
// never reviews/sends a transcript within 24h of recording it, finalize it
// automatically using the original, unedited AssemblyAI transcript — so it's
// never lost or stuck in "awaiting review" forever.
export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cutoff = new Date();
  cutoff.setHours(cutoff.getHours() - 24);

  const staleNotes = await db.voiceNote.findMany({
    where: { status: "awaiting_review", createdAt: { lt: cutoff } },
  });

  let finalized = 0;
  for (const note of staleNotes) {
    try {
      const { summary, promptTokens, outputTokens } = await summarizeTranscript(note.transcript!);
      const costUsd = calculateCostUsd("claude-haiku-4-5", promptTokens, outputTokens);

      await db.$transaction([
        db.voiceNote.update({
          where: { id: note.id },
          data: { summary: summary.summary, actionItems: summary.actionItems, status: "transcribed" },
        }),
        db.aiAuditLog.create({
          data: { userId: note.technicianId, feature: "voice_note", promptTokens, outputTokens, costUsd },
        }),
      ]);
    } catch (err) {
      console.error(`Failed to auto-finalize voice note ${note.id}:`, err);
      await db.voiceNote.update({ where: { id: note.id }, data: { status: "transcribed" } });
    }
    finalized++;
  }

  return NextResponse.json({ finalized, checked: staleNotes.length });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run "src/app/api/cron/finalize-voice-notes/__tests__/route.test.ts"`
Expected: PASS, all 4 tests.

- [ ] **Step 5: Register the cron in `vercel.json`**

Modify `vercel.json` — add a second entry to the `crons` array:

```json
{
  "regions": ["syd1"],
  "installCommand": "pnpm install --no-frozen-lockfile",
  "crons": [
    {
      "path": "/api/cron/cleanup-jobs",
      "schedule": "0 2 * * *"
    },
    {
      "path": "/api/cron/finalize-voice-notes",
      "schedule": "0 * * * *"
    }
  ]
}
```

- [ ] **Step 6: Commit**

```bash
git add src/app/api/cron/finalize-voice-notes/route.ts src/app/api/cron/finalize-voice-notes/__tests__/route.test.ts vercel.json
git commit -m "feat: add hourly cron to auto-finalize abandoned voice note reviews"
```

---

## Task 7: Show "awaiting review" status on the job detail page

**Files:**
- Modify: `src/app/jobs/[id]/page.tsx`

**Interfaces:**
- None new — this is a display-only update to the existing "Voice notes" section (added in the prior plan) to handle the new status value.

- [ ] **Step 1: Update the status badge and add a hint for `awaiting_review`**

In `src/app/jobs/[id]/page.tsx`, find the voice notes section's status badge (inside the `job.voiceNotes.map((note) => ...)` block). Replace this:

```tsx
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${
                      note.status === "transcribed"
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400"
                        : note.status === "failed"
                          ? "bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400"
                          : "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300"
                    }`}>
                      {note.status}
                    </span>
```

With this:

```tsx
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${
                      note.status === "transcribed"
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400"
                        : note.status === "failed"
                          ? "bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400"
                          : note.status === "awaiting_review"
                            ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400"
                            : "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300"
                    }`}>
                      {note.status.replace("_", " ")}
                    </span>
```

Then find this line, a few lines below:

```tsx
                  {note.status === "pending" && <p className="text-xs text-slate-400">Transcribing…</p>}
                  {note.status === "failed" && <p className="text-xs text-red-500">Transcription failed for this recording.</p>}
```

Add a third line after it:

```tsx
                  {note.status === "pending" && <p className="text-xs text-slate-400">Transcribing…</p>}
                  {note.status === "failed" && <p className="text-xs text-red-500">Transcription failed for this recording.</p>}
                  {note.status === "awaiting_review" && <p className="text-xs text-amber-600 dark:text-amber-400">Waiting for the technician to review and send.</p>}
```

- [ ] **Step 2: Verify it compiles and existing tests still pass**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npx vitest run`
Expected: all existing tests still pass (this task adds no new tests — display-only, exercised by Task 9's live verification).

- [ ] **Step 3: Commit**

```bash
git add "src/app/jobs/[id]/page.tsx"
git commit -m "feat: show awaiting-review status on the job detail page"
```

---

## Task 8: Editable review UI on the time-tracking page

**Files:**
- Create: `src/app/time-tracking/PendingVoiceNoteReview.tsx`
- Modify: `src/app/time-tracking/VoiceRecorder.tsx`
- Modify: `src/app/time-tracking/ClockCard.tsx`

**Interfaces:**
- Consumes: `GET /api/jobs/:id/voice-notes/pending-review` (Task 4), `POST /api/jobs/:id/voice-notes/:voiceNoteId/send` (Task 5).
- Produces: a `<PendingVoiceNoteReview jobId={string} />` component, rendered by `ClockCard` alongside the existing `<VoiceRecorder />`.

- [ ] **Step 1: Create the polling review component**

Create `src/app/time-tracking/PendingVoiceNoteReview.tsx`:

```tsx
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
```

- [ ] **Step 2: Let a technician record more than one note per page visit**

In `src/app/time-tracking/VoiceRecorder.tsx`, the current "done" state is a dead end — once shown, there's no way to record a second note without leaving and re-entering the page. Since the whole point of this feature is reviewing notes as they come in throughout a shift, add a reset affordance.

Replace:

```tsx
  if (state === "done") {
    return <p className="text-sm text-emerald-600 dark:text-emerald-400">Voice note saved — transcribing now.</p>;
  }
```

With:

```tsx
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
```

- [ ] **Step 3: Wire the review component into `ClockCard`**

In `src/app/time-tracking/ClockCard.tsx`, add the import:

```typescript
import { PendingVoiceNoteReview } from "./PendingVoiceNoteReview";
```

Then render it directly after the existing `<VoiceRecorder jobId={currentEntry.jobId} />` line:

```tsx
        <VoiceRecorder jobId={currentEntry.jobId} />

        <PendingVoiceNoteReview jobId={currentEntry.jobId} />

        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
```

- [ ] **Step 4: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npx vitest run`
Expected: all existing tests still pass (no new tests for these three files — consistent with this codebase's established convention that client UI components are verified live, not unit tested; see Global Constraints).

- [ ] **Step 5: Commit**

```bash
git add src/app/time-tracking/PendingVoiceNoteReview.tsx src/app/time-tracking/VoiceRecorder.tsx src/app/time-tracking/ClockCard.tsx
git commit -m "feat: add editable transcript review UI to the clock-in page"
```

---

## Task 9: Live verification

**Files:** None (verification only).

- [ ] **Step 1: Run the full test suite and typecheck**

Run: `npx vitest run && npx tsc --noEmit`
Expected: all tests pass, no type errors.

- [ ] **Step 2: Push and deploy**

Push `main` to `origin` (with explicit confirmation, per this project's established practice). No new Vercel env vars are needed for this plan — it reuses `ANTHROPIC_API_KEY`, `ASSEMBLYAI_API_KEY`, `ASSEMBLYAI_WEBHOOK_SECRET`, and `CRON_SECRET`, all already configured from the prior Voice Notes plan.

- [ ] **Step 3: Manual browser check on the live site**

1. Sign in as a technician, clock into a job, record a short voice note, stop recording.
2. Confirm "Voice note saved — transcribing now" appears, with a "Record another note" link/button beneath it.
3. Wait 10-30 seconds. An amber "Review your voice note" box should appear on the same page with an editable textarea pre-filled with the transcript.
4. Edit the text (deliberately introduce or fix a word) and tap "Send". The box should disappear.
5. Go to `/jobs`, open that job, check the "Voice notes" section — the note should show `status: transcribed` with a summary reflecting your edited text, not the original.
6. Record a second note on the same job, but this time do NOT send it — navigate away from the time-tracking page, then clock back into the same job. Confirm the still-unsent review box reappears (proves resumability while clocked in).

- [ ] **Step 4: Verify via the database (the check that can't lie)**

```bash
npx tsx --env-file .env.local -e '
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
const db = new PrismaClient({ adapter });
(async () => {
  const notes = await db.voiceNote.findMany({ orderBy: { createdAt: "desc" }, take: 5 });
  console.log(JSON.stringify(notes, null, 2));
  await db.$disconnect();
})();
'
```
Expected: the sent note shows `status: "transcribed"`, `transcript` matching your edited text (not the original AssemblyAI output if you changed it), and `summary`/`actionItems` populated. The unsent second note shows `status: "awaiting_review"`.
