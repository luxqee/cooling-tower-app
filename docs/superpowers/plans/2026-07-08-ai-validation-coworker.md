# AI Validation Coworker (Phase 3 Batch g) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a hybrid rule+AI validation layer to the job creation form — deterministic duplicate-site detection runs first and is free; Claude Haiku 4.5 only runs when rules don't catch anything, flagging implausible values with a plain-language explanation.

**Architecture:** One new API route (`POST /api/ai/validate`) that a debounced client-side call hits on blur. The route runs a Prisma duplicate-lookup first (fast, zero cost); if that finds nothing, it calls Claude Haiku 4.5 with structured output (`output_config.format`, `json_schema`) so the response is always a typed array, never free text to parse. Every AI call is logged to `AiAuditLog` (userId, feature, token counts, cost) — this table and its cost-calculation helper are shared by batches h and i too, so getting them right here matters beyond this one feature.

**Tech Stack:** `@anthropic-ai/sdk` (official SDK, per this project's `claude-api` conventions), Claude Haiku 4.5 (`claude-haiku-4-5`), Zod 4 for both input validation and the structured-output schema, existing Prisma/`requireRole` patterns.

## Global Constraints

- Use the official `@anthropic-ai/sdk` — never raw `fetch` against the Anthropic API (this project has zero justification for raw HTTP; a supported SDK exists).
- Model: `claude-haiku-4-5` for this feature specifically — it's a fast, cheap, per-keystroke-adjacent check, not a case needing Opus/Sonnet-tier reasoning.
- Every route follows the existing `requireRole(...).catch(() => null)` → 401 pattern already used across the whole codebase (see `src/app/api/variations/route.ts` for the canonical example).
- TDD throughout: write the failing test, watch it fail, then implement. No exceptions for this plan.
- `AiAuditLog.costUsd` uses `Decimal(10, 6)` — Haiku costs can be a fraction of a cent per call; don't round to 2dp and lose the number entirely.

---

## Task 1: `AiAuditLog` schema (already complete)

**Status:** Done prior to this plan being written, during initial groundwork. Documented here for completeness — nothing to execute, verify only.

**Files:**
- Modified: `prisma/schema.prisma` — added `AiFeature` enum and `AiAuditLog` model, added `aiAuditLogs AiAuditLog[]` back-relation on `User`.
- Migration not yet generated (this project applies migrations via `prisma migrate diff` → hand-written `migration.sql` → `prisma db execute` → `prisma migrate resolve --applied`, not `prisma migrate dev`, because of a pre-existing checksum drift on an earlier migration — see Task 2 for the exact commands).

**Interfaces:**
- Produces: `db.aiAuditLog.create({ data: { userId, feature: "validation" | "voice_note" | "company_assistant", toolCalls?, promptTokens, outputTokens, costUsd, createdAt } })` — every later task in this plan (and in the batch h/i plans) writes through this.

- [x] **Step 1: Verify the schema compiles**

Run: `npx prisma generate`
Expected: `✔ Generated Prisma Client` with no errors.

---

## Task 2: Apply the `AiAuditLog` migration

**Files:**
- Create: `prisma/migrations/<timestamp>_add_ai_audit_log/migration.sql`

**Interfaces:**
- Consumes: the `AiAuditLog` model from Task 1.
- Produces: a live `AiAuditLog` table in the database that Task 6's route can insert into.

- [ ] **Step 1: Preview the SQL diff (read-only, confirms purely additive)**

Run: `npx prisma migrate diff --from-config-datasource prisma.config.ts --to-schema prisma/schema.prisma --script`
Expected: Only `CREATE TYPE "AiFeature"` and `CREATE TABLE "AiAuditLog"` statements — no `ALTER`/`DROP` on any existing table. If anything else appears, stop and investigate before continuing.

- [ ] **Step 2: Write the migration file**

Copy the exact SQL from Step 1's output into a new file at `prisma/migrations/<YYYYMMDDHHMMSS>_add_ai_audit_log/migration.sql` (generate the timestamp with `date -u +%Y%m%d%H%M%S`).

- [ ] **Step 3: Apply it directly**

Run: `npx prisma db execute --file prisma/migrations/<timestamp>_add_ai_audit_log/migration.sql`
Expected: `Script executed successfully.`

- [ ] **Step 4: Record it as applied**

Run: `npx prisma migrate resolve --applied <timestamp>_add_ai_audit_log`
Expected: `Migration <timestamp>_add_ai_audit_log marked as applied.`

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat: add AiAuditLog table (shared across AI batches g/h/i)"
```

---

## Task 3: Cost calculation utility

**Files:**
- Create: `src/lib/ai/cost.ts`
- Test: `src/lib/ai/__tests__/cost.test.ts`

**Interfaces:**
- Produces: `calculateCostUsd(model: string, promptTokens: number, outputTokens: number): number` — `model` is a lookup key into an internal pricing table (throws if unknown), not a union type, so the table can grow (batch h/i add their own models) without changing this signature. Used by Task 6's route and, later, by the batch h/i routes.

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/ai/__tests__/cost.test.ts
import { describe, it, expect } from "vitest";
import { calculateCostUsd } from "../cost";

describe("calculateCostUsd", () => {
  it("calculates Haiku 4.5 cost at $1/$5 per million tokens", () => {
    // 1000 prompt tokens = $0.001, 500 output tokens = $0.0025 -> $0.0035
    const cost = calculateCostUsd("claude-haiku-4-5", 1000, 500);
    expect(cost).toBeCloseTo(0.0035, 6);
  });

  it("calculates Sonnet 5 cost at $3/$15 per million tokens", () => {
    // 1000 prompt tokens = $0.003, 500 output tokens = $0.0075 -> $0.0105
    const cost = calculateCostUsd("claude-sonnet-5", 1000, 500);
    expect(cost).toBeCloseTo(0.0105, 6);
  });

  it("returns 0 for zero tokens", () => {
    expect(calculateCostUsd("claude-haiku-4-5", 0, 0)).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/ai/__tests__/cost.test.ts`
Expected: FAIL — `Cannot find module '../cost'`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/lib/ai/cost.ts
const PRICING_PER_MILLION_TOKENS: Record<string, { input: number; output: number }> = {
  "claude-haiku-4-5": { input: 1.0, output: 5.0 },
  "claude-sonnet-5": { input: 3.0, output: 15.0 },
};

export function calculateCostUsd(model: string, promptTokens: number, outputTokens: number): number {
  const pricing = PRICING_PER_MILLION_TOKENS[model];
  if (!pricing) throw new Error(`Unknown model for cost calculation: ${model}`);
  const inputCost = (promptTokens / 1_000_000) * pricing.input;
  const outputCost = (outputTokens / 1_000_000) * pricing.output;
  return inputCost + outputCost;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/ai/__tests__/cost.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/cost.ts src/lib/ai/__tests__/cost.test.ts
git commit -m "feat: add AI cost calculation utility"
```

---

## Task 4: Install the Anthropic SDK and add the client wrapper

**Files:**
- Modify: `package.json` (add `@anthropic-ai/sdk`)
- Create: `src/lib/ai/client.ts`

**Interfaces:**
- Produces: `getAnthropicClient(): Anthropic` — a singleton client instance, used by Task 6.

- [ ] **Step 1: Install the SDK**

Run: `npm install @anthropic-ai/sdk`
Expected: added to `package.json` dependencies.

- [ ] **Step 2: Write the client wrapper**

```typescript
// src/lib/ai/client.ts
import Anthropic from "@anthropic-ai/sdk";

let client: Anthropic | null = null;

export function getAnthropicClient(): Anthropic {
  if (!client) {
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return client;
}
```

This is a thin, declarative wrapper (construct-and-cache) with no branching logic worth a unit test — consistent with how this codebase treats trivial config/wrapper modules elsewhere (e.g. `src/lib/db/client.ts`'s Prisma singleton has no dedicated test either).

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json src/lib/ai/client.ts
git commit -m "feat: add Anthropic SDK client wrapper"
```

---

## Task 5: Validation input/output schemas

**Files:**
- Create: `src/lib/ai/validate-job.ts`
- Test: `src/lib/ai/__tests__/validate-job.test.ts`

**Interfaces:**
- Produces:
  - `validateJobInputSchema` (Zod) and `validateAiValidateInput(input: unknown)` — request body validation.
  - `aiFlagSchema` (Zod) — the shape Claude's structured output must match: `{ field: string, severity: "warning" | "info", message: string, suggestion: string | null }`.
  - `type AiFlag = z.infer<typeof aiFlagSchema>`

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/ai/__tests__/validate-job.test.ts
import { describe, it, expect } from "vitest";
import { validateAiValidateInput } from "../validate-job";

describe("validateAiValidateInput", () => {
  const valid = {
    customerName: "Rio Tinto",
    siteName: "Weipa Plant",
    siteAddress: "1 Bauxite Rd, Weipa QLD",
    jobType: "Annual Service",
    quotedHours: 32,
    quotedCost: 7000,
  };

  it("accepts a complete valid job form payload", () => {
    const result = validateAiValidateInput(valid);
    expect(result.success).toBe(true);
  });

  it("accepts quotedCost as optional (undefined)", () => {
    const { quotedCost, ...rest } = valid;
    const result = validateAiValidateInput(rest);
    expect(result.success).toBe(true);
  });

  it("rejects a payload missing siteName", () => {
    const { siteName, ...rest } = valid;
    const result = validateAiValidateInput(rest);
    expect(result.success).toBe(false);
  });

  it("rejects a negative quotedHours", () => {
    const result = validateAiValidateInput({ ...valid, quotedHours: -5 });
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/ai/__tests__/validate-job.test.ts`
Expected: FAIL — `Cannot find module '../validate-job'`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/lib/ai/validate-job.ts
import { z } from "zod";

export const validateJobInputSchema = z.object({
  customerName: z.string().min(1),
  siteName: z.string().min(1),
  siteAddress: z.string().min(1),
  jobType: z.string().min(1),
  quotedHours: z.number().positive(),
  quotedCost: z.number().nonnegative().optional(),
});

export type ValidateJobInput = z.infer<typeof validateJobInputSchema>;

export function validateAiValidateInput(input: unknown) {
  return validateJobInputSchema.safeParse(input);
}

export const aiFlagSchema = z.object({
  field: z.string(),
  severity: z.enum(["warning", "info"]),
  message: z.string(),
  suggestion: z.string().nullable(),
});

export type AiFlag = z.infer<typeof aiFlagSchema>;

export const aiFlagsResponseSchema = z.object({
  flags: z.array(aiFlagSchema),
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/ai/__tests__/validate-job.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/validate-job.ts src/lib/ai/__tests__/validate-job.test.ts
git commit -m "feat: add job validation input/output schemas"
```

---

## Task 6: `POST /api/ai/validate` route

**Files:**
- Create: `src/app/api/ai/validate/route.ts`
- Test: `src/app/api/ai/validate/__tests__/validate.test.ts`

**Interfaces:**
- Consumes: `validateAiValidateInput` and `aiFlagsResponseSchema` from Task 5, `getAnthropicClient` from Task 4, `calculateCostUsd` from Task 3.
- Produces: `POST /api/ai/validate` — request body matches `ValidateJobInput`; response body is `{ flags: AiFlag[] }`.

Behavior, in order:
1. `requireRole([...])` — any authenticated staff role (`admin`, `director`, `service_manager`) may call this; it's a form-entry aid, not privileged data.
2. Validate input with `validateAiValidateInput`; 400 on failure.
3. **Rule layer**: query `db.job.findFirst` for an existing job with the same `siteName` (case-insensitive) and a different `customerName` — a same-site-different-customer combo is the cheap, deterministic "this looks like a duplicate or a typo" signal. If found, return `{ flags: [{ field: "siteName", severity: "warning", message: "A job at this site already exists under a different customer name...", suggestion: null }] }` immediately — **do not call Claude**.
4. **AI layer**: otherwise, call Claude Haiku 4.5 with `output_config.format` set to a `json_schema` matching `aiFlagsResponseSchema`, asking it to flag implausible values (e.g. quoted hours wildly inconsistent with job type). Log the call to `AiAuditLog` (`feature: "validation"`). Return the parsed flags (empty array if Claude finds nothing).
5. If the Claude call throws (network error, rate limit, etc.), catch it, log nothing (no real API usage occurred), and return `{ flags: [] }` — a validation aid that goes briefly offline must never block someone from saving a job.

- [ ] **Step 1: Write the failing tests**

```typescript
// src/app/api/ai/validate/__tests__/validate.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/clerk", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/db/client", () => ({
  db: {
    job: { findFirst: vi.fn() },
    aiAuditLog: { create: vi.fn() },
  },
}));
vi.mock("@/lib/ai/client", () => ({
  getAnthropicClient: vi.fn(),
}));

import { requireRole } from "@/lib/auth/clerk";
import { db } from "@/lib/db/client";
import { getAnthropicClient } from "@/lib/ai/client";
import { POST } from "../route";

const mockDirector = { id: "u1", role: "director" as const, name: "Dana", clerkId: "c1", email: "d@t.com", isActive: true };

const validBody = {
  customerName: "Rio Tinto",
  siteName: "Weipa Plant",
  siteAddress: "1 Bauxite Rd, Weipa QLD",
  jobType: "Annual Service",
  quotedHours: 32,
  quotedCost: 7000,
};

function makeReq(body: unknown) {
  return new Request("http://localhost/api/ai/validate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => vi.clearAllMocks());

describe("POST /api/ai/validate", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireRole).mockRejectedValue(new Error("Unauthorized"));
    const res = await POST(makeReq(validBody));
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid input", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockDirector as any);
    const res = await POST(makeReq({ siteName: "x" }));
    expect(res.status).toBe(400);
  });

  it("returns a rule-layer duplicate flag WITHOUT calling Claude", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockDirector as any);
    vi.mocked(db.job.findFirst).mockResolvedValue({ id: "existing-job" } as any);
    const res = await POST(makeReq(validBody));
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.flags).toHaveLength(1);
    expect(data.flags[0].field).toBe("siteName");
    expect(getAnthropicClient).not.toHaveBeenCalled();
  });

  it("calls Claude and returns its flags when no duplicate is found", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockDirector as any);
    vi.mocked(db.job.findFirst).mockResolvedValue(null);
    const mockCreate = vi.fn().mockResolvedValue({
      content: [{ type: "text", text: JSON.stringify({ flags: [{ field: "quotedHours", severity: "info", message: "32 hours is high for a routine inspection", suggestion: "Confirm scope with the customer" }] }) }],
      usage: { input_tokens: 200, output_tokens: 50 },
    });
    vi.mocked(getAnthropicClient).mockReturnValue({ messages: { create: mockCreate } } as any);
    vi.mocked(db.aiAuditLog.create).mockResolvedValue({} as any);

    const res = await POST(makeReq(validBody));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.flags).toHaveLength(1);
    expect(data.flags[0].field).toBe("quotedHours");
    expect(db.aiAuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: mockDirector.id, feature: "validation", promptTokens: 200, outputTokens: 50 }),
      })
    );
  });

  it("returns an empty flags array (not an error) when the Claude call throws", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockDirector as any);
    vi.mocked(db.job.findFirst).mockResolvedValue(null);
    const mockCreate = vi.fn().mockRejectedValue(new Error("network error"));
    vi.mocked(getAnthropicClient).mockReturnValue({ messages: { create: mockCreate } } as any);

    const res = await POST(makeReq(validBody));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.flags).toEqual([]);
    expect(db.aiAuditLog.create).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/app/api/ai/validate/__tests__/validate.test.ts`
Expected: FAIL — `Cannot find module '../route'`.

- [ ] **Step 3: Write the implementation**

```typescript
// src/app/api/ai/validate/route.ts
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/clerk";
import { db } from "@/lib/db/client";
import { getAnthropicClient } from "@/lib/ai/client";
import { calculateCostUsd } from "@/lib/ai/cost";
import { validateAiValidateInput, aiFlagsResponseSchema, type AiFlag } from "@/lib/ai/validate-job";

const MODEL = "claude-haiku-4-5";

export async function POST(req: Request) {
  const user = await requireRole(["admin", "director", "service_manager"]).catch(() => null);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = validateAiValidateInput(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  }
  const input = parsed.data;

  // Rule layer — free, instant, runs first.
  const duplicate = await db.job.findFirst({
    where: {
      siteName: { equals: input.siteName, mode: "insensitive" },
      customerName: { not: { equals: input.customerName, mode: "insensitive" } },
    },
  });
  if (duplicate) {
    const flags: AiFlag[] = [{
      field: "siteName",
      severity: "warning",
      message: `A job at "${input.siteName}" already exists under a different customer name. Check this isn't a duplicate or a typo.`,
      suggestion: null,
    }];
    return NextResponse.json({ flags });
  }

  // AI layer — only reached when the rule layer finds nothing.
  try {
    const client = getAnthropicClient();
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: "You review cooling-tower maintenance job forms for implausible values before they're saved. Flag only genuinely unusual values — do not flag normal variation. Respond with JSON matching the schema exactly.",
      messages: [{
        role: "user",
        content: `Review this job form for implausible values:\n${JSON.stringify(input, null, 2)}`,
      }],
      output_config: {
        format: {
          type: "json_schema",
          schema: {
            type: "object",
            properties: {
              flags: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    field: { type: "string" },
                    severity: { type: "string", enum: ["warning", "info"] },
                    message: { type: "string" },
                    suggestion: { type: ["string", "null"] },
                  },
                  required: ["field", "severity", "message", "suggestion"],
                  additionalProperties: false,
                },
              },
            },
            required: ["flags"],
            additionalProperties: false,
          },
        },
      },
    });

    const textBlock = response.content.find((b) => b.type === "text");
    const rawJson = textBlock && "text" in textBlock ? textBlock.text : "{}";
    const resultParsed = aiFlagsResponseSchema.safeParse(JSON.parse(rawJson));
    const flags = resultParsed.success ? resultParsed.data.flags : [];

    const costUsd = calculateCostUsd(MODEL, response.usage.input_tokens, response.usage.output_tokens);
    await db.aiAuditLog.create({
      data: {
        userId: user.id,
        feature: "validation",
        promptTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        costUsd,
      },
    });

    return NextResponse.json({ flags });
  } catch {
    // A validation aid going briefly offline must never block saving a job.
    return NextResponse.json({ flags: [] });
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/app/api/ai/validate/__tests__/validate.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Run the full suite to confirm nothing else broke**

Run: `npx vitest run && npx tsc --noEmit`
Expected: all tests pass, clean typecheck.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/ai/validate/
git commit -m "feat: add POST /api/ai/validate (hybrid rule+AI job validation)"
```

---

## Task 7: Wire into NewJobForm

**Files:**
- Modify: `src/app/jobs/NewJobForm.tsx`

**Interfaces:**
- Consumes: `POST /api/ai/validate` from Task 6.

Add a debounced check that fires ~800ms after the user stops typing in `siteAddress` (the last field filled before submit in the current form order), calling the new endpoint with the current field values and rendering any returned flags as inline amber notices — informational only, never blocking submission.

- [ ] **Step 1: Add flag state and the debounced effect**

In `src/app/jobs/NewJobForm.tsx`, add after the existing `fields` state declaration (after line 32):

```typescript
  const [aiFlags, setAiFlags] = useState<{ field: string; severity: string; message: string; suggestion: string | null }[]>([]);

  // AI validation check — debounced, fires after the user pauses typing.
  useEffect(() => {
    const hasMinimumFields = fields.siteName.length >= 2 && fields.siteAddress.length >= 5 && fields.quotedHours;
    const customerName = customerId ? customerQuery : customerQuery.trim();
    if (!hasMinimumFields || customerName.length < 2) {
      setAiFlags([]);
      return;
    }
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      fetch("/api/ai/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: ctrl.signal,
        body: JSON.stringify({
          customerName,
          siteName: fields.siteName,
          siteAddress: fields.siteAddress,
          jobType: fields.jobType,
          quotedHours: parseFloat(fields.quotedHours) || 0,
          quotedCost: fields.quotedCost ? parseFloat(fields.quotedCost) : undefined,
        }),
      })
        .then((r) => (r.ok ? r.json() : { flags: [] }))
        .then((d) => setAiFlags(d.flags ?? []))
        .catch(() => {});
    }, 800);
    return () => { clearTimeout(timer); ctrl.abort(); };
  }, [fields.siteName, fields.siteAddress, fields.jobType, fields.quotedHours, fields.quotedCost, customerId, customerQuery]);
```

- [ ] **Step 2: Render the flags**

Find the closing of the form fields block, right before the submit error line (`{errors.submit && ...}` around line 274), and add:

```tsx
      {aiFlags.map((flag, i) => (
        <div key={i} className="rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 px-3 py-2 space-y-0.5">
          <p className="text-sm text-amber-800 dark:text-amber-300">{flag.message}</p>
          {flag.suggestion && <p className="text-xs text-amber-600 dark:text-amber-400">{flag.suggestion}</p>}
        </div>
      ))}
```

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Run the full test suite**

Run: `npx vitest run`
Expected: all tests still pass (this task has no new automated tests — UI components in this codebase are verified manually/live, not unit tested, per established convention. See Task 8.)

- [ ] **Step 5: Commit**

```bash
git add src/app/jobs/NewJobForm.tsx
git commit -m "feat: wire AI validation into NewJobForm"
```

---

## Task 8: Live verification

**Files:** none — this task runs the feature against the real Claude API to confirm the end-to-end wiring actually works, not just the mocked test suite.

- [ ] **Step 1: Start the dev server**

Run: `npx next dev` (background)

- [ ] **Step 2: Call the route directly with curl, bypassing the UI, to isolate route logic from browser auth**

This requires a valid Clerk session cookie, which curl can't produce — instead, verify via a standalone script that exercises the same code path with a real Anthropic call:

```typescript
// scratch-verify.ts (delete after running)
import { getAnthropicClient } from "./src/lib/ai/client";
import { calculateCostUsd } from "./src/lib/ai/cost";

async function main() {
  const client = getAnthropicClient();
  const response = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 1024,
    system: "You review cooling-tower maintenance job forms for implausible values before they're saved. Flag only genuinely unusual values.",
    messages: [{ role: "user", content: 'Review this job form for implausible values:\n{"customerName":"Rio Tinto","siteName":"Weipa Plant","siteAddress":"1 Bauxite Rd","jobType":"Annual Service","quotedHours":400,"quotedCost":50}' }],
    output_config: {
      format: {
        type: "json_schema",
        schema: {
          type: "object",
          properties: { flags: { type: "array", items: { type: "object", properties: { field: { type: "string" }, severity: { type: "string", enum: ["warning", "info"] }, message: { type: "string" }, suggestion: { type: ["string", "null"] } }, required: ["field", "severity", "message", "suggestion"], additionalProperties: false } } },
          required: ["flags"], additionalProperties: false,
        },
      },
    },
  });
  console.log(JSON.stringify(response.content, null, 2));
  console.log("Cost:", calculateCostUsd("claude-haiku-4-5", response.usage.input_tokens, response.usage.output_tokens));
}
main();
```

Run: `npx tsx --env-file .env.local scratch-verify.ts`
Expected: real Claude output flagging that 400 hours is implausible for an annual service costing $50, and a cost printed around $0.001-0.003. Delete `scratch-verify.ts` after confirming.

- [ ] **Step 3: Verify in the browser**

Log in, go to `/jobs`, click "New job", fill in a real customer name, a site name that already exists under a different customer (e.g. reuse "Weipa Processing Plant" with a different customer name) — confirm the rule-layer warning appears instantly with no network delay. Then fill in a fresh site with an oddly large `quotedHours` (e.g. 400) — confirm an AI-generated flag appears within a couple seconds.

- [ ] **Step 4: Check the audit log has a real row**

Run a quick count check the same way used earlier this session:

```typescript
// check-audit.ts (delete after running)
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
const db = new PrismaClient({ adapter });
db.aiAuditLog.findMany({ orderBy: { createdAt: "desc" }, take: 3 })
  .then((rows) => console.log(JSON.stringify(rows, null, 2)))
  .finally(() => db.$disconnect());
```

Run: `npx tsx --env-file .env.local check-audit.ts`
Expected: at least one row with `feature: "validation"`, real token counts, and a nonzero `costUsd`. Delete `check-audit.ts` after confirming.

- [ ] **Step 5: Stop the dev server**

---

## Not in scope for this plan (explicitly deferred)

- Consolidating `CustomerForm`/`VariationForm`'s existing ad hoc validation into shared Zod modules — the roadmap doc mentions this as a nice-to-have; this plan only builds the new AI-assisted duplicate/implausibility checks on the job form, since that's what "AI Validation Coworker" actually requires.
- A full-form "review before submit" pass using Sonnet 5 — the roadmap describes this as a second tier; this plan ships the cheaper per-field Haiku check first. Add as a fast-follow once this is proven in real use.
- Predictive compliance reminders and statistical anomaly detection (bundled with this batch in the roadmap's build sequence) — separate concerns with their own data requirements (a real cadence/threshold to compare against), not needed to prove the validation-coworker pattern works.
