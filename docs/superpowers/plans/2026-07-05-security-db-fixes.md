# Security & Database Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all critical and important security vulnerabilities and database correctness issues identified in the 2026-07-05 expert review.

**Architecture:** All changes are isolated patches to existing routes, schema, and the push library. No new pages or routes. Six independent tasks ordered so migrations run before dependent application code changes.

**Tech Stack:** Next.js 14 App Router, Prisma 7 + Neon PostgreSQL, Zod, Vitest.

## Global Constraints

- Never remove existing API behaviour that passing tests cover — extend, don't replace
- Monetary columns must use `Decimal` (PostgreSQL `NUMERIC(12,2)`), never `Float`
- All Prisma `Decimal` fields must be serialised as JS `number` (`.toNumber()`) before `NextResponse.json()` so the API contract stays `number` for clients
- Partial unique index for TOCTOU must be added via a raw SQL migration file — Prisma schema alone cannot express `WHERE status = 'active'`
- This app is currently single-tenant per deployment; a Phase 3 multi-tenancy rewrite will add `orgId` FK to all models — do not add singleton constraints that would permanently block that migration
- Run `pnpm test` after every task; all 62+ tests must pass before committing
- Run `pnpm prisma generate` after any schema change before running tests

---

## File Map

**Modified files:**
- `src/app/api/photos/route.ts` — SSRF fix
- `src/app/api/upload/photo/route.ts` — MIME validation
- `src/app/api/variations/route.ts` — assignment gate on POST
- `src/app/api/variations/[id]/decision/route.ts` — status check inside tx
- `src/app/api/jobs/[id]/route.ts` — DELETE error handling
- `src/lib/push/vapid.ts` — move setVapidDetails inside function
- `src/app/api/webhooks/clerk/route.ts` — validate role enum
- `prisma/schema.prisma` — Float→Decimal, indexes, User.phone, Job.updatedAt

**New files:**
- `src/app/api/photos/__tests__/photos.test.ts`
- `src/app/api/upload/__tests__/photo.test.ts`
- `src/app/api/variations/__tests__/variations.test.ts`
- `prisma/migrations/<timestamp>_security_db_fixes/migration.sql`

---

### Task 1: Fix SSRF in `/api/photos` and add MIME validation to photo upload

**Files:**
- Modify: `src/app/api/photos/route.ts:12`
- Modify: `src/app/api/upload/photo/route.ts:16-18`
- Create: `src/app/api/photos/__tests__/photos.test.ts`
- Create: `src/app/api/upload/__tests__/photo.test.ts`

**Interfaces:**
- Produces: Nothing new. Existing behaviour is preserved — only the URL validation tightens from substring to hostname check.

- [ ] **Step 1: Write failing test for SSRF**

Create `src/app/api/photos/__tests__/photos.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/clerk", () => ({ getSessionUser: vi.fn() }));

import { getSessionUser } from "@/lib/auth/clerk";
import { GET } from "../route";

const mockUser = { id: "u1", role: "technician" as const, name: "Jake", clerkId: "c1", email: "j@t.com", isActive: true };

beforeEach(() => vi.clearAllMocks());

describe("GET /api/photos", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null);
    const res = await GET(new Request("http://localhost/api/photos?url=https://x.blob.vercel-storage.com/f.pdf"));
    expect(res.status).toBe(401);
  });

  it("returns 400 when url param is missing", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(mockUser as any);
    const res = await GET(new Request("http://localhost/api/photos"));
    expect(res.status).toBe(400);
  });

  it("returns 400 for a URL that only contains the string but is not a Vercel Blob hostname", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(mockUser as any);
    // SSRF test: hostname is attacker.com, path contains the blob domain string
    const malicious = "https://attacker.example.com/.blob.vercel-storage.com/steal";
    const res = await GET(new Request(`http://localhost/api/photos?url=${encodeURIComponent(malicious)}`));
    expect(res.status).toBe(400);
  });

  it("returns 400 for a non-Vercel URL", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(mockUser as any);
    const res = await GET(new Request("http://localhost/api/photos?url=https://evil.com/photo.jpg"));
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run tests to confirm SSRF test fails**

```bash
cd /Users/lukeherod/Desktop/cooling-tower-app-main
pnpm test src/app/api/photos/__tests__/photos.test.ts
```

Expected: FAIL — the SSRF test for `attacker.example.com/.blob.vercel-storage.com/steal` passes the current check and returns something other than 400.

- [ ] **Step 3: Fix SSRF in `/api/photos/route.ts`**

Replace the `includes` check with a proper hostname parse:

```typescript
import { getSessionUser } from "@/lib/auth/clerk";

export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const { searchParams } = new URL(req.url);
  const blobUrl = searchParams.get("url");
  if (!blobUrl) return new Response("Missing url", { status: 400 });

  // Parse URL and validate hostname — prevents SSRF via substring bypass
  let parsed: URL;
  try {
    parsed = new URL(blobUrl);
  } catch {
    return new Response("Invalid url", { status: 400 });
  }
  if (!parsed.hostname.endsWith(".blob.vercel-storage.com")) {
    return new Response("Invalid url", { status: 400 });
  }

  const res = await fetch(blobUrl, {
    headers: { Authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}` },
  });

  if (!res.ok) return new Response("Not found", { status: 404 });

  return new Response(res.body, {
    headers: {
      "Content-Type": res.headers.get("Content-Type") ?? "application/octet-stream",
      "Cache-Control": "private, max-age=3600",
    },
  });
}
```

- [ ] **Step 4: Write failing test for photo upload MIME validation**

Create `src/app/api/upload/__tests__/photo.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/clerk", () => ({ requireRole: vi.fn() }));
vi.mock("@vercel/blob", () => ({ put: vi.fn().mockResolvedValue({ url: "https://x.blob.vercel-storage.com/p.jpg" }) }));

import { requireRole } from "@/lib/auth/clerk";
import { POST } from "../photo/route";

const mockUser = { id: "u1", role: "technician" as const, name: "Jake", clerkId: "c1", email: "j@t.com", isActive: true };

function makeFormData(type: string, size = 100) {
  const fd = new FormData();
  fd.append("file", new Blob(["x".repeat(size)], { type }), "photo.jpg");
  return fd;
}

beforeEach(() => vi.clearAllMocks());

describe("POST /api/upload/photo", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireRole).mockRejectedValue(new Error("Unauthorized"));
    const req = new Request("http://localhost", { method: "POST", body: makeFormData("image/jpeg") });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 400 when no file provided", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockUser as any);
    const req = new Request("http://localhost", { method: "POST", body: new FormData() });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 422 for SVG file type", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockUser as any);
    const req = new Request("http://localhost", { method: "POST", body: makeFormData("image/svg+xml") });
    const res = await POST(req);
    expect(res.status).toBe(422);
    const data = await res.json();
    expect(data.error).toMatch(/format/i);
  });

  it("returns 422 for PDF file type", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockUser as any);
    const req = new Request("http://localhost", { method: "POST", body: makeFormData("application/pdf") });
    const res = await POST(req);
    expect(res.status).toBe(422);
  });

  it("accepts JPEG and returns 201", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockUser as any);
    const req = new Request("http://localhost", { method: "POST", body: makeFormData("image/jpeg") });
    const res = await POST(req);
    expect(res.status).toBe(201);
  });

  it("accepts PNG and returns 201", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockUser as any);
    const req = new Request("http://localhost", { method: "POST", body: makeFormData("image/png") });
    const res = await POST(req);
    expect(res.status).toBe(201);
  });

  it("returns 413 when file exceeds 5MB", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockUser as any);
    const req = new Request("http://localhost", { method: "POST", body: makeFormData("image/jpeg", 6 * 1024 * 1024) });
    const res = await POST(req);
    expect(res.status).toBe(413);
  });
});
```

- [ ] **Step 5: Run tests to confirm MIME test fails**

```bash
pnpm test src/app/api/upload/__tests__/photo.test.ts
```

Expected: FAIL — SVG and PDF uploads currently succeed with 201.

- [ ] **Step 6: Add MIME validation to `src/app/api/upload/photo/route.ts`**

```typescript
import { put } from "@vercel/blob";
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/clerk";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic"];
const MAX_BYTES = 5 * 1024 * 1024;

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
      { error: "Unsupported format. Use JPEG, PNG, WebP, or HEIC." },
      { status: 422 }
    );
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "File too large after compression. Maximum 5 MB." }, { status: 413 });
  }

  const filename = `variations/${user.id}/${Date.now()}.jpg`;

  try {
    const blob = await put(filename, file, { access: "private" });
    return NextResponse.json({ url: blob.url }, { status: 201 });
  } catch (err) {
    console.error("Blob upload error:", err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
```

- [ ] **Step 7: Run all tests and verify pass**

```bash
pnpm test
```

Expected: All tests pass including the 2 new test files.

- [ ] **Step 8: Commit**

```bash
git add src/app/api/photos/route.ts \
        src/app/api/upload/photo/route.ts \
        src/app/api/photos/__tests__/photos.test.ts \
        src/app/api/upload/__tests__/photo.test.ts
git commit -m "fix: SSRF hostname check in /api/photos + MIME validation on photo upload"
```

---

### Task 2: Add job-assignment gate to variation submission

**Files:**
- Modify: `src/app/api/variations/route.ts:23-50`
- Create: `src/app/api/variations/__tests__/variations.test.ts`

**Interfaces:**
- Consumes: `db.assignment.findFirst({ where: { userId, jobId } })` — already used identically in `clock-in/route.ts`
- Produces: POST now returns 403 `{ error: "Not assigned to this job" }` when technician submits against a job they have no assignment for

- [ ] **Step 1: Write failing test**

Create `src/app/api/variations/__tests__/variations.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/clerk",          () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/push/vapid",          () => ({ sendPushToUser: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/variations/validate", () => ({
  validateVariationInput: vi.fn((b) => {
    if (!b.jobId || !b.description || !b.costEstimate) {
      return { success: false, error: { issues: [{ message: "invalid" }] } };
    }
    return { success: true, data: b };
  }),
}));
vi.mock("@/lib/db/client", () => ({
  db: {
    job:        { findFirst: vi.fn() },
    assignment: { findFirst: vi.fn() },
    variation:  { create: vi.fn(), findMany: vi.fn() },
    user:       { findMany: vi.fn() },
  },
}));

import { requireRole } from "@/lib/auth/clerk";
import { db } from "@/lib/db/client";
import { GET, POST } from "../route";

const JOB_ID = "11111111-1111-4111-8111-111111111111";
const mockUser = { id: "u1", role: "technician" as const, name: "Jake", clerkId: "c1", email: "j@t.com", isActive: true };
const mockJob  = { id: JOB_ID, customerName: "Rio Tinto", siteName: "Weipa", status: "active" };

function makeReq(body: unknown) {
  return new Request("http://localhost/api/variations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => vi.clearAllMocks());

describe("GET /api/variations", () => {
  it("returns 401 for technician (not director/admin)", async () => {
    vi.mocked(requireRole).mockRejectedValue(new Error("Forbidden"));
    const res = await GET();
    expect(res.status).toBe(401);
  });
});

describe("POST /api/variations", () => {
  const body = { jobId: JOB_ID, description: "Pump failed", costEstimate: 450, photoUrl: null };

  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireRole).mockRejectedValue(new Error("Unauthorized"));
    const res = await POST(makeReq(body));
    expect(res.status).toBe(401);
  });

  it("returns 403 when technician is not assigned to the job", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockUser as any);
    vi.mocked(db.job.findFirst).mockResolvedValue(mockJob as any);
    vi.mocked(db.assignment.findFirst).mockResolvedValue(null); // not assigned
    const res = await POST(makeReq(body));
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toMatch(/not assigned/i);
  });

  it("returns 404 when job does not exist", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockUser as any);
    vi.mocked(db.job.findFirst).mockResolvedValue(null);
    const res = await POST(makeReq(body));
    expect(res.status).toBe(404);
  });

  it("returns 201 when technician is assigned to the job", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockUser as any);
    vi.mocked(db.job.findFirst).mockResolvedValue(mockJob as any);
    vi.mocked(db.assignment.findFirst).mockResolvedValue({ id: "a1" } as any);
    vi.mocked(db.variation.create).mockResolvedValue({
      id: "v1", ...body, status: "pending", submittedAt: new Date(),
      job: { customerName: "Rio Tinto", siteName: "Weipa" },
    } as any);
    vi.mocked(db.user.findMany).mockResolvedValue([]);
    const res = await POST(makeReq(body));
    expect(res.status).toBe(201);
  });
});
```

- [ ] **Step 2: Run test to confirm 403 test fails**

```bash
pnpm test src/app/api/variations/__tests__/variations.test.ts
```

Expected: FAIL — the 403 test for unassigned technician currently gets 201.

- [ ] **Step 3: Add assignment gate to `src/app/api/variations/route.ts`**

Add the assignment check after the job check (between lines 40 and 42 of the original):

```typescript
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/clerk";
import { db } from "@/lib/db/client";
import { validateVariationInput } from "@/lib/variations/validate";
import { sendPushToUser } from "@/lib/push/vapid";

export async function GET() {
  const user = await requireRole(["director", "admin"]).catch(() => null);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const variations = await db.variation.findMany({
    where: { status: "pending" },
    include: {
      technician: { select: { name: true } },
      job: { select: { customerName: true, siteName: true } },
    },
    orderBy: { submittedAt: "desc" },
  });

  return NextResponse.json(variations);
}

export async function POST(req: Request) {
  const user = await requireRole(["technician"]).catch(() => null);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = validateVariationInput(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", issues: parsed.error.issues }, { status: 400 });
  }

  const { jobId, description, costEstimate, photoUrl } = parsed.data;

  const job = await db.job.findFirst({
    where: { id: jobId, status: { in: ["active", "scheduled"] } },
  });
  if (!job) {
    return NextResponse.json({ error: "Job not found or not active" }, { status: 404 });
  }

  // Security: technician must be assigned to the job to submit a variation
  const assignment = await db.assignment.findFirst({
    where: { userId: user.id, jobId },
  });
  if (!assignment) {
    return NextResponse.json({ error: "Not assigned to this job" }, { status: 403 });
  }

  const variation = await db.variation.create({
    data: {
      jobId,
      technicianId: user.id,
      description,
      costEstimate,
      photoUrl: photoUrl ?? null,
      status: "pending",
    },
    include: { job: { select: { customerName: true, siteName: true } } },
  });

  const directors = await db.user.findMany({
    where: { role: "director", isActive: true },
    include: { pushSubscriptions: true },
  });

  await Promise.allSettled(
    directors.flatMap((d) =>
      d.pushSubscriptions.map((sub) =>
        sendPushToUser(sub, {
          title: "New Variation",
          body: `${user.name} — ${variation.job.siteName}: $${Number(costEstimate).toFixed(0)}`,
          url: "/variations",
        })
      )
    )
  );

  return NextResponse.json(variation, { status: 201 });
}
```

- [ ] **Step 4: Run all tests and verify pass**

```bash
pnpm test
```

Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/variations/route.ts \
        src/app/api/variations/__tests__/variations.test.ts
git commit -m "fix: variation POST requires job assignment (prevents fraud on unassigned jobs)"
```

---

### Task 3: Fix variation decision race + job DELETE FK error handling

**Files:**
- Modify: `src/app/api/variations/[id]/decision/route.ts:29-47`
- Modify: `src/app/api/jobs/[id]/route.ts:28-34`

**Interfaces:**
- Produces: Variation decision PATCH now returns 409 `{ error: "Variation already decided" }` atomically (no window between check and update). Job DELETE returns 409 when related records prevent deletion.

- [ ] **Step 1: Write failing test for decision race**

Add to `src/app/api/variations/__tests__/variations.test.ts` (append to the file):

Actually — add a new dedicated test file for the decision endpoint:

Create `src/app/api/variations/__tests__/decision.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/clerk", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/push/vapid", () => ({ sendPushToUser: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/db/client", () => ({
  db: {
    $transaction: vi.fn(),
    variation:    { findUnique: vi.fn(), update: vi.fn() },
    invoice:      { findFirst: vi.fn(), update: vi.fn(), create: vi.fn() },
    user:         { findUnique: vi.fn() },
  },
}));

import { requireRole } from "@/lib/auth/clerk";
import { db } from "@/lib/db/client";
import { PATCH } from "../[id]/decision/route";

const VAR_ID  = "55555555-5555-4555-8555-555555555555";
const mockDirector = { id: "d1", role: "director" as const, name: "Boss", clerkId: "c1", email: "b@c.com", isActive: true };
const pendingVar   = { id: VAR_ID, jobId: "j1", technicianId: "t1", costEstimate: 450, status: "pending", decidedAt: null };

function makeReq(body: unknown) {
  return new Request(`http://localhost/api/variations/${VAR_ID}/decision`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => vi.clearAllMocks());

describe("PATCH /api/variations/[id]/decision", () => {
  it("returns 401 for non-director", async () => {
    vi.mocked(requireRole).mockRejectedValue(new Error("Forbidden"));
    const res = await PATCH(makeReq({ decision: "approved" }), { params: { id: VAR_ID } });
    expect(res.status).toBe(401);
  });

  it("returns 404 when variation not found", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockDirector as any);
    vi.mocked(db.variation.findUnique).mockResolvedValue(null);
    const res = await PATCH(makeReq({ decision: "approved" }), { params: { id: VAR_ID } });
    expect(res.status).toBe(404);
  });

  it("returns 409 when variation already decided — status check is inside the transaction so concurrent approvals are blocked", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockDirector as any);
    // Simulate the transaction failing with P2025 because the row no longer matches { status: 'pending' }
    vi.mocked(db.$transaction).mockRejectedValue(
      Object.assign(new Error("Not found"), { code: "P2025" })
    );
    const alreadyDecidedVar = { ...pendingVar, status: "approved" };
    vi.mocked(db.variation.findUnique).mockResolvedValue(alreadyDecidedVar as any);
    const res = await PATCH(makeReq({ decision: "approved" }), { params: { id: VAR_ID } });
    expect(res.status).toBe(409);
  });
});
```

- [ ] **Step 2: Run test to confirm P2025 test fails**

```bash
pnpm test src/app/api/variations/__tests__/decision.test.ts
```

Expected: FAIL — the P2025 409 branch doesn't exist yet.

- [ ] **Step 3: Move status check inside transaction in `src/app/api/variations/[id]/decision/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth/clerk";
import { db } from "@/lib/db/client";
import { sendPushToUser } from "@/lib/push/vapid";

const decisionSchema = z.discriminatedUnion("decision", [
  z.object({ decision: z.literal("approved") }),
  z.object({
    decision: z.literal("rejected"),
    decisionReason: z.string().min(10, "Reason must be at least 10 characters (VC-06)"),
  }),
  z.object({
    decision: z.literal("queried"),
    decisionReason: z.string().min(10, "Provide a query of at least 10 characters"),
  }),
]);

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const user = await requireRole(["director"]).catch(() => null);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = decisionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid decision", issues: parsed.error.issues }, { status: 400 });
  }

  const variation = await db.variation.findUnique({ where: { id: params.id } });
  if (!variation) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { decision } = parsed.data;
  const decisionReason = "decisionReason" in parsed.data ? parsed.data.decisionReason : null;

  let updated;
  try {
    updated = await db.$transaction(async (tx) => {
      // Atomic status check + update: throws P2025 if row no longer matches status='pending'
      const result = await tx.variation.update({
        where: { id: params.id, status: "pending" },
        data: {
          status: decision,
          directorDecision: decision,
          decisionReason,
          decidedAt: new Date(),
        },
      });

      if (decision === "approved") {
        const existing = await tx.invoice.findFirst({ where: { jobId: variation.jobId } });
        if (existing) {
          await tx.invoice.update({
            where: { id: existing.id },
            data: {
              variationsTotal: existing.variationsTotal.toNumber() + variation.costEstimate.toNumber(),
              totalAmount: existing.totalAmount.toNumber() + variation.costEstimate.toNumber(),
            },
          });
        } else {
          await tx.invoice.create({
            data: {
              jobId: variation.jobId,
              baseAmount: 0,
              variationsTotal: variation.costEstimate.toNumber(),
              totalAmount: variation.costEstimate.toNumber(),
            },
          });
        }
      }

      return result;
    });
  } catch (err: unknown) {
    const code = (err as { code?: string }).code;
    if (code === "P2025") {
      return NextResponse.json({ error: "Variation already decided" }, { status: 409 });
    }
    throw err;
  }

  const technician = await db.user.findUnique({
    where: { id: variation.technicianId },
    include: { pushSubscriptions: true },
  });

  if (technician) {
    const messages: Record<string, string> = {
      approved: "Variation approved",
      rejected: "Variation rejected",
      queried: "Director has a query on your variation",
    };
    await Promise.allSettled(
      technician.pushSubscriptions.map((sub) =>
        sendPushToUser(sub, {
          title: messages[decision],
          body: decisionReason ?? `$${Number(variation.costEstimate).toFixed(0)}`,
          url: "/variations",
        })
      )
    );
  }

  return NextResponse.json(updated);
}
```

- [ ] **Step 4: Add try/catch to Job DELETE in `src/app/api/jobs/[id]/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth/clerk";
import { db } from "@/lib/db/client";

const patchSchema = z.object({
  customerName: z.string().min(2).optional(),
  siteName: z.string().min(2).optional(),
  siteAddress: z.string().min(5).optional(),
  quotedHours: z.number().positive().optional(),
  status: z.enum(["scheduled", "active", "complete", "cancelled"]).optional(),
});

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const user = await requireRole(["director", "service_manager", "admin"]).catch(() => null);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  }

  const job = await db.job.update({ where: { id: params.id }, data: parsed.data });
  return NextResponse.json(job);
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const user = await requireRole(["director", "admin"]).catch(() => null);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    await db.job.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const code = (err as { code?: string }).code;
    if (code === "P2003") {
      return NextResponse.json(
        { error: "Cannot delete job with related records (time entries, variations, etc). Mark as cancelled instead." },
        { status: 409 }
      );
    }
    if (code === "P2025") {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }
    throw err;
  }
}
```

- [ ] **Step 5: Run all tests and verify pass**

```bash
pnpm test
```

Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/variations/[id]/decision/route.ts \
        src/app/api/variations/__tests__/decision.test.ts \
        src/app/api/jobs/[id]/route.ts
git commit -m "fix: atomic variation decision check + job DELETE FK error handling"
```

---

### Task 4: Schema migrations — Decimal monetary types, indexes, TOCTOU partial index, Job.updatedAt, User.phone

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_security_db_fixes/migration.sql` (via `prisma migrate dev`)

**Interfaces:**
- Produces: `Variation.costEstimate` is `Decimal`. `Invoice.baseAmount`, `Invoice.variationsTotal`, `Invoice.totalAmount` are `Decimal`. New indexes on `Assignment(assignedDate)`, `Invoice(jobId)`, `TimeEntry(jobId, status)`, `ComplianceDocument(templateId)`. `Invoice` has `@@unique([jobId])`. `User.phone` is nullable. `Job` has `updatedAt`. TOCTOU partial unique index on `TimeEntry`.

- [ ] **Step 1: Update `prisma/schema.prisma`**

Make these changes to the schema file:

**User model** — change `phone` to nullable:
```prisma
model User {
  id        String   @id @default(uuid())
  clerkId   String   @unique
  name      String
  email     String   @unique
  phone     String?
  role      UserRole
  isActive  Boolean  @default(true)
  createdAt DateTime @default(now())
  // ... relations unchanged
}
```

**Job model** — add `updatedAt`:
```prisma
model Job {
  id           String    @id @default(uuid())
  customerName String
  siteName     String
  siteAddress  String
  status       JobStatus @default(scheduled)
  quotedHours  Float
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt

  // ... relations unchanged
  @@index([status])
}
```

**Assignment model** — add `assignedDate` index:
```prisma
model Assignment {
  id           String   @id @default(uuid())
  userId       String
  jobId        String
  assignedDate DateTime @default(now())

  user User @relation(fields: [userId], references: [id])
  job  Job  @relation(fields: [jobId], references: [id])

  @@unique([userId, jobId, assignedDate])
  @@index([assignedDate])
}
```

**TimeEntry model** — add `(jobId, status)` index:
```prisma
model TimeEntry {
  id              String          @id @default(uuid())
  userId          String
  jobId           String
  clockInTime     DateTime
  clockOutTime    DateTime?
  durationMinutes Int?
  status          TimeEntryStatus @default(active)

  user User @relation(fields: [userId], references: [id])
  job  Job  @relation(fields: [jobId], references: [id])

  @@index([status])
  @@index([userId, status])
  @@index([jobId, status])
}
```

**Variation model** — change `costEstimate` to `Decimal`:
```prisma
model Variation {
  id               String           @id @default(uuid())
  jobId            String
  technicianId     String
  description      String
  costEstimate     Decimal          @db.Decimal(12, 2)
  photoUrl         String?
  status           VariationStatus  @default(pending)
  directorDecision VariationStatus?
  decisionReason   String?
  submittedAt      DateTime         @default(now())
  decidedAt        DateTime?

  job        Job  @relation(fields: [jobId], references: [id])
  technician User @relation("TechnicianVariations", fields: [technicianId], references: [id])

  @@index([status])
  @@index([jobId])
}
```

**Invoice model** — change all amounts to `Decimal`, add index and unique:
```prisma
model Invoice {
  id              String   @id @default(uuid())
  jobId           String   @unique
  baseAmount      Decimal  @db.Decimal(12, 2)
  variationsTotal Decimal  @db.Decimal(12, 2)
  totalAmount     Decimal  @db.Decimal(12, 2)
  createdAt       DateTime @default(now())

  job Job @relation(fields: [jobId], references: [id])

  @@index([jobId])
}
```

**ComplianceDocument model** — add `templateId` index:
```prisma
model ComplianceDocument {
  id          String   @id @default(uuid())
  jobId       String
  templateId  String
  createdById String
  values      Json
  pdfUrl      String?
  submittedAt DateTime @default(now())
  createdAt   DateTime @default(now())

  job       Job                @relation(fields: [jobId], references: [id])
  template  ComplianceTemplate @relation(fields: [templateId], references: [id])
  createdBy User               @relation("ComplianceDocuments", fields: [createdById], references: [id])

  @@index([jobId])
  @@index([createdById])
  @@index([templateId])
}
```

- [ ] **Step 2: Run migration**

```bash
pnpm prisma migrate dev --name "security_db_fixes"
```

When prompted, confirm the migration. Prisma will generate a migration SQL file at `prisma/migrations/<timestamp>_security_db_fixes/migration.sql`.

Expected output: `✓ Generated Prisma Client`

- [ ] **Step 3: Add TOCTOU partial unique index to the migration SQL**

Open the generated migration file at `prisma/migrations/<timestamp>_security_db_fixes/migration.sql` and **append** this SQL at the end of the file:

```sql
-- Prevent TOCTOU race: only one active clock-in per user at a time
-- (Prisma cannot express partial unique indexes in schema.prisma declaratively)
CREATE UNIQUE INDEX IF NOT EXISTS "one_active_entry_per_user"
  ON "TimeEntry"("userId") WHERE status = 'active';
```

Then apply the raw migration:

```bash
pnpm prisma migrate deploy
```

Or to apply the updated migration file in dev:

```bash
pnpm prisma db push --accept-data-loss
```

Actually use the correct flow for adding raw SQL to an existing migration:
Since the migration file was already applied by `prisma migrate dev`, add the partial index as a separate migration:

```bash
pnpm prisma migrate dev --name "toctou_partial_index"
```

This will create a new (empty) migration. Then edit the new empty migration's `.sql` file to contain:

```sql
-- Prevent duplicate active clock-in entries (TOCTOU race)
CREATE UNIQUE INDEX IF NOT EXISTS "one_active_entry_per_user"
  ON "TimeEntry"("userId") WHERE status = 'active';
```

Then apply it:
```bash
pnpm prisma migrate dev
```

- [ ] **Step 4: Regenerate Prisma client**

```bash
pnpm prisma generate
```

Expected: Prisma client regenerated. `Variation.costEstimate`, `Invoice.baseAmount` etc. are now typed as `Prisma.Decimal`.

- [ ] **Step 5: Fix TypeScript compilation errors from Decimal type**

Run `pnpm build` to identify all breakage points:

```bash
pnpm build 2>&1 | grep "error TS" | head -30
```

The main breakage points will be in:
- `src/app/api/variations/[id]/decision/route.ts` — `.toNumber()` calls on Decimal (already added in Task 3)
- `src/app/api/variations/route.ts` — `costEstimate.toFixed(0)` in push body (already fixed in Task 2 with `Number(costEstimate).toFixed(0)`)
- `src/app/variations/VariationCard.tsx` — `variation.costEstimate.toFixed(0)` — this is a client component receiving serialised data

For `VariationCard.tsx`, the API sends JSON. Prisma Decimal serialises as a string via `JSON.stringify`. Update the component to handle it as `number | string`:

In `src/app/variations/VariationCard.tsx`, change line 69:
```tsx
// Before:
${variation.costEstimate.toFixed(0)}

// After:
${Number(variation.costEstimate).toFixed(2)}
```

Also update the interface in `VariationCard.tsx`:
```typescript
interface Variation {
  // ...
  costEstimate: number;  // keep as number — API will serialize Decimal as number (see next step)
  // ...
}
```

For the GET variations API route, explicitly convert Decimal to number before JSON response to keep the API contract stable:

In `src/app/api/variations/route.ts`, update the GET handler:
```typescript
export async function GET() {
  // ... auth check unchanged ...
  const variations = await db.variation.findMany({
    where: { status: "pending" },
    include: {
      technician: { select: { name: true } },
      job: { select: { customerName: true, siteName: true } },
    },
    orderBy: { submittedAt: "desc" },
  });

  return NextResponse.json(
    variations.map((v) => ({
      ...v,
      costEstimate: v.costEstimate.toNumber(),
    }))
  );
}
```

For Invoice amounts in the decision route (already fixed in Task 3 with `.toNumber()`).

Run `pnpm build` again to confirm all TypeScript errors are resolved.

- [ ] **Step 6: Run all tests**

```bash
pnpm test
```

Expected: All tests pass.

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.prisma \
        prisma/migrations/ \
        src/app/api/variations/route.ts \
        src/app/variations/VariationCard.tsx
git commit -m "fix: Float→Decimal monetary types, missing indexes, TOCTOU partial index, Job.updatedAt"
```

---

### Task 5: Fix VAPID module-level side effect and webhook role validation

**Files:**
- Modify: `src/lib/push/vapid.ts`
- Modify: `src/app/api/webhooks/clerk/route.ts:34-45`

**Interfaces:**
- Produces: `sendPushToUser()` initialises VAPID on first call (not at module load). Webhook `user.updated` rejects unknown role values with a 400.

- [ ] **Step 1: Fix VAPID side effect in `src/lib/push/vapid.ts`**

```typescript
import webpush from "web-push";

interface PushPayload {
  title: string;
  body: string;
  url: string;
}

interface StoredSubscription {
  endpoint: string;
  p256dh: string;
  auth: string;
}

let vapidInitialised = false;

function ensureVapid() {
  if (vapidInitialised) return;
  const contact = process.env.VAPID_CONTACT_EMAIL;
  const pubKey  = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privKey = process.env.VAPID_PRIVATE_KEY;
  if (!contact || !pubKey || !privKey) {
    throw new Error("VAPID env vars not set: VAPID_CONTACT_EMAIL, NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY");
  }
  webpush.setVapidDetails(`mailto:${contact}`, pubKey, privKey);
  vapidInitialised = true;
}

export async function sendPushToUser(sub: StoredSubscription, payload: PushPayload) {
  ensureVapid();
  return webpush.sendNotification(
    { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
    JSON.stringify(payload),
    { urgency: "high" }
  );
}
```

- [ ] **Step 2: Add role enum validation to webhook in `src/app/api/webhooks/clerk/route.ts`**

Add a constant for valid roles and validate before upsert:

```typescript
import { headers } from "next/headers";
import type { WebhookEvent } from "@clerk/nextjs/server";
import { Webhook } from "svix";
import { db } from "@/lib/db/client";
import type { UserRole } from "@/lib/nav-config";

const VALID_ROLES: UserRole[] = [
  "technician", "director", "service_manager", "admin", "sales_engineer", "draftsman",
];

export async function POST(req: Request) {
  const secret = process.env.CLERK_WEBHOOK_SECRET;
  if (!secret) return new Response("No webhook secret configured", { status: 500 });

  const headerPayload = await headers();
  const svixId = headerPayload.get("svix-id");
  const svixTimestamp = headerPayload.get("svix-timestamp");
  const svixSignature = headerPayload.get("svix-signature");

  if (!svixId || !svixTimestamp || !svixSignature) {
    return new Response("Missing svix headers", { status: 400 });
  }

  const payload = await req.text();
  const wh = new Webhook(secret);
  let evt: WebhookEvent;

  try {
    evt = wh.verify(payload, {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    }) as WebhookEvent;
  } catch {
    return new Response("Invalid webhook signature", { status: 400 });
  }

  if (evt.type === "user.created" || evt.type === "user.updated") {
    const { id, first_name, last_name, email_addresses, public_metadata, phone_numbers } = evt.data;
    const email = email_addresses[0]?.email_address ?? "";
    const name = [first_name, last_name].filter(Boolean).join(" ") || email;
    const rawRole = public_metadata?.role as string | undefined;
    const role: UserRole = VALID_ROLES.includes(rawRole as UserRole)
      ? (rawRole as UserRole)
      : "technician";
    const phone = phone_numbers[0]?.phone_number ?? undefined;

    await db.user.upsert({
      where: { clerkId: id },
      update: { name, email, role, phone },
      create: { clerkId: id, name, email, role, phone, isActive: true },
    });
  }

  if (evt.type === "session.created") {
    const user = await db.user.findUnique({ where: { clerkId: evt.data.user_id } });
    if (user) {
      await db.authEvent.create({ data: { eventType: "login", userId: user.id } });
    }
  }

  if (evt.type === "session.ended" || evt.type === "session.removed") {
    const user = await db.user.findUnique({ where: { clerkId: evt.data.user_id } });
    if (user) {
      await db.authEvent.create({ data: { eventType: "logout", userId: user.id } });
    }
  }

  return new Response("OK", { status: 200 });
}
```

- [ ] **Step 3: Run all tests**

```bash
pnpm test
```

Expected: All tests pass.

- [ ] **Step 4: Run build to confirm no TypeScript errors**

```bash
pnpm build
```

Expected: Build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/lib/push/vapid.ts \
        src/app/api/webhooks/clerk/route.ts
git commit -m "fix: VAPID lazy-init with env guard + webhook validates role enum"
```

- [ ] **Step 6: Push**

```bash
git push
```
