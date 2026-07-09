# Voice Notes (Phase 3 Batch h) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a technician record a voice note against the job they're clocked into, get it transcribed by AssemblyAI, and have Claude Haiku 4.5 produce a short summary and action-item list attached to the job — hands-free field capture instead of typed notes.

**Architecture:** Client-side `MediaRecorder` captures audio in the browser, uploaded as a private Vercel Blob (same convention as variation photos). The job-scoped API route that creates the `VoiceNote` record immediately re-uploads that audio to AssemblyAI (server-to-server, since AssemblyAI cannot reach a private blob URL) and submits a transcription job with a webhook callback — no polling, no blocking the request on transcription latency. When AssemblyAI's webhook fires, a dedicated public route verifies a shared-secret header, fetches the completed transcript, calls Claude Haiku 4.5 for a structured summary + action items, and writes both the `VoiceNote` update and an `AiAuditLog` row (feature `voice_note`, the same table Module 3g already introduced) in one transaction.

**Tech Stack:** Browser `MediaRecorder` API, `@vercel/blob` (existing), AssemblyAI REST API via raw `fetch` (no official Node SDK dependency added — three simple, already-verified endpoints don't justify a new package; unlike Claude, this project has no established "always use the SDK" convention for AssemblyAI), `@anthropic-ai/sdk` (existing, reused from Module 3g), Zod 4, existing Prisma/`requireRole` patterns.

## Global Constraints

- Follow the existing `requireRole([...]).catch(() => null)` → 401 pattern on every authenticated route (canonical example: `src/app/api/variations/route.ts`).
- The technician-submits-something-about-a-job authorization check must match `src/app/api/variations/route.ts` exactly: job must be `status: { in: ["active", "scheduled"] }`, and the technician must have an `Assignment` row for that job — return 404 if the job doesn't qualify, 403 if not assigned.
- TDD throughout: write the failing test, watch it fail, then implement. No exceptions.
- Private blobs (`access: "private"`) cannot be fetched directly by a third party — this codebase's existing proxy pattern (`src/app/api/photos/route.ts`) reads them server-side using `Authorization: Bearer ${BLOB_READ_WRITE_TOKEN}`. Voice note audio must follow the same private-access convention; the AssemblyAI submission route re-reads the blob server-side and re-uploads its bytes directly to AssemblyAI — the audio is never exposed on a publicly fetchable URL.
- AssemblyAI's REST API (ground-truthed against the live API this session, not assumed from docs):
  - Auth header: `Authorization: <raw API key>` — no `Bearer` prefix.
  - `POST https://api.assemblyai.com/v2/upload` — raw binary body, returns `{ "upload_url": "..." }`.
  - `POST https://api.assemblyai.com/v2/transcript` — JSON body `{ audio_url, webhook_url, webhook_auth_header_name, webhook_auth_header_value }`, returns `{ "id": "...", "status": "processing" | "queued", ... }`.
  - `GET https://api.assemblyai.com/v2/transcript/{id}` — returns `{ "status": "queued" | "processing" | "completed" | "error", "text": string | null, "error": string | null, ... }`.
  - The webhook AssemblyAI calls back is a small notification, not the full transcript — always re-fetch the full result via the `GET` endpoint using the id, don't trust a transcript body embedded in the webhook payload.
- `AiAuditLog.feature` for this module's Claude calls is `"voice_note"` (already a valid `AiFeature` enum value from Module 3g's migration — no new migration needed for that enum).
- A webhook secret (`ASSEMBLYAI_WEBHOOK_SECRET`) has already been generated and added to `.env.local` and `.env.example` — nothing to do there, just consume `process.env.ASSEMBLYAI_WEBHOOK_SECRET`.
- Webhook route must be added to `isPublicRoute` in `src/middleware.ts` (AssemblyAI's server has no Clerk session) — verify the shared secret header inside the route itself instead.
- The app's public base URL, for constructing the webhook callback URL, follows the existing convention in `src/app/api/team/invite/route.ts`: `process.env.NEXT_PUBLIC_APP_URL ?? "https://cooling-tower-app-alpha.vercel.app"`.
- **Local dev cannot receive AssemblyAI's webhook** (`localhost` isn't publicly reachable) — this is expected, not a bug. Live verification (Task 9) happens against the deployed Vercel URL, same as Module 3g's AI validation feature.

---

## Task 1: `VoiceNote` schema and migration

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_add_voice_note/migration.sql`

**Interfaces:**
- Produces: `VoiceNoteStatus` enum (`pending`, `transcribed`, `failed`) and `VoiceNote` model, consumed by every later task in this plan.

- [ ] **Step 1: Add the enum and model to the schema**

Add this enum near the other enums in `prisma/schema.prisma` (after `AiFeature`):

```prisma
enum VoiceNoteStatus {
  pending
  transcribed
  failed
}
```

Add this model after `AiAuditLog`:

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

Add back-relations. On `model Job`, add this line alongside the other relation fields (e.g. next to `materialEntries MaterialEntry[]`):

```prisma
  voiceNotes          VoiceNote[]
```

On `model User`, add this line alongside `aiAuditLogs AiAuditLog[]`:

```prisma
  voiceNotes          VoiceNote[]
```

- [ ] **Step 2: Verify the schema compiles**

Run: `npx prisma generate`
Expected: `✔ Generated Prisma Client` with no errors.

- [ ] **Step 3: Preview the SQL diff (read-only, confirms purely additive)**

Run: `npx prisma migrate diff --from-config-datasource prisma.config.ts --to-schema prisma/schema.prisma --script`
Expected: Only `CREATE TYPE "VoiceNoteStatus"` and `CREATE TABLE "VoiceNote"` statements (plus its indexes and foreign keys) — no `ALTER`/`DROP` on any existing table. If anything else appears, stop and investigate before continuing.

- [ ] **Step 4: Write the migration file**

Generate a timestamp with `date -u +%Y%m%d%H%M%S`, then copy the exact SQL from Step 3's output into `prisma/migrations/<timestamp>_add_voice_note/migration.sql`.

- [ ] **Step 5: Apply it directly**

Run: `npx prisma db execute --file prisma/migrations/<timestamp>_add_voice_note/migration.sql`
Expected: `Script executed successfully.`

- [ ] **Step 6: Mark the migration as resolved**

Run: `npx prisma migrate resolve --applied <timestamp>_add_voice_note`
Expected: confirms the migration is recorded as applied.

- [ ] **Step 7: Verify the table exists live**

Run:
```bash
npx tsx --env-file .env.local -e '
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
const db = new PrismaClient({ adapter });
(async () => {
  const count = await db.voiceNote.count();
  console.log("VoiceNote row count:", count);
  await db.$disconnect();
})();
'
```
Expected: `VoiceNote row count: 0` (table exists, empty).

- [ ] **Step 8: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat: add VoiceNote table (Phase 3 batch h)"
```

---

## Task 2: AssemblyAI REST client wrapper

**Files:**
- Create: `src/lib/ai/assemblyai.ts`
- Test: `src/lib/ai/__tests__/assemblyai.test.ts`

**Interfaces:**
- Produces:
  - `uploadAudioToAssemblyAI(audio: Buffer): Promise<string>` — returns AssemblyAI's own hosted `upload_url`.
  - `submitTranscription(audioUrl: string, webhookUrl: string, webhookSecret: string): Promise<{ id: string }>`
  - `fetchTranscript(id: string): Promise<AssemblyAiTranscriptResult>` where `AssemblyAiTranscriptResult = { status: "queued" | "processing" | "completed" | "error"; text: string | null; error: string | null }`
- Consumed by Task 5 (submission) and Task 6 (webhook).

- [ ] **Step 1: Write the failing tests**

Create `src/lib/ai/__tests__/assemblyai.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { uploadAudioToAssemblyAI, submitTranscription, fetchTranscript } from "../assemblyai";

const originalFetch = global.fetch;
const originalKey = process.env.ASSEMBLYAI_API_KEY;

beforeEach(() => {
  process.env.ASSEMBLYAI_API_KEY = "test-key-123";
});

afterEach(() => {
  global.fetch = originalFetch;
  process.env.ASSEMBLYAI_API_KEY = originalKey;
  vi.restoreAllMocks();
});

describe("uploadAudioToAssemblyAI", () => {
  it("posts the raw buffer with the correct auth header and returns upload_url", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ upload_url: "https://cdn.assemblyai.com/upload/abc123" }),
    });
    global.fetch = mockFetch as unknown as typeof fetch;

    const result = await uploadAudioToAssemblyAI(Buffer.from("fake audio bytes"));

    expect(result).toBe("https://cdn.assemblyai.com/upload/abc123");
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.assemblyai.com/v2/upload",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "test-key-123" }),
      })
    );
  });

  it("throws when the upload request fails", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 }) as unknown as typeof fetch;
    await expect(uploadAudioToAssemblyAI(Buffer.from("x"))).rejects.toThrow("500");
  });
});

describe("submitTranscription", () => {
  it("submits with webhook fields and returns the transcript id", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: "transcript-abc", status: "processing" }),
    });
    global.fetch = mockFetch as unknown as typeof fetch;

    const result = await submitTranscription(
      "https://cdn.assemblyai.com/upload/abc123",
      "https://example.com/webhook",
      "shared-secret"
    );

    expect(result).toEqual({ id: "transcript-abc" });
    const [, options] = mockFetch.mock.calls[0];
    const body = JSON.parse(options.body);
    expect(body).toEqual({
      audio_url: "https://cdn.assemblyai.com/upload/abc123",
      webhook_url: "https://example.com/webhook",
      webhook_auth_header_name: "x-webhook-secret",
      webhook_auth_header_value: "shared-secret",
    });
  });

  it("throws when submission fails", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 422 }) as unknown as typeof fetch;
    await expect(submitTranscription("url", "webhook", "secret")).rejects.toThrow("422");
  });
});

describe("fetchTranscript", () => {
  it("returns the parsed status/text/error fields", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: "completed", text: "hello world", error: null }),
    }) as unknown as typeof fetch;

    const result = await fetchTranscript("transcript-abc");

    expect(result).toEqual({ status: "completed", text: "hello world", error: null });
  });

  it("throws when the fetch fails", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 404 }) as unknown as typeof fetch;
    await expect(fetchTranscript("missing-id")).rejects.toThrow("404");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/ai/__tests__/assemblyai.test.ts`
Expected: FAIL — `Cannot find module '../assemblyai'` (file doesn't exist yet).

- [ ] **Step 3: Implement**

Create `src/lib/ai/assemblyai.ts`:

```typescript
const ASSEMBLYAI_BASE_URL = "https://api.assemblyai.com/v2";

function apiKey(): string {
  const key = process.env.ASSEMBLYAI_API_KEY;
  if (!key) throw new Error("ASSEMBLYAI_API_KEY is not set");
  return key;
}

export async function uploadAudioToAssemblyAI(audio: Buffer): Promise<string> {
  const res = await fetch(`${ASSEMBLYAI_BASE_URL}/upload`, {
    method: "POST",
    headers: { Authorization: apiKey() },
    body: new Uint8Array(audio),
  });
  if (!res.ok) throw new Error(`AssemblyAI upload failed: ${res.status}`);
  const data = (await res.json()) as { upload_url: string };
  return data.upload_url;
}

export async function submitTranscription(
  audioUrl: string,
  webhookUrl: string,
  webhookSecret: string
): Promise<{ id: string }> {
  const res = await fetch(`${ASSEMBLYAI_BASE_URL}/transcript`, {
    method: "POST",
    headers: { Authorization: apiKey(), "Content-Type": "application/json" },
    body: JSON.stringify({
      audio_url: audioUrl,
      webhook_url: webhookUrl,
      webhook_auth_header_name: "x-webhook-secret",
      webhook_auth_header_value: webhookSecret,
    }),
  });
  if (!res.ok) throw new Error(`AssemblyAI transcript submission failed: ${res.status}`);
  const data = (await res.json()) as { id: string };
  return { id: data.id };
}

export interface AssemblyAiTranscriptResult {
  status: "queued" | "processing" | "completed" | "error";
  text: string | null;
  error: string | null;
}

export async function fetchTranscript(id: string): Promise<AssemblyAiTranscriptResult> {
  const res = await fetch(`${ASSEMBLYAI_BASE_URL}/transcript/${id}`, {
    headers: { Authorization: apiKey() },
  });
  if (!res.ok) throw new Error(`AssemblyAI fetch transcript failed: ${res.status}`);
  const data = (await res.json()) as { status: string; text: string | null; error: string | null };
  return { status: data.status as AssemblyAiTranscriptResult["status"], text: data.text, error: data.error };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/ai/__tests__/assemblyai.test.ts`
Expected: PASS, all 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/assemblyai.ts src/lib/ai/__tests__/assemblyai.test.ts
git commit -m "feat: add AssemblyAI REST client wrapper"
```

---

## Task 3: Claude summarization for voice note transcripts

**Files:**
- Create: `src/lib/ai/voice-note.ts`
- Test: `src/lib/ai/__tests__/voice-note.test.ts`

**Interfaces:**
- Consumes: `getAnthropicClient()` from `src/lib/ai/client.ts` (existing, from Module 3g).
- Produces: `voiceNoteSummarySchema` (Zod), `summarizeTranscript(transcript: string): Promise<{ summary: { summary: string; actionItems: string[] }; promptTokens: number; outputTokens: number }>`, consumed by Task 6 (webhook route).

- [ ] **Step 1: Write the failing tests**

Create `src/lib/ai/__tests__/voice-note.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../client", () => ({ getAnthropicClient: vi.fn() }));

import { getAnthropicClient } from "../client";
import { summarizeTranscript, voiceNoteSummarySchema } from "../voice-note";

beforeEach(() => vi.clearAllMocks());

describe("voiceNoteSummarySchema", () => {
  it("accepts a valid summary object", () => {
    const result = voiceNoteSummarySchema.safeParse({
      summary: "Replaced fan belt on Tower 3.",
      actionItems: ["Order replacement belt for Tower 2", "Follow up with client on quote"],
    });
    expect(result.success).toBe(true);
  });

  it("rejects a payload with a non-array actionItems", () => {
    const result = voiceNoteSummarySchema.safeParse({ summary: "x", actionItems: "not an array" });
    expect(result.success).toBe(false);
  });
});

describe("summarizeTranscript", () => {
  it("calls Claude with the transcript and returns parsed summary + token usage", async () => {
    const mockCreate = vi.fn().mockResolvedValue({
      content: [{
        type: "text",
        text: JSON.stringify({
          summary: "Replaced fan belt on Tower 3, minor corrosion noted on Tower 2.",
          actionItems: ["Quote Tower 2 corrosion repair"],
        }),
      }],
      usage: { input_tokens: 150, output_tokens: 40 },
    });
    vi.mocked(getAnthropicClient).mockReturnValue({ messages: { create: mockCreate } } as any);

    const result = await summarizeTranscript("Today I replaced the fan belt on Tower 3...");

    expect(result.summary.summary).toBe("Replaced fan belt on Tower 3, minor corrosion noted on Tower 2.");
    expect(result.summary.actionItems).toEqual(["Quote Tower 2 corrosion repair"]);
    expect(result.promptTokens).toBe(150);
    expect(result.outputTokens).toBe(40);
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ model: "claude-haiku-4-5" })
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/ai/__tests__/voice-note.test.ts`
Expected: FAIL — `Cannot find module '../voice-note'`.

- [ ] **Step 3: Implement**

Create `src/lib/ai/voice-note.ts`:

```typescript
import { z } from "zod";
import { getAnthropicClient } from "./client";

export const voiceNoteSummarySchema = z.object({
  summary: z.string(),
  actionItems: z.array(z.string()),
});

export type VoiceNoteSummary = z.infer<typeof voiceNoteSummarySchema>;

const MODEL = "claude-haiku-4-5";

export async function summarizeTranscript(transcript: string): Promise<{
  summary: VoiceNoteSummary;
  promptTokens: number;
  outputTokens: number;
}> {
  const client = getAnthropicClient();
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system:
      "You summarize field technician voice notes from cooling tower maintenance visits. Write a concise summary (2-4 sentences) and extract concrete action items as a plain list. If there are no action items, return an empty array. Respond with JSON matching the schema exactly.",
    messages: [{ role: "user", content: `Summarize this voice note transcript:\n${transcript}` }],
    output_config: {
      format: {
        type: "json_schema",
        schema: {
          type: "object",
          properties: {
            summary: { type: "string" },
            actionItems: { type: "array", items: { type: "string" } },
          },
          required: ["summary", "actionItems"],
          additionalProperties: false,
        },
      },
    },
  });

  const textBlock = response.content.find((b) => b.type === "text");
  const rawJson = textBlock && "text" in textBlock ? textBlock.text : "{}";
  const summary = voiceNoteSummarySchema.parse(JSON.parse(rawJson));

  return {
    summary,
    promptTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/ai/__tests__/voice-note.test.ts`
Expected: PASS, all 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/voice-note.ts src/lib/ai/__tests__/voice-note.test.ts
git commit -m "feat: add Claude summarization for voice note transcripts"
```

---

## Task 4: Voice note input validation

**Files:**
- Create: `src/lib/voice-notes/validate.ts`
- Test: `src/lib/voice-notes/__tests__/validate.test.ts`

**Interfaces:**
- Produces: `validateVoiceNoteInput(input: unknown)`, a Zod `safeParse` wrapper returning `{ success: true; data: { audioUrl: string; durationSeconds: number } } | { success: false; error }`. Consumed by Task 5.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/voice-notes/__tests__/validate.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { validateVoiceNoteInput } from "../validate";

describe("validateVoiceNoteInput", () => {
  const valid = {
    audioUrl: "https://example.blob.vercel-storage.com/voice-notes/u1/123.webm",
    durationSeconds: 42,
  };

  it("accepts a valid payload", () => {
    expect(validateVoiceNoteInput(valid).success).toBe(true);
  });

  it("rejects a non-URL audioUrl", () => {
    const result = validateVoiceNoteInput({ ...valid, audioUrl: "not-a-url" });
    expect(result.success).toBe(false);
  });

  it("rejects a missing durationSeconds", () => {
    const { durationSeconds, ...rest } = valid;
    const result = validateVoiceNoteInput(rest);
    expect(result.success).toBe(false);
  });

  it("rejects a zero or negative durationSeconds", () => {
    expect(validateVoiceNoteInput({ ...valid, durationSeconds: 0 }).success).toBe(false);
    expect(validateVoiceNoteInput({ ...valid, durationSeconds: -5 }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/voice-notes/__tests__/validate.test.ts`
Expected: FAIL — `Cannot find module '../validate'`.

- [ ] **Step 3: Implement**

Create `src/lib/voice-notes/validate.ts`:

```typescript
import { z } from "zod";

export const voiceNoteInputSchema = z.object({
  audioUrl: z.string().url(),
  durationSeconds: z.number().positive(),
});

export function validateVoiceNoteInput(input: unknown) {
  return voiceNoteInputSchema.safeParse(input);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/voice-notes/__tests__/validate.test.ts`
Expected: PASS, all 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/voice-notes/validate.ts src/lib/voice-notes/__tests__/validate.test.ts
git commit -m "feat: add voice note input validation"
```

---

## Task 5: Audio upload route

**Files:**
- Create: `src/app/api/upload/voice-note/route.ts`
- Test: `src/app/api/upload/voice-note/__tests__/route.test.ts`

**Interfaces:**
- Consumes: `requireRole` from `src/lib/auth/clerk.ts`, `put` from `@vercel/blob` (existing dependency).
- Produces: `POST /api/upload/voice-note` accepting `multipart/form-data` with a `file` field, returns `{ url: string }` at 201.

- [ ] **Step 1: Write the failing tests**

Create `src/app/api/upload/voice-note/__tests__/route.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/clerk", () => ({ requireRole: vi.fn() }));
vi.mock("@vercel/blob", () => ({ put: vi.fn() }));

import { requireRole } from "@/lib/auth/clerk";
import { put } from "@vercel/blob";
import { POST } from "../route";

const mockTechnician = { id: "t1", role: "technician" as const, name: "Jake", clerkId: "c1", email: "j@t.com", isActive: true };

function makeReq(file: Blob | null) {
  const formData = new FormData();
  if (file) formData.append("file", file, "note.webm");
  return new Request("http://localhost/api/upload/voice-note", { method: "POST", body: formData });
}

beforeEach(() => vi.clearAllMocks());

describe("POST /api/upload/voice-note", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireRole).mockRejectedValue(new Error("Unauthorized"));
    const res = await POST(makeReq(new Blob(["audio"], { type: "audio/webm" })));
    expect(res.status).toBe(401);
  });

  it("returns 400 when no file is provided", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockTechnician as any);
    const res = await POST(makeReq(null));
    expect(res.status).toBe(400);
  });

  it("returns 422 for an unsupported audio type", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockTechnician as any);
    const res = await POST(makeReq(new Blob(["audio"], { type: "audio/x-unsupported" })));
    expect(res.status).toBe(422);
  });

  it("returns 413 when the file exceeds the size limit", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockTechnician as any);
    const bigChunk = new Uint8Array(26 * 1024 * 1024);
    const res = await POST(makeReq(new Blob([bigChunk], { type: "audio/webm" })));
    expect(res.status).toBe(413);
  });

  it("uploads a valid file privately and returns its URL", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockTechnician as any);
    vi.mocked(put).mockResolvedValue({ url: "https://example.blob.vercel-storage.com/voice-notes/t1/123.webm" } as any);

    const res = await POST(makeReq(new Blob(["audio"], { type: "audio/webm" })));
    const data = await res.json();

    expect(res.status).toBe(201);
    expect(data.url).toBe("https://example.blob.vercel-storage.com/voice-notes/t1/123.webm");
    expect(put).toHaveBeenCalledWith(
      expect.stringMatching(/^voice-notes\/t1\/\d+\.webm$/),
      expect.anything(),
      { access: "private" }
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/app/api/upload/voice-note/__tests__/route.test.ts`
Expected: FAIL — `Cannot find module '../route'`.

- [ ] **Step 3: Implement**

Create `src/app/api/upload/voice-note/route.ts`:

```typescript
import { put } from "@vercel/blob";
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/clerk";

const ALLOWED_TYPES = ["audio/webm", "audio/mp4", "audio/wav", "audio/mpeg", "audio/ogg"];
const MAX_BYTES = 25 * 1024 * 1024;

export async function POST(req: Request) {
  const user = await requireRole(["technician"]).catch(() => null);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get("file");

  if (!file || !(file instanceof Blob)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json(
      { error: "Unsupported format. Record using your device's default microphone format." },
      { status: 422 }
    );
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Recording too large. Maximum 25 MB (roughly 30 minutes)." }, { status: 413 });
  }

  const extension = file.type.split("/")[1] ?? "webm";
  const filename = `voice-notes/${user.id}/${Date.now()}.${extension}`;

  try {
    const blob = await put(filename, file, { access: "private" });
    return NextResponse.json({ url: blob.url }, { status: 201 });
  } catch (err) {
    console.error("Blob upload error:", err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/app/api/upload/voice-note/__tests__/route.test.ts`
Expected: PASS, all 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/upload/voice-note/route.ts src/app/api/upload/voice-note/__tests__/route.test.ts
git commit -m "feat: add voice note audio upload route"
```

---

## Task 6: Create voice note + submit to AssemblyAI

**Files:**
- Create: `src/app/api/jobs/[id]/voice-notes/route.ts`
- Test: `src/app/api/jobs/[id]/voice-notes/__tests__/route.test.ts`

**Interfaces:**
- Consumes: `validateVoiceNoteInput` (Task 4), `uploadAudioToAssemblyAI` + `submitTranscription` (Task 2).
- Produces: `POST /api/jobs/:id/voice-notes` — creates a `VoiceNote` row (`status: "pending"`), reads the uploaded blob server-side, submits it to AssemblyAI with a webhook callback, stores the returned `assemblyaiId`. Returns the created `VoiceNote` at 201 regardless of whether the AssemblyAI submission succeeds (submission failure marks the row `"failed"` rather than losing the recording).

- [ ] **Step 1: Write the failing tests**

Create `src/app/api/jobs/[id]/voice-notes/__tests__/route.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/clerk", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/db/client", () => ({
  db: {
    job: { findFirst: vi.fn() },
    assignment: { findFirst: vi.fn() },
    voiceNote: { create: vi.fn(), update: vi.fn() },
  },
}));
vi.mock("@/lib/ai/assemblyai", () => ({
  uploadAudioToAssemblyAI: vi.fn(),
  submitTranscription: vi.fn(),
}));

import { requireRole } from "@/lib/auth/clerk";
import { db } from "@/lib/db/client";
import { uploadAudioToAssemblyAI, submitTranscription } from "@/lib/ai/assemblyai";
import { POST } from "../route";

const mockTechnician = { id: "t1", role: "technician" as const, name: "Jake", clerkId: "c1", email: "j@t.com", isActive: true };
const validBody = { audioUrl: "https://example.blob.vercel-storage.com/voice-notes/t1/123.webm", durationSeconds: 60 };

function makeReq(body: unknown) {
  return new Request("http://localhost/api/jobs/job1/voice-notes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    arrayBuffer: async () => new TextEncoder().encode("fake audio").buffer,
  }) as unknown as typeof fetch;
});

describe("POST /api/jobs/[id]/voice-notes", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireRole).mockRejectedValue(new Error("Unauthorized"));
    const res = await POST(makeReq(validBody), { params: { id: "job1" } });
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid input", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockTechnician as any);
    const res = await POST(makeReq({ audioUrl: "not-a-url" }), { params: { id: "job1" } });
    expect(res.status).toBe(400);
  });

  it("returns 404 when the job doesn't exist or isn't active/scheduled", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockTechnician as any);
    vi.mocked(db.job.findFirst).mockResolvedValue(null);
    const res = await POST(makeReq(validBody), { params: { id: "job1" } });
    expect(res.status).toBe(404);
  });

  it("returns 403 when the technician isn't assigned to the job", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockTechnician as any);
    vi.mocked(db.job.findFirst).mockResolvedValue({ id: "job1" } as any);
    vi.mocked(db.assignment.findFirst).mockResolvedValue(null);
    const res = await POST(makeReq(validBody), { params: { id: "job1" } });
    expect(res.status).toBe(403);
  });

  it("creates the voice note and submits it to AssemblyAI on success", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockTechnician as any);
    vi.mocked(db.job.findFirst).mockResolvedValue({ id: "job1" } as any);
    vi.mocked(db.assignment.findFirst).mockResolvedValue({ id: "a1" } as any);
    vi.mocked(db.voiceNote.create).mockResolvedValue({ id: "vn1", jobId: "job1", technicianId: "t1", status: "pending" } as any);
    vi.mocked(uploadAudioToAssemblyAI).mockResolvedValue("https://cdn.assemblyai.com/upload/xyz");
    vi.mocked(submitTranscription).mockResolvedValue({ id: "transcript-abc" });
    vi.mocked(db.voiceNote.update).mockResolvedValue({} as any);

    const res = await POST(makeReq(validBody), { params: { id: "job1" } });
    const data = await res.json();

    expect(res.status).toBe(201);
    expect(data.id).toBe("vn1");
    expect(db.voiceNote.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ jobId: "job1", technicianId: "t1", status: "pending" }),
      })
    );
    expect(uploadAudioToAssemblyAI).toHaveBeenCalled();
    expect(submitTranscription).toHaveBeenCalled();
    expect(db.voiceNote.update).toHaveBeenCalledWith({
      where: { id: "vn1" },
      data: { assemblyaiId: "transcript-abc" },
    });
  });

  it("marks the voice note failed (but still returns 201) when AssemblyAI submission throws", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockTechnician as any);
    vi.mocked(db.job.findFirst).mockResolvedValue({ id: "job1" } as any);
    vi.mocked(db.assignment.findFirst).mockResolvedValue({ id: "a1" } as any);
    vi.mocked(db.voiceNote.create).mockResolvedValue({ id: "vn1", jobId: "job1", technicianId: "t1", status: "pending" } as any);
    vi.mocked(uploadAudioToAssemblyAI).mockRejectedValue(new Error("network error"));
    vi.mocked(db.voiceNote.update).mockResolvedValue({} as any);

    const res = await POST(makeReq(validBody), { params: { id: "job1" } });

    expect(res.status).toBe(201);
    expect(db.voiceNote.update).toHaveBeenCalledWith({ where: { id: "vn1" }, data: { status: "failed" } });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/app/api/jobs/\[id\]/voice-notes/__tests__/route.test.ts`
Expected: FAIL — `Cannot find module '../route'`.

- [ ] **Step 3: Implement**

Create `src/app/api/jobs/[id]/voice-notes/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/clerk";
import { db } from "@/lib/db/client";
import { validateVoiceNoteInput } from "@/lib/voice-notes/validate";
import { uploadAudioToAssemblyAI, submitTranscription } from "@/lib/ai/assemblyai";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const user = await requireRole(["technician"]).catch(() => null);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = validateVoiceNoteInput(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  }
  const { audioUrl, durationSeconds } = parsed.data;

  const job = await db.job.findFirst({ where: { id: params.id, status: { in: ["active", "scheduled"] } } });
  if (!job) return NextResponse.json({ error: "Job not found or not active" }, { status: 404 });

  const assignment = await db.assignment.findFirst({ where: { userId: user.id, jobId: params.id } });
  if (!assignment) return NextResponse.json({ error: "Not assigned to this job" }, { status: 403 });

  const voiceNote = await db.voiceNote.create({
    data: { jobId: params.id, technicianId: user.id, audioUrl, durationSeconds, status: "pending" },
  });

  try {
    const blobRes = await fetch(audioUrl, {
      headers: { Authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}` },
    });
    if (!blobRes.ok) throw new Error(`Failed to read uploaded audio: ${blobRes.status}`);
    const audioBuffer = Buffer.from(await blobRes.arrayBuffer());

    const uploadUrl = await uploadAudioToAssemblyAI(audioBuffer);
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://cooling-tower-app-alpha.vercel.app";
    const { id: assemblyaiId } = await submitTranscription(
      uploadUrl,
      `${appUrl}/api/voice-notes/webhook`,
      process.env.ASSEMBLYAI_WEBHOOK_SECRET!
    );

    await db.voiceNote.update({ where: { id: voiceNote.id }, data: { assemblyaiId } });
  } catch (err) {
    console.error("AssemblyAI submission failed:", err);
    await db.voiceNote.update({ where: { id: voiceNote.id }, data: { status: "failed" } });
  }

  return NextResponse.json(voiceNote, { status: 201 });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/app/api/jobs/\[id\]/voice-notes/__tests__/route.test.ts`
Expected: PASS, all 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/jobs/\[id\]/voice-notes/route.ts src/app/api/jobs/\[id\]/voice-notes/__tests__/route.test.ts
git commit -m "feat: add POST /api/jobs/:id/voice-notes (create + submit to AssemblyAI)"
```

---

## Task 7: AssemblyAI webhook receiver

**Files:**
- Create: `src/app/api/voice-notes/webhook/route.ts`
- Test: `src/app/api/voice-notes/webhook/__tests__/route.test.ts`
- Modify: `src/middleware.ts`

**Interfaces:**
- Consumes: `fetchTranscript` (Task 2), `summarizeTranscript` (Task 3), `calculateCostUsd` from `src/lib/ai/cost.ts` (existing, Module 3g).
- Produces: `POST /api/voice-notes/webhook` — public route, verifies `x-webhook-secret` header, looks up the `VoiceNote` by `assemblyaiId`, fetches the full transcript, summarizes it, writes both the `VoiceNote` update and an `AiAuditLog` row.

- [ ] **Step 1: Write the failing tests**

Create `src/app/api/voice-notes/webhook/__tests__/route.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/db/client", () => ({
  db: {
    voiceNote: { findUnique: vi.fn(), update: vi.fn() },
    aiAuditLog: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}));
vi.mock("@/lib/ai/assemblyai", () => ({ fetchTranscript: vi.fn() }));
vi.mock("@/lib/ai/voice-note", () => ({ summarizeTranscript: vi.fn() }));

import { db } from "@/lib/db/client";
import { fetchTranscript } from "@/lib/ai/assemblyai";
import { summarizeTranscript } from "@/lib/ai/voice-note";
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
    vi.mocked(db.voiceNote.findUnique).mockResolvedValue({ id: "vn1", technicianId: "u1" } as any);
    vi.mocked(fetchTranscript).mockResolvedValue({ status: "error", text: null, error: "Transcoding failed" });

    const res = await POST(makeReq({ transcript_id: "t1" }));

    expect(res.status).toBe(200);
    expect(db.voiceNote.update).toHaveBeenCalledWith({ where: { id: "vn1" }, data: { status: "failed" } });
  });

  it("summarizes a completed transcript and writes both VoiceNote and AiAuditLog in one transaction", async () => {
    vi.mocked(db.voiceNote.findUnique).mockResolvedValue({ id: "vn1", technicianId: "u1" } as any);
    vi.mocked(fetchTranscript).mockResolvedValue({ status: "completed", text: "Replaced fan belt on Tower 3.", error: null });
    vi.mocked(summarizeTranscript).mockResolvedValue({
      summary: { summary: "Replaced fan belt on Tower 3.", actionItems: [] },
      promptTokens: 100,
      outputTokens: 30,
    });
    vi.mocked(db.$transaction).mockResolvedValue([{}, {}]);

    const res = await POST(makeReq({ transcript_id: "t1" }));

    expect(res.status).toBe(200);
    expect(db.$transaction).toHaveBeenCalledWith([
      expect.objectContaining({}),
      expect.objectContaining({}),
    ]);
  });

  it("saves the raw transcript and marks transcribed even if Claude summarization throws", async () => {
    vi.mocked(db.voiceNote.findUnique).mockResolvedValue({ id: "vn1", technicianId: "u1" } as any);
    vi.mocked(fetchTranscript).mockResolvedValue({ status: "completed", text: "Replaced fan belt on Tower 3.", error: null });
    vi.mocked(summarizeTranscript).mockRejectedValue(new Error("Claude API error"));

    const res = await POST(makeReq({ transcript_id: "t1" }));

    expect(res.status).toBe(200);
    expect(db.voiceNote.update).toHaveBeenCalledWith({
      where: { id: "vn1" },
      data: { transcript: "Replaced fan belt on Tower 3.", status: "transcribed" },
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/app/api/voice-notes/webhook/__tests__/route.test.ts`
Expected: FAIL — `Cannot find module '../route'`.

- [ ] **Step 3: Implement**

Create `src/app/api/voice-notes/webhook/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { fetchTranscript } from "@/lib/ai/assemblyai";
import { summarizeTranscript } from "@/lib/ai/voice-note";
import { calculateCostUsd } from "@/lib/ai/cost";

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

  try {
    const { summary, promptTokens, outputTokens } = await summarizeTranscript(result.text);
    const costUsd = calculateCostUsd("claude-haiku-4-5", promptTokens, outputTokens);

    await db.$transaction([
      db.voiceNote.update({
        where: { id: voiceNote.id },
        data: {
          transcript: result.text,
          summary: summary.summary,
          actionItems: summary.actionItems,
          status: "transcribed",
        },
      }),
      db.aiAuditLog.create({
        data: { userId: voiceNote.technicianId, feature: "voice_note", promptTokens, outputTokens, costUsd },
      }),
    ]);
  } catch (err) {
    console.error("Voice note summarization failed:", err);
    // Transcription itself succeeded even though summarization failed — keep the
    // raw transcript and mark transcribed rather than losing it entirely.
    await db.voiceNote.update({
      where: { id: voiceNote.id },
      data: { transcript: result.text, status: "transcribed" },
    });
  }

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/app/api/voice-notes/webhook/__tests__/route.test.ts`
Expected: PASS, all 6 tests.

- [ ] **Step 5: Add the webhook route to the public-route allowlist**

In `src/middleware.ts`, add one line to the `isPublicRoute` array (AssemblyAI's server calls this with no Clerk session — the route verifies the shared secret itself):

```typescript
const isPublicRoute = createRouteMatcher([
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/api/webhooks(.*)",
  "/api/upload/photo", // Vercel Blob CDN posts onUploadCompleted without a Clerk session
  "/portal(.*)", // customer portal — auth is the token in the URL, not a Clerk session
  "/api/voice-notes/webhook", // AssemblyAI callback — verified via x-webhook-secret header, not Clerk
]);
```

- [ ] **Step 6: Commit**

```bash
git add src/app/api/voice-notes/webhook/route.ts src/app/api/voice-notes/webhook/__tests__/route.test.ts src/middleware.ts
git commit -m "feat: add AssemblyAI webhook receiver (transcribe + summarize + audit log)"
```

---

## Task 8: Show voice notes on the job detail page

**Files:**
- Modify: `src/app/jobs/[id]/page.tsx`

**Interfaces:**
- Consumes: the `VoiceNote` model (Task 1) via a new `include` on the existing `db.job.findUnique` query.

- [ ] **Step 1: Add `voiceNotes` to the Prisma query**

In `src/app/jobs/[id]/page.tsx`, add this line to the `include` object (alongside `materialEntries`):

```typescript
      voiceNotes: { include: { technician: { select: { name: true } } }, orderBy: { createdAt: "desc" } },
```

- [ ] **Step 2: Add a "Voice notes" section to the page**

Add this new `<section>` in `src/app/jobs/[id]/page.tsx`, directly after the existing "Communication log" section (after its closing `</section>`, before the "Compliance documents" section):

```tsx
        <section className="space-y-2">
          <h2 className="text-sm font-medium text-slate-700 dark:text-slate-300">Voice notes ({job.voiceNotes.length})</h2>
          {job.voiceNotes.length === 0 && <p className="text-sm text-slate-500">No voice notes recorded.</p>}
          {job.voiceNotes.length > 0 && (
            <div className="rounded-lg border border-slate-200 dark:border-slate-700 divide-y divide-slate-200 dark:divide-slate-700">
              {job.voiceNotes.map((note) => (
                <div key={note.id} className="px-4 py-3 text-sm space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-slate-500">{note.technician.name} · {new Date(note.createdAt).toLocaleDateString("en-AU")}</span>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${
                      note.status === "transcribed"
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400"
                        : note.status === "failed"
                          ? "bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400"
                          : "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300"
                    }`}>
                      {note.status}
                    </span>
                  </div>
                  {note.summary && <p>{note.summary}</p>}
                  {Array.isArray(note.actionItems) && note.actionItems.length > 0 && (
                    <ul className="list-disc list-inside text-xs text-slate-500 dark:text-slate-400">
                      {(note.actionItems as string[]).map((item, i) => <li key={i}>{item}</li>)}
                    </ul>
                  )}
                  {note.status === "pending" && <p className="text-xs text-slate-400">Transcribing…</p>}
                  {note.status === "failed" && <p className="text-xs text-red-500">Transcription failed for this recording.</p>}
                </div>
              ))}
            </div>
          )}
        </section>
```

- [ ] **Step 3: Verify it compiles and existing tests still pass**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npx vitest run`
Expected: all existing tests still pass (this task adds no new tests — it's a display-only extension of an existing page's query and render, exercised by Task 9's live verification).

- [ ] **Step 4: Commit**

```bash
git add src/app/jobs/\[id\]/page.tsx
git commit -m "feat: show voice notes on the job detail page"
```

---

## Task 9: Recording UI on the time-tracking (clock-in) page

**Files:**
- Create: `src/app/time-tracking/VoiceRecorder.tsx`
- Modify: `src/app/time-tracking/ClockCard.tsx`

**Interfaces:**
- Consumes: `POST /api/upload/voice-note` (Task 5), `POST /api/jobs/:id/voice-notes` (Task 6).
- Produces: a `<VoiceRecorder jobId={string} />` client component, rendered by `ClockCard` only while a technician is clocked in (mirrors the existing "Clock Out" button placement).

- [ ] **Step 1: Create the recorder component**

Create `src/app/time-tracking/VoiceRecorder.tsx`:

```tsx
"use client";

import { useState, useRef } from "react";
import { Mic, Square } from "lucide-react";

interface VoiceRecorderProps {
  jobId: string;
}

type RecorderState = "idle" | "recording" | "uploading" | "done" | "error";

export function VoiceRecorder({ jobId }: VoiceRecorderProps) {
  const [state, setState] = useState<RecorderState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startTimeRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function startRecording() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/mp4";
      const recorder = new MediaRecorder(stream, { mimeType });
      chunksRef.current = [];
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
    } catch {
      setError("Microphone access denied or unavailable.");
      setState("error");
    }
  }

  async function stopAndUpload() {
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
    const mimeType = recorder.mimeType || "audio/webm";
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
        body: JSON.stringify({ audioUrl: url, durationSeconds }),
      });
      if (!createRes.ok) throw new Error("Failed to save voice note");

      setState("done");
    } catch {
      setError("Failed to upload voice note. It was not saved.");
      setState("error");
    }
  }

  if (state === "done") {
    return <p className="text-sm text-emerald-600 dark:text-emerald-400">Voice note saved — transcribing now.</p>;
  }

  return (
    <div className="space-y-2">
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
          <Mic className="w-4 h-4" />
          {state === "uploading" ? "Saving…" : "Record voice note"}
        </button>
      )}
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Wire it into `ClockCard`**

In `src/app/time-tracking/ClockCard.tsx`, add the import:

```typescript
import { VoiceRecorder } from "./VoiceRecorder";
```

Then add `<VoiceRecorder jobId={currentEntry.jobId} />` inside the clocked-in return block, right after the `<LiveTimer />` div and before the `{error && ...}` line:

```tsx
          <div className="mt-2">
            <LiveTimer clockInTime={currentEntry.clockInTime} />
          </div>
        </div>

        <VoiceRecorder jobId={currentEntry.jobId} />

        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
```

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npx vitest run`
Expected: all existing tests still pass. (Browser-only APIs — `MediaRecorder`, `navigator.mediaDevices` — aren't available in the Vitest/jsdom environment used by this project's existing test suite, and no other component in this codebase unit-tests `MediaRecorder` usage; this component is exercised by Task 10's live browser verification instead, consistent with how this project treats browser-API-dependent UI.)

- [ ] **Step 4: Commit**

```bash
git add src/app/time-tracking/VoiceRecorder.tsx src/app/time-tracking/ClockCard.tsx
git commit -m "feat: add voice note recording UI to the clock-in page"
```

---

## Task 10: Live verification

**Files:** None (verification only).

- [ ] **Step 1: Run the full test suite and typecheck**

Run: `npx vitest run && npx tsc --noEmit`
Expected: all tests pass, no type errors.

- [ ] **Step 2: Deploy and add Vercel env vars**

This feature's webhook cannot be exercised on `localhost` (AssemblyAI cannot reach a local dev server). Verification must happen against the deployed Vercel URL:
1. Push `main` to `origin` (with explicit confirmation).
2. In the Vercel dashboard, add `ASSEMBLYAI_API_KEY` and `ASSEMBLYAI_WEBHOOK_SECRET` as Production environment variables (same values as `.env.local` — see Task 1 of Batch g's verification for the general walkthrough of adding env vars).
3. Redeploy so the new variables take effect.

- [ ] **Step 3: Manual browser check on the live site**

On a phone or a desktop browser with microphone access:
1. Sign in as a technician account, go to Time Tracking, clock in to any active/scheduled job.
2. Click "Record voice note", say a short sentence describing a fake job finding (e.g. "Replaced the fan belt on tower three, minor corrosion on tower two, need to order a new belt for next visit"), click "Stop recording".
3. Confirm "Voice note saved — transcribing now" appears.
4. Wait 10-30 seconds, then go to `/jobs`, open the job's detail page, and check the new "Voice notes" section — it should show `status: transcribed`, a plain-language summary, and an action item mentioning ordering a belt.

- [ ] **Step 4: Verify via the database (the check that can't lie)**

Run the same query pattern used for Batch g's verification, adapted for `VoiceNote` and the `voice_note` feature:

```bash
npx tsx --env-file .env.local -e '
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
const db = new PrismaClient({ adapter });
(async () => {
  const notes = await db.voiceNote.findMany({ orderBy: { createdAt: "desc" }, take: 3 });
  const auditRows = await db.aiAuditLog.count({ where: { feature: "voice_note" } });
  console.log("Recent voice notes:", JSON.stringify(notes, null, 2));
  console.log("voice_note AiAuditLog rows:", auditRows);
  await db.$disconnect();
})();
'
```
Expected: the most recent `VoiceNote` row has `status: "transcribed"`, a non-null `transcript` and `summary`, and `voice_note AiAuditLog rows` is at least 1 (confirms the whole chain — upload, AssemblyAI transcription, webhook delivery, Claude summarization, audit logging — actually completed, independent of what the UI displays).
