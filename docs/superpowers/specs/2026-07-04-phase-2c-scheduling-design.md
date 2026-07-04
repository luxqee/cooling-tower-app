# Phase 2c — Scheduling Calendar Design

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Excel scheduling spreadsheet with a week-view calendar grid (desktop) where service managers drag-and-drop technicians onto jobs by day. Technicians see their own today-card on mobile.

**Architecture:** Upgrade the existing `/schedule` page and `/api/schedule/assignments` routes. Add `endDate` to `Assignment` for multi-day support. New `ScheduleGrid` client component with `@dnd-kit/core` for drag-and-drop. Technicians get a read-only today view in the same route.

**Tech Stack:** Next.js 14 App Router, Prisma 7 + Neon, `@dnd-kit/core` + `@dnd-kit/utilities` (drag-and-drop), Tailwind CSS.

---

## Global Constraints

- Desktop calendar (≥768px): full week grid, drag-and-drop, create/delete assignments
- Mobile (<768px): read-only; technicians see today-card; managers see a date-grouped list (no DnD)
- Technicians see **only their own** assignments
- Service managers, directors, and admins see **all technicians**
- `@dnd-kit/core` is the drag-and-drop library — do not use `react-beautiful-dnd` or `@hello-pangea/dnd`
- Conflict detection warns but does not block — service manager can override
- Week navigation via URL query param `?week=YYYY-MM-DD` (Monday of the target week)

---

## 1. Schema Changes

### Change to `Assignment` model

Add `endDate` for multi-day assignments. `null` means single-day (same as `assignedDate`).

```prisma
model Assignment {
  id           String    @id @default(uuid())
  userId       String
  jobId        String
  assignedDate DateTime  // start date (keep name for backwards compat)
  endDate      DateTime? // null = single day; set for multi-day
  createdAt    DateTime  @default(now())

  user User @relation(fields: [userId], references: [id])
  job  Job  @relation(fields: [jobId], references: [id])

  @@unique([userId, jobId, assignedDate])
  @@index([assignedDate])
}
```

**Migration name:** `assignment_end_date`

Existing records: `endDate` defaults to `null` (single-day), no data loss.

---

## 2. API Routes

### `GET /api/schedule/assignments`

**Auth:** All authenticated users (`getSessionUser()` — not `requireRole()`).

**Query params:**
- `week` — ISO date string of the Monday of the target week (e.g. `2026-07-07`). Defaults to current week's Monday.

**Behaviour:**
- Fetch all assignments where `assignedDate >= weekStart` AND `assignedDate < weekStart + 7 days`
- Directors, service managers, admins: see all technicians
- Technicians: filtered to `userId === session.user.id`

**Response per assignment:**

```typescript
{
  id: string;
  assignedDate: string;    // ISO date of start
  endDate: string | null;  // ISO date of end, null = single day
  user: { id: string; name: string; role: string };
  job:  { id: string; customerName: string; siteName: string; siteAddress: string; status: string };
}
```

### `POST /api/schedule/assignments`

**Auth:** `requireRole(["director", "service_manager", "admin"])`

**Body:**

```typescript
{
  userId:      string;   // UUID
  jobId:       string;   // UUID
  assignedDate: string;  // ISO datetime (start)
  endDate?:    string;   // ISO datetime (end), omit for single-day
}
```

**Conflict detection:** Before creating, check whether the technician already has an assignment whose date range overlaps with the new assignment's range. If overlap detected, return `{ warning: "Technician already assigned on overlapping dates", conflicts: [...] }` alongside a `201` response (not a 4xx — the manager can proceed). The client shows a warning toast but does not block.

**Push notification:** After creating, send a push notification to the assigned technician:
- Title: `"New job assignment"`
- Body: `"{job.customerName} — {job.siteName}, {formattedDate}"`
- URL: `"/schedule"`
- Use existing `sendPushToUser()` helper

### `PATCH /api/schedule/assignments/[id]`

**Auth:** `requireRole(["director", "service_manager", "admin"])`

**Body:** `{ assignedDate?: string; endDate?: string | null }`

Used by drag-and-drop to move an assignment to a new date. When moving a multi-day assignment, `assignedDate` shifts by the drag delta and `endDate` shifts by the same amount to preserve duration.

Returns the updated assignment.

### `DELETE /api/schedule/assignments/[id]`

**Auth:** `requireRole(["director", "service_manager", "admin"])` — exists already, no changes needed.

---

## 3. Pages and Components

### `/schedule` server page (`src/app/schedule/page.tsx`)

**Access:** Any authenticated user. Technicians see the today card; managers/admins/directors see the full grid.

**Server component logic:**
- `getSessionUser()` — redirect to `/sign-in` if null
- Determine `weekStart` from `?week` query param (or current week's Monday)
- Fetch assignments for the week via the new `GET /api/schedule/assignments?week=...`
- For managers/admins/directors: also fetch all active technicians and active/scheduled jobs
- For technicians: fetch only their own assignments (server-side Prisma query, not via API)
- Render `<ScheduleGrid>` (managers) or `<TodayCard>` (technicians)

### `ScheduleGrid` client component (`src/app/schedule/ScheduleGrid.tsx`)

**Layout:** CSS grid — technician rows × day columns (Mon–Sun).

```
           Mon 7  Tue 8  Wed 9  Thu 10  Fri 11  Sat 12  Sun 13
Jake       [████ Rio Tinto — Weipa ████]
Sam        [▓ BHP ▓]              [▓ Xstrata ▓]
Chris                   [██████ Glencore ██████]
```

Each assignment block shows: job's customer name + site name (truncated). Color-coded by job status: amber = scheduled, green = active.

**Drag-and-drop (`@dnd-kit/core`):**
- Each assignment block is a `<Draggable>` with `id = assignment.id`
- Each grid cell is a `<Droppable>` with `id = "{userId}:{dateISO}"`
- On drop: calculate new `assignedDate` from the target cell's date. If multi-day, shift `endDate` by the same delta.
- `PATCH /api/schedule/assignments/[id]` with new dates
- Optimistic update: move the block immediately, revert on error
- Show conflict warning toast if response includes `warning` field

**Assignment creation:**
- Click an empty cell → opens a modal `<AssignNewModal>` with job selector
- Pre-fills technician (row) and date (column) from the clicked cell
- Optional end date for multi-day
- `POST /api/schedule/assignments`

**Assignment deletion:**
- Hover/tap on a block → shows a `×` button
- Confirm before delete
- `DELETE /api/schedule/assignments/[id]`

**Week navigation:**
- `← Previous week` / `Next week →` buttons
- Updates `?week=` param in URL using `router.push`
- "Today" button jumps to current week

### `TodayCard` client component (`src/app/schedule/TodayCard.tsx`)

Shown to technicians on mobile and desktop. Displays their assignment(s) for today as a large card.

```
┌─────────────────────────────┐
│  Today — Monday 7 July      │
│                             │
│  Rio Tinto                  │
│  Weipa Cooling Tower Site   │
│  123 Mine Rd, Weipa QLD     │
│                             │
│  [Clock In →]               │
└─────────────────────────────┘
```

- "Clock In →" button links to `/time-tracking` (uses existing clock-in flow)
- If multiple assignments today: stack multiple cards
- If no assignment: "No jobs scheduled for today"
- If job is `complete` or `cancelled`: grey card with status badge

---

## 4. Navigation

Update `src/lib/nav-config.ts` — the Schedule nav item already exists. Update `visibleTo` to include `technician`:

```typescript
{
  label: "Schedule",
  href: "/schedule",
  icon: Calendar,
  description: "Job scheduling and assignments",
  visibleTo: ["director", "service_manager", "admin", "technician"],
  phase: "2",
}
```

---

## 5. New Dependencies

```bash
pnpm add @dnd-kit/core @dnd-kit/utilities
```

No other new dependencies. Do not add a full calendar library (`react-big-calendar`, `fullcalendar`) — the grid is implemented with CSS grid + Tailwind.

---

## 6. Date Utilities

**File:** `src/lib/schedule/dateUtils.ts`

```typescript
// Returns the Monday of the week containing the given date
export function weekStart(date: Date): Date

// Returns an array of 7 Date objects for Mon–Sun of the given week
export function weekDays(monday: Date): Date[]

// Formats a date as "Mon 7 Jul"
export function formatShortDate(date: Date): string

// Returns ISO date string "YYYY-MM-DD" for a Date
export function toDateString(date: Date): string

// Returns true if dateA and dateB are the same calendar day
export function isSameDay(a: Date, b: Date): boolean
```

These are pure functions — unit-test them directly.

---

## 7. Conflict Detection Logic

An existing assignment `A` and new assignment `B` conflict if:

```
A.startDate <= B.endDate  AND  A.endDate >= B.startDate
```

Where `endDate` defaults to `startDate` if null (single-day).

Implemented server-side in `POST /api/schedule/assignments` — query for any existing assignment for the same `userId` that overlaps.

---

## 8. Testing

**Test file:** `src/app/api/schedule/__tests__/assignments.test.ts`

Cover:
- `GET /api/schedule/assignments` returns 401 when not authenticated
- Technician only sees their own assignments
- `POST /api/schedule/assignments` creates correctly and triggers push notification
- `POST /api/schedule/assignments` returns conflict warning (201 + `warning` field) when overlap detected
- `PATCH /api/schedule/assignments/[id]` updates dates correctly
- Multi-day duration is preserved after a PATCH (endDate shifts by same delta as startDate)
- Conflict detection logic (unit-test `detectConflict()` helper separately)

**Unit tests:** `src/lib/schedule/__tests__/dateUtils.test.ts`
- `weekStart()` returns Monday for any day of the week
- `weekDays()` returns exactly 7 days starting from a Monday
- `isSameDay()` handles timezone-boundary cases
