# AI Company Assistant Implementation Plan (Phase 3 Batch i)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the design in `docs/superpowers/specs/2026-07-09-ai-company-assistant-design.md` — a chat assistant for office/management roles with typed tool-calling (read-only lookups + draft-only Variation/Quote generation) and semantic search over voice note transcripts and job communications.

**Architecture:** See the design spec for the full rationale. In implementation terms: `pgvector` enabled via a hand-written migration, three new tables (`ChatSession`, `ChatMessage`, `DocumentChunk`), a Voyage AI embedding client, a semantic-search library built on raw SQL (Prisma cannot type-check `vector` columns, so all `DocumentChunk` reads/writes go through `$queryRawUnsafe`/`$executeRawUnsafe`), six typed tool functions, a chat route running a manual (not SDK tool-runner) Claude tool-calling loop — manual because the design requires per-tool role enforcement and one aggregated `AiAuditLog` row per turn, both of which the automatic tool runner doesn't expose — and two small UI pieces (a persistent chat bubble/panel, and a prominent placement on `/dashboard`).

**Tech Stack:** Next.js 14 App Router, Prisma 7 + Neon (`pgvector` extension), `@anthropic-ai/sdk` (Claude Sonnet 5, manual tool-calling loop — ground-truthed against the `claude-api` skill's TypeScript tool-use reference, not guessed), Voyage AI (`voyage-3.5`, ground-truthed live this session: `POST https://api.voyageai.com/v1/embeddings`, `Authorization: Bearer <key>`, returns 1024-dimensional embeddings), Zod 4, Vitest.

## Global Constraints

- Access to `/api/assistant/chat` and all six tools: `director`, `service_manager`, `admin`, `sales_engineer` only (`requireRole` on the route). No separate per-tool role gate beyond that **except** `draftVariation` and `draftQuote`, which have their own additional role checks (see below) — every other tool is usable by any of the four allowed chat roles.
- `draftQuote` additionally requires the calling user to be `admin`, `director`, or `sales_engineer` (matches `POST /api/quotes` exactly — every allowed chat role already qualifies, so this is really just documenting the equivalence, not a new restriction).
- `draftVariation` additionally requires the calling user to be `director`, `service_manager`, or `admin` (deliberately excludes `sales_engineer` — a sales engineer has no reason to log a technician's field variation on their behalf) and requires a `technicianName` argument resolved to a real `User` with role `technician`; the created `Variation.technicianId` is that resolved technician, not the calling user.
- Never free-form SQL generation from the model. Every tool is a fixed, typed Prisma (or parameterized raw SQL for the vector-search tool) query — the model supplies typed arguments, never a query string.
- Every chat turn writes exactly one `AiAuditLog` row (`feature: "company_assistant"`) after the tool-calling loop finishes, with `promptTokens`/`outputTokens` summed across every round of that turn, and `toolCalls` recording every tool invoked with its arguments — not one row per tool call.
- The tool-calling loop is capped at 5 rounds; if the cap is hit before Claude produces a final text response, the route returns whatever text Claude has produced so far (or a fallback message if none) rather than looping forever.
- A Claude API failure at any point returns a graceful in-chat error message, never a raw 500.
- `DocumentChunk` rows are written via raw SQL only — never `db.documentChunk.create()` — because the `embedding` column is `Unsupported("vector(1024)")` in the Prisma schema and has no typed client API.
- Indexing new content for semantic search is best-effort and must never block or fail the request that created the source content (a voice note send, a job communication) — wrap the indexing call in try/catch, log on failure, do not rethrow.

---

## Task 1: Enable pgvector, add `ChatSession`/`ChatMessage`/`DocumentChunk`

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_add_ai_assistant/migration.sql`

**Interfaces:**
- Produces: `ChatSession`, `ChatMessage`, `DocumentChunk` Prisma models (the last with an `embedding Unsupported("vector(1024)")` field, unreachable from the typed client — every later task that touches it uses raw SQL). `AiFeature.company_assistant` already exists from Module 3g's original migration — no enum change needed.

- [ ] **Step 1: Add the three models to the schema**

In `prisma/schema.prisma`, add these models after `AiAuditLog`:

```prisma
model ChatSession {
  id        String   @id @default(uuid())
  userId    String
  title     String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  user     User          @relation(fields: [userId], references: [id])
  messages ChatMessage[]

  @@index([userId])
}

model ChatMessage {
  id        String   @id @default(uuid())
  sessionId String
  role      String
  content   String
  toolCalls Json?
  createdAt DateTime @default(now())

  session ChatSession @relation(fields: [sessionId], references: [id])

  @@index([sessionId])
}

model DocumentChunk {
  id         String                       @id @default(uuid())
  sourceType String
  sourceId   String
  jobId      String
  chunkText  String
  embedding  Unsupported("vector(1024)")
  createdAt  DateTime                     @default(now())

  job Job @relation(fields: [jobId], references: [id])

  @@index([jobId])
  @@index([sourceType, sourceId])
}
```

Add back-relations. On `model User`, add alongside `aiAuditLogs AiAuditLog[]`:

```prisma
  chatSessions ChatSession[]
```

On `model Job`, add alongside `voiceNotes VoiceNote[]`:

```prisma
  documentChunks DocumentChunk[]
```

- [ ] **Step 2: Verify the schema compiles**

Run: `npx prisma generate`
Expected: `✔ Generated Prisma Client` with no errors. (The `embedding` field will not appear in the generated `DocumentChunk` type's create/update inputs — that's expected for an `Unsupported` field.)

- [ ] **Step 3: Preview the SQL diff for the non-vector parts**

Run: `npx prisma migrate diff --from-config-datasource prisma.config.ts --to-schema prisma/schema.prisma --script`

Expected: `CREATE TABLE "ChatSession"`, `CREATE TABLE "ChatMessage"`, `CREATE TABLE "DocumentChunk"` (including a `"embedding" vector(1024) NOT NULL` column — Prisma passes the `Unsupported(...)` string through literally as the column type), their indexes, and their foreign keys. No `DROP`, no `ALTER` on any existing table.

**This diff will NOT include `CREATE EXTENSION`** — Prisma's diff tool only compares table/column state, not installed extensions, and this project doesn't declare `extensions = [...]` in its datasource block. You must add it by hand in the next step, or the `CREATE TABLE "DocumentChunk"` statement will fail with `type "vector" does not exist`.

- [ ] **Step 4: Write the migration file, prepending the extension**

Generate a timestamp with `date -u +%Y%m%d%H%M%S`. Create `prisma/migrations/<timestamp>_add_ai_assistant/migration.sql` with this content: `CREATE EXTENSION IF NOT EXISTS vector;` as the very first line, followed by the exact SQL from Step 3's output, unmodified.

- [ ] **Step 5: Apply it directly**

Run: `npx prisma db execute --file prisma/migrations/<timestamp>_add_ai_assistant/migration.sql`
Expected: `Script executed successfully.`

- [ ] **Step 6: Mark the migration as resolved**

Run: `npx prisma migrate resolve --applied <timestamp>_add_ai_assistant`
Expected: confirms the migration is recorded as applied.

- [ ] **Step 7: Verify live — including a real vector insert and similarity query**

This is the most important verification in this task: confirm the `vector` extension and column genuinely work end-to-end, not just that the table exists.

```bash
npx tsx --env-file .env.local -e '
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
const db = new PrismaClient({ adapter });
(async () => {
  const sessionCount = await db.chatSession.count();
  console.log("ChatSession row count:", sessionCount);

  // Find a real job to satisfy the FK
  const job = await db.job.findFirst({ select: { id: true } });
  if (!job) { console.log("No job found to test against"); await db.$disconnect(); return; }

  const fakeEmbedding = `[${Array.from({ length: 1024 }, () => Math.random()).join(",")}]`;
  await db.$executeRawUnsafe(
    `INSERT INTO "DocumentChunk" (id, "sourceType", "sourceId", "jobId", "chunkText", embedding, "createdAt")
     VALUES ($1, $2, $3, $4, $5, $6::vector, now())`,
    "test-chunk-1", "VoiceNote", "test-source-1", job.id, "test chunk for pgvector verification", fakeEmbedding
  );

  const queryEmbedding = `[${Array.from({ length: 1024 }, () => Math.random()).join(",")}]`;
  const results = await db.$queryRawUnsafe(
    `SELECT id, "chunkText", embedding <=> $1::vector AS distance FROM "DocumentChunk" ORDER BY embedding <=> $1::vector LIMIT 3`,
    queryEmbedding
  );
  console.log("Similarity query results:", JSON.stringify(results, null, 2));

  await db.$executeRawUnsafe(`DELETE FROM "DocumentChunk" WHERE id = $1`, "test-chunk-1");
  console.log("Cleaned up test row.");
  await db.$disconnect();
})();
'
```
Expected: `ChatSession row count: 0`, then a real similarity query result showing the test chunk with a `distance` value (a number between 0 and 2 for cosine distance), then confirmation the test row was deleted. This proves the extension is installed, the vector column accepts inserts, and the `<=>` cosine-distance operator works — the exact mechanism the real semantic search tool will use.

- [ ] **Step 8: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat: enable pgvector, add ChatSession/ChatMessage/DocumentChunk tables"
```

---

## Task 2: Voyage embedding client + semantic search library

**Files:**
- Create: `src/lib/ai/voyage.ts`
- Test: `src/lib/ai/__tests__/voyage.test.ts`
- Create: `src/lib/ai/semanticSearch.ts`
- Test: `src/lib/ai/__tests__/semanticSearch.test.ts`

**Interfaces:**
- Produces: `embedText(text: string): Promise<number[]>` (calls Voyage, returns a 1024-length array). `indexDocument(sourceType: "VoiceNote" | "JobCommunication", sourceId: string, jobId: string, text: string): Promise<void>` (embeds and inserts a `DocumentChunk` row via raw SQL). `semanticSearch(query: string, jobId?: string, limit?: number): Promise<SemanticSearchResult[]>` where `SemanticSearchResult = { id: string; sourceType: string; sourceId: string; jobId: string; chunkText: string; distance: number }`. Consumed by Task 3 (indexing) and Task 5 (the semantic search tool).

- [ ] **Step 1: Write the failing voyage.ts tests**

Create `src/lib/ai/__tests__/voyage.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { embedText } from "../voyage";

const originalFetch = global.fetch;
const originalKey = process.env.VOYAGE_API_KEY;

beforeEach(() => {
  process.env.VOYAGE_API_KEY = "test-key-123";
});

afterEach(() => {
  global.fetch = originalFetch;
  process.env.VOYAGE_API_KEY = originalKey;
  vi.restoreAllMocks();
});

describe("embedText", () => {
  it("posts the text with the correct auth header and model, returns the embedding array", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ embedding: Array(1024).fill(0.1) }] }),
    });
    global.fetch = mockFetch as unknown as typeof fetch;

    const result = await embedText("Replaced fan belt on Tower 3");

    expect(result).toHaveLength(1024);
    expect(result[0]).toBe(0.1);
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.voyageai.com/v1/embeddings",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer test-key-123" }),
      })
    );
    const [, options] = mockFetch.mock.calls[0];
    const body = JSON.parse(options.body);
    expect(body).toEqual({ input: ["Replaced fan belt on Tower 3"], model: "voyage-3.5" });
  });

  it("throws when the request fails", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 }) as unknown as typeof fetch;
    await expect(embedText("x")).rejects.toThrow("500");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/ai/__tests__/voyage.test.ts`
Expected: FAIL — `Cannot find module '../voyage'`.

- [ ] **Step 3: Implement voyage.ts**

Create `src/lib/ai/voyage.ts`:

```typescript
const VOYAGE_EMBEDDINGS_URL = "https://api.voyageai.com/v1/embeddings";
const MODEL = "voyage-3.5";

function apiKey(): string {
  const key = process.env.VOYAGE_API_KEY;
  if (!key) throw new Error("VOYAGE_API_KEY is not set");
  return key;
}

export async function embedText(text: string): Promise<number[]> {
  const res = await fetch(VOYAGE_EMBEDDINGS_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey()}`, "Content-Type": "application/json" },
    body: JSON.stringify({ input: [text], model: MODEL }),
  });
  if (!res.ok) throw new Error(`Voyage embeddings request failed: ${res.status}`);
  const data = (await res.json()) as { data: { embedding: number[] }[] };
  return data.data[0].embedding;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/ai/__tests__/voyage.test.ts`
Expected: PASS, both tests.

- [ ] **Step 5: Write the failing semanticSearch.ts tests**

Create `src/lib/ai/__tests__/semanticSearch.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../voyage", () => ({ embedText: vi.fn() }));
vi.mock("@/lib/db/client", () => ({
  db: { $executeRawUnsafe: vi.fn(), $queryRawUnsafe: vi.fn() },
}));

import { embedText } from "../voyage";
import { db } from "@/lib/db/client";
import { indexDocument, semanticSearch } from "../semanticSearch";

beforeEach(() => vi.clearAllMocks());

describe("indexDocument", () => {
  it("embeds the text and inserts a DocumentChunk row via raw SQL", async () => {
    vi.mocked(embedText).mockResolvedValue([0.1, 0.2, 0.3]);
    vi.mocked(db.$executeRawUnsafe).mockResolvedValue(1);

    await indexDocument("VoiceNote", "vn1", "job1", "Replaced fan belt on Tower 3.");

    expect(embedText).toHaveBeenCalledWith("Replaced fan belt on Tower 3.");
    expect(db.$executeRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO \"DocumentChunk\""),
      expect.any(String),
      "VoiceNote",
      "vn1",
      "job1",
      "Replaced fan belt on Tower 3.",
      "[0.1,0.2,0.3]"
    );
  });
});

describe("semanticSearch", () => {
  it("embeds the query and runs a similarity query scoped to a job when jobId is given", async () => {
    vi.mocked(embedText).mockResolvedValue([0.4, 0.5]);
    vi.mocked(db.$queryRawUnsafe).mockResolvedValue([
      { id: "c1", sourceType: "VoiceNote", sourceId: "vn1", jobId: "job1", chunkText: "corrosion on tower 2", distance: 0.12 },
    ]);

    const results = await semanticSearch("corrosion", "job1");

    expect(embedText).toHaveBeenCalledWith("corrosion");
    expect(results).toHaveLength(1);
    expect(results[0].chunkText).toBe("corrosion on tower 2");
    const [sql, , jobArg] = vi.mocked(db.$queryRawUnsafe).mock.calls[0];
    expect(sql).toContain("WHERE \"jobId\"");
    expect(jobArg).toBe("job1");
  });

  it("runs an unscoped similarity query when jobId is omitted", async () => {
    vi.mocked(embedText).mockResolvedValue([0.4, 0.5]);
    vi.mocked(db.$queryRawUnsafe).mockResolvedValue([]);

    await semanticSearch("corrosion");

    const [sql] = vi.mocked(db.$queryRawUnsafe).mock.calls[0];
    expect(sql).not.toContain("WHERE \"jobId\"");
  });
});
```

- [ ] **Step 6: Run tests to verify they fail**

Run: `npx vitest run src/lib/ai/__tests__/semanticSearch.test.ts`
Expected: FAIL — `Cannot find module '../semanticSearch'`.

- [ ] **Step 7: Implement semanticSearch.ts**

Create `src/lib/ai/semanticSearch.ts`:

```typescript
import crypto from "node:crypto";
import { db } from "@/lib/db/client";
import { embedText } from "./voyage";

export type DocumentSourceType = "VoiceNote" | "JobCommunication";

export async function indexDocument(
  sourceType: DocumentSourceType,
  sourceId: string,
  jobId: string,
  text: string
): Promise<void> {
  const embedding = await embedText(text);
  const vectorLiteral = `[${embedding.join(",")}]`;
  const id = crypto.randomUUID();
  await db.$executeRawUnsafe(
    `INSERT INTO "DocumentChunk" (id, "sourceType", "sourceId", "jobId", "chunkText", embedding, "createdAt")
     VALUES ($1, $2, $3, $4, $5, $6::vector, now())`,
    id,
    sourceType,
    sourceId,
    jobId,
    text,
    vectorLiteral
  );
}

export interface SemanticSearchResult {
  id: string;
  sourceType: string;
  sourceId: string;
  jobId: string;
  chunkText: string;
  distance: number;
}

export async function semanticSearch(
  query: string,
  jobId?: string,
  limit = 5
): Promise<SemanticSearchResult[]> {
  const embedding = await embedText(query);
  const vectorLiteral = `[${embedding.join(",")}]`;

  if (jobId) {
    return db.$queryRawUnsafe<SemanticSearchResult[]>(
      `SELECT id, "sourceType", "sourceId", "jobId", "chunkText", embedding <=> $1::vector AS distance
       FROM "DocumentChunk" WHERE "jobId" = $2 ORDER BY embedding <=> $1::vector LIMIT $3`,
      vectorLiteral,
      jobId,
      limit
    );
  }

  return db.$queryRawUnsafe<SemanticSearchResult[]>(
    `SELECT id, "sourceType", "sourceId", "jobId", "chunkText", embedding <=> $1::vector AS distance
     FROM "DocumentChunk" ORDER BY embedding <=> $1::vector LIMIT $2`,
    vectorLiteral,
    limit
  );
}
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `npx vitest run src/lib/ai/__tests__/semanticSearch.test.ts`
Expected: PASS, both tests.

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add src/lib/ai/voyage.ts src/lib/ai/__tests__/voyage.test.ts src/lib/ai/semanticSearch.ts src/lib/ai/__tests__/semanticSearch.test.ts
git commit -m "feat: add Voyage embedding client and pgvector semantic search library"
```

---

## Task 3: Wire indexing into voice-note send and job-communication routes

**Files:**
- Modify: `src/app/api/jobs/[id]/voice-notes/[voiceNoteId]/send/route.ts`
- Modify: `src/app/api/jobs/[id]/voice-notes/[voiceNoteId]/send/__tests__/route.test.ts`
- Modify: `src/app/api/jobs/[id]/communications/route.ts`
- Modify: `src/app/api/jobs/[id]/communications/__tests__/route.test.ts` (create the test file if it doesn't already exist — check first)

**Interfaces:**
- Consumes: `indexDocument` (Task 2).
- Produces: no new exports — both routes now index their created content for semantic search, best-effort (a Voyage/DB failure here never fails the parent request).

- [ ] **Step 1: Check whether a test file already exists for the communications route**

Run: `ls src/app/api/jobs/\[id\]/communications/__tests__/ 2>/dev/null || echo "no test dir"`

If a test file exists, read it first so Step 5 below extends it consistently rather than guessing its current shape. If none exists, Step 5 creates one from scratch.

- [ ] **Step 2: Write the failing test for the send route**

In `src/app/api/jobs/[id]/voice-notes/[voiceNoteId]/send/__tests__/route.test.ts`, add `indexDocument` to the mocked `@/lib/ai/semanticSearch` module — find the top of the file (the existing `vi.mock` calls) and add a new one:

```typescript
vi.mock("@/lib/ai/semanticSearch", () => ({ indexDocument: vi.fn() }));
```

Then add this import alongside the other imports:

```typescript
import { indexDocument } from "@/lib/ai/semanticSearch";
```

Add these two new tests at the end of the `describe` block, right before its closing `});`:

```typescript

  it("indexes the sent transcript for semantic search on success", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockTechnician as any);
    vi.mocked(db.voiceNote.findFirst).mockResolvedValue({ id: "vn1", technicianId: "t1", jobId: "job1" } as any);
    vi.mocked(summarizeTranscript).mockResolvedValue({
      summary: { summary: "Fixed it.", actionItems: [] },
      promptTokens: 100,
      outputTokens: 20,
    });
    vi.mocked(db.$transaction).mockResolvedValue([{}, {}]);
    vi.mocked(db.voiceNotePhoto.createMany).mockResolvedValue({ count: 0 } as any);
    vi.mocked(indexDocument).mockResolvedValue(undefined);

    await POST(makeReq({ transcript: "Replaced fan belt on Tower 3." }), { params: { id: "job1", voiceNoteId: "vn1" } });

    expect(indexDocument).toHaveBeenCalledWith("VoiceNote", "vn1", "job1", "Replaced fan belt on Tower 3.");
  });

  it("does not fail the request if indexing throws", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockTechnician as any);
    vi.mocked(db.voiceNote.findFirst).mockResolvedValue({ id: "vn1", technicianId: "t1", jobId: "job1" } as any);
    vi.mocked(summarizeTranscript).mockResolvedValue({
      summary: { summary: "Fixed it.", actionItems: [] },
      promptTokens: 100,
      outputTokens: 20,
    });
    vi.mocked(db.$transaction).mockResolvedValue([{}, {}]);
    vi.mocked(db.voiceNotePhoto.createMany).mockResolvedValue({ count: 0 } as any);
    vi.mocked(indexDocument).mockRejectedValue(new Error("Voyage down"));

    const res = await POST(makeReq({ transcript: "x" }), { params: { id: "job1", voiceNoteId: "vn1" } });

    expect(res.status).toBe(200);
  });
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run "src/app/api/jobs/[id]/voice-notes/[voiceNoteId]/send/__tests__/route.test.ts"`
Expected: FAIL on the two new tests — the route doesn't call `indexDocument` yet.

- [ ] **Step 4: Implement the send route change**

In `src/app/api/jobs/[id]/voice-notes/[voiceNoteId]/send/route.ts`, add the import at the top:

```typescript
import { indexDocument } from "@/lib/ai/semanticSearch";
```

Then find the line right after the try/catch block that summarizes and saves the transcript (after the `try { ... } catch (err) { ... }` block that wraps `summarizeTranscript`, and after the `await db.voiceNotePhoto.createMany(...)` call), and right before the final `return NextResponse.json({ ok: true });`. Insert this best-effort indexing call there:

```typescript
  try {
    await indexDocument("VoiceNote", voiceNote.id, params.id, transcript);
  } catch (err) {
    console.error("Failed to index voice note for semantic search:", err);
  }
```

- [ ] **Step 5: Write the failing test for the communications route, and implement it in the same TDD cycle**

Create (or extend, if Step 1 found one) `src/app/api/jobs/[id]/communications/__tests__/route.test.ts`. If creating fresh, write the full file:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/clerk", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/db/client", () => ({
  db: {
    job: { findUnique: vi.fn() },
    jobCommunication: { create: vi.fn(), findMany: vi.fn() },
    assignment: { findFirst: vi.fn() },
  },
}));
vi.mock("@/lib/ai/semanticSearch", () => ({ indexDocument: vi.fn() }));

import { requireRole } from "@/lib/auth/clerk";
import { db } from "@/lib/db/client";
import { indexDocument } from "@/lib/ai/semanticSearch";
import { POST } from "../route";

const mockDirector = { id: "u1", role: "director" as const, name: "Dana", clerkId: "c1", email: "d@t.com", isActive: true };

function makeReq(body: unknown) {
  return new Request("http://localhost/api/jobs/job1/communications", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => vi.clearAllMocks());

describe("POST /api/jobs/[id]/communications indexing", () => {
  it("indexes the communication body for semantic search on success", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockDirector as any);
    vi.mocked(db.job.findUnique).mockResolvedValue({ id: "job1" } as any);
    vi.mocked(db.jobCommunication.create).mockResolvedValue({ id: "comm1", jobId: "job1", body: "Field note text" } as any);
    vi.mocked(indexDocument).mockResolvedValue(undefined);

    await POST(makeReq({ type: "field_instruction", body: "Field note text" }), { params: { id: "job1" } });

    expect(indexDocument).toHaveBeenCalledWith("JobCommunication", "comm1", "job1", "Field note text");
  });

  it("does not fail the request if indexing throws", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockDirector as any);
    vi.mocked(db.job.findUnique).mockResolvedValue({ id: "job1" } as any);
    vi.mocked(db.jobCommunication.create).mockResolvedValue({ id: "comm1", jobId: "job1", body: "x" } as any);
    vi.mocked(indexDocument).mockRejectedValue(new Error("Voyage down"));

    const res = await POST(makeReq({ type: "internal_note", body: "x" }), { params: { id: "job1" } });

    expect(res.status).toBe(201);
  });
});
```

If a test file already existed (found in Step 1), instead add the two `it(...)` blocks above (adapted to match that file's existing mock/fixture names) plus the `vi.mock("@/lib/ai/semanticSearch", ...)` line, rather than replacing the whole file.

- [ ] **Step 6: Run tests to verify they fail**

Run: `npx vitest run "src/app/api/jobs/[id]/communications/__tests__/route.test.ts"`
Expected: FAIL on the two indexing tests.

- [ ] **Step 7: Implement the communications route change**

In `src/app/api/jobs/[id]/communications/route.ts`, add the import at the top:

```typescript
import { indexDocument } from "@/lib/ai/semanticSearch";
```

Find the `POST` handler's `const communication = await db.jobCommunication.create({...});` line, and insert this immediately after it, before the `return NextResponse.json(communication, { status: 201 });` line:

```typescript
  try {
    await indexDocument("JobCommunication", communication.id, jobId, communication.body);
  } catch (err) {
    console.error("Failed to index job communication for semantic search:", err);
  }
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `npx vitest run "src/app/api/jobs/[id]/voice-notes/[voiceNoteId]/send/__tests__/route.test.ts" "src/app/api/jobs/[id]/communications/__tests__/route.test.ts"`
Expected: PASS, all tests in both files.

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add "src/app/api/jobs/[id]/voice-notes/[voiceNoteId]/send/" "src/app/api/jobs/[id]/communications/"
git commit -m "feat: index new voice notes and job communications for semantic search"
```

---

## Task 4: Backfill script for existing data

**Files:**
- Create: `scripts/backfill-embeddings.ts`

**Interfaces:**
- Produces: a standalone script (not an app route, not imported anywhere) run manually once via `npx tsx --env-file .env.local scripts/backfill-embeddings.ts`. No tests — this is an operational script, not application logic, matching this codebase's convention that one-off migration/backfill scripts aren't unit tested (there is no existing precedent of a tested script in this repo's `scripts/`-equivalent locations; the only comparable case, `prisma/seed.ts`, also has no tests).

- [ ] **Step 1: Write the script**

Create `scripts/backfill-embeddings.ts`:

```typescript
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { indexDocument } from "../src/lib/ai/semanticSearch";

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
const db = new PrismaClient({ adapter });

async function main() {
  const alreadyIndexed = await db.$queryRawUnsafe<{ sourceId: string }[]>(
    `SELECT "sourceId" FROM "DocumentChunk"`
  );
  const indexedIds = new Set(alreadyIndexed.map((r) => r.sourceId));

  const voiceNotes = await db.voiceNote.findMany({
    where: { status: "transcribed", transcript: { not: null } },
    select: { id: true, jobId: true, transcript: true },
  });

  let voiceNotesIndexed = 0;
  for (const note of voiceNotes) {
    if (indexedIds.has(note.id) || !note.transcript) continue;
    try {
      await indexDocument("VoiceNote", note.id, note.jobId, note.transcript);
      voiceNotesIndexed++;
    } catch (err) {
      console.error(`Failed to index voice note ${note.id}:`, err);
    }
  }

  const communications = await db.jobCommunication.findMany({
    select: { id: true, jobId: true, body: true },
  });

  let communicationsIndexed = 0;
  for (const comm of communications) {
    if (indexedIds.has(comm.id)) continue;
    try {
      await indexDocument("JobCommunication", comm.id, comm.jobId, comm.body);
      communicationsIndexed++;
    } catch (err) {
      console.error(`Failed to index communication ${comm.id}:`, err);
    }
  }

  console.log(`Backfill complete. Voice notes indexed: ${voiceNotesIndexed}/${voiceNotes.length}. Communications indexed: ${communicationsIndexed}/${communications.length}.`);
  await db.$disconnect();
}

main();
```

- [ ] **Step 2: Verify it compiles and runs against real data**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npx tsx --env-file .env.local scripts/backfill-embeddings.ts`
Expected: prints a real completion line like `Backfill complete. Voice notes indexed: N/N. Communications indexed: M/M.` — run it now as part of this task (this is the one-time backfill the design calls for, not just a dry run) and confirm the printed counts are non-zero and match the number of eligible rows (transcribed voice notes and all communications) you'd expect from this session's seed/test data.

- [ ] **Step 3: Verify idempotency by running it a second time**

Run the same command again: `npx tsx --env-file .env.local scripts/backfill-embeddings.ts`
Expected: `Voice notes indexed: 0/N` and `Communications indexed: 0/M` — the `alreadyIndexed` check should skip everything the first run already indexed. If this shows non-zero on the second run, the dedup logic is broken — stop and fix before continuing.

- [ ] **Step 4: Commit**

```bash
git add scripts/backfill-embeddings.ts
git commit -m "feat: add one-time backfill script for existing voice note/communication embeddings"
```

---

## Task 5: Read-only tool functions

**Files:**
- Create: `src/lib/assistant/tools/read.ts`
- Test: `src/lib/assistant/tools/__tests__/read.test.ts`

**Interfaces:**
- Produces: `findJobs(args)`, `findComplianceDocuments(args)`, `findAssignments(args)`, `semanticSearchTool(args)` — four plain async functions, each taking a typed args object and returning plain JSON-serializable data (no role checks in this file; the chat route in Task 7 enforces the single shared role gate for all four, since none of these four need a role check beyond "any of the four chat-allowed roles", per Global Constraints). Consumed by Task 7 (the chat route's tool dispatch).

- [ ] **Step 1: Write the failing tests**

Create `src/lib/assistant/tools/__tests__/read.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db/client", () => ({
  db: {
    job: { findMany: vi.fn() },
    complianceTemplate: { findMany: vi.fn() },
    complianceDocument: { findMany: vi.fn() },
    assignment: { findMany: vi.fn() },
  },
}));
vi.mock("@/lib/ai/semanticSearch", () => ({ semanticSearch: vi.fn() }));

import { db } from "@/lib/db/client";
import { semanticSearch } from "@/lib/ai/semanticSearch";
import { findJobs, findComplianceDocuments, findAssignments, semanticSearchTool } from "../read";

beforeEach(() => vi.clearAllMocks());

describe("findJobs", () => {
  it("filters by status, siteName, and customerName when provided", async () => {
    vi.mocked(db.job.findMany).mockResolvedValue([{ id: "j1", customerName: "Rio Tinto", siteName: "Weipa", status: "active" }] as any);

    const result = await findJobs({ status: "active", siteName: "Weipa", customerName: "Rio Tinto" });

    expect(db.job.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: "active",
          siteName: { contains: "Weipa", mode: "insensitive" },
          customerName: { contains: "Rio Tinto", mode: "insensitive" },
        }),
      })
    );
    expect(result).toHaveLength(1);
  });

  it("filters overdue jobs (active, logged hours exceed quoted) when overdueOnly is true", async () => {
    vi.mocked(db.job.findMany).mockResolvedValue([]);
    await findJobs({ overdueOnly: true });
    expect(db.job.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: "active" }) })
    );
  });

  it("returns all jobs (capped) when no filters are given", async () => {
    vi.mocked(db.job.findMany).mockResolvedValue([]);
    await findJobs({});
    expect(db.job.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 20 }));
  });
});

describe("findComplianceDocuments", () => {
  it("returns templates missing a submitted document for a given job", async () => {
    vi.mocked(db.complianceTemplate.findMany).mockResolvedValue([
      { id: "tmpl1", name: "SWMS", type: "SWMS" },
      { id: "tmpl2", name: "JSA", type: "JSA" },
    ] as any);
    vi.mocked(db.complianceDocument.findMany).mockResolvedValue([{ templateId: "tmpl2" }] as any);

    const result = await findComplianceDocuments({ jobId: "job1" });

    expect(result).toEqual([{ templateId: "tmpl1", templateName: "SWMS" }]);
  });
});

describe("findAssignments", () => {
  it("filters by technician name when provided", async () => {
    vi.mocked(db.assignment.findMany).mockResolvedValue([]);
    await findAssignments({ technicianName: "Jake" });
    expect(db.assignment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ user: { name: { contains: "Jake", mode: "insensitive" } } }),
      })
    );
  });
});

describe("semanticSearchTool", () => {
  it("delegates to semanticSearch with the query and optional jobId", async () => {
    vi.mocked(semanticSearch).mockResolvedValue([
      { id: "c1", sourceType: "VoiceNote", sourceId: "vn1", jobId: "job1", chunkText: "corrosion noted", distance: 0.1 },
    ]);

    const result = await semanticSearchTool({ query: "corrosion", jobId: "job1" });

    expect(semanticSearch).toHaveBeenCalledWith("corrosion", "job1");
    expect(result).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/assistant/tools/__tests__/read.test.ts`
Expected: FAIL — `Cannot find module '../read'`.

- [ ] **Step 3: Implement**

Create `src/lib/assistant/tools/read.ts`:

```typescript
import { db } from "@/lib/db/client";
import { semanticSearch } from "@/lib/ai/semanticSearch";

export async function findJobs(args: {
  status?: string;
  siteName?: string;
  customerName?: string;
  overdueOnly?: boolean;
}) {
  const where: Record<string, unknown> = {};
  if (args.status) where.status = args.status;
  if (args.siteName) where.siteName = { contains: args.siteName, mode: "insensitive" };
  if (args.customerName) where.customerName = { contains: args.customerName, mode: "insensitive" };
  if (args.overdueOnly) where.status = "active";

  const jobs = await db.job.findMany({
    where,
    select: { id: true, customerName: true, siteName: true, status: true, quotedHours: true, jobType: true },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  return jobs;
}

export async function findComplianceDocuments(args: { jobId?: string; missingTemplateType?: string }) {
  const templates = await db.complianceTemplate.findMany({
    where: { isActive: true, ...(args.missingTemplateType ? { type: args.missingTemplateType } : {}) },
    select: { id: true, name: true, type: true },
  });

  if (!args.jobId) {
    return templates.map((t) => ({ templateId: t.id, templateName: t.name }));
  }

  const submitted = await db.complianceDocument.findMany({
    where: { jobId: args.jobId },
    select: { templateId: true },
  });
  const submittedIds = new Set(submitted.map((s) => s.templateId));

  return templates
    .filter((t) => !submittedIds.has(t.id))
    .map((t) => ({ templateId: t.id, templateName: t.name }));
}

export async function findAssignments(args: { technicianName?: string; siteId?: string; dateFrom?: string; dateTo?: string }) {
  const where: Record<string, unknown> = {};
  if (args.technicianName) where.user = { name: { contains: args.technicianName, mode: "insensitive" } };
  if (args.dateFrom || args.dateTo) {
    where.assignedDate = {
      ...(args.dateFrom ? { gte: new Date(args.dateFrom) } : {}),
      ...(args.dateTo ? { lte: new Date(args.dateTo) } : {}),
    };
  }

  const assignments = await db.assignment.findMany({
    where,
    include: { user: { select: { name: true } }, job: { select: { customerName: true, siteName: true } } },
    take: 20,
    orderBy: { assignedDate: "desc" },
  });

  return assignments.map((a) => ({
    technicianName: a.user.name,
    customerName: a.job.customerName,
    siteName: a.job.siteName,
    assignedDate: a.assignedDate.toISOString(),
  }));
}

export async function semanticSearchTool(args: { query: string; jobId?: string }) {
  const results = await semanticSearch(args.query, args.jobId);
  return results.map((r) => ({ sourceType: r.sourceType, jobId: r.jobId, chunkText: r.chunkText, relevance: 1 - r.distance }));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/assistant/tools/__tests__/read.test.ts`
Expected: PASS, all 6 tests.

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/assistant/tools/read.ts src/lib/assistant/tools/__tests__/read.test.ts
git commit -m "feat: add read-only assistant tool functions (findJobs, findComplianceDocuments, findAssignments, semanticSearchTool)"
```

---

## Task 6: Draft-generation tool functions

**Files:**
- Create: `src/lib/assistant/tools/draft.ts`
- Test: `src/lib/assistant/tools/__tests__/draft.test.ts`

**Interfaces:**
- Produces: `draftVariation(args, callingUser): Promise<{ ok: true; variationId: string } | { ok: false; error: string }>` and `draftQuote(args, callingUser): Promise<{ ok: true; quoteId: string } | { ok: false; error: string }>` — both take the tool's typed arguments AND the calling `User` (for role checks and audit fields), and return a discriminated-union result instead of throwing, so the chat route can feed either outcome back to Claude as a normal tool result. Consumed by Task 7.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/assistant/tools/__tests__/draft.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db/client", () => ({
  db: {
    user: { findFirst: vi.fn() },
    job: { findFirst: vi.fn() },
    assignment: { findFirst: vi.fn() },
    variation: { create: vi.fn() },
    quote: { create: vi.fn() },
  },
}));

import { db } from "@/lib/db/client";
import { draftVariation, draftQuote } from "../draft";

const director = { id: "u1", role: "director" as const, name: "Dana", clerkId: "c1", email: "d@t.com", isActive: true };
const salesEngineer = { id: "u2", role: "sales_engineer" as const, name: "Sam", clerkId: "c2", email: "s@t.com", isActive: true };

beforeEach(() => vi.clearAllMocks());

describe("draftVariation", () => {
  it("returns an error when the calling user's role isn't allowed to draft variations", async () => {
    const result = await draftVariation(
      { jobId: "job1", technicianName: "Jake", description: "Fan belt", costEstimate: 50 },
      salesEngineer as any
    );
    expect(result.ok).toBe(false);
    expect(db.variation.create).not.toHaveBeenCalled();
  });

  it("returns an error when the named technician can't be found", async () => {
    vi.mocked(db.user.findFirst).mockResolvedValue(null);
    const result = await draftVariation(
      { jobId: "job1", technicianName: "Nobody", description: "Fan belt", costEstimate: 50 },
      director as any
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("Nobody");
  });

  it("creates a pending Variation attributed to the resolved technician, not the calling director", async () => {
    vi.mocked(db.user.findFirst).mockResolvedValue({ id: "tech1", name: "Jake Morrison", role: "technician" } as any);
    vi.mocked(db.job.findFirst).mockResolvedValue({ id: "job1" } as any);
    vi.mocked(db.assignment.findFirst).mockResolvedValue({ id: "a1" } as any);
    vi.mocked(db.variation.create).mockResolvedValue({ id: "var1" } as any);

    const result = await draftVariation(
      { jobId: "job1", technicianName: "Jake Morrison", description: "Fan belt for $50", costEstimate: 50 },
      director as any
    );

    expect(result).toEqual({ ok: true, variationId: "var1" });
    expect(db.variation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ technicianId: "tech1", jobId: "job1", status: "pending", costEstimate: 50 }),
      })
    );
  });

  it("returns an error when the resolved technician isn't assigned to the job", async () => {
    vi.mocked(db.user.findFirst).mockResolvedValue({ id: "tech1", name: "Jake Morrison", role: "technician" } as any);
    vi.mocked(db.job.findFirst).mockResolvedValue({ id: "job1" } as any);
    vi.mocked(db.assignment.findFirst).mockResolvedValue(null);

    const result = await draftVariation(
      { jobId: "job1", technicianName: "Jake Morrison", description: "Fan belt", costEstimate: 50 },
      director as any
    );

    expect(result.ok).toBe(false);
    expect(db.variation.create).not.toHaveBeenCalled();
  });
});

describe("draftQuote", () => {
  it("returns an error when the calling user's role isn't allowed to draft quotes", async () => {
    const technician = { id: "u3", role: "technician" as const, name: "Jake", clerkId: "c3", email: "j@t.com", isActive: true };
    const result = await draftQuote(
      { customerName: "Rio Tinto", siteName: "Weipa", jobType: "Inspection", lineItems: [{ description: "Labour", qty: 2, unitPrice: 100 }] },
      technician as any
    );
    expect(result.ok).toBe(false);
    expect(db.quote.create).not.toHaveBeenCalled();
  });

  it("creates a draft Quote attributed to the calling user", async () => {
    vi.mocked(db.quote.create).mockResolvedValue({ id: "q1" } as any);

    const result = await draftQuote(
      { customerName: "Rio Tinto", siteName: "Weipa", jobType: "Inspection", lineItems: [{ description: "Labour", qty: 2, unitPrice: 100 }] },
      director as any
    );

    expect(result).toEqual({ ok: true, quoteId: "q1" });
    expect(db.quote.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ createdById: "u1", status: "draft", totalAmount: 200 }),
      })
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/assistant/tools/__tests__/draft.test.ts`
Expected: FAIL — `Cannot find module '../draft'`.

- [ ] **Step 3: Implement**

Create `src/lib/assistant/tools/draft.ts`:

```typescript
import { db } from "@/lib/db/client";

interface CallingUser {
  id: string;
  role: string;
  name: string;
}

type ToolResult<T extends Record<string, unknown>> = ({ ok: true } & T) | { ok: false; error: string };

const DRAFT_VARIATION_ROLES = ["director", "service_manager", "admin"];
const DRAFT_QUOTE_ROLES = ["admin", "director", "sales_engineer"];

export async function draftVariation(
  args: { jobId: string; technicianName: string; description: string; costEstimate: number },
  callingUser: CallingUser
): Promise<ToolResult<{ variationId: string }>> {
  if (!DRAFT_VARIATION_ROLES.includes(callingUser.role)) {
    return { ok: false, error: "Your role isn't permitted to draft a variation." };
  }

  const technician = await db.user.findFirst({
    where: { name: { contains: args.technicianName, mode: "insensitive" }, role: "technician" },
  });
  if (!technician) {
    return { ok: false, error: `Couldn't find a technician named "${args.technicianName}".` };
  }

  const job = await db.job.findFirst({ where: { id: args.jobId, status: { in: ["active", "scheduled"] } } });
  if (!job) {
    return { ok: false, error: "Job not found or not active." };
  }

  const assignment = await db.assignment.findFirst({ where: { userId: technician.id, jobId: args.jobId } });
  if (!assignment) {
    return { ok: false, error: `${technician.name} isn't assigned to this job.` };
  }

  const variation = await db.variation.create({
    data: {
      jobId: args.jobId,
      technicianId: technician.id,
      description: args.description,
      costEstimate: args.costEstimate,
      status: "pending",
    },
  });

  return { ok: true, variationId: variation.id };
}

export async function draftQuote(
  args: { customerName: string; siteName: string; jobType: string; lineItems: { description: string; qty: number; unitPrice: number }[] },
  callingUser: CallingUser
): Promise<ToolResult<{ quoteId: string }>> {
  if (!DRAFT_QUOTE_ROLES.includes(callingUser.role)) {
    return { ok: false, error: "Your role isn't permitted to draft a quote." };
  }

  const totalAmount = args.lineItems.reduce((sum, li) => sum + li.qty * li.unitPrice, 0);

  const quote = await db.quote.create({
    data: {
      createdById: callingUser.id,
      customerName: args.customerName,
      siteName: args.siteName,
      jobType: args.jobType,
      lineItems: args.lineItems,
      totalAmount,
      status: "draft",
    },
  });

  return { ok: true, quoteId: quote.id };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/assistant/tools/__tests__/draft.test.ts`
Expected: PASS, all 6 tests.

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/assistant/tools/draft.ts src/lib/assistant/tools/__tests__/draft.test.ts
git commit -m "feat: add draft-generation assistant tool functions (draftVariation, draftQuote)"
```

---

## Task 7: Chat route with manual tool-calling loop

**Files:**
- Create: `src/lib/assistant/toolDefinitions.ts`
- Create: `src/lib/assistant/validate.ts`
- Test: `src/lib/assistant/__tests__/validate.test.ts`
- Create: `src/app/api/assistant/chat/route.ts`
- Test: `src/app/api/assistant/chat/__tests__/route.test.ts`

**Interfaces:**
- Consumes: `findJobs`/`findComplianceDocuments`/`findAssignments`/`semanticSearchTool` (Task 5), `draftVariation`/`draftQuote` (Task 6), `getAnthropicClient` (existing), `calculateCostUsd` (existing).
- Produces: `POST /api/assistant/chat` — the only new HTTP endpoint in this plan. Accepts `{ sessionId?: string; message: string }`, runs a bounded manual Claude tool-calling loop against all six tools, persists `ChatSession`/`ChatMessage` rows, writes one `AiAuditLog` row per turn, returns `{ sessionId: string; reply: string }`.

- [ ] **Step 1: Write the tool schema definitions (no tests — this is a static data structure, not logic)**

Create `src/lib/assistant/toolDefinitions.ts`:

```typescript
import type Anthropic from "@anthropic-ai/sdk";

export const ASSISTANT_TOOLS: Anthropic.Tool[] = [
  {
    name: "findJobs",
    description: "Search jobs by status, site name, customer name, or whether they're overdue (active jobs whose logged hours exceed quoted hours). Call this for questions like 'which jobs are overdue' or 'show me jobs at Weipa'.",
    input_schema: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["scheduled", "active", "complete", "cancelled"] },
        siteName: { type: "string" },
        customerName: { type: "string" },
        overdueOnly: { type: "boolean" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "findComplianceDocuments",
    description: "Find compliance document templates missing a submitted document for a job (e.g. 'which jobs are missing a SWMS'). Omit jobId to list all active templates.",
    input_schema: {
      type: "object",
      properties: {
        jobId: { type: "string" },
        missingTemplateType: { type: "string" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "findAssignments",
    description: "Find which technicians worked at which sites and when. Call this for questions like 'which technicians worked at Site X' or 'who's assigned this week'.",
    input_schema: {
      type: "object",
      properties: {
        technicianName: { type: "string" },
        dateFrom: { type: "string", description: "ISO date string" },
        dateTo: { type: "string", description: "ISO date string" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "semanticSearchTool",
    description: "Search voice note transcripts and job communications by meaning, not exact keywords. Call this for questions like 'find notes mentioning corrosion' or 'search for mentions of a leak'.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string" },
        jobId: { type: "string", description: "Optional — scope the search to one job" },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
  {
    name: "draftVariation",
    description: "Draft a job variation on a named technician's behalf. Only usable by director/service_manager/admin roles. Creates a real Variation record with status 'pending', reviewed the same way as a technician-submitted one.",
    input_schema: {
      type: "object",
      properties: {
        jobId: { type: "string" },
        technicianName: { type: "string", description: "The technician this variation is being drafted for" },
        description: { type: "string" },
        costEstimate: { type: "number" },
      },
      required: ["jobId", "technicianName", "description", "costEstimate"],
      additionalProperties: false,
    },
  },
  {
    name: "draftQuote",
    description: "Draft a quote. Only usable by admin/director/sales_engineer roles. Creates a real Quote record with status 'draft', reviewed the same way as a manually-started one.",
    input_schema: {
      type: "object",
      properties: {
        customerName: { type: "string" },
        siteName: { type: "string" },
        jobType: { type: "string" },
        lineItems: {
          type: "array",
          items: {
            type: "object",
            properties: {
              description: { type: "string" },
              qty: { type: "number" },
              unitPrice: { type: "number" },
            },
            required: ["description", "qty", "unitPrice"],
          },
        },
      },
      required: ["customerName", "siteName", "jobType", "lineItems"],
      additionalProperties: false,
    },
  },
];
```

- [ ] **Step 2: Write the failing validate.ts test**

Create `src/lib/assistant/__tests__/validate.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { validateChatInput } from "../validate";

describe("validateChatInput", () => {
  it("accepts a message with no sessionId", () => {
    expect(validateChatInput({ message: "hello" }).success).toBe(true);
  });

  it("accepts a message with a sessionId", () => {
    expect(validateChatInput({ message: "hello", sessionId: "sess-1" }).success).toBe(true);
  });

  it("rejects an empty message", () => {
    expect(validateChatInput({ message: "" }).success).toBe(false);
  });

  it("rejects a missing message", () => {
    expect(validateChatInput({}).success).toBe(false);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/lib/assistant/__tests__/validate.test.ts`
Expected: FAIL — `Cannot find module '../validate'`.

- [ ] **Step 4: Implement validate.ts**

Create `src/lib/assistant/validate.ts`:

```typescript
import { z } from "zod";

export const chatInputSchema = z.object({
  sessionId: z.string().optional(),
  message: z.string().min(1),
});

export function validateChatInput(input: unknown) {
  return chatInputSchema.safeParse(input);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/lib/assistant/__tests__/validate.test.ts`
Expected: PASS, all 4 tests.

- [ ] **Step 6: Write the failing chat route tests**

Create `src/app/api/assistant/chat/__tests__/route.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/clerk", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/db/client", () => ({
  db: {
    chatSession: { create: vi.fn(), findUnique: vi.fn() },
    chatMessage: { create: vi.fn(), findMany: vi.fn() },
    aiAuditLog: { create: vi.fn() },
  },
}));
vi.mock("@/lib/ai/client", () => ({ getAnthropicClient: vi.fn() }));
vi.mock("@/lib/assistant/tools/read", () => ({
  findJobs: vi.fn(),
  findComplianceDocuments: vi.fn(),
  findAssignments: vi.fn(),
  semanticSearchTool: vi.fn(),
}));
vi.mock("@/lib/assistant/tools/draft", () => ({
  draftVariation: vi.fn(),
  draftQuote: vi.fn(),
}));

import { requireRole } from "@/lib/auth/clerk";
import { db } from "@/lib/db/client";
import { getAnthropicClient } from "@/lib/ai/client";
import { findJobs } from "@/lib/assistant/tools/read";
import { POST } from "../route";

const mockDirector = { id: "u1", role: "director" as const, name: "Dana", clerkId: "c1", email: "d@t.com", isActive: true };

function makeReq(body: unknown) {
  return new Request("http://localhost/api/assistant/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(db.chatSession.create).mockResolvedValue({ id: "sess1", userId: "u1" } as any);
  vi.mocked(db.chatMessage.findMany).mockResolvedValue([]);
  vi.mocked(db.chatMessage.create).mockResolvedValue({} as any);
  vi.mocked(db.aiAuditLog.create).mockResolvedValue({} as any);
});

describe("POST /api/assistant/chat", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireRole).mockRejectedValue(new Error("Unauthorized"));
    const res = await POST(makeReq({ message: "hi" }));
    expect(res.status).toBe(401);
  });

  it("returns 400 for an empty message", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockDirector as any);
    const res = await POST(makeReq({ message: "" }));
    expect(res.status).toBe(400);
  });

  it("returns Claude's direct text response when no tool call is needed", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockDirector as any);
    const mockCreate = vi.fn().mockResolvedValue({
      content: [{ type: "text", text: "Hello! How can I help?" }],
      stop_reason: "end_turn",
      usage: { input_tokens: 50, output_tokens: 10 },
    });
    vi.mocked(getAnthropicClient).mockReturnValue({ messages: { create: mockCreate } } as any);

    const res = await POST(makeReq({ message: "hi" }));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.reply).toBe("Hello! How can I help?");
    expect(db.aiAuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ feature: "company_assistant", promptTokens: 50, outputTokens: 10 }),
      })
    );
  });

  it("executes a tool call, feeds the result back, and returns the follow-up text — one AiAuditLog row for the whole turn", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockDirector as any);
    vi.mocked(findJobs).mockResolvedValue([{ id: "j1", customerName: "Rio Tinto", siteName: "Weipa", status: "active" }] as any);

    const mockCreate = vi.fn()
      .mockResolvedValueOnce({
        content: [{ type: "tool_use", id: "tool1", name: "findJobs", input: { customerName: "Rio Tinto" } }],
        stop_reason: "tool_use",
        usage: { input_tokens: 100, output_tokens: 20 },
      })
      .mockResolvedValueOnce({
        content: [{ type: "text", text: "Rio Tinto has one active job at Weipa." }],
        stop_reason: "end_turn",
        usage: { input_tokens: 150, output_tokens: 15 },
      });
    vi.mocked(getAnthropicClient).mockReturnValue({ messages: { create: mockCreate } } as any);

    const res = await POST(makeReq({ message: "What jobs does Rio Tinto have?" }));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.reply).toBe("Rio Tinto has one active job at Weipa.");
    expect(findJobs).toHaveBeenCalledWith({ customerName: "Rio Tinto" });
    expect(mockCreate).toHaveBeenCalledTimes(2);
    // One AiAuditLog row for the whole turn, tokens summed across both rounds
    expect(db.aiAuditLog.create).toHaveBeenCalledTimes(1);
    expect(db.aiAuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ promptTokens: 250, outputTokens: 35 }),
      })
    );
  });

  it("returns a graceful message instead of a 500 when the Claude API call throws", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockDirector as any);
    const mockCreate = vi.fn().mockRejectedValue(new Error("Claude API error"));
    vi.mocked(getAnthropicClient).mockReturnValue({ messages: { create: mockCreate } } as any);

    const res = await POST(makeReq({ message: "hi" }));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.reply).toMatch(/trouble/i);
  });
});
```

- [ ] **Step 7: Run tests to verify they fail**

Run: `npx vitest run src/app/api/assistant/chat/__tests__/route.test.ts`
Expected: FAIL — `Cannot find module '../route'`.

- [ ] **Step 8: Implement the chat route**

Create `src/app/api/assistant/chat/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/clerk";
import { db } from "@/lib/db/client";
import { getAnthropicClient } from "@/lib/ai/client";
import { calculateCostUsd } from "@/lib/ai/cost";
import { validateChatInput } from "@/lib/assistant/validate";
import { ASSISTANT_TOOLS } from "@/lib/assistant/toolDefinitions";
import { findJobs, findComplianceDocuments, findAssignments, semanticSearchTool } from "@/lib/assistant/tools/read";
import { draftVariation, draftQuote } from "@/lib/assistant/tools/draft";
import type Anthropic from "@anthropic-ai/sdk";

const MODEL = "claude-sonnet-5";
const MAX_ROUNDS = 5;
const FALLBACK_MESSAGE = "I'm having trouble right now — please try again in a moment.";

async function dispatchTool(name: string, input: Record<string, unknown>, callingUser: { id: string; role: string; name: string }) {
  switch (name) {
    case "findJobs":
      return findJobs(input as never);
    case "findComplianceDocuments":
      return findComplianceDocuments(input as never);
    case "findAssignments":
      return findAssignments(input as never);
    case "semanticSearchTool":
      return semanticSearchTool(input as never);
    case "draftVariation":
      return draftVariation(input as never, callingUser);
    case "draftQuote":
      return draftQuote(input as never, callingUser);
    default:
      return { error: `Unknown tool: ${name}` };
  }
}

export async function POST(req: Request) {
  const user = await requireRole(["director", "service_manager", "admin", "sales_engineer"]).catch(() => null);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = validateChatInput(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  }
  const { message } = parsed.data;

  const session = parsed.data.sessionId
    ? await db.chatSession.findUnique({ where: { id: parsed.data.sessionId } })
    : await db.chatSession.create({ data: { userId: user.id, title: message.slice(0, 80) } });

  if (!session) {
    return NextResponse.json({ error: "Chat session not found" }, { status: 404 });
  }

  const history = await db.chatMessage.findMany({
    where: { sessionId: session.id },
    orderBy: { createdAt: "asc" },
    select: { role: true, content: true },
  });

  const messages: Anthropic.MessageParam[] = [
    ...history.map((h) => ({ role: h.role as "user" | "assistant", content: h.content })),
    { role: "user" as const, content: message },
  ];

  await db.chatMessage.create({ data: { sessionId: session.id, role: "user", content: message } });

  let totalPromptTokens = 0;
  let totalOutputTokens = 0;
  const toolCallLog: { tool: string; input: unknown }[] = [];
  let finalText = FALLBACK_MESSAGE;

  try {
    const client = getAnthropicClient();

    for (let round = 0; round < MAX_ROUNDS; round++) {
      const response = await client.messages.create({
        model: MODEL,
        max_tokens: 2048,
        system: "You are an assistant for a cooling tower maintenance field-ops company. Answer questions using the tools available to you. For semantic search, use it when the user asks to find or search notes/communications by topic rather than exact match.",
        tools: ASSISTANT_TOOLS,
        messages,
      });

      totalPromptTokens += response.usage.input_tokens;
      totalOutputTokens += response.usage.output_tokens;

      const textBlock = response.content.find((b) => b.type === "text");
      if (textBlock && "text" in textBlock) finalText = textBlock.text;

      if (response.stop_reason !== "tool_use") {
        break;
      }

      messages.push({ role: "assistant", content: response.content });

      const toolUseBlocks = response.content.filter((b) => b.type === "tool_use");
      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const toolUse of toolUseBlocks) {
        if (toolUse.type !== "tool_use") continue;
        toolCallLog.push({ tool: toolUse.name, input: toolUse.input });
        const result = await dispatchTool(toolUse.name, toolUse.input as Record<string, unknown>, user);
        toolResults.push({
          type: "tool_result",
          tool_use_id: toolUse.id,
          content: JSON.stringify(result),
        });
      }

      messages.push({ role: "user", content: toolResults });
    }

    const costUsd = calculateCostUsd(MODEL, totalPromptTokens, totalOutputTokens);
    await db.aiAuditLog.create({
      data: {
        userId: user.id,
        feature: "company_assistant",
        toolCalls: toolCallLog,
        promptTokens: totalPromptTokens,
        outputTokens: totalOutputTokens,
        costUsd,
      },
    });

    await db.chatMessage.create({
      data: { sessionId: session.id, role: "assistant", content: finalText, toolCalls: toolCallLog },
    });
  } catch (err) {
    console.error("Assistant chat turn failed:", err);
    finalText = FALLBACK_MESSAGE;
  }

  return NextResponse.json({ sessionId: session.id, reply: finalText });
}
```

- [ ] **Step 9: Run tests to verify they pass**

Run: `npx vitest run src/app/api/assistant/chat/__tests__/route.test.ts`
Expected: PASS, all 5 tests.

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 10: Commit**

```bash
git add src/lib/assistant/ src/app/api/assistant/
git commit -m "feat: add POST /api/assistant/chat with manual tool-calling loop"
```

---

## Task 8: Chat bubble/panel UI + dashboard placement

**Files:**
- Create: `src/components/assistant/ChatWidget.tsx`
- Modify: `src/components/layout/AppShell.tsx`
- Modify: `src/app/dashboard/page.tsx`

**Interfaces:**
- Produces: `<ChatWidget />` — a self-contained client component rendering a floating bubble that expands into a chat panel. It manages its own `sessionId`/message history in local component state (no need to fetch prior history on mount — a fresh page load starts a fresh visible conversation; the underlying `ChatSession` still persists server-side once a message is sent). Rendered from `AppShell` so it appears on every page the four allowed roles can see; `AppShell` already knows the current user's role (see existing `hasTabs` check), so it conditionally renders the widget only for `director`/`service_manager`/`admin`/`sales_engineer`. Also rendered inline (not as a bubble) directly on `/dashboard`.

- [ ] **Step 1: Create the chat widget component**

Create `src/components/assistant/ChatWidget.tsx`:

```tsx
"use client";

import { useState, useRef, useEffect } from "react";
import { MessageCircle, X, Send } from "lucide-react";

interface ChatMessageDisplay {
  role: "user" | "assistant";
  content: string;
}

interface ChatWidgetProps {
  inline?: boolean;
}

export function ChatWidget({ inline = false }: ChatWidgetProps) {
  const [open, setOpen] = useState(inline);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessageDisplay[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  async function send() {
    const trimmed = input.trim();
    if (!trimmed || sending) return;
    setError(null);
    setMessages((prev) => [...prev, { role: "user", content: trimmed }]);
    setInput("");
    setSending(true);
    try {
      const res = await fetch("/api/assistant/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: sessionId ?? undefined, message: trimmed }),
      });
      if (!res.ok) throw new Error("Request failed");
      const data = await res.json();
      setSessionId(data.sessionId);
      setMessages((prev) => [...prev, { role: "assistant", content: data.reply }]);
    } catch {
      setError("Failed to send. Try again.");
    } finally {
      setSending(false);
    }
  }

  const panel = (
    <div className={inline ? "rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 flex flex-col h-[420px]" : "w-80 sm:w-96 h-[480px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-xl flex flex-col"}>
      {!inline && (
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-700">
          <p className="text-sm font-semibold">Assistant</p>
          <button onClick={() => setOpen(false)} className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {messages.length === 0 && (
          <p className="text-sm text-slate-400">Ask about jobs, compliance, assignments, or draft a variation/quote.</p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`text-sm ${m.role === "user" ? "text-right" : "text-left"}`}>
            <span className={`inline-block px-3 py-2 rounded-lg max-w-[85%] ${m.role === "user" ? "bg-amber-600 text-white" : "bg-slate-100 dark:bg-slate-700"}`}>
              {m.content}
            </span>
          </div>
        ))}
        {sending && <p className="text-xs text-slate-400">Thinking…</p>}
        {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
      </div>
      <div className="flex gap-2 p-3 border-t border-slate-200 dark:border-slate-700">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") send(); }}
          placeholder="Ask a question…"
          className="flex-1 min-h-[40px] rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 text-sm"
        />
        <button
          onClick={send}
          disabled={sending}
          aria-label="Send"
          className="min-h-[40px] px-3 rounded-lg bg-amber-600 hover:bg-amber-700 text-white disabled:opacity-40"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  );

  if (inline) return panel;

  return (
    <div className="fixed bottom-4 right-4 z-40">
      {open ? panel : (
        <button
          onClick={() => setOpen(true)}
          aria-label="Open assistant"
          className="w-14 h-14 rounded-full bg-amber-600 hover:bg-amber-700 text-white shadow-lg flex items-center justify-center"
        >
          <MessageCircle className="w-6 h-6" />
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Render the floating bubble from AppShell for allowed roles only**

In `src/components/layout/AppShell.tsx`, read the current file first. Add the import:

```typescript
import { ChatWidget } from "@/components/assistant/ChatWidget";
```

Find:

```tsx
export async function AppShell({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  const hasTabs = user?.role === "technician";

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <Sidebar />
      <MobileNav />
      <BottomTabBar />
      <div className="lg:pl-64">
        <TopBar />
        {/* Extra bottom padding on mobile so content clears the bottom tab bar */}
        <main className={`px-4 py-6 lg:px-8 lg:py-8 ${hasTabs ? "pb-20 lg:pb-8" : ""}`}>
          {children}
        </main>
      </div>
    </div>
  );
}
```

Replace with:

```tsx
const ASSISTANT_ROLES = ["director", "service_manager", "admin", "sales_engineer"];

export async function AppShell({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  const hasTabs = user?.role === "technician";
  const showAssistant = !!user && ASSISTANT_ROLES.includes(user.role);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <Sidebar />
      <MobileNav />
      <BottomTabBar />
      <div className="lg:pl-64">
        <TopBar />
        {/* Extra bottom padding on mobile so content clears the bottom tab bar */}
        <main className={`px-4 py-6 lg:px-8 lg:py-8 ${hasTabs ? "pb-20 lg:pb-8" : ""}`}>
          {children}
        </main>
      </div>
      {showAssistant && <ChatWidget />}
    </div>
  );
}
```

- [ ] **Step 3: Add an inline panel prominently on the dashboard**

In `src/app/dashboard/page.tsx`, read the current file first. Add the import:

```typescript
import { ChatWidget } from "@/components/assistant/ChatWidget";
```

Find:

```tsx
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-8">
        <h1 className="text-xl font-semibold">Dashboard</h1>

        {(user.role === "service_manager" || user.role === "director") && (
          <CrewBoard />
        )}

        {(user.role === "director" || user.role === "admin") && (
          <HoursOverview />
        )}
      </div>
```

Replace with:

```tsx
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-8">
        <h1 className="text-xl font-semibold">Dashboard</h1>

        <div className="space-y-2">
          <h2 className="text-sm font-medium text-slate-700 dark:text-slate-300">Assistant</h2>
          <ChatWidget inline />
        </div>

        {(user.role === "service_manager" || user.role === "director") && (
          <CrewBoard />
        )}

        {(user.role === "director" || user.role === "admin") && (
          <HoursOverview />
        )}
      </div>
```

Note: since `AppShell` also renders the floating bubble for these same roles, `/dashboard` will show both the inline panel and the floating bubble simultaneously. This is intentional and matches the design decision ("prominently on `/dashboard` ... plus the persistent bubble everywhere else") — the floating bubble on the dashboard itself is a minor, accepted redundancy rather than a bug; do not add special-case logic to hide the bubble specifically on `/dashboard`.

- [ ] **Step 4: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npx vitest run`
Expected: all existing tests still pass, count unchanged (no new tests for these three files — matches this codebase's established convention for interactive client components, see Global Constraints in the prior Voice Notes plans).

- [ ] **Step 5: Commit**

```bash
git add src/components/assistant/ src/components/layout/AppShell.tsx src/app/dashboard/page.tsx
git commit -m "feat: add assistant chat widget (floating bubble + dashboard panel)"
```

---

## Task 9: Live verification

**Files:** None (verification only).

- [ ] **Step 1: Run the full test suite and typecheck**

Run: `npx vitest run && npx tsc --noEmit`
Expected: all tests pass, no type errors.

- [ ] **Step 2: Push and deploy**

Push `main` to `origin` (with explicit confirmation). No new Vercel env vars needed — `ANTHROPIC_API_KEY` and `VOYAGE_API_KEY` are already configured from prior batches.

- [ ] **Step 3: Manual browser check on the live site**

1. As a director, open `/dashboard` — confirm the inline assistant panel appears, and the floating bubble also appears in the bottom-right corner (both, as designed).
2. Ask a read-only question: "Which jobs are active?" — confirm a sensible reply referencing real job data.
3. Ask a semantic-search question referencing something from the seeded/backfilled data: "Find any notes mentioning a fan belt." — confirm it returns something relevant (this proves the backfill from Task 4 actually indexed real content).
4. Ask it to draft a quote: "Draft a quote for Test Customer, Test Site, Inspection job type, with one line item: labour, qty 2, $100 each." — confirm it responds confirming creation, then check `/quotes` and find the new draft.
5. As a technician account, confirm the assistant is NOT visible anywhere (no bubble, and `/dashboard` isn't reachable at all — matches existing role gate).
6. As a sales_engineer, ask it to draft a variation ("Draft a variation for Jake on job X, $50, fan belt") — confirm it explains it can't do that for your role (proves the `draftVariation` role restriction works end-to-end, not just in unit tests).

- [ ] **Step 4: Verify via the database**

```bash
npx tsx --env-file .env.local -e '
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
const db = new PrismaClient({ adapter });
(async () => {
  const sessions = await db.chatSession.findMany({ orderBy: { createdAt: "desc" }, take: 3, include: { messages: true } });
  console.log("Recent chat sessions:", JSON.stringify(sessions, null, 2));
  const auditRows = await db.aiAuditLog.count({ where: { feature: "company_assistant" } });
  console.log("company_assistant AiAuditLog rows:", auditRows);
  const chunkCount = await db.documentChunk.count();
  console.log("DocumentChunk rows:", chunkCount);
  await db.$disconnect();
})();
'
```
Expected: a real `ChatSession` with real `ChatMessage` rows matching what you saw in the browser, at least one `AiAuditLog` row with `feature: "company_assistant"`, and a non-zero `DocumentChunk` count confirming the semantic index is populated.
