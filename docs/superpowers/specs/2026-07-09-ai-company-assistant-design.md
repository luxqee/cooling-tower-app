# AI Company Assistant Design (Phase 3 Batch i)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:writing-plans to turn this spec into a task-by-task implementation plan, then superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to build it.

**Goal:** A chat assistant for office/management staff that answers questions against the app's own data ("which jobs are overdue", "find missing SWMS", "which technicians worked at Site X"), searches free-text field notes semantically ("find mentions of corrosion"), and can draft a Variation or Quote on request — landing in the exact same pending/draft states a human creating one manually would produce, reviewed through the existing pages, not a new approval UI.

**Architecture:** A single chat endpoint backed by Claude Sonnet 5 with tool-calling, where every tool is a typed wrapper around an existing Prisma query or existing creation route's logic — never free-form SQL generation. Conversations persist (`ChatSession`/`ChatMessage`) so the chat bubble keeps context as a user navigates between pages. Semantic search runs against a new `DocumentChunk` table (`pgvector` on Neon) populated by embedding new voice note transcripts and job communications via Voyage AI as they're created, plus a one-time backfill script for existing data. Every tool call — read or draft — is logged to the existing `AiAuditLog` table (`feature: "company_assistant"`), the same audit convention every other AI feature in this app already uses.

**Tech Stack:** Next.js 14 App Router, Prisma 7 + Neon (`pgvector` extension), `@anthropic-ai/sdk` (Claude Sonnet 5, tool/function calling), Voyage AI (embeddings — no Claude embeddings endpoint exists), Zod 4, Vitest.

---

## Global Constraints

- Access: `director`, `service_manager`, `admin`, `sales_engineer` only. Technicians do not get assistant access (their AI touchpoint remains Voice Notes).
- The assistant is presented two ways: (1) prominently on `/dashboard` (already role-gated to the same set of roles this feature targets — a clean match), and (2) a persistent chat bubble/panel available on every other page those roles can see. Built responsively — same functionality on a phone browser as desktop, not desktop-only.
- **Never free-form SQL generation.** Every read tool wraps a specific, typed Prisma query. The model chooses which tool to call and with what typed arguments — it never constructs or receives raw SQL.
- **Draft actions mostly reuse existing role gates, with one deliberate, explicit exception:**
  - `draftQuote` requires the calling user to be `admin`, `director`, or `sales_engineer` — matches `POST /api/quotes`'s existing `requireRole(["admin", "director", "sales_engineer"])` exactly, no change.
  - `draftVariation` is a deliberate widening: since only office/management roles get assistant access at all, and only technicians can create Variations today, a same-role-only version of this tool would be permanently unreachable. Instead, `director`, `service_manager`, and `admin` can invoke `draftVariation` **on a named technician's behalf** — the tool requires `technicianName`, resolves it to a real technician `User`, and sets `Variation.technicianId` to that person, not to the calling office user. This is a real, intentional permission expansion beyond what the manual `/variations/submit` form allows today (a director could not previously submit a variation for a technician), scoped narrowly to this one AI tool.
  - Both created records land in their existing "not final" state — `Variation.status: "pending"`, `Quote.status: "draft"` — and are reviewed through the existing Variations/Quotes pages. No new approval UI.
- Every tool call (read or draft) writes an `AiAuditLog` row: `feature: "company_assistant"`, token counts, cost, plus a `toolCalls` JSON field recording which tool(s) ran and with what arguments — this table already has a `toolCalls Json?` column reserved for exactly this from Module 3g, unused until now.
- The tool-calling loop is bounded (a fixed max round count) to prevent runaway cost from a pathological conversation.
- A Claude API failure returns a graceful "having trouble right now" message in the chat, never a raw 500 to the user.
- Semantic search covers voice note transcripts and job communications only for v1 — not compliance documents (structured form data, not natural free text; a future extension, not in scope here).

---

## Data Model

```
ChatSession
- id
- userId
- title       String?   (first user message, truncated, for a session picker if we add one later)
- createdAt
- updatedAt

ChatMessage
- id
- sessionId
- role        "user" | "assistant"
- content     Text
- toolCalls   Json?     (which tools ran on this turn, for transparency/debugging)
- createdAt

DocumentChunk
- id
- sourceType  "VoiceNote" | "JobCommunication"
- sourceId
- jobId                  (denormalized for fast "search within this job" filtering)
- chunkText   Text
- embedding   Unsupported("vector(1024)")   -- pgvector; exact dimension confirmed against Voyage's actual API before implementation, not assumed
- createdAt
```

`ChatSession`/`ChatMessage` back-relate to `User`. `DocumentChunk` has no FK to `VoiceNote`/`JobCommunication` (polymorphic `sourceType`/`sourceId` pair, matching how this app already references sources elsewhere) but does FK to `Job` for the denormalized `jobId`.

---

## Chat Flow

1. Client sends `{ sessionId?: string, message: string }` to `POST /api/assistant/chat`.
2. Route loads the existing `ChatSession` (or creates one if `sessionId` is omitted), appends the user's message, and loads recent conversation history to send as context.
3. Calls Claude Sonnet 5 with the conversation history and the full tool schema (all six tools listed below, each described so the model knows when to call it).
4. If Claude requests a tool call: the route executes the corresponding typed function server-side (enforcing that tool's own role check — see Global Constraints), feeds the result back into the same conversation, and calls Claude again. Repeats up to the bounded round limit.
5. Once Claude returns a final text response (no more tool calls), the route saves the assistant's `ChatMessage` (with a `toolCalls` record of everything that ran this turn), writes one `AiAuditLog` row for the whole turn (aggregate token/cost across all rounds), and returns the response plus any created record IDs (so the UI can show "Created variation — view it" style confirmations).

## Tools (v1 set)

**Read-only:**
- `findJobs(status?, siteName?, customerName?, overdueOnly?)` — wraps `db.job.findMany`, same filtering logic already used by `/jobs`.
- `findComplianceDocuments(jobId?, missingTemplateType?)` — supports "which jobs are missing a SWMS" by comparing submitted documents against active templates for a job.
- `findAssignments(technicianName?, siteId?, dateRange?)` — "who worked at Site X".
- `semanticSearch(query, jobId?)` — embeds `query` via Voyage, pgvector cosine-similarity lookup against `DocumentChunk`, optionally scoped to one job.

**Draft-generation:**
- `draftVariation(jobId, technicianName, description, costEstimate)` — creates a real `Variation`, `status: "pending"`. `technicianName` is resolved to a real `User` with role `technician` (case-insensitive match on name); if no match is found, the tool returns an error the assistant relays conversationally ("I couldn't find a technician named X — did you mean Jake Morrison?") rather than creating a malformed record. `Variation.technicianId` is set to the resolved technician, not the calling office user (see Global Constraints for why this tool's role model deliberately differs from the manual form).
- `draftQuote(customerName, siteName, jobType, lineItems)` — creates a real `Quote`, `status: "draft"`, `createdById` = the calling user.

## Indexing Pipeline

- Going forward: the existing "send" route (voice notes) and the existing job-communication creation route each get one additional step — embed the new text via Voyage, insert a `DocumentChunk` row. This keeps search current with zero separate sync job.
- Backfill: a one-time script embeds every existing `VoiceNote.transcript` (where `status: "transcribed"`) and every existing `JobCommunication.body`, run manually once after this ships — not a recurring job.

## Testing

- Every tool function is a plain, testable unit — mock the Prisma client, assert the query shape and the role check, same pattern as every other route in this codebase.
- The chat route's tool-calling loop is tested by mocking the Anthropic client's tool-call responses across multiple rounds, verifying the bounded-loop cutoff, the graceful-failure path, and that `AiAuditLog` is written once per turn (not once per tool call).
- Client chat UI (bubble, panel, dashboard placement) is not unit tested — matches this codebase's established convention for interactive client components (verified live).
