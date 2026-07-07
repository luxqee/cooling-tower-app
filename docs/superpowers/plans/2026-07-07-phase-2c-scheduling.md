# Phase 2c — Scheduling Calendar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the existing list-based schedule view with a week-view calendar grid (desktop) where service managers drag-and-drop technicians onto jobs by day, and technicians see their own today-card on mobile.

**Architecture:** Upgrade the existing `/schedule` page and `/api/schedule/assignments` routes. Add `endDate` and `createdAt` to the `Assignment` Prisma model for multi-day support. New `ScheduleGrid` client component uses `@dnd-kit/core` for drag-and-drop. Technicians get a read-only `TodayCard`. The existing `ScheduleClient.tsx` is deleted.

**Tech Stack:** Next.js 14 App Router, Prisma 7 + Neon, `@dnd-kit/core` + `@dnd-kit/utilities`, Tailwind CSS.

## Global Constraints

- Desktop calendar (≥768px): full week grid, drag-and-drop, create/delete assignments
- Mobile (<768px): read-only; technicians see today-card; managers see a date-grouped list (no DnD)
- Technicians see **only their own** assignments
- Service managers, directors, and admins see **all technicians**
- `@dnd-kit/core` is the drag-and-drop library — do not use `react-beautiful-dnd` or `@hello-pangea/dnd`
- Conflict detection warns but does not block — 201 response with `warning` field
- Week navigation via URL query param `?week=YYYY-MM-DD` (Monday of the target week)
- Run `pnpm` (not npm/yarn) for all package operations
- Test runner: `pnpm vitest run` (not `jest`)
- After every Prisma schema change run: `pnpm prisma migrate dev --name <name>`

---

## File Structure

**New files:**
- `src/lib/schedule/dateUtils.ts` — pure date helpers
- `src/lib/schedule/conflictDetection.ts` — overlap logic extracted for testability
- `src/lib/schedule/__tests__/dateUtils.test.ts`
- `src/lib/schedule/__tests__/conflictDetection.test.ts`
- `src/app/api/schedule/__tests__/assignments.test.ts`
- `src/app/schedule/TodayCard.tsx` — technician read-only view
- `src/app/schedule/AssignNewModal.tsx` — assignment creation modal
- `src/app/schedule/ScheduleGrid.tsx` — manager week grid with DnD

**Modified files:**
- `prisma/schema.prisma` — add `endDate DateTime?` and `createdAt DateTime @default(now())` to `Assignment`
- `src/app/api/schedule/assignments/route.ts` — rewrite GET + POST
- `src/app/api/schedule/assignments/[id]/route.ts` — add PATCH to existing DELETE
- `src/app/schedule/page.tsx` — rewrite for role-split + week navigation
- `src/lib/nav-config.ts` — add `technician` to Schedule's `visibleTo`

**Deleted files:**
- `src/app/schedule/ScheduleClient.tsx` — replaced by `ScheduleGrid.tsx` + `TodayCard.tsx`

---

## Task 1: Date utilities + conflict detection + unit tests

**Files:**
- Create: `src/lib/schedule/dateUtils.ts`
- Create: `src/lib/schedule/conflictDetection.ts`
- Create: `src/lib/schedule/__tests__/dateUtils.test.ts`
- Create: `src/lib/schedule/__tests__/conflictDetection.test.ts`

**Interfaces:**
- Produces:
  - `weekStart(date: Date): Date` — Monday 00:00:00 of the week containing `date`
  - `weekDays(monday: Date): Date[]` — 7 Date objects Mon–Sun
  - `formatShortDate(date: Date): string` — `"Mon 7 Jul"` (en-AU locale)
  - `toDateString(date: Date): string` — `"YYYY-MM-DD"`
  - `isSameDay(a: Date, b: Date): boolean`
  - `detectConflict(existing: DateRange, incoming: DateRange): boolean`
  - `interface DateRange { startDate: Date; endDate: Date }`

- [ ] **Step 1: Write failing tests for dateUtils**

Create `src/lib/schedule/__tests__/dateUtils.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { weekStart, weekDays, formatShortDate, toDateString, isSameDay } from "../dateUtils";

describe("weekStart", () => {
  it("returns Monday for a Monday", () => {
    // 2026-07-07 is a Monday
    const result = weekStart(new Date("2026-07-07T00:00:00"));
    expect(toDateString(result)).toBe("2026-07-07");
  });

  it("returns Monday for a Wednesday", () => {
    const result = weekStart(new Date("2026-07-09T12:00:00"));
    expect(toDateString(result)).toBe("2026-07-07");
  });

  it("returns previous Monday for a Sunday", () => {
    // 2026-07-12 is Sunday
    const result = weekStart(new Date("2026-07-12T08:00:00"));
    expect(toDateString(result)).toBe("2026-07-06");
  });

  it("returns time set to 00:00:00", () => {
    const result = weekStart(new Date("2026-07-09T15:30:00"));
    expect(result.getHours()).toBe(0);
    expect(result.getMinutes()).toBe(0);
    expect(result.getSeconds()).toBe(0);
  });
});

describe("weekDays", () => {
  it("returns exactly 7 days", () => {
    const monday = new Date("2026-07-07");
    expect(weekDays(monday)).toHaveLength(7);
  });

  it("starts on Monday (getDay() === 1) and ends on Sunday (getDay() === 0)", () => {
    const monday = new Date("2026-07-07");
    const days = weekDays(monday);
    expect(days[0].getDay()).toBe(1);
    expect(days[6].getDay()).toBe(0);
  });

  it("days are consecutive", () => {
    const monday = new Date("2026-07-07");
    const days = weekDays(monday);
    for (let i = 1; i < days.length; i++) {
      expect(days[i].getDate() - days[i - 1].getDate()).toBe(1);
    }
  });
});

describe("isSameDay", () => {
  it("returns true for same day same time", () => {
    expect(isSameDay(new Date("2026-07-07T09:00:00"), new Date("2026-07-07T09:00:00"))).toBe(true);
  });

  it("returns true for same day different times", () => {
    expect(isSameDay(new Date("2026-07-07T01:00:00"), new Date("2026-07-07T23:59:00"))).toBe(true);
  });

  it("returns false for adjacent days", () => {
    expect(isSameDay(new Date("2026-07-07T23:59:59"), new Date("2026-07-08T00:00:00"))).toBe(false);
  });
});

describe("toDateString", () => {
  it("returns YYYY-MM-DD", () => {
    expect(toDateString(new Date("2026-07-07T15:00:00"))).toBe("2026-07-07");
  });
});

describe("formatShortDate", () => {
  it("returns short weekday + day + month", () => {
    // 2026-07-07 is a Tuesday... wait, let me check. 
    // Jan 1 2026 is Thursday. So July 7 2026: 
    // Jan has 31 days, Feb 28, Mar 31, Apr 30, May 31, Jun 30 = 181 days into year
    // July 7 = day 188. Day 1 (Jan 1) = Thursday (day 4). 
    // (188 - 1) % 7 = 187 % 7 = 0. Thursday + 0 = Thursday? No:
    // Jan 1 = Thursday = day index 4 (0=Sun). (4 + 187) % 7 = 191 % 7 = 2 = Tuesday.
    // So July 7 2026 is a Tuesday.
    const result = formatShortDate(new Date("2026-07-07T12:00:00"));
    expect(result).toMatch(/Tue/i);
    expect(result).toMatch(/7/);
    expect(result).toMatch(/Jul/i);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /path/to/repo && pnpm vitest run src/lib/schedule/__tests__/dateUtils.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement dateUtils**

Create `src/lib/schedule/dateUtils.ts`:

```typescript
export function weekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay(); // 0=Sun, 1=Mon, ...6=Sat
  const diff = day === 0 ? -6 : 1 - day; // shift to Monday
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function weekDays(monday: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(d.getDate() + i);
    return d;
  });
}

export function formatShortDate(date: Date): string {
  return date.toLocaleDateString("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

export function toDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}
```

Note: `toDateString` uses local-time components (getFullYear/getMonth/getDate) so it is consistent with `isSameDay`.

- [ ] **Step 4: Write failing tests for conflictDetection**

Create `src/lib/schedule/__tests__/conflictDetection.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { detectConflict } from "../conflictDetection";

function range(start: string, end: string) {
  return { startDate: new Date(start), endDate: new Date(end) };
}

describe("detectConflict", () => {
  it("returns false when existing ends before incoming starts", () => {
    expect(detectConflict(range("2026-07-07", "2026-07-08"), range("2026-07-09", "2026-07-10"))).toBe(false);
  });

  it("returns false when existing starts after incoming ends", () => {
    expect(detectConflict(range("2026-07-11", "2026-07-12"), range("2026-07-07", "2026-07-09"))).toBe(false);
  });

  it("returns true when ranges overlap partially", () => {
    expect(detectConflict(range("2026-07-07", "2026-07-09"), range("2026-07-08", "2026-07-10"))).toBe(true);
  });

  it("returns true when one range is contained in the other", () => {
    expect(detectConflict(range("2026-07-07", "2026-07-11"), range("2026-07-08", "2026-07-09"))).toBe(true);
  });

  it("returns true for same single-day assignment", () => {
    expect(detectConflict(range("2026-07-07", "2026-07-07"), range("2026-07-07", "2026-07-07"))).toBe(true);
  });

  it("returns false when end of existing equals start of incoming (adjacent, non-overlapping)", () => {
    // A ends July 8, B starts July 9 — no overlap
    expect(detectConflict(range("2026-07-07", "2026-07-08"), range("2026-07-09", "2026-07-09"))).toBe(false);
  });
});
```

- [ ] **Step 5: Implement conflictDetection**

Create `src/lib/schedule/conflictDetection.ts`:

```typescript
export interface DateRange {
  startDate: Date;
  endDate: Date; // same as startDate for single-day
}

export function detectConflict(existing: DateRange, incoming: DateRange): boolean {
  return existing.startDate <= incoming.endDate && existing.endDate >= incoming.startDate;
}
```

- [ ] **Step 6: Run all new unit tests**

```bash
pnpm vitest run src/lib/schedule/__tests__/
```

Expected: All tests PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/schedule/
git commit -m "feat: add schedule date utilities and conflict detection helpers"
```

---

## Task 2: Prisma schema migration

**Files:**
- Modify: `prisma/schema.prisma`

**Interfaces:**
- Produces: `Assignment` model with `endDate DateTime?` and `createdAt DateTime @default(now())`
- The existing `@default(now())` on `assignedDate` is removed (dates are always provided explicitly)

- [ ] **Step 1: Update Assignment model in schema**

Open `prisma/schema.prisma`. Find the `Assignment` model and replace it with:

```prisma
model Assignment {
  id           String    @id @default(uuid())
  userId       String
  jobId        String
  assignedDate DateTime
  endDate      DateTime?
  createdAt    DateTime  @default(now())

  user User @relation(fields: [userId], references: [id])
  job  Job  @relation(fields: [jobId], references: [id])

  @@unique([userId, jobId, assignedDate])
  @@index([assignedDate])
}
```

The existing model to replace:
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

- [ ] **Step 2: Run migration**

```bash
pnpm prisma migrate dev --name assignment_end_date
```

Expected output includes: `✔ Generated Prisma Client` and migration file created in `prisma/migrations/`.

- [ ] **Step 3: Verify generated client has endDate**

```bash
grep -A 5 "endDate" node_modules/.prisma/client/index.d.ts | head -20
```

Expected: `endDate` appears in the Assignment type.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat: add endDate and createdAt to Assignment model"
```

---

## Task 3: GET + POST route upgrades + API tests

**Files:**
- Modify: `src/app/api/schedule/assignments/route.ts` (full rewrite)
- Create: `src/app/api/schedule/__tests__/assignments.test.ts`

**Interfaces:**
- Consumes: `detectConflict` from `@/lib/schedule/conflictDetection`, `weekStart` from `@/lib/schedule/dateUtils`
- Consumes: `getSessionUser`, `requireRole` from `@/lib/auth/clerk`
- Consumes: `sendPushToUser` from `@/lib/push/vapid`
- Consumes: `db` from `@/lib/db/client`

**GET response shape:**
```typescript
{
  id: string;
  assignedDate: string;   // ISO datetime
  endDate: string | null; // ISO datetime or null
  user: { id: string; name: string; role: string };
  job:  { id: string; customerName: string; siteName: string; siteAddress: string; status: string };
}[]
```

**POST request/response:**
- Request body: `{ userId: string; jobId: string; assignedDate: string; endDate?: string }`
- Response on success (201): assignment object + optional `warning` + optional `conflicts` array
- Response on 409 (unique constraint): `{ error: "Technician already assigned to this job on that date." }`

- [ ] **Step 1: Write failing API tests**

Create `src/app/api/schedule/__tests__/assignments.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/clerk", () => ({
  getSessionUser: vi.fn(),
  requireRole: vi.fn(),
}));
vi.mock("@/lib/push/vapid", () => ({ sendPushToUser: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/db/client", () => ({
  db: {
    assignment: {
      findMany: vi.fn(),
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    user: { findUnique: vi.fn() },
    job:  { findUnique: vi.fn() },
  },
}));

import { getSessionUser, requireRole } from "@/lib/auth/clerk";
import { db } from "@/lib/db/client";
import { GET, POST } from "../route";

const MANAGER = { id: "m1", clerkId: "cm1", name: "Boss", email: "b@b.com", role: "service_manager" as const, isActive: true };
const TECH    = { id: "t1", clerkId: "ct1", name: "Jake", email: "j@j.com", role: "technician" as const, isActive: true };
const TECH2   = { id: "t2", clerkId: "ct2", name: "Sam",  email: "s@s.com", role: "technician" as const, isActive: true };
const JOB_ID  = "11111111-1111-4111-8111-111111111111";
const USER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const mockAssignment = {
  id: "a1",
  assignedDate: new Date("2026-07-07T00:00:00.000Z"),
  endDate: null,
  user: { id: USER_ID, name: "Jake", role: "technician" },
  job: { id: JOB_ID, customerName: "Rio Tinto", siteName: "Weipa", siteAddress: "123 Mine Rd", status: "active" },
};

function makeGET(week?: string) {
  const url = week
    ? `http://localhost/api/schedule/assignments?week=${week}`
    : "http://localhost/api/schedule/assignments";
  return new Request(url);
}

function makePOST(body: unknown) {
  return new Request("http://localhost/api/schedule/assignments", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => vi.clearAllMocks());

describe("GET /api/schedule/assignments", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null);
    const res = await GET(makeGET());
    expect(res.status).toBe(401);
  });

  it("returns assignments for the requested week for a manager", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(MANAGER);
    vi.mocked(db.assignment.findMany).mockResolvedValue([mockAssignment] as any);

    const res = await GET(makeGET("2026-07-07"));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveLength(1);
    expect(data[0].endDate).toBeNull();
    expect(data[0].job.siteAddress).toBe("123 Mine Rd");
  });

  it("technician query includes userId filter", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(TECH);
    vi.mocked(db.assignment.findMany).mockResolvedValue([]);

    await GET(makeGET("2026-07-07"));
    const callArg = vi.mocked(db.assignment.findMany).mock.calls[0][0] as any;
    expect(callArg.where.userId).toBe(TECH.id);
  });

  it("manager query does NOT include userId filter", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(MANAGER);
    vi.mocked(db.assignment.findMany).mockResolvedValue([]);

    await GET(makeGET("2026-07-07"));
    const callArg = vi.mocked(db.assignment.findMany).mock.calls[0][0] as any;
    expect(callArg.where.userId).toBeUndefined();
  });
});

describe("POST /api/schedule/assignments", () => {
  const validBody = {
    userId: USER_ID,
    jobId: JOB_ID,
    assignedDate: "2026-07-07T00:00:00.000Z",
  };

  it("returns 401 when not a manager/admin/director", async () => {
    vi.mocked(requireRole).mockRejectedValue(new Error("Forbidden"));
    const res = await POST(makePOST(validBody));
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid body (missing userId)", async () => {
    vi.mocked(requireRole).mockResolvedValue(MANAGER as any);
    const res = await POST(makePOST({ jobId: JOB_ID, assignedDate: "2026-07-07T00:00:00.000Z" }));
    expect(res.status).toBe(400);
  });

  it("creates assignment and returns 201", async () => {
    vi.mocked(requireRole).mockResolvedValue(MANAGER as any);
    vi.mocked(db.assignment.findMany).mockResolvedValue([]); // no conflicts
    vi.mocked(db.assignment.create).mockResolvedValue({
      ...mockAssignment,
      job: { ...mockAssignment.job, siteAddress: "123 Mine Rd" },
    } as any);
    vi.mocked(db.user.findUnique).mockResolvedValue({ pushSubscriptions: [] } as any);

    const res = await POST(makePOST(validBody));
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.id).toBe("a1");
    expect(data.warning).toBeUndefined();
  });

  it("returns 201 with warning when overlap detected", async () => {
    vi.mocked(requireRole).mockResolvedValue(MANAGER as any);
    vi.mocked(db.assignment.findMany).mockResolvedValue([
      {
        id: "existing1",
        assignedDate: new Date("2026-07-07T00:00:00.000Z"),
        endDate: null,
        job: { customerName: "BHP", siteName: "Site A" },
      },
    ] as any);
    vi.mocked(db.assignment.create).mockResolvedValue({
      ...mockAssignment,
      job: { ...mockAssignment.job, siteAddress: "123 Mine Rd" },
    } as any);
    vi.mocked(db.user.findUnique).mockResolvedValue({ pushSubscriptions: [] } as any);

    const res = await POST(makePOST(validBody));
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.warning).toMatch(/overlapping/i);
    expect(data.conflicts).toHaveLength(1);
  });

  it("sends push notification to technician", async () => {
    const { sendPushToUser } = await import("@/lib/push/vapid");
    vi.mocked(requireRole).mockResolvedValue(MANAGER as any);
    vi.mocked(db.assignment.findMany).mockResolvedValue([]);
    vi.mocked(db.assignment.create).mockResolvedValue({
      ...mockAssignment,
      job: { ...mockAssignment.job, siteAddress: "123 Mine Rd" },
    } as any);
    vi.mocked(db.user.findUnique).mockResolvedValue({
      pushSubscriptions: [{ endpoint: "https://fcm.example", p256dh: "key", auth: "auth" }],
    } as any);

    await POST(makePOST(validBody));
    expect(sendPushToUser).toHaveBeenCalledWith(
      expect.objectContaining({ endpoint: "https://fcm.example" }),
      expect.objectContaining({ title: "New job assignment", url: "/schedule" })
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm vitest run src/app/api/schedule/__tests__/assignments.test.ts
```

Expected: FAIL — route doesn't export expected behaviour yet.

- [ ] **Step 3: Rewrite the GET + POST route**

Replace `src/app/api/schedule/assignments/route.ts` entirely:

```typescript
import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser, requireRole } from "@/lib/auth/clerk";
import { db } from "@/lib/db/client";
import { weekStart } from "@/lib/schedule/dateUtils";
import { detectConflict } from "@/lib/schedule/conflictDetection";
import { sendPushToUser } from "@/lib/push/vapid";

export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const weekParam = searchParams.get("week");
  const monday = weekParam ? weekStart(new Date(weekParam)) : weekStart(new Date());
  const weekEnd = new Date(monday);
  weekEnd.setDate(weekEnd.getDate() + 7);

  const assignments = await db.assignment.findMany({
    where: {
      assignedDate: { gte: monday, lt: weekEnd },
      ...(user.role === "technician" ? { userId: user.id } : {}),
    },
    include: {
      user: { select: { id: true, name: true, role: true } },
      job: { select: { id: true, customerName: true, siteName: true, siteAddress: true, status: true } },
    },
    orderBy: [{ assignedDate: "asc" }, { user: { name: "asc" } }],
  });

  return NextResponse.json(
    assignments.map((a) => ({
      id: a.id,
      assignedDate: a.assignedDate.toISOString(),
      endDate: a.endDate?.toISOString() ?? null,
      user: a.user,
      job: a.job,
    }))
  );
}

const createSchema = z.object({
  userId: z.string().uuid(),
  jobId: z.string().uuid(),
  assignedDate: z.string().datetime(),
  endDate: z.string().datetime().optional(),
});

export async function POST(req: Request) {
  const user = await requireRole(["director", "service_manager", "admin"]).catch(() => null);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  }

  const { userId, jobId, assignedDate, endDate } = parsed.data;

  const startDate = new Date(assignedDate);
  startDate.setHours(0, 0, 0, 0);
  const endDateObj = endDate ? new Date(endDate) : new Date(startDate);
  if (endDate) endDateObj.setHours(0, 0, 0, 0);

  // Conflict detection: existing assignments for this technician
  const existingAssignments = await db.assignment.findMany({
    where: { userId },
    select: { id: true, assignedDate: true, endDate: true },
  });

  const conflicts = existingAssignments.filter((a) =>
    detectConflict(
      { startDate: a.assignedDate, endDate: a.endDate ?? a.assignedDate },
      { startDate, endDate: endDateObj }
    )
  );

  try {
    const assignment = await db.assignment.create({
      data: { userId, jobId, assignedDate: startDate, endDate: endDate ? endDateObj : null },
      include: {
        user: { select: { id: true, name: true, role: true } },
        job: { select: { id: true, customerName: true, siteName: true, siteAddress: true, status: true } },
      },
    });

    // Push notification to technician (fire-and-forget)
    const techWithSubs = await db.user.findUnique({
      where: { id: userId },
      include: { pushSubscriptions: true },
    });
    if (techWithSubs?.pushSubscriptions?.length) {
      const dateLabel = startDate.toLocaleDateString("en-AU", {
        weekday: "short",
        day: "numeric",
        month: "short",
      });
      await Promise.allSettled(
        techWithSubs.pushSubscriptions.map((sub) =>
          sendPushToUser(sub, {
            title: "New job assignment",
            body: `${assignment.job.customerName} — ${assignment.job.siteName}, ${dateLabel}`,
            url: "/schedule",
          })
        )
      );
    }

    const responseBody: Record<string, unknown> = {
      id: assignment.id,
      assignedDate: assignment.assignedDate.toISOString(),
      endDate: assignment.endDate?.toISOString() ?? null,
      user: assignment.user,
      job: assignment.job,
    };

    if (conflicts.length > 0) {
      responseBody.warning = "Technician already assigned on overlapping dates";
      responseBody.conflicts = conflicts.map((c) => ({
        id: c.id,
        assignedDate: c.assignedDate.toISOString(),
        endDate: c.endDate?.toISOString() ?? null,
      }));
    }

    return NextResponse.json(responseBody, { status: 201 });
  } catch (err: unknown) {
    if ((err as { code?: string }).code === "P2002") {
      return NextResponse.json(
        { error: "Technician already assigned to this job on that date." },
        { status: 409 }
      );
    }
    throw err;
  }
}
```

- [ ] **Step 4: Run tests**

```bash
pnpm vitest run src/app/api/schedule/__tests__/assignments.test.ts
```

Expected: All GET and POST tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/schedule/assignments/route.ts src/app/api/schedule/__tests__/assignments.test.ts
git commit -m "feat: upgrade schedule GET/POST — week param, conflict detection, push notification"
```

---

## Task 4: PATCH route + tests

**Files:**
- Modify: `src/app/api/schedule/assignments/[id]/route.ts` (add PATCH to existing DELETE)
- Modify: `src/app/api/schedule/__tests__/assignments.test.ts` (append PATCH tests)

**Interfaces:**
- Consumes: `requireRole` from `@/lib/auth/clerk`, `db` from `@/lib/db/client`
- PATCH body: `{ assignedDate?: string; endDate?: string | null }`
- PATCH response: same shape as POST (assignment object with `endDate`)

**Multi-day shift rule:** If the assignment has an `endDate` and `assignedDate` is being changed, shift `endDate` by the same delta (in milliseconds) to preserve the duration.

- [ ] **Step 1: Append PATCH tests to the existing test file**

Open `src/app/api/schedule/__tests__/assignments.test.ts` and append after the existing `describe` blocks:

```typescript
// --- PATCH route ---
// Import PATCH from the [id] route
import { PATCH, DELETE as DELETE_HANDLER } from "../../assignments/[id]/route";

const ASSIGNMENT_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function makePATCH(id: string, body: unknown) {
  return new Request(`http://localhost/api/schedule/assignments/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("PATCH /api/schedule/assignments/[id]", () => {
  const existingAssignment = {
    id: ASSIGNMENT_ID,
    assignedDate: new Date("2026-07-07T00:00:00.000Z"),
    endDate: null,
  };

  it("returns 401 when not a manager", async () => {
    vi.mocked(requireRole).mockRejectedValue(new Error("Forbidden"));
    const res = await PATCH(makePATCH(ASSIGNMENT_ID, { assignedDate: "2026-07-08T00:00:00.000Z" }), {
      params: { id: ASSIGNMENT_ID },
    });
    expect(res.status).toBe(401);
  });

  it("returns 404 when assignment not found", async () => {
    vi.mocked(requireRole).mockResolvedValue(MANAGER as any);
    vi.mocked(db.assignment.findUnique).mockResolvedValue(null);
    const res = await PATCH(makePATCH(ASSIGNMENT_ID, { assignedDate: "2026-07-08T00:00:00.000Z" }), {
      params: { id: ASSIGNMENT_ID },
    });
    expect(res.status).toBe(404);
  });

  it("updates assignedDate correctly", async () => {
    vi.mocked(requireRole).mockResolvedValue(MANAGER as any);
    vi.mocked(db.assignment.findUnique).mockResolvedValue(existingAssignment as any);
    vi.mocked(db.assignment.update).mockResolvedValue({
      ...mockAssignment,
      assignedDate: new Date("2026-07-08T00:00:00.000Z"),
      endDate: null,
      job: { ...mockAssignment.job, siteAddress: "123 Mine Rd" },
    } as any);

    const res = await PATCH(makePATCH(ASSIGNMENT_ID, { assignedDate: "2026-07-08T00:00:00.000Z" }), {
      params: { id: ASSIGNMENT_ID },
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.assignedDate).toContain("2026-07-08");
  });

  it("preserves multi-day duration when shifting assignedDate", async () => {
    // Assignment: Mon 7 Jul → Wed 9 Jul (3 days). Move to Tue 8 Jul → Thu 10 Jul.
    vi.mocked(requireRole).mockResolvedValue(MANAGER as any);
    vi.mocked(db.assignment.findUnique).mockResolvedValue({
      ...existingAssignment,
      assignedDate: new Date("2026-07-07T00:00:00.000Z"),
      endDate: new Date("2026-07-09T00:00:00.000Z"),
    } as any);

    const expectedNewEnd = new Date("2026-07-10T00:00:00.000Z");
    vi.mocked(db.assignment.update).mockResolvedValue({
      ...mockAssignment,
      assignedDate: new Date("2026-07-08T00:00:00.000Z"),
      endDate: expectedNewEnd,
      job: { ...mockAssignment.job, siteAddress: "123 Mine Rd" },
    } as any);

    const res = await PATCH(makePATCH(ASSIGNMENT_ID, { assignedDate: "2026-07-08T00:00:00.000Z" }), {
      params: { id: ASSIGNMENT_ID },
    });
    expect(res.status).toBe(200);

    const updateCall = vi.mocked(db.assignment.update).mock.calls[0][0] as any;
    // endDate should have shifted by 1 day (same delta as assignedDate shift)
    const updatedEnd: Date = updateCall.data.endDate;
    expect(updatedEnd.toISOString().slice(0, 10)).toBe("2026-07-10");
  });
});
```

- [ ] **Step 2: Run PATCH tests to verify they fail**

```bash
pnpm vitest run src/app/api/schedule/__tests__/assignments.test.ts
```

Expected: PATCH tests FAIL — PATCH not exported from route yet.

- [ ] **Step 3: Add PATCH to the [id] route**

Replace `src/app/api/schedule/assignments/[id]/route.ts` entirely:

```typescript
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth/clerk";
import { db } from "@/lib/db/client";

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const user = await requireRole(["director", "service_manager", "admin"]).catch(() => null);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await db.assignment.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}

const patchSchema = z.object({
  assignedDate: z.string().datetime().optional(),
  endDate: z.string().datetime().nullable().optional(),
});

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const user = await requireRole(["director", "service_manager", "admin"]).catch(() => null);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  }

  const existing = await db.assignment.findUnique({ where: { id: params.id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const data: { assignedDate?: Date; endDate?: Date | null } = {};

  if (parsed.data.assignedDate !== undefined) {
    const newStart = new Date(parsed.data.assignedDate);
    newStart.setHours(0, 0, 0, 0);
    data.assignedDate = newStart;

    // Shift endDate by the same delta to preserve multi-day duration
    if (existing.endDate) {
      const delta = newStart.getTime() - existing.assignedDate.getTime();
      data.endDate = new Date(existing.endDate.getTime() + delta);
    }
  }

  // Explicit endDate in body overrides the auto-shifted one
  if (parsed.data.endDate !== undefined) {
    if (parsed.data.endDate === null) {
      data.endDate = null;
    } else {
      const d = new Date(parsed.data.endDate);
      d.setHours(0, 0, 0, 0);
      data.endDate = d;
    }
  }

  const updated = await db.assignment.update({
    where: { id: params.id },
    data,
    include: {
      user: { select: { id: true, name: true, role: true } },
      job: { select: { id: true, customerName: true, siteName: true, siteAddress: true, status: true } },
    },
  });

  return NextResponse.json({
    id: updated.id,
    assignedDate: updated.assignedDate.toISOString(),
    endDate: updated.endDate?.toISOString() ?? null,
    user: updated.user,
    job: updated.job,
  });
}
```

- [ ] **Step 4: Run all schedule tests**

```bash
pnpm vitest run src/app/api/schedule/__tests__/assignments.test.ts
```

Expected: All tests PASS (GET, POST, and PATCH).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/schedule/assignments/[id]/route.ts src/app/api/schedule/__tests__/assignments.test.ts
git commit -m "feat: add PATCH route for moving assignments, with multi-day duration preservation"
```

---

## Task 5: TodayCard component

**Files:**
- Create: `src/app/schedule/TodayCard.tsx`

**Interfaces:**
- Consumes: `cn` from `@/lib/utils/cn`, `Link` from `next/link`, `Clock` from `lucide-react`
- Produces: `TodayCard({ assignments, todayLabel })` — exported client component
- Props:
  ```typescript
  interface TodayCardAssignment {
    id: string;
    assignedDate: string;
    endDate: string | null;
    job: { id: string; customerName: string; siteName: string; siteAddress: string; status: string };
  }
  interface TodayCardProps {
    assignments: TodayCardAssignment[];
    todayLabel: string; // e.g. "Today — Tuesday 7 July"
  }
  ```

- [ ] **Step 1: Create TodayCard.tsx**

Create `src/app/schedule/TodayCard.tsx`:

```typescript
"use client";

import Link from "next/link";
import { Clock } from "lucide-react";
import { cn } from "@/lib/utils/cn";

interface TodayCardAssignment {
  id: string;
  assignedDate: string;
  endDate: string | null;
  job: {
    id: string;
    customerName: string;
    siteName: string;
    siteAddress: string;
    status: string;
  };
}

interface TodayCardProps {
  assignments: TodayCardAssignment[];
  todayLabel: string;
}

export function TodayCard({ assignments, todayLabel }: TodayCardProps) {
  if (assignments.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-5 py-8 text-center space-y-2">
        <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">{todayLabel}</p>
        <p className="text-slate-400 dark:text-slate-500 text-sm">No jobs scheduled for today</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">{todayLabel}</p>
      {assignments.map((a) => {
        const isInactive = a.job.status === "complete" || a.job.status === "cancelled";
        return (
          <div
            key={a.id}
            className={cn(
              "rounded-2xl border px-5 py-5 space-y-4",
              isInactive
                ? "border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50"
                : "border-amber-200 dark:border-amber-700/50 bg-white dark:bg-slate-800"
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-0.5">
                <p className="font-semibold">{a.job.customerName}</p>
                <p className="text-sm text-slate-600 dark:text-slate-300">{a.job.siteName}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">{a.job.siteAddress}</p>
              </div>
              {isInactive && (
                <span className="shrink-0 text-xs font-medium px-2 py-0.5 rounded-full bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300 capitalize">
                  {a.job.status}
                </span>
              )}
            </div>
            {!isInactive && (
              <Link
                href="/time-tracking"
                className="flex items-center justify-center gap-2 min-h-[44px] w-full rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-semibold text-sm transition-colors"
              >
                <Clock className="w-4 h-4" />
                Clock In →
              </Link>
            )}
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Run the full test suite to verify no regressions**

```bash
pnpm vitest run
```

Expected: All tests pass (TodayCard has no unit tests — it's a pure presentational component; regressions from import errors would show here).

- [ ] **Step 3: Commit**

```bash
git add src/app/schedule/TodayCard.tsx
git commit -m "feat: add TodayCard component for technician schedule view"
```

---

## Task 6: Install @dnd-kit, AssignNewModal, ScheduleGrid

**Files:**
- Create: `src/app/schedule/AssignNewModal.tsx`
- Create: `src/app/schedule/ScheduleGrid.tsx`

**Interfaces:**
- Consumes: `@dnd-kit/core` (`DndContext`, `DragEndEvent`, `useDraggable`, `useDroppable`, `PointerSensor`, `TouchSensor`, `useSensor`, `useSensors`)
- Consumes: `weekDays`, `formatShortDate`, `toDateString`, `isSameDay` from `@/lib/schedule/dateUtils`
- Consumes: `cn` from `@/lib/utils/cn`, `useRouter` from `next/navigation`
- Produces: `AssignNewModal({ prefilledUserId, prefilledDate, jobs, onClose, onCreated, onConflict })` — client component
- Produces: `ScheduleGrid({ assignments, technicians, jobs, weekStartDate })` — client component

**AssignNewModal Props:**
```typescript
interface AssignNewModalProps {
  prefilledUserId: string;
  prefilledDate: string;    // YYYY-MM-DD
  jobs: { id: string; customerName: string; siteName: string }[];
  onClose: () => void;
  onCreated: (assignment: ScheduleAssignment) => void;
  onConflict: (warning: string) => void;
}
```

**ScheduleGrid Props:**
```typescript
interface Technician { id: string; name: string }
interface ScheduleAssignment {
  id: string;
  assignedDate: string;
  endDate: string | null;
  user: { id: string; name: string; role: string };
  job: { id: string; customerName: string; siteName: string; siteAddress: string; status: string };
}
interface ScheduleGridProps {
  assignments: ScheduleAssignment[];
  technicians: Technician[];
  jobs: { id: string; customerName: string; siteName: string }[];
  weekStartDate: string; // YYYY-MM-DD (Monday)
}
```

- [ ] **Step 1: Install @dnd-kit**

```bash
pnpm add @dnd-kit/core @dnd-kit/utilities
```

Expected: packages added to `dependencies` in `package.json`.

- [ ] **Step 2: Create AssignNewModal.tsx**

Create `src/app/schedule/AssignNewModal.tsx`:

```typescript
"use client";

import { useState, useTransition } from "react";
import { X } from "lucide-react";

interface Job {
  id: string;
  customerName: string;
  siteName: string;
}

interface ScheduleAssignment {
  id: string;
  assignedDate: string;
  endDate: string | null;
  user: { id: string; name: string; role: string };
  job: { id: string; customerName: string; siteName: string; siteAddress: string; status: string };
}

interface AssignNewModalProps {
  prefilledUserId: string;
  prefilledDate: string; // YYYY-MM-DD
  jobs: Job[];
  onClose: () => void;
  onCreated: (assignment: ScheduleAssignment) => void;
  onConflict: (warning: string) => void;
}

const sel =
  "w-full min-h-[44px] rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 text-base";

export function AssignNewModal({
  prefilledUserId,
  prefilledDate,
  jobs,
  onClose,
  onCreated,
  onConflict,
}: AssignNewModalProps) {
  const [jobId, setJobId] = useState("");
  const [endDate, setEndDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit() {
    if (!jobId) {
      setError("Select a job.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const body: Record<string, string> = {
        userId: prefilledUserId,
        jobId,
        assignedDate: new Date(prefilledDate).toISOString(),
      };
      if (endDate) body.endDate = new Date(endDate).toISOString();

      const res = await fetch("/api/schedule/assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to create assignment.");
        return;
      }
      if (data.warning) {
        onConflict(data.warning);
      }
      onCreated(data as ScheduleAssignment);
      onClose();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40">
      <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 p-6 space-y-4 shadow-xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Assign job</h2>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Start date</label>
            <input
              type="date"
              value={prefilledDate}
              readOnly
              className={sel + " opacity-60 cursor-default"}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">End date <span className="font-normal text-slate-400">(optional — for multi-day)</span></label>
            <input
              type="date"
              value={endDate}
              min={prefilledDate}
              onChange={(e) => setEndDate(e.target.value)}
              className={sel}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Job</label>
            <select
              value={jobId}
              onChange={(e) => setJobId(e.target.value)}
              className={sel}
            >
              <option value="">Select…</option>
              {jobs.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.customerName} — {j.siteName}
                </option>
              ))}
            </select>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-3 pt-1">
            <button
              onClick={onClose}
              className="flex-1 min-h-[48px] rounded-lg border border-slate-300 dark:border-slate-600 text-sm font-medium"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={isPending}
              className="flex-1 min-h-[48px] rounded-lg bg-amber-500 hover:bg-amber-600 text-white font-semibold text-sm disabled:opacity-40"
            >
              {isPending ? "Saving…" : "Assign"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create ScheduleGrid.tsx**

Create `src/app/schedule/ScheduleGrid.tsx`:

```typescript
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Fragment } from "react";
import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { ChevronLeft, ChevronRight, Trash2, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { weekDays, formatShortDate, toDateString } from "@/lib/schedule/dateUtils";
import { AssignNewModal } from "./AssignNewModal";

interface Technician {
  id: string;
  name: string;
}

interface Job {
  id: string;
  customerName: string;
  siteName: string;
}

interface ScheduleAssignment {
  id: string;
  assignedDate: string;
  endDate: string | null;
  user: { id: string; name: string; role: string };
  job: { id: string; customerName: string; siteName: string; siteAddress: string; status: string };
}

interface ScheduleGridProps {
  assignments: ScheduleAssignment[];
  technicians: Technician[];
  jobs: Job[];
  weekStartDate: string; // YYYY-MM-DD Monday
}

function AssignmentBlock({
  assignment,
  onDelete,
}: {
  assignment: ScheduleAssignment;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: assignment.id,
  });
  const [confirming, setConfirming] = useState(false);
  const [isPending, startTransition] = useTransition();

  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;

  const isActive = assignment.job.status === "active";

  function handleDelete() {
    startTransition(async () => {
      await fetch(`/api/schedule/assignments/${assignment.id}`, { method: "DELETE" });
      onDelete();
    });
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "rounded px-2 py-1.5 text-xs font-medium select-none relative group",
        isDragging ? "opacity-40 z-50 shadow-lg cursor-grabbing" : "cursor-grab",
        isActive
          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300"
          : "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
      )}
    >
      <div {...listeners} {...attributes} className="space-y-0.5">
        <p className="truncate font-semibold leading-tight">{assignment.job.customerName}</p>
        <p className="truncate opacity-75 leading-tight">{assignment.job.siteName}</p>
        {assignment.endDate && (
          <p className="opacity-60 text-[10px]">
            → {new Date(assignment.endDate).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}
          </p>
        )}
      </div>
      {!confirming ? (
        <button
          onClick={(e) => {
            e.stopPropagation();
            setConfirming(true);
          }}
          className="absolute top-0.5 right-0.5 hidden group-hover:flex p-0.5 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-slate-400 hover:text-red-500"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      ) : (
        <div className="flex gap-1 mt-1 pt-1 border-t border-current/20">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setConfirming(false);
            }}
            className="flex-1 rounded bg-white/40 dark:bg-black/20 text-[10px] py-0.5"
          >
            ×
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleDelete();
            }}
            disabled={isPending}
            className="flex-1 rounded bg-red-200 dark:bg-red-900/50 text-red-700 dark:text-red-300 text-[10px] py-0.5 disabled:opacity-40"
          >
            {isPending ? "…" : "✓"}
          </button>
        </div>
      )}
    </div>
  );
}

function GridCell({
  userId,
  dateStr,
  assignments,
  onCellClick,
  onDelete,
}: {
  userId: string;
  dateStr: string;
  assignments: ScheduleAssignment[];
  onCellClick: (userId: string, dateStr: string) => void;
  onDelete: (id: string) => void;
}) {
  const { isOver, setNodeRef } = useDroppable({ id: `${userId}:${dateStr}` });

  return (
    <div
      ref={setNodeRef}
      onClick={() => {
        if (assignments.length === 0) onCellClick(userId, dateStr);
      }}
      className={cn(
        "min-h-[80px] border-r border-b border-slate-200 dark:border-slate-700 p-1 space-y-1",
        "transition-colors",
        assignments.length === 0 && "cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40",
        isOver && "bg-amber-50 dark:bg-amber-900/20 ring-1 ring-inset ring-amber-300 dark:ring-amber-700"
      )}
    >
      {assignments.map((a) => (
        <AssignmentBlock key={a.id} assignment={a} onDelete={() => onDelete(a.id)} />
      ))}
    </div>
  );
}

function MobileList({
  assignments,
  days,
}: {
  assignments: ScheduleAssignment[];
  days: Date[];
}) {
  const byDate = new Map<string, ScheduleAssignment[]>();
  for (const day of days) {
    byDate.set(toDateString(day), []);
  }
  for (const a of assignments) {
    const key = a.assignedDate.slice(0, 10);
    if (byDate.has(key)) byDate.get(key)!.push(a);
  }

  const todayStr = toDateString(new Date());

  return (
    <div className="space-y-6">
      {days.map((day) => {
        const dateStr = toDateString(day);
        const dayAssignments = byDate.get(dateStr) ?? [];
        return (
          <div key={dateStr}>
            <h3
              className={cn(
                "text-sm font-semibold mb-2",
                dateStr === todayStr
                  ? "text-amber-600 dark:text-amber-400"
                  : "text-slate-500 dark:text-slate-400"
              )}
            >
              {dateStr === todayStr ? "Today — " : ""}{formatShortDate(day)}
            </h3>
            {dayAssignments.length === 0 ? (
              <p className="text-xs text-slate-400">No assignments</p>
            ) : (
              <div className="space-y-2">
                {dayAssignments.map((a) => (
                  <div
                    key={a.id}
                    className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-3"
                  >
                    <p className="text-sm font-medium">{a.user.name}</p>
                    <p className="text-xs text-slate-500">
                      {a.job.customerName} — {a.job.siteName}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function ScheduleGrid({
  assignments: initialAssignments,
  technicians,
  jobs,
  weekStartDate,
}: ScheduleGridProps) {
  const router = useRouter();
  const [assignments, setAssignments] = useState<ScheduleAssignment[]>(initialAssignments);
  const [modal, setModal] = useState<{ userId: string; dateStr: string } | null>(null);
  const [conflictWarning, setConflictWarning] = useState<string | null>(null);

  const monday = new Date(weekStartDate);
  const days = weekDays(monday);
  const todayStr = toDateString(new Date());

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } })
  );

  function prevWeek() {
    const prev = new Date(monday);
    prev.setDate(prev.getDate() - 7);
    router.push(`/schedule?week=${toDateString(prev)}`);
  }

  function nextWeek() {
    const next = new Date(monday);
    next.setDate(next.getDate() + 7);
    router.push(`/schedule?week=${toDateString(next)}`);
  }

  function thisWeek() {
    router.push("/schedule");
  }

  function handleDelete(id: string) {
    setAssignments((prev) => prev.filter((a) => a.id !== id));
  }

  function handleCreated(assignment: ScheduleAssignment) {
    setAssignments((prev) => [...prev, assignment]);
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;

    const assignment = assignments.find((a) => a.id === active.id);
    if (!assignment) return;

    const [targetUserId, targetDateStr] = (over.id as string).split(":");

    // Only allow moving within the same technician's row
    if (targetUserId !== assignment.user.id) return;
    if (targetDateStr === assignment.assignedDate.slice(0, 10)) return;

    const oldStart = new Date(assignment.assignedDate);
    const newStart = new Date(targetDateStr);
    newStart.setHours(0, 0, 0, 0);
    const delta = newStart.getTime() - oldStart.getTime();

    const newEndDate = assignment.endDate
      ? new Date(new Date(assignment.endDate).getTime() + delta).toISOString()
      : null;

    // Optimistic update
    const prevAssignments = assignments;
    setAssignments((prev) =>
      prev.map((a) =>
        a.id === assignment.id
          ? { ...a, assignedDate: newStart.toISOString(), endDate: newEndDate }
          : a
      )
    );

    const body: Record<string, string | null> = {
      assignedDate: newStart.toISOString(),
    };
    if (newEndDate !== null) body.endDate = newEndDate;

    fetch(`/api/schedule/assignments/${assignment.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then(async (res) => {
      if (!res.ok) {
        setAssignments(prevAssignments); // revert
      } else {
        const data = await res.json();
        if (data.warning) setConflictWarning(data.warning);
      }
    });
  }

  // Build lookup: { [techId]: { [dateStr]: Assignment[] } }
  const cellMap = new Map<string, Map<string, ScheduleAssignment[]>>();
  for (const tech of technicians) {
    const techMap = new Map<string, ScheduleAssignment[]>();
    for (const day of days) {
      techMap.set(toDateString(day), []);
    }
    cellMap.set(tech.id, techMap);
  }
  for (const a of assignments) {
    const dateStr = a.assignedDate.slice(0, 10);
    const techMap = cellMap.get(a.user.id);
    if (techMap?.has(dateStr)) {
      techMap.get(dateStr)!.push(a);
    }
  }

  const weekLabel = `${formatShortDate(days[0])} – ${formatShortDate(days[6])}`;

  return (
    <div className="space-y-4">
      {/* Header: week navigation */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Schedule</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">{weekLabel}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={thisWeek}
            className="min-h-[36px] px-3 rounded-lg border border-slate-300 dark:border-slate-600 text-sm"
          >
            Today
          </button>
          <button
            onClick={prevWeek}
            className="p-2 rounded-lg border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={nextWeek}
            className="p-2 rounded-lg border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Conflict warning banner */}
      {conflictWarning && (
        <div className="flex items-center gap-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{conflictWarning}</span>
          <button
            onClick={() => setConflictWarning(null)}
            className="ml-auto text-amber-600 hover:text-amber-800 dark:text-amber-400"
          >
            ×
          </button>
        </div>
      )}

      {/* Mobile list view */}
      <div className="md:hidden">
        <MobileList assignments={assignments} days={days} />
      </div>

      {/* Desktop grid view */}
      <div className="hidden md:block overflow-x-auto">
        <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
          <div
            className="grid border-t border-l border-slate-200 dark:border-slate-700 min-w-[700px]"
            style={{ gridTemplateColumns: `160px repeat(7, 1fr)` }}
          >
            {/* Header row */}
            <div className="border-r border-b border-slate-200 dark:border-slate-700 px-3 py-2 bg-slate-50 dark:bg-slate-800/60" />
            {days.map((day) => {
              const dateStr = toDateString(day);
              return (
                <div
                  key={dateStr}
                  className={cn(
                    "border-r border-b border-slate-200 dark:border-slate-700 px-2 py-2 text-xs font-semibold text-center",
                    "bg-slate-50 dark:bg-slate-800/60",
                    dateStr === todayStr && "text-amber-600 dark:text-amber-400"
                  )}
                >
                  {formatShortDate(day)}
                </div>
              );
            })}

            {/* Technician rows */}
            {technicians.map((tech) => (
              <Fragment key={tech.id}>
                <div className="border-r border-b border-slate-200 dark:border-slate-700 px-3 py-2 flex items-start">
                  <span className="text-sm font-medium truncate">{tech.name}</span>
                </div>
                {days.map((day) => {
                  const dateStr = toDateString(day);
                  const cellAssignments = cellMap.get(tech.id)?.get(dateStr) ?? [];
                  return (
                    <GridCell
                      key={`${tech.id}:${dateStr}`}
                      userId={tech.id}
                      dateStr={dateStr}
                      assignments={cellAssignments}
                      onCellClick={(uid, ds) => setModal({ userId: uid, dateStr: ds })}
                      onDelete={handleDelete}
                    />
                  );
                })}
              </Fragment>
            ))}
          </div>
        </DndContext>
      </div>

      {/* Assignment creation modal */}
      {modal && (
        <AssignNewModal
          prefilledUserId={modal.userId}
          prefilledDate={modal.dateStr}
          jobs={jobs}
          onClose={() => setModal(null)}
          onCreated={handleCreated}
          onConflict={(warning) => setConflictWarning(warning)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run the full test suite**

```bash
pnpm vitest run
```

Expected: All tests pass. TypeScript will be checked at build time; fix any import errors that appear.

- [ ] **Step 5: Commit**

```bash
git add src/app/schedule/AssignNewModal.tsx src/app/schedule/ScheduleGrid.tsx package.json pnpm-lock.yaml
git commit -m "feat: add ScheduleGrid with DnD and AssignNewModal for week-view scheduling"
```

---

## Task 7: Schedule page + nav update + delete ScheduleClient

**Files:**
- Modify: `src/app/schedule/page.tsx` (full rewrite)
- Modify: `src/lib/nav-config.ts`
- Delete: `src/app/schedule/ScheduleClient.tsx`

**Interfaces:**
- Consumes: `getSessionUser` from `@/lib/auth/clerk`
- Consumes: `db` from `@/lib/db/client`
- Consumes: `weekStart`, `toDateString` from `@/lib/schedule/dateUtils`
- Consumes: `TodayCard` from `./TodayCard`
- Consumes: `ScheduleGrid` from `./ScheduleGrid`
- Consumes: `AppShell` from `@/components/layout/AppShell`

**Page behaviour:**
- Technician: queries today's assignments directly from DB (server-side), renders `<TodayCard>`
- Manager/admin/director: queries week assignments + technicians + jobs from DB, renders `<ScheduleGrid>`
- `?week=YYYY-MM-DD` controls which week is displayed (defaults to current week)

- [ ] **Step 1: Delete ScheduleClient.tsx**

```bash
git rm src/app/schedule/ScheduleClient.tsx
```

- [ ] **Step 2: Rewrite page.tsx**

Replace `src/app/schedule/page.tsx` entirely:

```typescript
import { AppShell } from "@/components/layout/AppShell";
import { getSessionUser } from "@/lib/auth/clerk";
import { db } from "@/lib/db/client";
import { redirect } from "next/navigation";
import { weekStart, toDateString } from "@/lib/schedule/dateUtils";
import { TodayCard } from "./TodayCard";
import { ScheduleGrid } from "./ScheduleGrid";

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: { week?: string };
}) {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");

  // Technician: read-only today-card
  if (user.role === "technician") {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const assignments = await db.assignment.findMany({
      where: { userId: user.id, assignedDate: { gte: today, lt: tomorrow } },
      include: {
        job: {
          select: {
            id: true,
            customerName: true,
            siteName: true,
            siteAddress: true,
            status: true,
          },
        },
      },
      orderBy: { assignedDate: "asc" },
    });

    const todayLabel = `Today — ${today.toLocaleDateString("en-AU", {
      weekday: "long",
      day: "numeric",
      month: "long",
    })}`;

    const serialised = assignments.map((a) => ({
      id: a.id,
      assignedDate: a.assignedDate.toISOString(),
      endDate: a.endDate?.toISOString() ?? null,
      job: {
        id: a.job.id,
        customerName: a.job.customerName,
        siteName: a.job.siteName,
        siteAddress: a.job.siteAddress,
        status: a.job.status,
      },
    }));

    return (
      <AppShell>
        <div className="max-w-lg mx-auto px-4 py-6">
          <TodayCard assignments={serialised} todayLabel={todayLabel} />
        </div>
      </AppShell>
    );
  }

  // Manager / admin / director: week grid
  const monday = searchParams.week
    ? weekStart(new Date(searchParams.week))
    : weekStart(new Date());
  const weekEnd = new Date(monday);
  weekEnd.setDate(weekEnd.getDate() + 7);

  const [assignments, technicians, jobs] = await Promise.all([
    db.assignment.findMany({
      where: { assignedDate: { gte: monday, lt: weekEnd } },
      include: {
        user: { select: { id: true, name: true, role: true } },
        job: {
          select: {
            id: true,
            customerName: true,
            siteName: true,
            siteAddress: true,
            status: true,
          },
        },
      },
      orderBy: [{ assignedDate: "asc" }, { user: { name: "asc" } }],
    }),
    db.user.findMany({
      where: { role: "technician", isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    db.job.findMany({
      where: { status: { in: ["active", "scheduled"] } },
      select: { id: true, customerName: true, siteName: true },
      orderBy: { customerName: "asc" },
    }),
  ]);

  const serialisedAssignments = assignments.map((a) => ({
    id: a.id,
    assignedDate: a.assignedDate.toISOString(),
    endDate: a.endDate?.toISOString() ?? null,
    user: a.user,
    job: a.job,
  }));

  return (
    <AppShell>
      <div className="px-4 py-6">
        <ScheduleGrid
          assignments={serialisedAssignments}
          technicians={technicians}
          jobs={jobs}
          weekStartDate={toDateString(monday)}
        />
      </div>
    </AppShell>
  );
}
```

- [ ] **Step 3: Update nav-config.ts — add technician to Schedule visibleTo**

In `src/lib/nav-config.ts`, find the Schedule nav item:

```typescript
{
  label: "Schedule",
  href: "/schedule",
  icon: Calendar,
  description: "Crew assignments and breakdown response",
  visibleTo: ["service_manager", "director", "admin"],
  phase: "1b",
},
```

Replace with:

```typescript
{
  label: "Schedule",
  href: "/schedule",
  icon: Calendar,
  description: "Crew assignments and breakdown response",
  visibleTo: ["service_manager", "director", "admin", "technician"],
  phase: "2",
},
```

- [ ] **Step 4: Run full test suite**

```bash
pnpm vitest run
```

Expected: All tests pass.

- [ ] **Step 5: Verify TypeScript compiles**

```bash
pnpm tsc --noEmit
```

Fix any type errors before committing.

- [ ] **Step 6: Commit**

```bash
git add src/app/schedule/page.tsx src/lib/nav-config.ts
git commit -m "feat: rewrite schedule page — week grid for managers, today-card for technicians"
```

- [ ] **Step 7: Final commit tally**

At this point the following commits should exist (in order):
1. `feat: add schedule date utilities and conflict detection helpers`
2. `feat: add endDate and createdAt to Assignment model`
3. `feat: upgrade schedule GET/POST — week param, conflict detection, push notification`
4. `feat: add PATCH route for moving assignments, with multi-day duration preservation`
5. `feat: add TodayCard component for technician schedule view`
6. `feat: add ScheduleGrid with DnD and AssignNewModal for week-view scheduling`
7. `feat: rewrite schedule page — week grid for managers, today-card for technicians`

Run `git log --oneline -7` to confirm.
