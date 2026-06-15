# Phase 1b — Time Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let technicians clock in and out of jobs from their phones. Give the service manager a live crew board that refreshes every 5 seconds. Give the director a per-job view of hours logged vs quoted, flagging jobs 10% over.

**Architecture:** Clock actions call Next.js API routes that write server-side timestamps (never trust the client). The technician's mobile UI polls for their current state on load. The service manager's crew board uses a client-side 5-second polling loop via `useEffect`. All pages are mobile-first with 44px touch targets, responsive layouts, and offline-safe UX copy.

**Tech Stack:** Next.js 14 App Router · TypeScript · Prisma + Neon Postgres · Clerk (via `requireRole`) · Zod · Tailwind CSS · `vitest`

**Prerequisite:** Phase 1a must be complete (Prisma schema migrated, `requireRole` working, Clerk middleware active).

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `src/app/api/time/clock-in/route.ts` | Clock-in endpoint |
| Create | `src/app/api/time/clock-out/route.ts` | Clock-out endpoint |
| Create | `src/app/api/time/current/route.ts` | Current active entry for the signed-in technician |
| Create | `src/app/api/jobs/assigned/route.ts` | Jobs assigned to the signed-in user today |
| Create | `src/app/api/crew/live/route.ts` | All active time entries (service manager use) |
| Create | `src/app/api/jobs/hours/route.ts` | Per-job hours summary (director use) |
| Modify | `src/app/time-tracking/page.tsx` | Technician mobile view — replace placeholder |
| Create | `src/app/time-tracking/ClockCard.tsx` | Clock in/out card (client component) |
| Create | `src/app/time-tracking/LiveTimer.tsx` | Elapsed time display (client component) |
| Modify | `src/app/dashboard/page.tsx` | Role-split: crew board for service_manager, hours overview for director |
| Create | `src/app/dashboard/CrewBoard.tsx` | Live crew board with 5-second refresh (client) |
| Create | `src/app/dashboard/HoursOverview.tsx` | Per-job hours vs quoted (server component) |
| Create | `src/lib/time/__tests__/time.test.ts` | Unit tests for duration calculation and overage logic |
| Create | `src/lib/time/utils.ts` | Duration and overage utilities |

---

## Task 1: Time Utility Functions (TDD)

**Files:** Create `src/lib/time/utils.ts`, `src/lib/time/__tests__/time.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/time/__tests__/time.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { calcDurationMinutes, isOverQuota, formatDuration } from "@/lib/time/utils";

describe("calcDurationMinutes", () => {
  it("returns minutes between two dates", () => {
    const clockIn = new Date("2025-01-01T08:00:00Z");
    const clockOut = new Date("2025-01-01T10:30:00Z");
    expect(calcDurationMinutes(clockIn, clockOut)).toBe(150);
  });

  it("returns 0 when clockOut is the same as clockIn", () => {
    const t = new Date("2025-01-01T09:00:00Z");
    expect(calcDurationMinutes(t, t)).toBe(0);
  });
});

describe("isOverQuota", () => {
  it("returns false when actual hours are within 10% of quoted", () => {
    expect(isOverQuota(9.9, 9)).toBe(false);  // 9.9h vs 9h quoted → 10% = 9.9 — not over
  });

  it("returns true when actual hours exceed quoted by more than 10%", () => {
    expect(isOverQuota(10.1, 9)).toBe(true);  // > 9.9h
  });

  it("returns false when actual hours equal quoted", () => {
    expect(isOverQuota(8, 8)).toBe(false);
  });
});

describe("formatDuration", () => {
  it("formats minutes as h:mm", () => {
    expect(formatDuration(90)).toBe("1h 30m");
    expect(formatDuration(60)).toBe("1h 00m");
    expect(formatDuration(5)).toBe("0h 05m");
  });
});
```

- [ ] **Step 2: Run test to confirm failure**

```bash
pnpm test
```

Expected: FAIL — `@/lib/time/utils` not found.

- [ ] **Step 3: Write the implementation**

Create `src/lib/time/utils.ts`:

```typescript
export function calcDurationMinutes(clockIn: Date, clockOut: Date): number {
  return Math.round((clockOut.getTime() - clockIn.getTime()) / 60_000);
}

export function isOverQuota(actualHours: number, quotedHours: number): boolean {
  return actualHours > quotedHours * 1.1;
}

export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${String(m).padStart(2, "0")}m`;
}
```

- [ ] **Step 4: Run tests — confirm pass**

```bash
pnpm test
```

Expected: all 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/time/utils.ts src/lib/time/__tests__/time.test.ts
git commit -m "feat: time utility functions with tests (duration, overage, format)"
```

---

## Task 2: Clock-In API Route

**Files:** Create `src/app/api/time/clock-in/route.ts`

- [ ] **Step 1: Write the route**

```typescript
// src/app/api/time/clock-in/route.ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth/clerk";
import { db } from "@/lib/db/client";

const schema = z.object({
  jobId: z.string().uuid(),
});

export async function POST(req: Request) {
  const user = await requireRole(["technician", "service_manager", "director"]).catch(() => null);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request", issues: parsed.error.issues }, { status: 400 });
  }

  const { jobId } = parsed.data;

  // TT-04: prevent clocking into two jobs simultaneously
  const activeEntry = await db.timeEntry.findFirst({
    where: { userId: user.id, status: "active" },
  });
  if (activeEntry) {
    return NextResponse.json(
      { error: "Already clocked in to another job. Clock out first." },
      { status: 409 }
    );
  }

  // Verify the job exists and the user is assigned to it
  const assignment = await db.assignment.findFirst({
    where: { userId: user.id, jobId },
  });
  if (!assignment) {
    return NextResponse.json({ error: "Not assigned to this job" }, { status: 403 });
  }

  // TT-01: server-side timestamp
  const entry = await db.timeEntry.create({
    data: {
      userId: user.id,
      jobId,
      clockInTime: new Date(),
      status: "active",
    },
  });

  return NextResponse.json(entry, { status: 201 });
}
```

- [ ] **Step 2: Test clock-in manually**

Sign in via the app, then:

```bash
curl -X POST http://localhost:3000/api/time/clock-in \
  -H "Content-Type: application/json" \
  -b "your-session-cookie" \
  -d '{"jobId":"<a-real-job-uuid>"}'
```

Expected: `201` with the new time entry JSON. Check Prisma Studio to confirm the row exists.

- [ ] **Step 3: Test the duplicate clock-in guard**

Run the same curl command again without clocking out.

Expected: `409` with `"Already clocked in to another job. Clock out first."`

- [ ] **Step 4: Commit**

```bash
git add src/app/api/time/clock-in/route.ts
git commit -m "feat: clock-in api route with server timestamp and duplicate guard (TT-01, TT-04)"
```

---

## Task 3: Clock-Out API Route

**Files:** Create `src/app/api/time/clock-out/route.ts`

- [ ] **Step 1: Write the route**

```typescript
// src/app/api/time/clock-out/route.ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth/clerk";
import { db } from "@/lib/db/client";
import { calcDurationMinutes } from "@/lib/time/utils";

const schema = z.object({
  entryId: z.string().uuid(),
});

export async function POST(req: Request) {
  const user = await requireRole(["technician", "service_manager", "director"]).catch(() => null);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request", issues: parsed.error.issues }, { status: 400 });
  }

  const { entryId } = parsed.data;

  const entry = await db.timeEntry.findFirst({
    where: { id: entryId, userId: user.id, status: "active" },
  });
  if (!entry) {
    return NextResponse.json({ error: "No active time entry found" }, { status: 404 });
  }

  // TT-01: server-side clock-out timestamp
  const clockOutTime = new Date();
  const durationMinutes = calcDurationMinutes(entry.clockInTime, clockOutTime);

  const updated = await db.timeEntry.update({
    where: { id: entry.id },
    data: { clockOutTime, durationMinutes, status: "complete" },
  });

  return NextResponse.json(updated);
}
```

- [ ] **Step 2: Test clock-out manually**

```bash
curl -X POST http://localhost:3000/api/time/clock-out \
  -H "Content-Type: application/json" \
  -b "your-session-cookie" \
  -d '{"entryId":"<entry-uuid-from-clock-in>"}'
```

Expected: `200` with the completed entry showing `clockOutTime` and `durationMinutes`.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/time/clock-out/route.ts
git commit -m "feat: clock-out api route with server timestamp and duration calculation"
```

---

## Task 4: Current Entry and Assigned Jobs API Routes

**Files:** Create `src/app/api/time/current/route.ts`, `src/app/api/jobs/assigned/route.ts`

- [ ] **Step 1: Write the current-entry route**

```typescript
// src/app/api/time/current/route.ts
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/clerk";
import { db } from "@/lib/db/client";

export async function GET() {
  const user = await requireRole(["technician", "service_manager", "director"]).catch(() => null);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const entry = await db.timeEntry.findFirst({
    where: { userId: user.id, status: "active" },
    include: { job: { select: { customerName: true, siteName: true } } },
  });

  return NextResponse.json(entry ?? null);
}
```

- [ ] **Step 2: Write the assigned-jobs route**

```typescript
// src/app/api/jobs/assigned/route.ts
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/clerk";
import { db } from "@/lib/db/client";

export async function GET() {
  const user = await requireRole(["technician", "service_manager", "director"]).catch(() => null);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);

  const assignments = await db.assignment.findMany({
    where: {
      userId: user.id,
      assignedDate: { gte: today, lt: tomorrow },
    },
    include: {
      job: {
        select: {
          id: true,
          customerName: true,
          siteName: true,
          siteAddress: true,
          status: true,
          quotedHours: true,
        },
      },
    },
  });

  return NextResponse.json(assignments.map((a) => a.job));
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/time/current/route.ts src/app/api/jobs/assigned/route.ts
git commit -m "feat: current active entry and today's assigned jobs api routes"
```

---

## Task 5: Technician Mobile UI

**Files:** Modify `src/app/time-tracking/page.tsx`, create `src/app/time-tracking/ClockCard.tsx`, `src/app/time-tracking/LiveTimer.tsx`

- [ ] **Step 1: Write the LiveTimer client component**

Create `src/app/time-tracking/LiveTimer.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { formatDuration } from "@/lib/time/utils";

interface LiveTimerProps {
  clockInTime: string; // ISO string
}

export function LiveTimer({ clockInTime }: LiveTimerProps) {
  const [minutes, setMinutes] = useState(0);

  useEffect(() => {
    const start = new Date(clockInTime).getTime();

    function tick() {
      setMinutes(Math.floor((Date.now() - start) / 60_000));
    }

    tick();
    const id = setInterval(tick, 10_000); // update every 10 seconds
    return () => clearInterval(id);
  }, [clockInTime]);

  return (
    <span className="font-mono text-2xl tabular-nums text-amber-500">
      {formatDuration(minutes)}
    </span>
  );
}
```

- [ ] **Step 2: Write the ClockCard client component**

Create `src/app/time-tracking/ClockCard.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { LiveTimer } from "./LiveTimer";

interface Job {
  id: string;
  customerName: string;
  siteName: string;
  siteAddress: string;
}

interface ActiveEntry {
  id: string;
  jobId: string;
  clockInTime: string;
  job: { customerName: string; siteName: string };
}

interface ClockCardProps {
  jobs: Job[];
  activeEntry: ActiveEntry | null;
}

export function ClockCard({ jobs, activeEntry }: ClockCardProps) {
  const [selectedJobId, setSelectedJobId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [currentEntry, setCurrentEntry] = useState(activeEntry);
  const [isPending, startTransition] = useTransition();

  async function handleClockIn() {
    if (!selectedJobId) {
      setError("Select a job first.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await fetch("/api/time/clock-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId: selectedJobId }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Clock-in failed.");
        return;
      }
      const entry = await res.json();
      const job = jobs.find((j) => j.id === entry.jobId)!;
      setCurrentEntry({
        ...entry,
        clockInTime: entry.clockInTime,
        job: { customerName: job.customerName, siteName: job.siteName },
      });
    });
  }

  async function handleClockOut() {
    if (!currentEntry) return;
    setError(null);
    startTransition(async () => {
      const res = await fetch("/api/time/clock-out", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entryId: currentEntry.id }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Clock-out failed.");
        return;
      }
      setCurrentEntry(null);
    });
  }

  if (currentEntry) {
    return (
      <div className="flex flex-col gap-6 p-5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
        <div>
          <p className="text-xs font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Clocked in
          </p>
          <p className="text-lg font-semibold mt-1">
            {currentEntry.job.customerName} — {currentEntry.job.siteName}
          </p>
          <div className="mt-2">
            <LiveTimer clockInTime={currentEntry.clockInTime} />
          </div>
        </div>

        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

        <button
          onClick={handleClockOut}
          disabled={isPending}
          className="w-full min-h-[52px] rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 font-semibold text-base disabled:opacity-50 active:scale-[0.98] transition-transform"
        >
          {isPending ? "Clocking out…" : "Clock Out"}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
      <p className="text-xs font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400">
        Not clocked in
      </p>

      {jobs.length === 0 ? (
        <p className="text-sm text-slate-500">No jobs scheduled for today.</p>
      ) : (
        <>
          <select
            value={selectedJobId}
            onChange={(e) => setSelectedJobId(e.target.value)}
            className="w-full min-h-[44px] rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 px-3 text-base"
          >
            <option value="">Select a job…</option>
            {jobs.map((job) => (
              <option key={job.id} value={job.id}>
                {job.customerName} — {job.siteName}
              </option>
            ))}
          </select>

          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

          <button
            onClick={handleClockIn}
            disabled={isPending || !selectedJobId}
            className="w-full min-h-[52px] rounded-lg bg-amber-500 hover:bg-amber-600 text-white font-semibold text-base disabled:opacity-40 active:scale-[0.98] transition-transform"
          >
            {isPending ? "Clocking in…" : "Clock In"}
          </button>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Write the technician page (server component)**

Replace the full contents of `src/app/time-tracking/page.tsx`:

```tsx
import { AppShell } from "@/components/layout/AppShell";
import { requireRole } from "@/lib/auth/clerk";
import { db } from "@/lib/db/client";
import { ClockCard } from "./ClockCard";
import { redirect } from "next/navigation";

export default async function TimeTrackingPage() {
  const user = await requireRole(["technician", "service_manager", "director"]).catch(() => null);
  if (!user) redirect("/sign-in");

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);

  const [assignments, activeEntry] = await Promise.all([
    db.assignment.findMany({
      where: { userId: user.id, assignedDate: { gte: today, lt: tomorrow } },
      include: {
        job: {
          select: { id: true, customerName: true, siteName: true, siteAddress: true },
        },
      },
    }),
    db.timeEntry.findFirst({
      where: { userId: user.id, status: "active" },
      include: { job: { select: { customerName: true, siteName: true } } },
    }),
  ]);

  const jobs = assignments.map((a) => a.job);
  const serialisedEntry = activeEntry
    ? {
        ...activeEntry,
        clockInTime: activeEntry.clockInTime.toISOString(),
        clockOutTime: activeEntry.clockOutTime?.toISOString() ?? null,
      }
    : null;

  return (
    <AppShell>
      <div className="max-w-lg mx-auto px-4 py-6 space-y-4">
        <div>
          <h1 className="text-xl font-semibold">Time Tracking</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            {today.toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long" })}
          </p>
        </div>

        <ClockCard jobs={jobs} activeEntry={serialisedEntry} />
      </div>
    </AppShell>
  );
}
```

- [ ] **Step 4: Test on mobile**

```bash
pnpm dev
```

Open http://localhost:3000/time-tracking on a phone (use your local IP: `http://192.168.x.x:3000/time-tracking`) or resize Chrome to 390px width. Verify:

- Job selector dropdown is tap-friendly (min 44px height)
- Clock In button is large and amber
- After clocking in, the Live Timer appears and counts up
- Clock Out button is visible and triggers clock-out
- Error states render correctly (try submitting with no job selected)

- [ ] **Step 5: Commit**

```bash
git add src/app/time-tracking/page.tsx src/app/time-tracking/ClockCard.tsx src/app/time-tracking/LiveTimer.tsx
git commit -m "feat: technician mobile clock in/out UI with live timer"
```

---

## Task 6: Service Manager Live Crew Board

**Files:** Create `src/app/api/crew/live/route.ts`, create `src/app/dashboard/CrewBoard.tsx`, modify `src/app/dashboard/page.tsx`

- [ ] **Step 1: Write the crew live API route**

```typescript
// src/app/api/crew/live/route.ts
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/clerk";
import { db } from "@/lib/db/client";

export async function GET() {
  const user = await requireRole(["service_manager", "director", "admin"]).catch(() => null);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const activeEntries = await db.timeEntry.findMany({
    where: { status: "active" },
    include: {
      user: { select: { id: true, name: true } },
      job: { select: { id: true, customerName: true, siteName: true } },
    },
    orderBy: { clockInTime: "asc" },
  });

  return NextResponse.json(activeEntries.map((e) => ({
    entryId: e.id,
    technicianId: e.user.id,
    technicianName: e.user.name,
    jobId: e.job.id,
    customerName: e.job.customerName,
    siteName: e.job.siteName,
    clockInTime: e.clockInTime.toISOString(),
  })));
}
```

- [ ] **Step 2: Write the CrewBoard client component**

Create `src/app/dashboard/CrewBoard.tsx`:

```tsx
"use client";

import { useEffect, useState, useCallback } from "react";
import { formatDuration, calcDurationMinutes } from "@/lib/time/utils";

interface CrewEntry {
  entryId: string;
  technicianId: string;
  technicianName: string;
  jobId: string;
  customerName: string;
  siteName: string;
  clockInTime: string;
}

export function CrewBoard() {
  const [entries, setEntries] = useState<CrewEntry[]>([]);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [error, setError] = useState(false);

  const fetchCrew = useCallback(async () => {
    try {
      const res = await fetch("/api/crew/live");
      if (!res.ok) throw new Error("fetch failed");
      const data = await res.json();
      setEntries(data);
      setLastUpdated(new Date());
      setError(false);
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    fetchCrew();
    const id = setInterval(fetchCrew, 5_000); // NF requirement TT-08
    return () => clearInterval(id);
  }, [fetchCrew]);

  const [, forceRender] = useState(0);
  useEffect(() => {
    const id = setInterval(() => forceRender((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">Live Crew</h2>
        {lastUpdated && (
          <span className="text-xs font-mono text-slate-400">
            {lastUpdated.toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
          </span>
        )}
      </div>

      {error && (
        <p className="text-sm text-red-600 dark:text-red-400">
          Failed to refresh — check your connection.
        </p>
      )}

      {entries.length === 0 && !error && (
        <p className="text-sm text-slate-500 dark:text-slate-400">No technicians currently clocked in.</p>
      )}

      <ul className="space-y-2">
        {entries.map((e) => {
          const elapsed = calcDurationMinutes(new Date(e.clockInTime), new Date());
          return (
            <li
              key={e.entryId}
              className="flex items-start justify-between gap-4 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-3"
            >
              <div className="min-w-0">
                <p className="font-medium truncate">{e.technicianName}</p>
                <p className="text-sm text-slate-500 truncate">
                  {e.customerName} — {e.siteName}
                </p>
              </div>
              <span className="text-sm font-mono tabular-nums text-amber-500 shrink-0">
                {formatDuration(elapsed)}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
```

- [ ] **Step 3: Write per-job hours summary API route**

```typescript
// src/app/api/jobs/hours/route.ts
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/clerk";
import { db } from "@/lib/db/client";

export async function GET() {
  const user = await requireRole(["director", "service_manager", "admin"]).catch(() => null);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const jobs = await db.job.findMany({
    where: { status: { in: ["active", "scheduled"] } },
    select: {
      id: true,
      customerName: true,
      siteName: true,
      quotedHours: true,
      timeEntries: {
        where: { status: "complete" },
        select: { durationMinutes: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(
    jobs.map((job) => {
      const loggedMinutes = job.timeEntries.reduce((sum, e) => sum + (e.durationMinutes ?? 0), 0);
      const loggedHours = loggedMinutes / 60;
      const isOverQuota = loggedHours > job.quotedHours * 1.1;
      return {
        id: job.id,
        customerName: job.customerName,
        siteName: job.siteName,
        quotedHours: job.quotedHours,
        loggedHours: Math.round(loggedHours * 10) / 10,
        isOverQuota,
      };
    })
  );
}
```

- [ ] **Step 4: Write HoursOverview server component**

Create `src/app/dashboard/HoursOverview.tsx`:

```tsx
import { db } from "@/lib/db/client";
import { isOverQuota } from "@/lib/time/utils";
import { cn } from "@/lib/utils/cn";

export async function HoursOverview() {
  const jobs = await db.job.findMany({
    where: { status: { in: ["active", "scheduled"] } },
    select: {
      id: true,
      customerName: true,
      siteName: true,
      quotedHours: true,
      timeEntries: {
        where: { status: "complete" },
        select: { durationMinutes: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const rows = jobs.map((job) => {
    const loggedMinutes = job.timeEntries.reduce((sum, e) => sum + (e.durationMinutes ?? 0), 0);
    const loggedHours = Math.round((loggedMinutes / 60) * 10) / 10;
    const over = isOverQuota(loggedHours, job.quotedHours);
    return { ...job, loggedHours, over };
  });

  return (
    <div className="space-y-3">
      <h2 className="text-base font-semibold">Hours vs Quoted</h2>
      {rows.length === 0 && (
        <p className="text-sm text-slate-500">No active jobs.</p>
      )}
      <ul className="space-y-2">
        {rows.map((row) => (
          <li
            key={row.id}
            className="flex items-center justify-between gap-4 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-3"
          >
            <div className="min-w-0">
              <p className="font-medium truncate">{row.customerName}</p>
              <p className="text-sm text-slate-500 truncate">{row.siteName}</p>
            </div>
            <div className="text-right shrink-0">
              <p className={cn("text-sm font-mono tabular-nums", row.over ? "text-red-500" : "text-slate-700 dark:text-slate-300")}>
                {row.loggedHours}h / {row.quotedHours}h
              </p>
              {row.over && (
                <p className="text-xs font-mono uppercase text-red-500 tracking-wider">Over quota</p>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 5: Update dashboard page to split by role**

Replace the full contents of `src/app/dashboard/page.tsx`:

```tsx
import { AppShell } from "@/components/layout/AppShell";
import { requireRole } from "@/lib/auth/clerk";
import { redirect } from "next/navigation";
import { CrewBoard } from "./CrewBoard";
import { HoursOverview } from "./HoursOverview";

export default async function DashboardPage() {
  const user = await requireRole(["director", "service_manager", "admin"]).catch(() => null);
  if (!user) redirect("/sign-in");

  return (
    <AppShell>
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-8">
        <h1 className="text-xl font-semibold">Dashboard</h1>

        {(user.role === "service_manager" || user.role === "director") && (
          <CrewBoard />
        )}

        {(user.role === "director" || user.role === "admin") && (
          <HoursOverview />
        )}
      </div>
    </AppShell>
  );
}
```

- [ ] **Step 6: Test the crew board**

Open `/dashboard` as service_manager. Clock in a technician in another browser tab, then watch the crew board update within 5 seconds automatically.

Open `/dashboard` as director. You should see both the crew board and the hours table.

- [ ] **Step 7: Commit**

```bash
git add src/app/api/crew/live/route.ts src/app/api/jobs/hours/route.ts \
        src/app/dashboard/CrewBoard.tsx src/app/dashboard/HoursOverview.tsx \
        src/app/dashboard/page.tsx
git commit -m "feat: live crew board (5s refresh) and hours vs quoted for dashboard"
```

---

## Task 7: TypeScript, Lint, and Test Check

- [ ] **Step 1: Type check**

```bash
pnpm tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 2: Lint**

```bash
pnpm lint
```

Fix any issues.

- [ ] **Step 3: Run all tests**

```bash
pnpm test
```

Expected: all tests PASS (time utils tests from Task 1, requireRole tests from Phase 1a).

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "chore: phase 1b complete — time tracking, crew board, hours overview"
```

---

## Phase 1b Completion Checklist

- [ ] Technician can clock in to an assigned job (server-side timestamp, TT-01)
- [ ] Technician cannot clock in to two jobs simultaneously (TT-04)
- [ ] Live timer displays elapsed time on the technician's screen
- [ ] Clock out calculates and stores duration in minutes
- [ ] Service manager crew board shows all active clock-ins
- [ ] Crew board refreshes within 5 seconds (TT-08)
- [ ] Director sees per-job logged hours vs quoted hours
- [ ] Jobs more than 10% over quota are flagged in red
- [ ] UI is usable on iPhone SE (375px wide), all buttons ≥ 44px
- [ ] `pnpm tsc --noEmit` — zero errors
- [ ] `pnpm test` — all tests PASS
- [ ] Deployed to Vercel and tested on a real phone
