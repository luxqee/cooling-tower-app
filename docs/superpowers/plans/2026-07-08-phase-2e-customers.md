# Phase 2e — Customer / Contact Records Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a reusable `Customer` model to the database, expose CRUD API routes for admin use, wire customer search into the job creation form, and add Customer list and detail pages.

**Architecture:** New `Customer` Prisma model with a nullable FK on `Job`. Server components fetch data directly via `db`; client components handle interactivity. Customer search on the job form uses a debounced fetch to `GET /api/customers?q=`. The inline edit on the customer detail page toggles a shared `CustomerForm` component in place.

**Tech Stack:** Next.js 14 App Router, Prisma 7 + Neon (`@prisma/adapter-neon`), Clerk auth (`requireRole`), Zod 4 validation, Vitest for unit tests, Tailwind CSS, `lucide-react`.

## Global Constraints

- `customerId` on `Job` is nullable — existing jobs are unaffected; `customerName` stays as the display string
- When a job is linked to a customer, `job.customerName` is kept in sync with `customer.name`
- Only `admin` can create/edit/delete customer records
- `director` and `sales_engineer` can view customers; `technician`, `draftsman`, `service_manager` have no access
- Migration name: `add_customer_model`
- All `DateTime` values returned from API routes must be serialised to ISO strings
- Auth pattern: `requireRole([...]).catch(() => null)` then `if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })`
- Page auth pattern: `requireRole([...]).catch(() => null)` then `if (!user) redirect("/")`
- Use `AppShell` wrapper for all pages (`import { AppShell } from "@/components/layout/AppShell"`)
- Run tests with `pnpm test`
- Tailwind classes: amber accent (`bg-amber-600`), dark-mode (`dark:*`), min touch target `min-h-[44px]`

---

## File Map

**Create:**
- `src/app/api/customers/route.ts` — GET list/search + POST create
- `src/app/api/customers/[id]/route.ts` — GET detail + PATCH update + DELETE
- `src/app/api/customers/__tests__/customers.test.ts` — API unit tests
- `src/app/customers/page.tsx` — Customer list server page
- `src/app/customers/CustomerList.tsx` — Client list with client-side search filter
- `src/app/customers/CustomerForm.tsx` — Client form (shared by new + inline edit)
- `src/app/customers/new/page.tsx` — New customer server page
- `src/app/customers/[id]/page.tsx` — Customer detail server page
- `src/app/customers/[id]/CustomerDetail.tsx` — Client detail with inline edit

**Modify:**
- `prisma/schema.prisma` — Add `Customer` model; add `customerId` to `Job`
- `src/app/api/jobs/route.ts` — Accept optional `customerId`; derive `customerName` from customer
- `src/app/api/jobs/__tests__/jobs.test.ts` — Add tests for `customerId` path
- `src/app/jobs/NewJobForm.tsx` — Replace `customerName` text input with search-and-select
- `src/lib/nav-config.ts` — Add `Building2` import; add Customers nav item

---

### Task 1: Database Schema + Migration

**Files:**
- Modify: `prisma/schema.prisma`

**Interfaces:**
- Produces: `db.customer` Prisma model, nullable `job.customerId` FK

- [ ] **Step 1: Add `Customer` model to `prisma/schema.prisma`**

Insert after the `User` model block, before the `Job` model:

```prisma
model Customer {
  id            String   @id @default(uuid())
  name          String
  abn           String?
  contactPerson String?
  email         String?
  phone         String?
  address       String?
  notes         String?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  jobs Job[]

  @@index([name])
}
```

- [ ] **Step 2: Add `customerId` and `customer` relation to the `Job` model**

In the `Job` model, after the `jobType String` line, add:

```prisma
  customerId    String?
```

After the `invoices Invoice[]` relation line, add:

```prisma
  customer      Customer? @relation(fields: [customerId], references: [id])
```

- [ ] **Step 3: Generate and run migration**

```bash
pnpm exec prisma migrate dev --name add_customer_model
```

Expected output includes:
```
Applying migration `<timestamp>_add_customer_model`
```

- [ ] **Step 4: Verify Prisma client regenerated**

```bash
pnpm exec prisma generate
```

Expected: `Generated Prisma Client` with no errors.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat: add Customer model with nullable FK on Job"
```

---

### Task 2: Customer API Routes + Tests

**Files:**
- Create: `src/app/api/customers/route.ts`
- Create: `src/app/api/customers/[id]/route.ts`
- Create: `src/app/api/customers/__tests__/customers.test.ts`

**Interfaces:**
- Consumes: `db.customer`, `db.job`, `requireRole`, `db.$transaction`
- Produces:
  - `GET /api/customers?q=` → `{ id, name, email, phone, abn }[]`
  - `POST /api/customers` → full customer object, 201
  - `GET /api/customers/[id]` → customer + serialised jobs array
  - `PATCH /api/customers/[id]` → updated customer; syncs `customerName` on linked jobs
  - `DELETE /api/customers/[id]` → 204; nullifies `customerId` on linked jobs first

- [ ] **Step 1: Write the test file**

Create `src/app/api/customers/__tests__/customers.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/clerk", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/db/client", () => ({
  db: {
    $transaction: vi.fn(),
    customer: {
      findMany:   vi.fn(),
      findUnique: vi.fn(),
      create:     vi.fn(),
      update:     vi.fn(),
      delete:     vi.fn(),
    },
    job: { updateMany: vi.fn() },
  },
}));

import { requireRole } from "@/lib/auth/clerk";
import { db } from "@/lib/db/client";
import { GET as GET_LIST, POST } from "../route";
import { GET as GET_DETAIL, PATCH, DELETE } from "../[id]/route";

const ADMIN    = { id: "a1", role: "admin"      as const, name: "Admin", clerkId: "ca1", email: "a@c.com", isActive: true };
const DIRECTOR = { id: "d1", role: "director"   as const, name: "Boss",  clerkId: "cd1", email: "d@c.com", isActive: true };

const CUST_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const baseCustomer = {
  id:            CUST_ID,
  name:          "Rio Tinto",
  abn:           "33 007 457 141",
  contactPerson: "Jane Smith",
  email:         "jane@riotinto.com",
  phone:         "0400 000 000",
  address:       "123 Mine Rd, Brisbane QLD 4000",
  notes:         null,
  createdAt:     new Date("2026-07-01T00:00:00Z"),
  updatedAt:     new Date("2026-07-01T00:00:00Z"),
};

function makeReq(url: string, init?: RequestInit) {
  return new Request(`http://localhost${url}`, init);
}

beforeEach(() => vi.clearAllMocks());

// ── GET /api/customers ────────────────────────────────────────────────────────

describe("GET /api/customers", () => {
  it("returns 401 for technician", async () => {
    vi.mocked(requireRole).mockRejectedValue(new Error("Forbidden"));
    const res = await GET_LIST(makeReq("/api/customers"));
    expect(res.status).toBe(401);
  });

  it("returns customer list for admin", async () => {
    vi.mocked(requireRole).mockResolvedValue(ADMIN as any);
    vi.mocked(db.customer.findMany).mockResolvedValue([
      { id: CUST_ID, name: "Rio Tinto", email: null, phone: null, abn: null },
    ] as any);
    const res = await GET_LIST(makeReq("/api/customers"));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveLength(1);
    expect(data[0].name).toBe("Rio Tinto");
  });

  it("passes ?q filter to Prisma with contains insensitive", async () => {
    vi.mocked(requireRole).mockResolvedValue(DIRECTOR as any);
    vi.mocked(db.customer.findMany).mockResolvedValue([
      { id: CUST_ID, name: "Rio Tinto", email: null, phone: null, abn: null },
    ] as any);
    await GET_LIST(makeReq("/api/customers?q=rio"));
    expect(vi.mocked(db.customer.findMany)).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { name: { contains: "rio", mode: "insensitive" } },
      })
    );
  });
});

// ── POST /api/customers ───────────────────────────────────────────────────────

describe("POST /api/customers", () => {
  it("returns 401 for non-admin", async () => {
    vi.mocked(requireRole).mockRejectedValue(new Error("Forbidden"));
    const res = await POST(makeReq("/api/customers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "ACME" }),
    }));
    expect(res.status).toBe(401);
  });

  it("returns 400 when name is missing", async () => {
    vi.mocked(requireRole).mockResolvedValue(ADMIN as any);
    const res = await POST(makeReq("/api/customers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when name is too short (< 2 chars)", async () => {
    vi.mocked(requireRole).mockResolvedValue(ADMIN as any);
    const res = await POST(makeReq("/api/customers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "A" }),
    }));
    expect(res.status).toBe(400);
  });

  it("creates customer and returns 201", async () => {
    vi.mocked(requireRole).mockResolvedValue(ADMIN as any);
    vi.mocked(db.customer.create).mockResolvedValue(baseCustomer as any);
    const res = await POST(makeReq("/api/customers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Rio Tinto" }),
    }));
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.name).toBe("Rio Tinto");
    expect(data.id).toBe(CUST_ID);
  });
});

// ── GET /api/customers/[id] ───────────────────────────────────────────────────

describe("GET /api/customers/[id]", () => {
  it("returns 401 for technician", async () => {
    vi.mocked(requireRole).mockRejectedValue(new Error("Forbidden"));
    const res = await GET_DETAIL(makeReq(`/api/customers/${CUST_ID}`), { params: { id: CUST_ID } });
    expect(res.status).toBe(401);
  });

  it("returns 404 when customer does not exist", async () => {
    vi.mocked(requireRole).mockResolvedValue(ADMIN as any);
    vi.mocked(db.customer.findUnique).mockResolvedValue(null);
    const res = await GET_DETAIL(makeReq(`/api/customers/${CUST_ID}`), { params: { id: CUST_ID } });
    expect(res.status).toBe(404);
  });

  it("returns customer with linked jobs and ISO date strings", async () => {
    vi.mocked(requireRole).mockResolvedValue(DIRECTOR as any);
    vi.mocked(db.customer.findUnique).mockResolvedValue({
      ...baseCustomer,
      jobs: [{
        id: "j1", customerName: "Rio Tinto", siteName: "Weipa",
        status: "active", createdAt: new Date("2026-07-01T00:00:00Z"), jobType: "Annual Service",
      }],
    } as any);
    const res = await GET_DETAIL(makeReq(`/api/customers/${CUST_ID}`), { params: { id: CUST_ID } });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.jobs).toHaveLength(1);
    expect(data.jobs[0].siteName).toBe("Weipa");
    expect(typeof data.createdAt).toBe("string");
    expect(typeof data.jobs[0].createdAt).toBe("string");
  });
});

// ── PATCH /api/customers/[id] ─────────────────────────────────────────────────

describe("PATCH /api/customers/[id]", () => {
  it("returns 401 for non-admin", async () => {
    vi.mocked(requireRole).mockRejectedValue(new Error("Forbidden"));
    const res = await PATCH(makeReq(`/api/customers/${CUST_ID}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Rio Tinto Ltd" }),
    }), { params: { id: CUST_ID } });
    expect(res.status).toBe(401);
  });

  it("syncs customerName on linked jobs when name is updated", async () => {
    vi.mocked(requireRole).mockResolvedValue(ADMIN as any);
    vi.mocked(db.customer.findUnique).mockResolvedValue(baseCustomer as any);
    const updatedCustomer = { ...baseCustomer, name: "Rio Tinto Ltd" };
    let capturedJobUpdate: any = null;
    vi.mocked(db.$transaction).mockImplementation(async (fn: any) =>
      fn({
        customer: { update: vi.fn().mockResolvedValue(updatedCustomer) },
        job: {
          updateMany: vi.fn().mockImplementation(async (args: any) => {
            capturedJobUpdate = args;
            return { count: 1 };
          }),
        },
      })
    );
    const res = await PATCH(makeReq(`/api/customers/${CUST_ID}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Rio Tinto Ltd" }),
    }), { params: { id: CUST_ID } });
    expect(res.status).toBe(200);
    expect(capturedJobUpdate?.data?.customerName).toBe("Rio Tinto Ltd");
    expect(capturedJobUpdate?.where?.customerId).toBe(CUST_ID);
  });

  it("does not call job.updateMany when name is not in the patch body", async () => {
    vi.mocked(requireRole).mockResolvedValue(ADMIN as any);
    vi.mocked(db.customer.findUnique).mockResolvedValue(baseCustomer as any);
    const jobUpdateManySpy = vi.fn();
    vi.mocked(db.$transaction).mockImplementation(async (fn: any) =>
      fn({
        customer: { update: vi.fn().mockResolvedValue(baseCustomer) },
        job: { updateMany: jobUpdateManySpy },
      })
    );
    await PATCH(makeReq(`/api/customers/${CUST_ID}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: "0411 000 000" }),
    }), { params: { id: CUST_ID } });
    expect(jobUpdateManySpy).not.toHaveBeenCalled();
  });
});

// ── DELETE /api/customers/[id] ────────────────────────────────────────────────

describe("DELETE /api/customers/[id]", () => {
  it("returns 401 for non-admin", async () => {
    vi.mocked(requireRole).mockRejectedValue(new Error("Forbidden"));
    const res = await DELETE(makeReq(`/api/customers/${CUST_ID}`, { method: "DELETE" }), { params: { id: CUST_ID } });
    expect(res.status).toBe(401);
  });

  it("returns 404 when customer does not exist", async () => {
    vi.mocked(requireRole).mockResolvedValue(ADMIN as any);
    vi.mocked(db.customer.findUnique).mockResolvedValue(null);
    const res = await DELETE(makeReq(`/api/customers/${CUST_ID}`, { method: "DELETE" }), { params: { id: CUST_ID } });
    expect(res.status).toBe(404);
  });

  it("nullifies customerId on linked jobs then deletes customer, returns 204", async () => {
    vi.mocked(requireRole).mockResolvedValue(ADMIN as any);
    vi.mocked(db.customer.findUnique).mockResolvedValue(baseCustomer as any);
    let capturedJobUpdate: any = null;
    vi.mocked(db.$transaction).mockImplementation(async (fn: any) =>
      fn({
        job: {
          updateMany: vi.fn().mockImplementation(async (args: any) => {
            capturedJobUpdate = args;
            return { count: 1 };
          }),
        },
        customer: { delete: vi.fn().mockResolvedValue(baseCustomer) },
      })
    );
    const res = await DELETE(makeReq(`/api/customers/${CUST_ID}`, { method: "DELETE" }), { params: { id: CUST_ID } });
    expect(res.status).toBe(204);
    expect(capturedJobUpdate?.data?.customerId).toBeNull();
    expect(capturedJobUpdate?.where?.customerId).toBe(CUST_ID);
  });
});
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
pnpm test src/app/api/customers
```

Expected: FAIL — modules `../route` and `../[id]/route` not found.

- [ ] **Step 3: Create `src/app/api/customers/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth/clerk";
import { db } from "@/lib/db/client";

const createCustomerSchema = z.object({
  name:          z.string().min(2, "Customer name required"),
  abn:           z.string().optional(),
  contactPerson: z.string().optional(),
  email:         z.string().email("Invalid email").optional(),
  phone:         z.string().optional(),
  address:       z.string().optional(),
  notes:         z.string().optional(),
});

export async function GET(req: Request) {
  const user = await requireRole(["admin", "director", "sales_engineer"]).catch(() => null);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q");

  const customers = await db.customer.findMany({
    where: q ? { name: { contains: q, mode: "insensitive" } } : undefined,
    select: { id: true, name: true, email: true, phone: true, abn: true },
    orderBy: { name: "asc" },
  });

  return NextResponse.json(customers);
}

export async function POST(req: Request) {
  const user = await requireRole(["admin"]).catch(() => null);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = createCustomerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  }

  const customer = await db.customer.create({ data: parsed.data });
  return NextResponse.json(customer, { status: 201 });
}
```

- [ ] **Step 4: Create `src/app/api/customers/[id]/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth/clerk";
import { db } from "@/lib/db/client";

const patchCustomerSchema = z.object({
  name:          z.string().min(2).optional(),
  abn:           z.string().nullable().optional(),
  contactPerson: z.string().nullable().optional(),
  email:         z.string().email().nullable().optional(),
  phone:         z.string().nullable().optional(),
  address:       z.string().nullable().optional(),
  notes:         z.string().nullable().optional(),
});

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const user = await requireRole(["admin", "director", "sales_engineer"]).catch(() => null);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const customer = await db.customer.findUnique({
    where: { id: params.id },
    include: {
      jobs: {
        select: {
          id: true, customerName: true, siteName: true,
          status: true, createdAt: true, jobType: true,
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!customer) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({
    ...customer,
    createdAt: customer.createdAt.toISOString(),
    updatedAt: customer.updatedAt.toISOString(),
    jobs: customer.jobs.map((j) => ({ ...j, createdAt: j.createdAt.toISOString() })),
  });
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const user = await requireRole(["admin"]).catch(() => null);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = patchCustomerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  }

  const existing = await db.customer.findUnique({ where: { id: params.id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const updated = await db.$transaction(async (tx) => {
    const customer = await tx.customer.update({ where: { id: params.id }, data: parsed.data });
    if (parsed.data.name !== undefined) {
      await tx.job.updateMany({
        where: { customerId: params.id },
        data: { customerName: parsed.data.name },
      });
    }
    return customer;
  });

  return NextResponse.json({
    ...updated,
    createdAt: updated.createdAt.toISOString(),
    updatedAt: updated.updatedAt.toISOString(),
  });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const user = await requireRole(["admin"]).catch(() => null);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const existing = await db.customer.findUnique({ where: { id: params.id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await db.$transaction(async (tx) => {
    await tx.job.updateMany({ where: { customerId: params.id }, data: { customerId: null } });
    await tx.customer.delete({ where: { id: params.id } });
  });

  return new NextResponse(null, { status: 204 });
}
```

- [ ] **Step 5: Run tests — verify all 16 pass**

```bash
pnpm test src/app/api/customers
```

Expected:
```
✓ GET /api/customers > returns 401 for technician
✓ GET /api/customers > returns customer list for admin
✓ GET /api/customers > passes ?q filter to Prisma with contains insensitive
✓ POST /api/customers > returns 401 for non-admin
✓ POST /api/customers > returns 400 when name is missing
✓ POST /api/customers > returns 400 when name is too short (< 2 chars)
✓ POST /api/customers > creates customer and returns 201
✓ GET /api/customers/[id] > returns 401 for technician
✓ GET /api/customers/[id] > returns 404 when customer does not exist
✓ GET /api/customers/[id] > returns customer with linked jobs and ISO date strings
✓ PATCH /api/customers/[id] > returns 401 for non-admin
✓ PATCH /api/customers/[id] > syncs customerName on linked jobs when name is updated
✓ PATCH /api/customers/[id] > does not call job.updateMany when name is not in the patch body
✓ DELETE /api/customers/[id] > returns 401 for non-admin
✓ DELETE /api/customers/[id] > returns 404 when customer does not exist
✓ DELETE /api/customers/[id] > nullifies customerId on linked jobs then deletes customer, returns 204

Test Files  1 passed (1)
Tests  16 passed (16)
```

- [ ] **Step 6: Commit**

```bash
git add src/app/api/customers/
git commit -m "feat: add Customer API routes (list/search, create, detail, update, delete)"
```

---

### Task 3: Job API — customerId Integration + Tests

**Files:**
- Modify: `src/app/api/jobs/route.ts`
- Modify: `src/app/api/jobs/__tests__/jobs.test.ts`

**Interfaces:**
- Consumes: `db.customer.findUnique` (new), `db.job.create`
- `POST /api/jobs` now accepts optional `customerId`; if provided, `customerName` is derived from the customer

- [ ] **Step 1: Add `customer.findUnique` to the db mock and two new test cases**

In `src/app/api/jobs/__tests__/jobs.test.ts`, update the `vi.mock("@/lib/db/client")` block — replace:

```typescript
vi.mock("@/lib/db/client", () => ({
  db: {
    job: { update: vi.fn(), delete: vi.fn(), create: vi.fn() },
  },
}));
```

with:

```typescript
vi.mock("@/lib/db/client", () => ({
  db: {
    job:      { update: vi.fn(), delete: vi.fn(), create: vi.fn() },
    customer: { findUnique: vi.fn() },
  },
}));
```

Also add `import { db } from "@/lib/db/client";` if not already imported (it is — check line 11).

Then, inside `describe("POST /api/jobs", ...)`, add these two tests after the existing ones:

```typescript
  it("returns 404 when customerId references unknown customer", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockDirector as any);
    vi.mocked(db.customer.findUnique).mockResolvedValue(null);
    const { customerName: _cn, ...bodyWithoutName } = validPostBody;
    const res = await POST(makePostReq({
      ...bodyWithoutName,
      customerId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    }));
    expect(res.status).toBe(404);
  });

  it("derives customerName from customer when customerId is provided", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockDirector as any);
    vi.mocked(db.customer.findUnique).mockResolvedValue({
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      name: "BHP",
    } as any);
    vi.mocked(db.job.create).mockResolvedValue({
      id: "j2",
      customerName: "BHP",
      customerId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      siteName: "North Tower",
      siteAddress: "123 Main St, Sydney NSW 2000",
      quotedHours: 8,
      jobType: "Installation",
      status: "scheduled",
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any);
    const { customerName: _cn, ...bodyWithoutName } = validPostBody;
    const res = await POST(makePostReq({
      ...bodyWithoutName,
      customerId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    }));
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.customerName).toBe("BHP");
  });
```

- [ ] **Step 2: Run jobs tests — verify the two new tests fail**

```bash
pnpm test src/app/api/jobs
```

Expected: 2 new tests FAIL (`db.customer.findUnique is not a function` or similar).

- [ ] **Step 3: Replace `src/app/api/jobs/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth/clerk";
import { db } from "@/lib/db/client";

const createJobSchema = z.object({
  customerName: z.string().min(2, "Customer name required").optional(),
  customerId:   z.string().uuid().optional(),
  siteName:     z.string().min(2, "Site name required"),
  siteAddress:  z.string().min(5, "Site address required"),
  quotedHours:  z.number().positive("Quoted hours must be greater than 0"),
  quotedCost:   z.number().nonnegative().optional(),
  status:       z.enum(["scheduled", "active"]).default("scheduled"),
  jobType:      z.string().min(1, "Job type required"),
});

export async function POST(req: Request) {
  const user = await requireRole(["director", "service_manager", "admin"]).catch(() => null);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = createJobSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  }

  let { customerName, customerId, ...rest } = parsed.data;

  if (customerId) {
    const customer = await db.customer.findUnique({ where: { id: customerId } });
    if (!customer) return NextResponse.json({ error: "Customer not found" }, { status: 404 });
    customerName = customer.name;
  } else if (!customerName || customerName.trim().length < 2) {
    return NextResponse.json({ error: "Customer name required" }, { status: 400 });
  }

  const job = await db.job.create({
    data: { ...rest, customerName: customerName!, customerId: customerId ?? null },
  });
  return NextResponse.json(job, { status: 201 });
}
```

- [ ] **Step 4: Run all jobs tests — verify all 10 pass**

```bash
pnpm test src/app/api/jobs
```

Expected:
```
✓ DELETE /api/jobs/[id] > returns 401 when not authenticated
✓ DELETE /api/jobs/[id] > returns 200 when job deleted successfully
✓ DELETE /api/jobs/[id] > returns 409 when job has related records (FK violation P2003)
✓ DELETE /api/jobs/[id] > returns 404 when job does not exist (P2025)
✓ POST /api/jobs > returns 401 when not authenticated
✓ POST /api/jobs > returns 400 when jobType is missing
✓ POST /api/jobs > returns 400 when jobType is empty string
✓ POST /api/jobs > returns 201 when all fields including jobType are provided
✓ POST /api/jobs > returns 404 when customerId references unknown customer
✓ POST /api/jobs > derives customerName from customer when customerId is provided

Test Files  1 passed (1)
Tests  10 passed (10)
```

- [ ] **Step 5: Commit**

```bash
git add src/app/api/jobs/route.ts src/app/api/jobs/__tests__/jobs.test.ts
git commit -m "feat: accept customerId in POST /api/jobs; derive customerName from customer record"
```

---

### Task 4: Customer List + New Customer Pages

**Files:**
- Create: `src/app/customers/page.tsx`
- Create: `src/app/customers/CustomerList.tsx`
- Create: `src/app/customers/CustomerForm.tsx`
- Create: `src/app/customers/new/page.tsx`

**Interfaces:**
- Consumes: `db.customer.findMany` with `_count`; `POST /api/customers`
- Produces:
  - `/customers` — server page rendering `CustomerList` (client-side text filter)
  - `/customers/new` — server page rendering `CustomerForm` for creation
  - `CustomerForm` is reused by Task 5's inline edit

- [ ] **Step 1: Create `src/app/customers/CustomerList.tsx`**

```typescript
"use client";

import { useState } from "react";
import Link from "next/link";

interface CustomerRow {
  id:            string;
  name:          string;
  abn:           string | null;
  contactPerson: string | null;
  email:         string | null;
  phone:         string | null;
  jobCount:      number;
}

export function CustomerList({ customers }: { customers: CustomerRow[] }) {
  const [query, setQuery] = useState("");
  const filtered = query.trim()
    ? customers.filter((c) => c.name.toLowerCase().includes(query.toLowerCase()))
    : customers;

  return (
    <div className="space-y-4">
      <input
        type="search"
        placeholder="Search customers…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="w-full min-h-[44px] rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 text-base"
      />

      {filtered.length === 0 && (
        <p className="text-sm text-slate-500 dark:text-slate-400 py-4">No customers found.</p>
      )}

      {filtered.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-700">
                {["Name", "ABN", "Contact", "Email", "Phone", "Jobs"].map((h) => (
                  <th
                    key={h}
                    className="pb-2 pr-4 text-left text-xs font-medium text-slate-500 dark:text-slate-400 whitespace-nowrap"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr
                  key={c.id}
                  className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40"
                >
                  <td className="py-3 pr-4">
                    <Link
                      href={`/customers/${c.id}`}
                      className="font-medium text-amber-600 dark:text-amber-400 hover:underline"
                    >
                      {c.name}
                    </Link>
                  </td>
                  <td className="py-3 pr-4 text-slate-500">{c.abn ?? "—"}</td>
                  <td className="py-3 pr-4 text-slate-500">{c.contactPerson ?? "—"}</td>
                  <td className="py-3 pr-4 text-slate-500">{c.email ?? "—"}</td>
                  <td className="py-3 pr-4 text-slate-500">{c.phone ?? "—"}</td>
                  <td className="py-3 pr-4 text-slate-500">{c.jobCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create `src/app/customers/CustomerForm.tsx`**

Handles both creating (POST to `/api/customers`, redirects to `/customers/[id]`) and editing (PATCH to `/api/customers/[id]`, calls `onSave()` then `router.refresh()`).

```typescript
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

interface CustomerData {
  id:            string;
  name:          string;
  abn:           string | null;
  contactPerson: string | null;
  email:         string | null;
  phone:         string | null;
  address:       string | null;
  notes:         string | null;
}

interface CustomerFormProps {
  initial?:  CustomerData;
  onSave?:   () => void;
  onCancel?: () => void;
}

export function CustomerForm({ initial, onSave, onCancel }: CustomerFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [fields, setFields] = useState({
    name:          initial?.name          ?? "",
    abn:           initial?.abn           ?? "",
    contactPerson: initial?.contactPerson ?? "",
    email:         initial?.email         ?? "",
    phone:         initial?.phone         ?? "",
    address:       initial?.address       ?? "",
    notes:         initial?.notes         ?? "",
  });

  const isEdit = !!initial;

  function set(key: keyof typeof fields, value: string) {
    setFields((prev) => ({ ...prev, [key]: value }));
  }

  function handleSubmit() {
    const newErrors: Record<string, string> = {};
    if (fields.name.trim().length < 2) newErrors.name = "Customer name required (min 2 chars)";
    if (fields.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email.trim())) {
      newErrors.email = "Invalid email address";
    }
    if (Object.keys(newErrors).length > 0) { setErrors(newErrors); return; }
    setErrors({});

    startTransition(async () => {
      let body: Record<string, unknown>;
      if (isEdit) {
        // Send all fields so the user can clear optional fields by blanking them
        body = {
          name:          fields.name.trim(),
          abn:           fields.abn.trim()           || null,
          contactPerson: fields.contactPerson.trim() || null,
          email:         fields.email.trim()         || null,
          phone:         fields.phone.trim()         || null,
          address:       fields.address.trim()       || null,
          notes:         fields.notes.trim()         || null,
        };
      } else {
        // Only include non-empty optional fields for creation
        body = { name: fields.name.trim() };
        if (fields.abn.trim())           body.abn           = fields.abn.trim();
        if (fields.contactPerson.trim()) body.contactPerson = fields.contactPerson.trim();
        if (fields.email.trim())         body.email         = fields.email.trim();
        if (fields.phone.trim())         body.phone         = fields.phone.trim();
        if (fields.address.trim())       body.address       = fields.address.trim();
        if (fields.notes.trim())         body.notes         = fields.notes.trim();
      }

      const url    = isEdit ? `/api/customers/${initial.id}` : "/api/customers";
      const method = isEdit ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setErrors({ submit: (data as any).error ?? "Failed to save customer." });
        return;
      }

      if (isEdit) {
        onSave?.();
        router.refresh();
      } else {
        const created = await res.json();
        router.push(`/customers/${created.id}`);
      }
    });
  }

  const inputClass =
    "w-full min-h-[44px] rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 text-base";

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <label className="text-sm font-medium">Customer name *</label>
        <input
          type="text"
          value={fields.name}
          onChange={(e) => set("name", e.target.value)}
          placeholder="Rio Tinto"
          className={inputClass}
        />
        {errors.name && <p className="text-sm text-red-600">{errors.name}</p>}
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium">
          ABN <span className="font-normal text-slate-400">optional</span>
        </label>
        <input
          type="text"
          value={fields.abn}
          onChange={(e) => set("abn", e.target.value)}
          placeholder="12 345 678 901"
          className={inputClass}
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium">
          Contact person <span className="font-normal text-slate-400">optional</span>
        </label>
        <input
          type="text"
          value={fields.contactPerson}
          onChange={(e) => set("contactPerson", e.target.value)}
          placeholder="Jane Smith"
          className={inputClass}
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium">
          Email <span className="font-normal text-slate-400">optional</span>
        </label>
        <input
          type="email"
          value={fields.email}
          onChange={(e) => set("email", e.target.value)}
          placeholder="contact@company.com"
          className={inputClass}
        />
        {errors.email && <p className="text-sm text-red-600">{errors.email}</p>}
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium">
          Phone <span className="font-normal text-slate-400">optional</span>
        </label>
        <input
          type="tel"
          value={fields.phone}
          onChange={(e) => set("phone", e.target.value)}
          placeholder="0400 000 000"
          className={inputClass}
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium">
          Address <span className="font-normal text-slate-400">optional</span>
        </label>
        <input
          type="text"
          value={fields.address}
          onChange={(e) => set("address", e.target.value)}
          placeholder="123 Main St, Brisbane QLD 4000"
          className={inputClass}
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium">
          Notes <span className="font-normal text-slate-400">optional</span>
        </label>
        <textarea
          value={fields.notes}
          onChange={(e) => set("notes", e.target.value)}
          placeholder="Access instructions, parking, site-specific notes…"
          rows={4}
          className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-base resize-none"
        />
      </div>

      {errors.submit && <p className="text-sm text-red-600">{errors.submit}</p>}

      <div className="flex gap-3 pt-1">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 min-h-[48px] rounded-lg border border-slate-300 dark:border-slate-600 text-sm font-medium"
          >
            Cancel
          </button>
        )}
        <button
          type="button"
          onClick={handleSubmit}
          disabled={isPending}
          className="flex-1 min-h-[48px] rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-semibold text-sm disabled:opacity-40"
        >
          {isPending ? "Saving…" : isEdit ? "Save changes" : "Create customer"}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create `src/app/customers/page.tsx`**

```typescript
import { AppShell } from "@/components/layout/AppShell";
import { requireRole } from "@/lib/auth/clerk";
import { db } from "@/lib/db/client";
import { redirect } from "next/navigation";
import Link from "next/link";
import { CustomerList } from "./CustomerList";

export default async function CustomersPage() {
  const user = await requireRole(["admin", "director", "sales_engineer"]).catch(() => null);
  if (!user) redirect("/");

  const customers = await db.customer.findMany({
    select: {
      id: true,
      name: true,
      abn: true,
      contactPerson: true,
      email: true,
      phone: true,
      _count: { select: { jobs: true } },
    },
    orderBy: { name: "asc" },
  });

  const rows = customers.map((c) => ({
    id:            c.id,
    name:          c.name,
    abn:           c.abn,
    contactPerson: c.contactPerson,
    email:         c.email,
    phone:         c.phone,
    jobCount:      c._count.jobs,
  }));

  return (
    <AppShell>
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold">Customers</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
              Customer contacts and linked jobs
            </p>
          </div>
          {user.role === "admin" && (
            <Link
              href="/customers/new"
              className="px-4 min-h-[40px] flex items-center rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-semibold text-sm"
            >
              New customer
            </Link>
          )}
        </div>
        <CustomerList customers={rows} />
      </div>
    </AppShell>
  );
}
```

- [ ] **Step 4: Create `src/app/customers/new/page.tsx`**

```typescript
import { AppShell } from "@/components/layout/AppShell";
import { requireRole } from "@/lib/auth/clerk";
import { redirect } from "next/navigation";
import { CustomerForm } from "../CustomerForm";

export default async function NewCustomerPage() {
  const user = await requireRole(["admin"]).catch(() => null);
  if (!user) redirect("/");

  return (
    <AppShell>
      <div className="max-w-lg mx-auto px-4 py-6 space-y-5">
        <div>
          <h1 className="text-xl font-semibold">New customer</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Add a reusable customer record
          </p>
        </div>
        <CustomerForm />
      </div>
    </AppShell>
  );
}
```

- [ ] **Step 5: Run all tests — confirm no regressions**

```bash
pnpm test
```

Expected: All previously passing tests still pass.

- [ ] **Step 6: Commit**

```bash
git add src/app/customers/page.tsx src/app/customers/CustomerList.tsx src/app/customers/CustomerForm.tsx src/app/customers/new/page.tsx
git commit -m "feat: add customer list page, new customer page, and shared CustomerForm"
```

---

### Task 5: Customer Detail Page

**Files:**
- Create: `src/app/customers/[id]/page.tsx`
- Create: `src/app/customers/[id]/CustomerDetail.tsx`

**Interfaces:**
- Consumes: `db.customer.findUnique` with `jobs` include; `CustomerForm` from `../CustomerForm`
- Produces: `/customers/[id]` — contact details, notes, linked jobs table; admin gets an Edit button that swaps in `CustomerForm` inline

- [ ] **Step 1: Create `src/app/customers/[id]/CustomerDetail.tsx`**

```typescript
"use client";

import { useState } from "react";
import Link from "next/link";
import { CustomerForm } from "../CustomerForm";

interface CustomerProps {
  id:            string;
  name:          string;
  abn:           string | null;
  contactPerson: string | null;
  email:         string | null;
  phone:         string | null;
  address:       string | null;
  notes:         string | null;
}

interface JobRow {
  id:           string;
  customerName: string;
  siteName:     string;
  status:       "scheduled" | "active" | "complete" | "cancelled";
  createdAt:    string;
  jobType:      string;
}

interface CustomerDetailProps {
  customer: CustomerProps;
  jobs:     JobRow[];
  canEdit:  boolean;
}

const STATUS_BADGE: Record<string, string> = {
  scheduled: "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300",
  active:    "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  complete:  "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400",
  cancelled: "bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400",
};

export function CustomerDetail({ customer, jobs, canEdit }: CustomerDetailProps) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <div className="space-y-6">
        <h1 className="text-xl font-semibold">{customer.name}</h1>
        <CustomerForm
          initial={customer}
          onSave={() => setEditing(false)}
          onCancel={() => setEditing(false)}
        />
      </div>
    );
  }

  const contactFields = [
    { label: "ABN",            value: customer.abn },
    { label: "Contact person", value: customer.contactPerson },
    { label: "Email",          value: customer.email },
    { label: "Phone",          value: customer.phone },
    { label: "Address",        value: customer.address },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">{customer.name}</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Customer record</p>
        </div>
        {canEdit && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="px-4 min-h-[38px] rounded-lg border border-slate-300 dark:border-slate-600 text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-800 shrink-0"
          >
            Edit
          </button>
        )}
      </div>

      {/* Contact details */}
      <div className="rounded-lg border border-slate-200 dark:border-slate-700 divide-y divide-slate-200 dark:divide-slate-700">
        {contactFields.map(({ label, value }) => (
          <div key={label} className="flex px-4 py-3 text-sm">
            <span className="w-36 text-slate-500 dark:text-slate-400 shrink-0">{label}</span>
            <span className="text-slate-900 dark:text-slate-100 break-all">{value ?? "—"}</span>
          </div>
        ))}
      </div>

      {/* Notes */}
      {customer.notes && (
        <div className="space-y-1.5">
          <h2 className="text-sm font-medium text-slate-700 dark:text-slate-300">Notes</h2>
          <p className="text-sm text-slate-600 dark:text-slate-400 whitespace-pre-wrap bg-slate-50 dark:bg-slate-800/50 rounded-lg px-4 py-3">
            {customer.notes}
          </p>
        </div>
      )}

      {/* Linked jobs */}
      <div className="space-y-2">
        <h2 className="text-sm font-medium text-slate-700 dark:text-slate-300">
          Linked jobs ({jobs.length})
        </h2>
        {jobs.length === 0 && (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            No jobs linked to this customer yet.
          </p>
        )}
        {jobs.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700">
                  {["Site", "Type", "Status", "Created"].map((h) => (
                    <th
                      key={h}
                      className="pb-2 pr-4 text-left text-xs font-medium text-slate-500 dark:text-slate-400 whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {jobs.map((j) => (
                  <tr
                    key={j.id}
                    className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40"
                  >
                    <td className="py-3 pr-4">
                      <Link
                        href={`/jobs/${j.id}`}
                        className="text-amber-600 dark:text-amber-400 hover:underline"
                      >
                        {j.siteName}
                      </Link>
                    </td>
                    <td className="py-3 pr-4 text-slate-500">{j.jobType}</td>
                    <td className="py-3 pr-4">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${STATUS_BADGE[j.status]}`}>
                        {j.status}
                      </span>
                    </td>
                    <td className="py-3 pr-4 text-slate-500">
                      {new Date(j.createdAt).toLocaleDateString("en-AU")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create `src/app/customers/[id]/page.tsx`**

```typescript
import { AppShell } from "@/components/layout/AppShell";
import { requireRole } from "@/lib/auth/clerk";
import { db } from "@/lib/db/client";
import { redirect, notFound } from "next/navigation";
import { CustomerDetail } from "./CustomerDetail";

export default async function CustomerDetailPage({ params }: { params: { id: string } }) {
  const user = await requireRole(["admin", "director", "sales_engineer"]).catch(() => null);
  if (!user) redirect("/");

  const customer = await db.customer.findUnique({
    where: { id: params.id },
    include: {
      jobs: {
        select: {
          id: true, customerName: true, siteName: true,
          status: true, createdAt: true, jobType: true,
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!customer) notFound();

  return (
    <AppShell>
      <div className="max-w-2xl mx-auto px-4 py-6">
        <CustomerDetail
          customer={{
            id:            customer.id,
            name:          customer.name,
            abn:           customer.abn,
            contactPerson: customer.contactPerson,
            email:         customer.email,
            phone:         customer.phone,
            address:       customer.address,
            notes:         customer.notes,
          }}
          jobs={customer.jobs.map((j) => ({
            id:           j.id,
            customerName: j.customerName,
            siteName:     j.siteName,
            status:       j.status as "scheduled" | "active" | "complete" | "cancelled",
            createdAt:    j.createdAt.toISOString(),
            jobType:      j.jobType,
          }))}
          canEdit={user.role === "admin"}
        />
      </div>
    </AppShell>
  );
}
```

- [ ] **Step 3: Run all tests — confirm no regressions**

```bash
pnpm test
```

Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add "src/app/customers/[id]/page.tsx" "src/app/customers/[id]/CustomerDetail.tsx"
git commit -m "feat: add customer detail page with inline edit and linked jobs table"
```

---

### Task 6: NewJobForm — Customer Search-and-Select

**Files:**
- Modify: `src/app/jobs/NewJobForm.tsx`

**Interfaces:**
- Consumes: `GET /api/customers?q=` → `{ id: string; name: string }[]`
- Behaviour: typing 2+ chars triggers a 200ms debounced fetch; selecting a customer locks the name field and sets `customerId`; clicking ✕ clears and returns to free-text; submit sends `customerId` if set, else `customerName`

- [ ] **Step 1: Replace the entire `src/app/jobs/NewJobForm.tsx`**

```typescript
"use client";

import { useState, useTransition, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

interface CustomerOption {
  id:   string;
  name: string;
}

export function NewJobForm({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [jobTypeOptions, setJobTypeOptions] = useState<string[]>([]);
  const [jobTypeSelect, setJobTypeSelect] = useState("");

  // Customer search-and-select
  const [customerQuery, setCustomerQuery]   = useState("");
  const [customerId, setCustomerId]         = useState<string | null>(null);
  const [suggestions, setSuggestions]       = useState<CustomerOption[]>([]);
  const [showDropdown, setShowDropdown]     = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [fields, setFields] = useState({
    siteName:    "",
    siteAddress: "",
    quotedHours: "",
    quotedCost:  "",
    jobType:     "",
    status:      "scheduled" as "scheduled" | "active",
  });

  useEffect(() => {
    fetch("/api/quotes/job-types")
      .then((r) => (r.ok ? r.json() : { jobTypes: [] }))
      .then((d) => setJobTypeOptions(d.jobTypes ?? []));
  }, []);

  // Debounced customer search
  useEffect(() => {
    if (customerId) return;
    if (customerQuery.trim().length < 2) {
      setSuggestions([]);
      setShowDropdown(false);
      return;
    }
    const ctrl  = new AbortController();
    const timer = setTimeout(() => {
      fetch(`/api/customers?q=${encodeURIComponent(customerQuery.trim())}`, { signal: ctrl.signal })
        .then((r) => (r.ok ? r.json() : []))
        .then((data: CustomerOption[]) => {
          setSuggestions(data);
          setShowDropdown(data.length > 0);
        })
        .catch(() => {});
    }, 200);
    return () => { clearTimeout(timer); ctrl.abort(); };
  }, [customerQuery, customerId]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function selectCustomer(option: CustomerOption) {
    setCustomerId(option.id);
    setCustomerQuery(option.name);
    setSuggestions([]);
    setShowDropdown(false);
  }

  function clearCustomer() {
    setCustomerId(null);
    setCustomerQuery("");
    setSuggestions([]);
    setShowDropdown(false);
  }

  function set(key: keyof typeof fields, value: string) {
    setFields((prev) => ({ ...prev, [key]: value }));
  }

  function handleSubmit() {
    const newErrors: Record<string, string> = {};
    if (!customerId && customerQuery.trim().length < 2) newErrors.customer = "Customer name required";
    if (fields.siteName.length < 2)    newErrors.siteName    = "Required";
    if (fields.siteAddress.length < 5) newErrors.siteAddress = "Required";
    const hours = parseFloat(fields.quotedHours);
    if (!fields.quotedHours || isNaN(hours) || hours <= 0)
      newErrors.quotedHours = "Enter hours greater than 0";
    const cost = fields.quotedCost ? parseFloat(fields.quotedCost) : undefined;
    if (fields.quotedCost && (isNaN(cost!) || cost! < 0))
      newErrors.quotedCost = "Enter a valid dollar amount";
    if (!fields.jobType.trim()) newErrors.jobType = "Required";
    if (Object.keys(newErrors).length > 0) { setErrors(newErrors); return; }
    setErrors({});

    startTransition(async () => {
      const body: Record<string, unknown> = {
        ...fields,
        quotedHours: hours,
        quotedCost:  cost,
      };
      if (customerId) {
        body.customerId = customerId;
      } else {
        body.customerName = customerQuery.trim();
      }

      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setErrors({ submit: (data as any).error ?? "Failed to create job." });
        return;
      }
      router.refresh();
      onClose();
    });
  }

  const inputClass =
    "w-full min-h-[44px] rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 text-base";

  return (
    <div className="space-y-4">
      {/* Customer search-and-select */}
      <div className="space-y-1.5" ref={dropdownRef}>
        <label className="text-sm font-medium">Customer name</label>
        <div className="relative">
          <input
            type="text"
            value={customerQuery}
            onChange={(e) => { if (!customerId) setCustomerQuery(e.target.value); }}
            onFocus={() => { if (!customerId && suggestions.length > 0) setShowDropdown(true); }}
            placeholder={customerId ? "" : "Search or type a name…"}
            readOnly={!!customerId}
            className={`${inputClass} pr-10 ${customerId ? "bg-slate-50 dark:bg-slate-800 cursor-default" : ""}`}
          />
          {customerId && (
            <button
              type="button"
              onClick={clearCustomer}
              aria-label="Clear customer"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-lg leading-none"
            >
              ✕
            </button>
          )}
          {showDropdown && (
            <ul className="absolute z-20 mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg max-h-48 overflow-y-auto">
              {suggestions.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => selectCustomer(s)}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-800"
                  >
                    {s.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        {errors.customer && <p className="text-sm text-red-600">{errors.customer}</p>}
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium">Site name</label>
        <input
          type="text"
          value={fields.siteName}
          onChange={(e) => set("siteName", e.target.value)}
          placeholder="North cooling tower"
          className={inputClass}
        />
        {errors.siteName && <p className="text-sm text-red-600">{errors.siteName}</p>}
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium">Site address</label>
        <input
          type="text"
          value={fields.siteAddress}
          onChange={(e) => set("siteAddress", e.target.value)}
          placeholder="123 Main St, Sydney NSW 2000"
          className={inputClass}
        />
        {errors.siteAddress && <p className="text-sm text-red-600">{errors.siteAddress}</p>}
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium">Job type</label>
        <select
          value={jobTypeSelect}
          onChange={(e) => {
            setJobTypeSelect(e.target.value);
            if (e.target.value !== "other") set("jobType", e.target.value);
            else set("jobType", "");
          }}
          className={inputClass}
        >
          <option value="">Select a job type…</option>
          {jobTypeOptions.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
          <option value="other">Other…</option>
        </select>
        {jobTypeSelect === "other" && (
          <input
            type="text"
            value={fields.jobType}
            onChange={(e) => set("jobType", e.target.value)}
            placeholder="Enter job type"
            className={inputClass}
          />
        )}
        {errors.jobType && <p className="text-sm text-red-600">{errors.jobType}</p>}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Quoted hours</label>
          <input
            type="number"
            inputMode="decimal"
            value={fields.quotedHours}
            onChange={(e) => set("quotedHours", e.target.value)}
            placeholder="8"
            className={inputClass}
          />
          {errors.quotedHours && <p className="text-sm text-red-600">{errors.quotedHours}</p>}
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium">
            Quoted cost ($) <span className="font-normal text-slate-400">optional</span>
          </label>
          <input
            type="number"
            inputMode="decimal"
            value={fields.quotedCost}
            onChange={(e) => set("quotedCost", e.target.value)}
            placeholder="1200"
            className={inputClass}
          />
          {errors.quotedCost && <p className="text-sm text-red-600">{errors.quotedCost}</p>}
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium">Status</label>
        <select
          value={fields.status}
          onChange={(e) => set("status", e.target.value as "scheduled" | "active")}
          className={inputClass}
        >
          <option value="scheduled">Scheduled</option>
          <option value="active">Active</option>
        </select>
      </div>

      {errors.submit && <p className="text-sm text-red-600">{errors.submit}</p>}

      <div className="flex gap-3 pt-1">
        <button
          type="button"
          onClick={onClose}
          className="flex-1 min-h-[48px] rounded-lg border border-slate-300 dark:border-slate-600 text-sm font-medium"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={isPending}
          className="flex-1 min-h-[48px] rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-semibold text-sm disabled:opacity-40"
        >
          {isPending ? "Creating…" : "Create job"}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Run all tests — confirm no regressions**

```bash
pnpm test
```

Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/app/jobs/NewJobForm.tsx
git commit -m "feat: replace customerName input in NewJobForm with customer search-and-select"
```

---

### Task 7: Navigation

**Files:**
- Modify: `src/lib/nav-config.ts`

**Interfaces:**
- Produces: "Customers" nav item visible to `admin`, `director`, `sales_engineer`

- [ ] **Step 1: Add `Building2` to the lucide-react import**

In `src/lib/nav-config.ts`, the current import line ends with `Receipt,`. Add `Building2,` after it:

```typescript
import {
  LayoutDashboard,
  Briefcase,
  Clock,
  FileEdit,
  Calendar,
  Users,
  ShieldCheck,
  FileText,
  Settings,
  BarChart2,
  Receipt,
  Building2,
  type LucideIcon,
} from "lucide-react";
```

- [ ] **Step 2: Add the Customers nav item to `navItems`**

After the closing brace of the `Invoices` item (the last item before `];`), add:

```typescript
  {
    label: "Customers",
    href: "/customers",
    icon: Building2,
    description: "Customer contacts and linked jobs",
    visibleTo: ["admin", "director", "sales_engineer"],
    phase: "2",
  },
```

- [ ] **Step 3: Run all tests — confirm no regressions**

```bash
pnpm test
```

Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/lib/nav-config.ts
git commit -m "feat: add Customers nav item (admin, director, sales_engineer)"
```
