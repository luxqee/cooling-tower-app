# UX & Navigation Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all critical and important UX, accessibility, and navigation issues identified in the 2026-07-05 expert review — making the app usable by tradies in the field on a phone.

**Architecture:** All changes are in React/TSX components and nav config. No schema or API changes. Tasks are ordered from highest user impact to lowest.

**Tech Stack:** Next.js 14 App Router, React, Tailwind CSS, lucide-react.

## Global Constraints

- Mobile-first: all interactive targets must be at least 44×44px (iOS HIG minimum)
- Bottom tab bar must only render for `technician` role on mobile (`< lg` breakpoint) — admin/director/service_manager keep the hamburger drawer
- Amber CTA buttons must use `bg-amber-600` not `bg-amber-500` (contrast fix for sunlight readability)
- `text-sm` (14px) on `<select>` and `<input>` elements causes iOS Safari to auto-zoom — use `text-base` (16px) on all form controls
- Phase badge labels ("1a", "1b", "2") must be hidden from end users — keep in DOM with `aria-hidden="true"` and visually hidden from non-admin roles
- Run `pnpm build` at the end of each task to confirm no TypeScript errors
- No new npm packages (use Tailwind and existing lucide-react icons)

---

## File Map

**Modified files:**
- `src/app/compliance/new/SignatureCanvas.tsx`
- `src/app/compliance/new/ComplianceForm.tsx`
- `src/app/time-tracking/ClockCard.tsx`
- `src/app/variations/VariationForm.tsx`
- `src/app/variations/VariationCard.tsx`
- `src/app/time-tracking/page.tsx`
- `src/app/api/time/clock-in/route.ts`
- `src/components/nav/NavLinks.tsx`
- `src/components/nav/MobileNavClient.tsx`
- `src/components/nav/MobileNav.tsx`
- `src/components/nav/Sidebar.tsx`
- `src/components/nav/TopBar.tsx`
- `src/components/layout/AppShell.tsx`
- `src/lib/nav-config.ts`

**New files:**
- `src/components/nav/BottomTabBar.tsx` (server component — reads session user)
- `src/components/nav/BottomTabBarClient.tsx` (client component — renders tabs)

---

### Task 1: Fix signature canvas height mismatch and dark mode invisibility

**Files:**
- Modify: `src/app/compliance/new/SignatureCanvas.tsx`

**Interfaces:**
- Produces: `SignatureCanvas` wrapper height matches canvas height (200px). Stroke colour adapts to dark/light mode. Canvas has `aria-label`.

- [ ] **Step 1: Read the current file**

Read `src/app/compliance/new/SignatureCanvas.tsx` and note:
- Line 88: `style={{ height: 100 }}` — wrapper is 100px, but canvas `height={150}` — mismatch causes broken coordinate mapping
- Line 19: `ctx.strokeStyle = "#1e293b"` — dark slate, invisible in dark mode

- [ ] **Step 2: Rewrite `src/app/compliance/new/SignatureCanvas.tsx`**

```tsx
"use client";

import { useRef, useEffect, useState } from "react";

interface SignatureCanvasProps {
  onChange: (dataUrl: string | null) => void;
}

export function SignatureCanvas({ onChange }: SignatureCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing   = useRef(false);
  const [isEmpty, setIsEmpty] = useState(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    ctx.strokeStyle = dark ? "#e2e8f0" : "#1e293b";
    ctx.lineWidth   = 2.5;
    ctx.lineCap     = "round";
    ctx.lineJoin    = "round";
  }, []);

  useEffect(() => {
    function handleWindowMouseUp() {
      if (!drawing.current) return;
      drawing.current = false;
      setIsEmpty(false);
      onChange(canvasRef.current?.toDataURL("image/png") ?? null);
    }
    window.addEventListener("mouseup", handleWindowMouseUp);
    return () => window.removeEventListener("mouseup", handleWindowMouseUp);
  }, [onChange]);

  function getPos(e: React.MouseEvent | React.TouchEvent) {
    const canvas = canvasRef.current!;
    const rect   = canvas.getBoundingClientRect();
    const scaleX = canvas.width  / rect.width;
    const scaleY = canvas.height / rect.height;
    if ("touches" in e) {
      const touch = e.touches[0];
      return { x: (touch.clientX - rect.left) * scaleX, y: (touch.clientY - rect.top) * scaleY };
    }
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
  }

  function start(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault();
    drawing.current = true;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const { x, y } = getPos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  }

  function move(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault();
    if (!drawing.current) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const { x, y } = getPos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  }

  function end(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault();
    if (!drawing.current) return;
    drawing.current = false;
    setIsEmpty(false);
    onChange(canvasRef.current?.toDataURL("image/png") ?? null);
  }

  function clear() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // Re-apply stroke style after clear (ctx state survives, but good to reinforce)
    const dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    ctx.strokeStyle = dark ? "#e2e8f0" : "#1e293b";
    setIsEmpty(true);
    onChange(null);
  }

  return (
    <div className="space-y-1">
      {/* Wrapper height (200px) must match the canvas height attribute to keep coordinate mapping 1:1 */}
      <div
        className="relative rounded-lg border-2 border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 overflow-hidden touch-none"
        style={{ height: 200 }}
      >
        <canvas
          ref={canvasRef}
          width={600}
          height={200}
          aria-label="Signature pad — draw your signature here"
          className="w-full h-full"
          onMouseDown={start}
          onMouseMove={move}
          onMouseUp={end}
          onMouseLeave={end}
          onTouchStart={start}
          onTouchMove={move}
          onTouchEnd={end}
        />
        {isEmpty && (
          <p className="absolute inset-0 flex items-center justify-center text-sm text-slate-400 pointer-events-none select-none">
            Sign here
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={clear}
        className="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 underline underline-offset-2"
      >
        Clear
      </button>
    </div>
  );
}
```

- [ ] **Step 3: Verify build**

```bash
pnpm build
```

Expected: Build succeeds with no TypeScript errors in SignatureCanvas.

- [ ] **Step 4: Commit**

```bash
git add src/app/compliance/new/SignatureCanvas.tsx
git commit -m "fix: signature canvas height mismatch, dark mode stroke colour, aria-label"
```

---

### Task 2: Fix label/htmlFor associations and iOS font-size auto-zoom

**Files:**
- Modify: `src/app/compliance/new/ComplianceForm.tsx`
- Modify: `src/app/time-tracking/ClockCard.tsx`
- Modify: `src/app/variations/VariationForm.tsx`

**Interfaces:**
- Produces: All `<label>` elements have `htmlFor` matching an `id` on their input. All `<select>` and `<input>` elements use `text-base` (16px minimum) to prevent iOS auto-zoom.

- [ ] **Step 1: Fix `ComplianceForm.tsx` — Step 1 select label + input font sizes**

In `src/app/compliance/new/ComplianceForm.tsx`:

**Step 1 (job select)** — add `htmlFor`/`id` and change to `text-base`:
```tsx
// Around line 89-95, replace:
<div className="space-y-1">
  <label className="text-sm font-medium">Select job</label>
  <select
    value={jobId}
    onChange={(e) => setJobId(e.target.value)}
    className="w-full min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 text-sm"
  >

// With:
<div className="space-y-1">
  <label htmlFor="compliance-job-select" className="text-sm font-medium">Select job</label>
  <select
    id="compliance-job-select"
    value={jobId}
    onChange={(e) => setJobId(e.target.value)}
    className="w-full min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 text-base"
  >
```

**Form fields section** — add `id` attributes to all inputs. For the dynamic form fields (Step 3), the `field.id` is already unique — use it:
```tsx
// For text inputs (around line 171-177):
{field.type === "text" && (
  <input
    id={`field-${field.id}`}
    type="text"
    value={(values[field.id] as string) ?? ""}
    onChange={(e) => setValue(field.id, e.target.value)}
    className="w-full min-h-[44px] rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 text-base"
  />
)}

// For textarea (around line 180-186):
{field.type === "textarea" && (
  <textarea
    id={`field-${field.id}`}
    value={(values[field.id] as string) ?? ""}
    onChange={(e) => setValue(field.id, e.target.value)}
    rows={3}
    className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-base resize-none"
  />
)}

// For date (around line 189-194):
{field.type === "date" && (
  <input
    id={`field-${field.id}`}
    type="date"
    value={(values[field.id] as string) ?? ""}
    onChange={(e) => setValue(field.id, e.target.value)}
    className="w-full min-h-[44px] rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 text-base"
  />
)}
```

Update the label for dynamic fields to include `htmlFor`:
```tsx
// Around line 167-169:
<label htmlFor={`field-${field.id}`} className="text-sm font-medium text-slate-700 dark:text-slate-300">
  {field.label}{field.required && <span className="text-red-500 ml-0.5">*</span>}
</label>
```

Also change the `min-h-[40px]` inputs to `min-h-[44px]` everywhere in the file (global replace).

- [ ] **Step 2: Fix `ClockCard.tsx` — add label/id to job select**

In `src/app/time-tracking/ClockCard.tsx`, around line 114-124:
```tsx
// Add a visually hidden label (the select already has a placeholder option, but needs a label for screen readers)
<label htmlFor="clock-job-select" className="sr-only">Select job to clock in</label>
<select
  id="clock-job-select"
  value={selectedJobId}
  onChange={(e) => setSelectedJobId(e.target.value)}
  className="w-full min-h-[44px] rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 px-3 text-base"
>
```

- [ ] **Step 3: Fix `VariationForm.tsx` — add htmlFor/id to all labels**

In `src/app/variations/VariationForm.tsx`, update all four form field groups:

```tsx
// Job select (around line 128-141):
<div className="space-y-1.5">
  <label htmlFor="variation-job" className="text-sm font-medium">Job</label>
  <select
    id="variation-job"
    value={jobId}
    onChange={(e) => setJobId(e.target.value)}
    className="w-full min-h-[44px] rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 text-base"
  >

// Description textarea (around line 145-153):
<div className="space-y-1.5">
  <label htmlFor="variation-description" className="text-sm font-medium">Description</label>
  <textarea
    id="variation-description"
    value={description}
    onChange={(e) => setDescription(e.target.value)}
    rows={4}
    placeholder="Describe the extra work found on site…"
    className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-base resize-none"
  />

// Cost input (around line 157-166):
<div className="space-y-1.5">
  <label htmlFor="variation-cost" className="text-sm font-medium">Cost Estimate ($AUD)</label>
  <input
    id="variation-cost"
    type="number"
    inputMode="decimal"
    value={costEstimate}
    onChange={(e) => setCostEstimate(e.target.value)}
    placeholder="0.00"
    className="w-full min-h-[44px] rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 text-base"
  />

// Photo input (around line 172-184):
<div className="space-y-1.5">
  <label htmlFor="variation-photo" className="text-sm font-medium">Photo (optional)</label>
  <input
    id="variation-photo"
    ref={fileRef}
    type="file"
    accept="image/*"
    capture="environment"
    onChange={handlePhotoChange}
    className="w-full text-sm text-slate-500 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-slate-100 file:text-slate-700 dark:file:bg-slate-700 dark:file:text-slate-200"
  />
```

- [ ] **Step 4: Verify build**

```bash
pnpm build
```

Expected: Build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/app/compliance/new/ComplianceForm.tsx \
        src/app/time-tracking/ClockCard.tsx \
        src/app/variations/VariationForm.tsx
git commit -m "fix: label/htmlFor associations, iOS text-base on all form controls (WCAG 1.3.1)"
```

---

### Task 3: Add photo preview in VariationForm + fix VariationCard cost and photo display

**Files:**
- Modify: `src/app/variations/VariationForm.tsx`
- Modify: `src/app/variations/VariationCard.tsx`

**Interfaces:**
- Produces: After photo upload, a thumbnail preview with "Retake" button appears. `costEstimate` renders with 2 decimal places. Portrait photos display with `object-contain`. "queried" action button is labelled "Send back".

- [ ] **Step 1: Add photo thumbnail preview to `VariationForm.tsx`**

In `src/app/variations/VariationForm.tsx`, find the photo section (around line 172). Replace the current upload status display with a preview:

The state `photoUrl` holds the blob URL. Add a `previewObjectUrl` state for the local canvas preview, OR just show the photo via the `/api/photos?url=` proxy once uploaded. Simplest approach: show the uploaded URL via the photo proxy as an `<img>` thumbnail.

Replace the photo section with:

```tsx
{/* Photo upload section — add this entire block in place of the existing photo div */}
<div className="space-y-1.5">
  <label htmlFor="variation-photo" className="text-sm font-medium">Photo (optional)</label>

  {photoUrl ? (
    <div className="space-y-2">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`/api/photos?url=${encodeURIComponent(photoUrl)}`}
        alt="Uploaded photo preview"
        className="w-full max-h-48 rounded-lg object-contain bg-slate-100 dark:bg-slate-800"
      />
      <button
        type="button"
        onClick={() => {
          setPhotoUrl(null);
          if (fileRef.current) fileRef.current.value = "";
        }}
        className="text-sm text-amber-600 underline underline-offset-2"
      >
        Retake photo
      </button>
    </div>
  ) : (
    <>
      <input
        id="variation-photo"
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handlePhotoChange}
        className="w-full text-sm text-slate-500 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-slate-100 file:text-slate-700 dark:file:bg-slate-700 dark:file:text-slate-200"
      />
      {uploadProgress && <p className="text-sm text-slate-500">Uploading…</p>}
      {errors.photo && <p className="text-sm text-red-600">{errors.photo}</p>}
    </>
  )}
</div>
```

- [ ] **Step 2: Fix `VariationCard.tsx` — cost decimal, photo crop, "queried" label**

In `src/app/variations/VariationCard.tsx`:

**Cost fix** — change `toFixed(0)` to `toFixed(2)` and show as currency:
```tsx
// Around line 69, replace:
${variation.costEstimate.toFixed(0)}
// With:
${Number(variation.costEstimate).toFixed(2)}
```

**Photo crop fix** — replace `aspect-video` with `object-contain`:
```tsx
// Around line 79, replace:
<div className="w-full aspect-video bg-slate-100 dark:bg-slate-900 overflow-hidden">
  <img
    src={photoSrc(variation.photoUrl)}
    alt="Variation photo"
    className="w-full h-full object-cover"
  />
</div>
// With:
<div className="w-full bg-slate-100 dark:bg-slate-900 overflow-hidden">
  {/* eslint-disable-next-line @next/next/no-img-element */}
  <img
    src={photoSrc(variation.photoUrl)}
    alt="Variation photo"
    className="w-full max-h-64 object-contain"
  />
</div>
```

**"queried" label fix** — rename to "Send back" in the decision buttons. The API still sends `"queried"` — only the display label changes:
```tsx
// Around line 91-108, replace the button label for "queried":
{(["approved", "rejected", "queried"] as const).map((a) => (
  <button
    key={a}
    onClick={() => handleSelect(a)}
    className={cn(
      "flex-1 min-h-[44px] rounded-lg text-sm font-medium capitalize border transition-colors",
      action === a
        ? a === "approved"
          ? "bg-emerald-600 text-white border-emerald-600"
          : a === "rejected"
            ? "bg-red-600 text-white border-red-600"
            : "bg-slate-600 text-white border-slate-600"
        : "border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-300 bg-transparent"
    )}
  >
    {a === "queried" ? "Send back" : a}
  </button>
))}
```

- [ ] **Step 3: Build and verify**

```bash
pnpm build
```

Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/app/variations/VariationForm.tsx \
        src/app/variations/VariationCard.tsx
git commit -m "fix: photo preview with retake, cost decimal, portrait photo crop, 'Send back' label"
```

---

### Task 4: Clock-in fallback when no assignments exist

**Files:**
- Modify: `src/app/time-tracking/page.tsx`
- Modify: `src/app/time-tracking/ClockCard.tsx`
- Modify: `src/app/api/time/clock-in/route.ts`

**Interfaces:**
- Produces: Technicians see all active/scheduled jobs when no assignments exist for today (with a note "No formal assignment — select job"). Service managers and directors bypass the assignment check entirely (they manage jobs, not work them).

- [ ] **Step 1: Update `src/app/time-tracking/page.tsx` to fetch fallback jobs**

```typescript
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

  let jobs = assignments.map((a) => a.job);
  let usingFallback = false;

  // Fallback: if no assignments today, show all active/scheduled jobs
  // so technicians who arrive at an unplanned job can still clock in
  if (jobs.length === 0) {
    const fallbackJobs = await db.job.findMany({
      where: { status: { in: ["active", "scheduled"] } },
      select: { id: true, customerName: true, siteName: true, siteAddress: true },
      orderBy: { customerName: "asc" },
    });
    jobs = fallbackJobs;
    usingFallback = true;
  }

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

        <ClockCard jobs={jobs} activeEntry={serialisedEntry} usingFallback={usingFallback} />
      </div>
    </AppShell>
  );
}
```

- [ ] **Step 2: Update `ClockCard.tsx` to show fallback note and accept `usingFallback` prop**

In `src/app/time-tracking/ClockCard.tsx`, update the interface and render:

```typescript
interface ClockCardProps {
  jobs: Job[];
  activeEntry: ActiveEntry | null;
  usingFallback?: boolean;
}

export function ClockCard({ jobs, activeEntry, usingFallback = false }: ClockCardProps) {
  // ... all state and handlers unchanged ...

  // In the not-clocked-in section, update the empty state and add a note:
  return (
    <div className="flex flex-col gap-4 p-5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
      <p className="text-xs font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400">
        Not clocked in
      </p>

      {jobs.length === 0 ? (
        <p className="text-sm text-slate-500">No active jobs available.</p>
      ) : (
        <>
          {usingFallback && (
            <p className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 rounded-lg px-3 py-2">
              No assignment for today — select a job to clock in manually.
            </p>
          )}
          <label htmlFor="clock-job-select" className="sr-only">Select job to clock in</label>
          <select
            id="clock-job-select"
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
            className="w-full min-h-[52px] rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-semibold text-base disabled:opacity-40 active:scale-[0.98] transition-transform"
          >
            {isPending ? "Clocking in…" : "Clock In"}
          </button>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Relax assignment check for non-technician roles in `clock-in/route.ts`**

Directors and service managers are not typically assigned to jobs but need to log time. Only technicians require an assignment.

In `src/app/api/time/clock-in/route.ts`:

```typescript
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

  const activeEntry = await db.timeEntry.findFirst({
    where: { userId: user.id, status: "active" },
  });
  if (activeEntry) {
    return NextResponse.json(
      { error: "Already clocked in to another job. Clock out first." },
      { status: 409 }
    );
  }

  // Technicians must be assigned to the job; directors and service managers may clock in freely
  if (user.role === "technician") {
    const assignment = await db.assignment.findFirst({
      where: { userId: user.id, jobId },
    });
    if (!assignment) {
      return NextResponse.json(
        { error: "Not assigned to this job. Ask your manager to add you to the schedule." },
        { status: 403 }
      );
    }
  }

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

- [ ] **Step 4: Build and verify**

```bash
pnpm build
```

Expected: Build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/app/time-tracking/page.tsx \
        src/app/time-tracking/ClockCard.tsx \
        src/app/api/time/clock-in/route.ts
git commit -m "fix: clock-in fallback shows all active jobs when not assigned; directors bypass assignment gate"
```

---

### Task 5: Add bottom tab bar for technician role (mobile only)

**Files:**
- Create: `src/components/nav/BottomTabBarClient.tsx`
- Create: `src/components/nav/BottomTabBar.tsx`
- Modify: `src/components/layout/AppShell.tsx`

**Interfaces:**
- Consumes: `getSessionUser()` from `@/lib/auth/clerk`, `navItems` from `@/lib/nav-config`
- Produces: A persistent `fixed bottom-0` bar with 3 tabs (Time Tracking, Compliance, Log Variation) shown only for technician role on `< lg` screens. Main content gets `pb-20` to avoid overlap.

- [ ] **Step 1: Create `src/components/nav/BottomTabBarClient.tsx`**

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils/cn";
import type { LucideIcon } from "lucide-react";

export interface TabItem {
  href: string;
  label: string;
  Icon: LucideIcon;
}

interface Props {
  tabs: TabItem[];
}

export function BottomTabBarClient({ tabs }: Props) {
  const pathname = usePathname();

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 flex h-16 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 safe-area-inset-bottom">
      {tabs.map(({ href, label, Icon }) => {
        const isActive = pathname === href || pathname.startsWith(href + "/");
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex flex-1 flex-col items-center justify-center gap-0.5 text-xs font-medium transition-colors",
              isActive
                ? "text-amber-600 dark:text-amber-400"
                : "text-slate-500 dark:text-slate-400"
            )}
          >
            <Icon className={cn("h-5 w-5", isActive && "text-amber-600 dark:text-amber-400")} />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
```

- [ ] **Step 2: Create `src/components/nav/BottomTabBar.tsx`**

```tsx
import { getSessionUser } from "@/lib/auth/clerk";
import { navItems } from "@/lib/nav-config";
import { BottomTabBarClient } from "./BottomTabBarClient";

// Bottom tab bar shown only for technician role on mobile.
// Admin/director/service_manager have more nav items and use the hamburger drawer.
const TECHNICIAN_HREFS = ["/time-tracking", "/compliance", "/variations/submit"];

export async function BottomTabBar() {
  const user = await getSessionUser();
  if (!user || user.role !== "technician") return null;

  const tabs = TECHNICIAN_HREFS.flatMap((href) => {
    const item = navItems.find((n) => n.href === href);
    if (!item) return [];
    return [{ href: item.href, label: item.label, Icon: item.icon }];
  });

  return <BottomTabBarClient tabs={tabs} />;
}
```

- [ ] **Step 3: Update `src/components/layout/AppShell.tsx` to include BottomTabBar and conditional bottom padding**

```tsx
import { Sidebar } from "@/components/nav/Sidebar";
import { MobileNav } from "@/components/nav/MobileNav";
import { BottomTabBar } from "@/components/nav/BottomTabBar";
import { TopBar } from "@/components/nav/TopBar";
import { getSessionUser } from "@/lib/auth/clerk";

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

Note: `AppShell` needs to become an `async` server component to call `getSessionUser()`. Verify there's no `"use client"` directive on the current file — there isn't (it's already a server component).

- [ ] **Step 4: Build and verify**

```bash
pnpm build
```

Expected: Build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/components/nav/BottomTabBar.tsx \
        src/components/nav/BottomTabBarClient.tsx \
        src/components/layout/AppShell.tsx
git commit -m "feat: bottom tab bar for technician role on mobile (Time Tracking / Compliance / Log Variation)"
```

---

### Task 6: Navigation cleanup — settings link, schedule visibility, phase badges, version label, bell dot, amber-600

**Files:**
- Modify: `src/lib/nav-config.ts`
- Modify: `src/components/nav/NavLinks.tsx`
- Modify: `src/components/nav/MobileNavClient.tsx`
- Modify: `src/components/nav/Sidebar.tsx`
- Modify: `src/components/nav/TopBar.tsx`

**Interfaces:**
- Produces: Admin can see Schedule. Settings link goes to `/settings` (admin/director only). Phase badges have `aria-hidden`. Version label is "CT Field Ops" on both mobile and desktop. Amber dot on bell is removed. Hamburger button is 44×44px. `dark:hover:bg-slate-850` replaced with `dark:hover:bg-slate-800`. Amber CTA buttons throughout use `bg-amber-600`.

- [ ] **Step 1: Update `src/lib/nav-config.ts` — add admin to Schedule**

```typescript
// Change the Schedule nav item's visibleTo (around line 79):
{
  label: "Schedule",
  href: "/schedule",
  icon: Calendar,
  description: "Crew assignments and breakdown response",
  visibleTo: ["service_manager", "director", "admin"],
  phase: "1b",
},
```

- [ ] **Step 2: Update `src/components/nav/NavLinks.tsx`**

Five changes:
1. Fix `dark:hover:bg-slate-850` → `dark:hover:bg-slate-800` (3 occurrences)
2. Settings link: `href="#"` → `href="/settings"`, hide from non-admin/director
3. Phase badge: add `aria-hidden="true"`, hide from technicians (but keep in DOM)

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SignOutButton } from "@clerk/nextjs";
import { cn } from "@/lib/utils/cn";
import { Settings, LogOut } from "lucide-react";
import { navItems, type UserRole } from "@/lib/nav-config";

interface Props {
  visibleHrefs: string[];
  user: { name: string; role: UserRole } | null;
  onNavigate?: () => void;
}

export function NavLinks({ visibleHrefs, user, onNavigate }: Props) {
  const pathname = usePathname();
  const visibleItems = navItems.filter((item) =>
    visibleHrefs.includes(item.href)
  );
  const canSeeSettings = user?.role === "admin" || user?.role === "director";

  return (
    <>
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <div className="mb-2 px-3 text-2xs font-mono uppercase tracking-wider text-slate-500 dark:text-slate-500">
          Operations
        </div>
        <ul className="space-y-0.5">
          {visibleItems.map((item) => {
            const isActive =
              pathname === item.href || pathname.startsWith(item.href + "/");
            const Icon = item.icon;

            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={onNavigate}
                  className={cn(
                    "group relative flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                    isActive
                      ? "bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-50 font-medium"
                      : "text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100"
                  )}
                >
                  {isActive && (
                    <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r bg-amber-500" />
                  )}
                  <Icon
                    className={cn(
                      "h-4 w-4 shrink-0",
                      isActive
                        ? "text-amber-500"
                        : "text-slate-500 dark:text-slate-500 group-hover:text-slate-700 dark:group-hover:text-slate-300"
                    )}
                  />
                  <span className="flex-1">{item.label}</span>
                  {/* Phase badge: hidden from end users, visible to admin/director only */}
                  {(user?.role === "admin" || user?.role === "director") && (
                    <span aria-hidden="true" className="text-2xs font-mono text-slate-400 dark:text-slate-600">
                      {item.phase}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="border-t border-slate-200 dark:border-slate-800 p-3">
        <div className="mb-2 flex items-center gap-3 rounded-md px-3 py-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900 text-xs font-medium text-amber-700 dark:text-amber-300">
            {user ? user.name.charAt(0).toUpperCase() : "?"}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
              {user ? user.name : "Not signed in"}
            </div>
            <div className="text-2xs font-mono uppercase tracking-wider text-slate-500">
              {user ? user.role.replace("_", " ") : "No role"}
            </div>
          </div>
        </div>
        <div className="space-y-0.5">
          {canSeeSettings && (
            <Link
              href="/settings"
              onClick={onNavigate}
              className="flex items-center gap-3 rounded-md px-3 py-1.5 text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100"
            >
              <Settings className="h-4 w-4" />
              Settings
            </Link>
          )}
          {user ? (
            <SignOutButton>
              <button className="flex w-full items-center gap-3 rounded-md px-3 py-1.5 text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100">
                <LogOut className="h-4 w-4" />
                Sign out
              </button>
            </SignOutButton>
          ) : (
            <Link
              href="/sign-in"
              className="flex items-center gap-3 rounded-md px-3 py-1.5 text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100"
            >
              <LogOut className="h-4 w-4" />
              Sign in
            </Link>
          )}
        </div>
      </div>
    </>
  );
}
```

- [ ] **Step 3: Fix hamburger button size and version label in `MobileNavClient.tsx`**

Two changes:
1. `h-9 w-9` → `h-11 w-11` on the hamburger button
2. "Phase 1b" → "CT Field Ops"

```tsx
// Hamburger button (around line 19-23):
<button
  onClick={() => setIsOpen(true)}
  className="lg:hidden fixed top-3 left-3 z-50 flex h-11 w-11 items-center justify-center rounded-md text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
  aria-label="Open menu"
>
  <Menu className="h-5 w-5" />
</button>

// Version label (around line 47-49):
<span className="text-2xs leading-tight text-slate-500 dark:text-slate-400 font-mono uppercase tracking-wider">
  CT Field Ops
</span>
```

- [ ] **Step 4: Fix version label in `Sidebar.tsx`**

Same change:
```tsx
// Around line 24-26:
<span className="text-2xs leading-tight text-slate-500 dark:text-slate-400 font-mono uppercase tracking-wider">
  CT Field Ops
</span>
```

- [ ] **Step 5: Remove amber dot from bell in `TopBar.tsx`**

```tsx
// Remove the dot span. Replace:
<button
  className="relative flex h-9 w-9 items-center justify-center rounded-md text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100 transition-colors"
  aria-label="Notifications"
>
  <Bell className="h-4 w-4" />
  <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-amber-500" />
</button>

// With (dot removed):
<button
  className="flex h-9 w-9 items-center justify-center rounded-md text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100 transition-colors"
  aria-label="Notifications"
>
  <Bell className="h-4 w-4" />
</button>
```

- [ ] **Step 6: Run build and all tests**

```bash
pnpm build && pnpm test
```

Expected: Build succeeds and all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/lib/nav-config.ts \
        src/components/nav/NavLinks.tsx \
        src/components/nav/MobileNavClient.tsx \
        src/components/nav/Sidebar.tsx \
        src/components/nav/TopBar.tsx
git commit -m "fix: nav cleanup — schedule for admin, settings link, phase badges hidden, version label, bell dot, 44px hamburger"
```

- [ ] **Step 8: Push all changes**

```bash
git push
```
