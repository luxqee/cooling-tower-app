# UI Polish: Theme, Sidebar Quick-Actions & Consistency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sunlight-readable contrast, a manual light/dark toggle reachable by every role, hover-triggered sidebar quick-actions for create-capable sections, toast notifications replacing scattered inline error text, one unified status-badge component, route-level loading skeletons, and glove-friendly touch targets.

**Architecture:** 16 bite-sized tasks across the 7 parts from the design spec. Two new dependencies (`next-themes`, `sonner`). No schema changes, no new routes beyond two `?new=1`-aware client components and three new `loading.tsx` files (a first-class Next.js App Router convention — dropping a `loading.tsx` next to a route's `page.tsx` automatically Suspense-wraps it, no page.tsx changes needed).

**Tech Stack:** Next.js 14 App Router, Tailwind CSS, TypeScript, Vitest, `next-themes`, `sonner`.

## Global Constraints

- Stay within the existing slate + amber palette family (`tailwind.config.ts`) — no new brand colors.
- The theme toggle must be reachable by every role, including `technician` (confirmed: `/settings` is `["director", "admin"]`-only in `src/lib/permissions.ts`, so the toggle cannot live there) — it goes in `TopBar`, which every role sees on every page.
- Sidebar hover quick-actions are desktop-only (`Sidebar.tsx` is already `hidden lg:flex`) — no mobile equivalent.
- No behavior change to any existing create-flow's validation/submission logic — only how the form is *reached* changes.
- Every `dark:`-prefixed class is a deliberate dark-mode override and must be left untouched by the Part 1 contrast pass — only bare (non-`dark:`-prefixed) `text-slate-400`/`border-slate-200` tokens are in scope.
- `tailwind.config.ts` overrides Tailwind's stock `slate` scale (`slate.400` here is `#7d8ea3`, not Tailwind's default `#94a3b8`) — this only matters as background knowledge; no code depends on the literal hex.

Full context: `docs/superpowers/specs/2026-07-14-ui-polish-theme-sidebar-design.md`.

---

## Part 1: Color Palette Contrast

### Task 1: Bulk contrast pass — light-mode text and borders

**Files:**
- Modify: every `.tsx` file under `src/app` and `src/components` containing a bare (non-`dark:`-prefixed) `text-slate-400` or `border-slate-200` class (150 + 84 occurrences respectively, per repo-wide grep — see Interfaces below for the exact commands).

**Interfaces:**
- No new exports. This is a pure CSS-class string change with zero logic/type impact — `tsc` cannot catch anything here since these are string literals in `className` props.

**Scope note:** the spec's Part 1 also mentioned standardizing inconsistent `amber-500`/`amber-600` usage. That audit found 58 sites (24 `bg-amber-500` + 34 `bg-amber-600`) spanning buttons, badges, icons, and decorative accents — fixing it requires per-site judgment (is this a primary action button vs. a decorative accent?) that a scripted bulk edit can't safely make, and both shades are already plenty saturated for outdoor visibility (the actual readability driver is text/border contrast, not accent-hue consistency). **Descoped from this plan** — left as a candidate for a separate, smaller follow-up pass if wanted.

- [ ] **Step 1: Run the bulk replace**

This is a single scripted, reproducible change — not manually authored per-file, given the volume (234 occurrences). Use `perl` for negative-lookbehind support (`sed` doesn't have it, and a naive replace would also corrupt every `dark:text-slate-400`/`dark:border-slate-200` occurrence, which must NOT change):

```bash
grep -rlZ 'text-slate-400' src/app src/components --include="*.tsx" | xargs -0 perl -pi -e 's/(?<!dark:)text-slate-400/text-slate-500/g'
grep -rlZ 'border-slate-200' src/app src/components --include="*.tsx" | xargs -0 perl -pi -e 's/(?<!dark:)border-slate-200/border-slate-300/g'
```

- [ ] **Step 2: Verify no `dark:` variants were touched**

Run: `grep -rn "dark:text-slate-500\|dark:border-slate-300" src/app src/components --include="*.tsx"`
Expected: **zero matches**. If any appear, the lookbehind failed to protect a `dark:` line — investigate before continuing (most likely cause: a class string with unusual spacing/formatting the regex didn't anticipate).

Run: `grep -rn "dark:text-slate-400\|dark:border-slate-200" src/app src/components --include="*.tsx" | wc -l`
Expected: a non-zero count roughly matching the pre-change dark-mode occurrence count (these should be untouched — spot-check 2-3 of them manually against `git diff` to confirm they weren't modified).

- [ ] **Step 3: Run the full test suite and typecheck**

Run: `npx vitest run && npx tsc --noEmit`
Expected: PASS, no errors (this change cannot affect either — it's a pure styling diff — but confirms nothing else broke and no file was corrupted by the bulk edit).

- [ ] **Step 4: Spot-check a high-traffic page visually**

Run `npm run dev`, open `/jobs` and `/dashboard` in both light and dark mode. Confirm secondary text and card borders are still legible and nothing looks obviously broken (e.g. a border color that no longer pairs sensibly with its background). This is a `perl`-driven bulk edit across ~40+ files — a visual pass catches anything the mechanical steps above can't.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "fix: tighten light-mode text/border contrast for outdoor readability"
```

---

## Part 2: Manual Light/Dark Toggle

### Task 2: Add next-themes, wire ThemeProvider, switch to class-based dark mode

**Files:**
- Modify: `package.json` (add dependency)
- Modify: `tailwind.config.ts`
- Modify: `src/app/globals.css`
- Modify: `src/app/layout.tsx`

**Interfaces:**
- Produces: dark mode now driven by a `.dark` class on `<html>` (set by `next-themes`) instead of Tailwind's `media` strategy. Every existing `dark:` utility class in the codebase continues to work unchanged — only the *mechanism* selecting light vs. dark changes, not how components declare their dark styles.

- [ ] **Step 1: Install next-themes**

```bash
npm install next-themes --legacy-peer-deps
```

(`--legacy-peer-deps` matches how this repo's own dependencies were installed this session — the repo has a pre-existing Next 14/Clerk 7 peer-dependency conflict unrelated to this change.)

- [ ] **Step 2: Switch Tailwind to class-based dark mode**

In `tailwind.config.ts`, add `darkMode: "class"` (the key is currently absent, which defaults to the `media` strategy). Change:

```ts
const config: Config = {
  content: [
```

to:

```ts
const config: Config = {
  darkMode: "class",
  content: [
```

- [ ] **Step 3: Update globals.css to the class strategy**

Change:

```css
:root {
  --background: #f4f7fa;
  --foreground: #0f1419;
}

@media (prefers-color-scheme: dark) {
  :root {
    --background: #0a0e14;
    --foreground: #e4ebf2;
  }
}
```

to:

```css
:root {
  --background: #f4f7fa;
  --foreground: #0f1419;
}

.dark {
  --background: #0a0e14;
  --foreground: #e4ebf2;
}
```

- [ ] **Step 4: Wrap the root layout with ThemeProvider**

In `src/app/layout.tsx`, add the import after the existing `ClerkProvider` import (line 4):

```tsx
import { ClerkProvider } from "@clerk/nextjs";
import { ThemeProvider } from "next-themes";
```

Change the `<html>` tag (line 32) to add `suppressHydrationWarning` (required by `next-themes` — the server can't know the client's stored theme preference, so React's hydration-mismatch warning for the `class` attribute must be suppressed on this element specifically):

```tsx
<html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
```

to:

```tsx
<html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`} suppressHydrationWarning>
```

Wrap the `<body>` contents with `ThemeProvider`. Change:

```tsx
<body className="bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 antialiased">
  <PushRegistrar />
  {children}
</body>
```

to:

```tsx
<body className="bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 antialiased">
  <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
    <PushRegistrar />
    {children}
  </ThemeProvider>
</body>
```

- [ ] **Step 5: Run the full test suite and typecheck**

Run: `npx vitest run && npx tsc --noEmit`
Expected: PASS, no errors.

- [ ] **Step 6: Manual verification**

Run `npm run dev`. Confirm the app still renders correctly and respects the OS light/dark preference exactly as before (no toggle exists yet — this task only changes the underlying mechanism, Task 3 adds the UI).

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json tailwind.config.ts src/app/globals.css src/app/layout.tsx
git commit -m "feat: switch to class-based dark mode via next-themes (no UI toggle yet)"
```

---

### Task 3: ThemeToggle component, wired into TopBar

**Files:**
- Create: `src/components/theme/ThemeToggle.tsx`
- Modify: `src/components/nav/TopBar.tsx`

**Interfaces:**
- Consumes: `next-themes`' `useTheme()` hook (from Task 2's `ThemeProvider`).
- Produces: `<ThemeToggle />` — a self-contained client component, no props.

- [ ] **Step 1: Write the ThemeToggle component**

```tsx
// src/components/theme/ThemeToggle.tsx
"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Sun, Moon } from "lucide-react";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  // next-themes can't know the resolved theme until after client hydration —
  // render a neutral placeholder until then to avoid a light/dark icon flash.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return <div className="h-11 w-11" aria-hidden="true" />;
  }

  const isDark = resolvedTheme === "dark";

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className="flex h-11 w-11 items-center justify-center rounded-md text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100 transition-colors"
    >
      {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}
```

- [ ] **Step 2: Wire it into TopBar**

In `src/components/nav/TopBar.tsx`, add the import after line 7:

```tsx
import { NotificationBell } from "./NotificationBell";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
```

Change line 165 (`<NotificationBell />`, inside the `<div className="flex items-center gap-2">` opened at line 90) to:

```tsx
<ThemeToggle />
<NotificationBell />
```

- [ ] **Step 3: Run typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Manual verification**

Run `npm run dev`, sign in as any role, click the new sun/moon icon in the top bar. Confirm it toggles the whole app between light and dark instantly, and that reloading the page keeps the chosen theme (persisted by `next-themes` via localStorage).

- [ ] **Step 5: Commit**

```bash
git add src/components/theme/ThemeToggle.tsx src/components/nav/TopBar.tsx
git commit -m "feat: add manual light/dark toggle to TopBar, reachable by every role"
```

---

## Part 3: Sidebar Hover Quick-Actions

### Task 4: Add quickAction field to nav-config.ts

**Files:**
- Modify: `src/lib/nav-config.ts`

**Interfaces:**
- Produces: `NavItem.quickAction?: { label: string; href: string }` — consumed by Task 5 (`NavLinks.tsx`).

- [ ] **Step 1: Extend the NavItem interface**

Change:

```ts
export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  description: string;
  // Which roles can see this nav item. Sourced from permissions.ts wherever
  // a page has its own single-source-of-truth requireRole() check for the
  // same access boundary — see that file for which sections aren't covered.
  visibleTo: readonly UserRole[];
}
```

to:

```ts
export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  description: string;
  // Which roles can see this nav item. Sourced from permissions.ts wherever
  // a page has its own single-source-of-truth requireRole() check for the
  // same access boundary — see that file for which sections aren't covered.
  visibleTo: readonly UserRole[];
  // Shown in the desktop sidebar's hover-expand panel (NavLinks.tsx) for
  // sections with a real "create" action. Omit for sections with nothing
  // to quick-create (Dashboard, Time tracking, Settings, etc.).
  quickAction?: { label: string; href: string };
}
```

- [ ] **Step 2: Add quickAction to the five relevant items**

Add a `quickAction` field to exactly these five `navItems` entries (leave all others unchanged):

Jobs:
```ts
  {
    label: "Jobs",
    href: "/jobs",
    icon: Briefcase,
    description: "Active jobs with hours logged vs quoted",
    visibleTo: PAGE_ACCESS.jobs,
    quickAction: { label: "+ Add Job", href: "/jobs?new=1" },
  },
```

Schedule:
```ts
  {
    label: "Schedule",
    href: "/schedule",
    icon: Calendar,
    description: "Crew assignments and breakdown response",
    visibleTo: ["service_manager", "director", "admin", "technician"],
    quickAction: { label: "+ Assign Job", href: "/schedule" },
  },
```

Compliance:
```ts
  {
    label: "Compliance",
    href: "/compliance",
    icon: ShieldCheck,
    description: "SWMS, JSA, and WHS compliance documents",
    visibleTo: PAGE_ACCESS.compliance,
    quickAction: { label: "+ New Document", href: "/compliance/new" },
  },
```

Quotes:
```ts
  {
    label: "Quotes",
    href: "/quotes",
    icon: BarChart2,
    description: "Historical job data for quoting",
    visibleTo: PAGE_ACCESS.quotes,
    quickAction: { label: "+ New Quote", href: "/quotes?new=1" },
  },
```

Customers:
```ts
  {
    label: "Customers",
    href: "/customers",
    icon: Building2,
    description: "Customer contacts and linked jobs",
    visibleTo: PAGE_ACCESS.customers,
    quickAction: { label: "+ New Customer", href: "/customers/new" },
  },
```

- [ ] **Step 3: Run typecheck**

Run: `npx tsc --noEmit`
Expected: no errors (`quickAction` is optional, so the eight untouched `navItems` entries remain valid).

- [ ] **Step 4: Commit**

```bash
git add src/lib/nav-config.ts
git commit -m "feat: add quickAction field to nav-config for the 5 create-capable sections"
```

---

### Task 5: Inline-expand hover interaction in NavLinks.tsx

**Files:**
- Modify: `src/components/nav/NavLinks.tsx`

**Interfaces:**
- Consumes: `NavItem.quickAction` and `NavItem.description` (Task 4; `description` already existed but was unused until now).

- [ ] **Step 1: Replace the nav item rendering**

Change the `<li>` block (current lines 36-61):

```tsx
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
                </Link>
              </li>
```

to:

```tsx
              <li
                key={item.href}
                className={cn(
                  "group/item rounded-md transition-[max-height] duration-200 ease-out overflow-hidden",
                  item.quickAction ? "max-h-9 hover:max-h-24" : "max-h-9"
                )}
              >
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
                </Link>
                {item.quickAction && (
                  <div className="px-3 pb-2 pt-0.5 opacity-0 group-hover/item:opacity-100 transition-opacity duration-150 delay-75">
                    <p className="text-2xs text-slate-500 dark:text-slate-500 leading-snug mb-1.5">
                      {item.description}
                    </p>
                    <Link
                      href={item.quickAction.href}
                      onClick={onNavigate}
                      className="block text-center text-2xs font-semibold rounded px-2 py-1 bg-amber-500 hover:bg-amber-600 text-slate-950 transition-colors"
                    >
                      {item.quickAction.label}
                    </Link>
                  </div>
                )}
              </li>
```

Note: `max-h-9` (36px) matches the collapsed row's natural height (`py-2` + text line-height); `max-h-24` (96px) comfortably fits the description line + button when expanded. `group/item` and `group-hover/item` are Tailwind's *named* group syntax — required here because the `<Link>` inside already uses the unnamed `group`/`group-hover` for its own icon-color hover effect, and nesting two unnamed groups would make the icon incorrectly react to the outer `<li>` hover too.

- [ ] **Step 2: Run the full test suite and typecheck**

Run: `npx vitest run && npx tsc --noEmit`
Expected: PASS, no errors (`NavLinks.tsx` has no dedicated test file — client nav components aren't unit tested per this repo's convention — so this confirms nothing else broke).

- [ ] **Step 3: Manual verification**

Run `npm run dev` on a desktop-width viewport, sign in as `director`. Hover over "Jobs" — confirm the description + "+ Add Job" button smoothly reveal without pushing "Time tracking" (the item below) down abruptly. Hover over "Dashboard" (no `quickAction`) — confirm nothing expands. Confirm keyboard/focus navigation still reaches every link (tab through the sidebar).

- [ ] **Step 4: Commit**

```bash
git add src/components/nav/NavLinks.tsx
git commit -m "feat: inline-expand hover panel on sidebar items with a quick-action"
```

---

### Task 6: Auto-open "New Job" modal via ?new=1

**Files:**
- Modify: `src/app/jobs/JobsClient.tsx`

**Interfaces:**
- Consumes: the `new` URL search param, set by the sidebar quick-action link from Task 4 (`/jobs?new=1`).

- [ ] **Step 1: Add the search-param-driven auto-open effect**

Change the import (line 8):

```ts
import { useRouter } from "next/navigation";
```

to:

```ts
import { useRouter, useSearchParams } from "next/navigation";
```

Directly after the existing `const [showForm, setShowForm] = useState(false);` (line 556), add:

```ts
  const searchParams = useSearchParams();
  useEffect(() => {
    if (searchParams.get("new") === "1") setShowForm(true);
    // Only ever needs to fire once, on the params present at mount —
    // re-running on every searchParams change would re-open a form the
    // user just closed if any other param on this page changes later.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
```

(`useEffect` is already imported at line 2 — `import { useState, useTransition, useEffect } from "react";` — no new import needed for it.)

- [ ] **Step 2: Run the full test suite and typecheck**

Run: `npx vitest run && npx tsc --noEmit`
Expected: PASS, no errors.

- [ ] **Step 3: Manual verification**

Run `npm run dev`, sign in as `director`, navigate directly to `/jobs?new=1`. Confirm the "New job" modal is already open on load. Navigate to plain `/jobs` (no param) — confirm it does NOT auto-open.

- [ ] **Step 4: Commit**

```bash
git add src/app/jobs/JobsClient.tsx
git commit -m "feat: auto-open the New Job modal when landing on /jobs?new=1"
```

---

### Task 7: Auto-open "New Quote" modal via ?new=1

**Files:**
- Modify: `src/app/quotes/NewQuoteButton.tsx`

**Interfaces:**
- Consumes: the `new` URL search param, set by the sidebar quick-action link from Task 4 (`/quotes?new=1`).

- [ ] **Step 1: Add the search-param-driven auto-open effect**

`NewQuoteButton.tsx` owns its `open` state locally (`const [open, setOpen] = useState(false);` at line 22) rather than receiving it from a parent — confirmed via research, `QuotesClient.tsx` has no reference to this component at all, they're independent siblings. Add `useSearchParams` directly inside this file.

Find this component's existing imports (near the top of the file) and add `useSearchParams` to whatever `next/navigation` import exists, or add a new one if none exists yet:

```ts
import { useSearchParams } from "next/navigation";
```

Directly after `const [open, setOpen] = useState(false);` (line 22), add:

```ts
  const searchParams = useSearchParams();
  useEffect(() => {
    if (searchParams.get("new") === "1") setOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
```

If `useEffect` isn't already imported from `"react"` in this file, add it to that import line.

- [ ] **Step 2: Run the full test suite and typecheck**

Run: `npx vitest run && npx tsc --noEmit`
Expected: PASS, no errors.

- [ ] **Step 3: Manual verification**

Run `npm run dev`, sign in as a role that can see Quotes, navigate directly to `/quotes?new=1`. Confirm the new-quote form is already open on load. Navigate to plain `/quotes` — confirm it does NOT auto-open.

- [ ] **Step 4: Commit**

```bash
git add src/app/quotes/NewQuoteButton.tsx
git commit -m "feat: auto-open the New Quote form when landing on /quotes?new=1"
```

---

## Part 4: Toast Notifications

### Task 8: Add sonner, mount Toaster

**Files:**
- Modify: `package.json`
- Modify: `src/app/layout.tsx`

**Interfaces:**
- Produces: a globally-mounted `<Toaster />`; every later task in this part calls `toast.error(...)`/`toast.success(...)` from `"sonner"` directly (no wrapper needed — `sonner`'s API is already minimal).

- [ ] **Step 1: Install sonner**

```bash
npm install sonner --legacy-peer-deps
```

- [ ] **Step 2: Mount the Toaster in the root layout**

In `src/app/layout.tsx`, add the import after the `next-themes` import (from Task 2):

```tsx
import { ThemeProvider } from "next-themes";
import { Toaster } from "sonner";
```

Add `<Toaster />` as a sibling of `{children}` inside `ThemeProvider` (so it inherits the app's theme automatically via `sonner`'s theme prop). Change:

```tsx
  <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
    <PushRegistrar />
    {children}
  </ThemeProvider>
```

to:

```tsx
  <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
    <PushRegistrar />
    {children}
    <Toaster richColors position="top-center" />
  </ThemeProvider>
```

(`richColors` gives error/success toasts distinct red/green backgrounds out of the box — matching this app's existing semantic-color conventions rather than a flat neutral toast.)

- [ ] **Step 3: Run typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json src/app/layout.tsx
git commit -m "feat: add sonner toast system, mounted globally"
```

---

### Task 9: Convert inline error text to toasts — batch 1 (clean single-purpose cases)

**Files:**
- Modify: `src/app/jobs/[id]/DeleteVoiceNoteButton.tsx`
- Modify: `src/app/team/TeamClient.tsx`
- Modify: `src/app/quotes/NewQuoteButton.tsx`

**Interfaces:**
- Consumes: `toast` from `"sonner"` (Task 8).

These three are the cleanest cases — each has exactly one submit-result `error` state, set only inside a user-triggered async action's failure branch, with no pre-submission validation sharing the same state.

**`src/app/dashboard/CrewBoard.tsx` was considered for this batch and deliberately excluded**: its `error` state (`useState(false)`, a boolean) is driven by a 5-second polling interval (`setInterval(fetchCrew, 5_000)`), not a one-time user action. A toast for a recurring background poll failure would fire repeatedly (or need de-duplication logic this app has no pattern for yet) every 5 seconds while a connection stays down — the existing persistent inline banner is the *correct* pattern for this case, not a bug to fix. Left untouched.

- [ ] **Step 1: `DeleteVoiceNoteButton.tsx`**

Add the import: `import { toast } from "sonner";`

Change:

```tsx
  async function handleDelete() {
    if (!window.confirm("Delete this voice note? This can't be undone.")) return;
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/jobs/${jobId}/voice-notes/${noteId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      router.refresh();
    } catch {
      setError("Failed to delete. Try again.");
      setDeleting(false);
    }
  }
```

to:

```tsx
  async function handleDelete() {
    if (!window.confirm("Delete this voice note? This can't be undone.")) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/jobs/${jobId}/voice-notes/${noteId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      router.refresh();
    } catch {
      toast.error("Failed to delete. Try again.");
      setDeleting(false);
    }
  }
```

Remove the `const [error, setError] = useState<string | null>(null);` declaration and the `{error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}` render block at the end of the component's JSX.

- [ ] **Step 2: `TeamClient.tsx`**

Add the import: `import { toast } from "sonner";`

In `UserRow`'s `save()` function, change:

```ts
  function save() {
    startTransition(async () => {
      const res = await fetch(`/api/team/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role, isActive }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Failed to update.");
        return;
      }
      setEditing(false);
```

to:

```ts
  function save() {
    startTransition(async () => {
      const res = await fetch(`/api/team/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role, isActive }),
      });
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error ?? "Failed to update.");
        return;
      }
      setEditing(false);
```

Remove the `const [error, setError] = useState<string | null>(null);` declaration and the render block at line 126: `{error && <p className="text-xs text-red-600">{error}</p>}`.

- [ ] **Step 3: `NewQuoteButton.tsx`**

Add the import: `import { toast } from "sonner";`

In `save()`, change:

```ts
      if (!res.ok) { setError((await res.json()).error ?? "Failed to create quote."); return; }
```

to:

```ts
      if (!res.ok) { toast.error((await res.json()).error ?? "Failed to create quote."); return; }
```

Remove the `const [error, setError] = useState<string | null>(null);` declaration (line 34) and the render block at line 202: `{error && <p className="text-sm text-red-600">{error}</p>}`. Note: `reset()`'s `setError(null)` call also becomes dead and should be removed from `reset()` too, since `error` no longer exists as state.

- [ ] **Step 4: Run the full test suite and typecheck**

Run: `npx vitest run && npx tsc --noEmit`
Expected: PASS, no errors.

- [ ] **Step 5: Manual verification**

For at least one of the three (e.g. trigger a failed voice-note delete by disconnecting network briefly, or a failed team-member update), confirm a toast appears instead of inline text. Confirm `CrewBoard`'s inline "Failed to refresh" banner still works exactly as before (unchanged).

- [ ] **Step 6: Commit**

```bash
git add src/app/jobs/\[id\]/DeleteVoiceNoteButton.tsx src/app/team/TeamClient.tsx src/app/quotes/NewQuoteButton.tsx
git commit -m "feat: convert single-purpose inline error text to toast notifications (batch 1)"
```

---

### Task 10: Convert inline error text to toasts — batch 2 (remaining cases, careful with mixed validation)

**Files:**
- Modify: `src/app/schedule/AssignNewModal.tsx`
- Modify: `src/app/variations/VariationCard.tsx`
- Modify: `src/app/jobs/JobsClient.tsx`
- Modify: `src/app/time-tracking/ClockCard.tsx`

**Interfaces:**
- Consumes: `toast` from `"sonner"` (Task 8).

**Important distinction for this batch**: `AssignNewModal.tsx` and `VariationCard.tsx` both reuse their `error` state for *inline field validation* too (e.g. `setError("Select a technician.")`, `setError("Reason must be at least 10 characters.")`), not just submit-result feedback. Only the **submission-failure** path (the actual server/network error after clicking submit) converts to a toast — the pre-submit validation messages stay as inline text next to the field, since a toast is the wrong pattern for "you forgot to fill this in" (the user's eyes are already on the field, not the toast corner).

- [ ] **Step 1: `AssignNewModal.tsx`**

Import `toast` from `"sonner"`. In `handleSubmit` (starting at line 53), change:

```ts
  function handleSubmit() {
    if (!userId) { setError("Select a technician."); return; }
    if (!jobId) { setError("Select a job."); return; }
    setError(null);
    startTransition(async () => {
      const body: Record<string, string> = {
        userId,
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
      if (data.warning) onConflict(data.warning);
      onCreated(data as ScheduleAssignment);
      onClose();
    });
  }
```

to:

```ts
  function handleSubmit() {
    if (!userId) { setError("Select a technician."); return; }
    if (!jobId) { setError("Select a job."); return; }
    setError(null);
    startTransition(async () => {
      const body: Record<string, string> = {
        userId,
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
        toast.error(data.error ?? "Failed to create assignment.");
        return;
      }
      if (data.warning) onConflict(data.warning);
      onCreated(data as ScheduleAssignment);
      onClose();
    });
  }
```

The two pre-submission `setError(...)` calls (line 54-55) and the inline `{error && ...}` render are unchanged — they still need `error` state for field validation.

- [ ] **Step 2: `VariationCard.tsx`**

Import `toast` from `"sonner"`. In `handleSubmit` (starting at line 37), change:

```ts
  function handleSubmit() {
    if (!action) return;
    if ((action === "rejected" || action === "queried") && reason.length < 10) {
      setError("Provide at least 10 characters.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/variations/${variation.id}/decision`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision: action, decisionReason: reason || undefined }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Failed to save decision.");
        return;
      }
      onDecided(variation.id);
      router.refresh();
    });
  }
```

to:

```ts
  function handleSubmit() {
    if (!action) return;
    if ((action === "rejected" || action === "queried") && reason.length < 10) {
      setError("Provide at least 10 characters.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/variations/${variation.id}/decision`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision: action, decisionReason: reason || undefined }),
      });
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error ?? "Failed to save decision.");
        return;
      }
      onDecided(variation.id);
      router.refresh();
    });
  }
```

The reason-length validation `setError(...)` (inside the `if (... reason.length < 10)` block) and the inline `{error && ...}` render are unchanged.

- [ ] **Step 3: `JobsClient.tsx`**

This file has two independent `error` states named identically (`error`/`setError`) but scoped to different components — `EditJobModal`'s (line 34, render 92) and `MaterialsModal`'s (line 225-ish, render 331). Both are pure submit-result feedback confirmed by reading `save()` and `submit()` — neither has a pre-submission validation path sharing this state (in `MaterialsModal.submit()`, the `if (!description.trim() || Number.isNaN(cost)) return;` guard silently no-ops rather than setting an error message). Import `toast` from `"sonner"`, convert both `setError(...)` failure calls to `toast.error(...)` using their existing message text, and remove both `const [error, setError] = useState<string | null>(null);` declarations and both `{error && <p ...>{error}</p>}` render blocks (lines 92 and 331).

**Do not touch `MaterialsModal`'s separate `loadError` state** (line 226ish, rendered inline at `{loadError && <p ...>{loadError}</p>}`) — that's a background data-load failure on modal mount (via `useEffect(load, [job.id])`), not a user-triggered submission result, and it replaces the entries list content rather than being a transient notification. It's a different pattern and out of scope for this toast conversion.

- [ ] **Step 4: `ClockCard.tsx`**

Import `toast` from `"sonner"`. In `handleClockIn` (starting at line 34), change:

```ts
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
```

to:

```ts
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
        toast.error(data.error ?? "Clock-in failed.");
        return;
      }
```

(the rest of `handleClockIn` after this point is unchanged). In `handleClockOut` (starting at line 60), change:

```ts
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
```

to:

```ts
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
        toast.error(data.error ?? "Clock-out failed.");
        return;
      }
      setCurrentEntry(null);
    });
  }
```

`error` state itself stays (still used by the pre-submission `"Select a job first."` validation in `handleClockIn`) — do NOT remove the `const [error, setError] = useState<string | null>(null);` declaration or the `{error && <p ...>{error}</p>}` render block in this file, unlike `JobsClient.tsx` in Step 3.

- [ ] **Step 5: Run the full test suite and typecheck**

Run: `npx vitest run && npx tsc --noEmit`
Expected: PASS, no errors.

- [ ] **Step 6: Manual verification**

Confirm `AssignNewModal`, `VariationCard`, and `ClockCard` (clock-in without selecting a job) still show inline validation messages when you submit with missing/invalid fields (this must NOT have moved to a toast), and confirm a genuine submission failure on any of the four files now shows a toast.

- [ ] **Step 7: Commit**

```bash
git add src/app/schedule/AssignNewModal.tsx src/app/variations/VariationCard.tsx src/app/jobs/JobsClient.tsx src/app/time-tracking/ClockCard.tsx
git commit -m "feat: convert submit-failure inline error text to toast notifications (batch 2), keep field validation inline"
```

---

## Part 5: Unified Status Badges

### Task 11: StatusBadge component + test

**Files:**
- Create: `src/components/ui/StatusBadge.tsx`
- Test: `src/components/ui/__tests__/StatusBadge.test.tsx`

**Interfaces:**
- Produces: `StatusBadge({ status }: { status: Status })` where `Status` is the union of every status string value found across `JobStatus`, `TimeEntryStatus`, `VariationStatus`, `InvoiceStatus`, `MaterialEntryStatus`, `QuoteStatus`, `ContractStatus`, and `VoiceNoteStatus` (confirmed from `prisma/schema.prisma`). `ComplianceDocument` has no status field and is out of scope (its existing pill colors by `template.type`, an unrelated concept).

Canonical color semantic (four families, consistently applied): **slate** = not yet started/neutral (`scheduled`, `pending`, `draft`), **amber** = in progress/needs attention (`active`, `sent`, `queried`, `received`, `awaiting_review`) — matches the majority of the existing duplicated implementations for `active`, and reuses the brand accent for "this needs eyes on it," **emerald** = done/success (`complete`, `approved`, `paid`, `accepted`, `reconciled`, `transcribed`), **red** = negative/terminal (`cancelled`, `rejected`, `declined`, `failed`, `lapsed`).

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/ui/__tests__/StatusBadge.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { StatusBadge } from "../StatusBadge";

describe("StatusBadge", () => {
  it("renders the active status in the amber family with its label", () => {
    render(<StatusBadge status="active" />);
    const badge = screen.getByText("Active");
    expect(badge.className).toContain("amber");
  });

  it("renders the complete status in the emerald family", () => {
    render(<StatusBadge status="complete" />);
    const badge = screen.getByText("Complete");
    expect(badge.className).toContain("emerald");
  });

  it("renders the cancelled status in the red family", () => {
    render(<StatusBadge status="cancelled" />);
    const badge = screen.getByText("Cancelled");
    expect(badge.className).toContain("red");
  });

  it("renders the pending status in the slate family", () => {
    render(<StatusBadge status="pending" />);
    const badge = screen.getByText("Pending");
    expect(badge.className).toContain("slate");
  });

  it("renders the awaiting_review status with a readable label", () => {
    render(<StatusBadge status="awaiting_review" />);
    expect(screen.getByText("Awaiting Review")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/ui/__tests__/StatusBadge.test.tsx`
Expected: FAIL — `Cannot find module '../StatusBadge'`

- [ ] **Step 3: Write the implementation**

```tsx
// src/components/ui/StatusBadge.tsx
export type Status =
  | "scheduled" | "active" | "complete" | "cancelled"      // JobStatus
  | "pending" | "approved" | "rejected" | "queried"        // VariationStatus (pending shared with others below)
  | "draft" | "sent" | "paid"                               // InvoiceStatus
  | "received" | "reconciled"                                // MaterialEntryStatus (pending shared)
  | "accepted" | "declined"                                  // QuoteStatus (draft/sent shared)
  | "lapsed"                                                 // ContractStatus (active/cancelled shared)
  | "transcribed" | "failed" | "awaiting_review";            // VoiceNoteStatus (pending shared)

const STATUS_STYLES: Record<Status, string> = {
  scheduled: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
  pending: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
  draft: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",

  active: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300",
  sent: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300",
  queried: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300",
  received: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300",
  awaiting_review: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300",

  complete: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300",
  approved: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300",
  paid: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300",
  accepted: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300",
  reconciled: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300",
  transcribed: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300",

  cancelled: "bg-red-100 text-red-600 dark:bg-red-900 dark:text-red-400",
  rejected: "bg-red-100 text-red-600 dark:bg-red-900 dark:text-red-400",
  declined: "bg-red-100 text-red-600 dark:bg-red-900 dark:text-red-400",
  failed: "bg-red-100 text-red-600 dark:bg-red-900 dark:text-red-400",
  lapsed: "bg-red-100 text-red-600 dark:bg-red-900 dark:text-red-400",
};

const STATUS_LABELS: Record<Status, string> = {
  scheduled: "Scheduled",
  pending: "Pending",
  draft: "Draft",
  active: "Active",
  sent: "Sent",
  queried: "Queried",
  received: "Received",
  awaiting_review: "Awaiting Review",
  complete: "Complete",
  approved: "Approved",
  paid: "Paid",
  accepted: "Accepted",
  reconciled: "Reconciled",
  transcribed: "Transcribed",
  cancelled: "Cancelled",
  rejected: "Rejected",
  declined: "Declined",
  failed: "Failed",
  lapsed: "Lapsed",
};

export function StatusBadge({ status }: { status: Status }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[status]}`}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/ui/__tests__/StatusBadge.test.tsx`
Expected: PASS (5 tests). If `@testing-library/react` isn't already a dev dependency, run `npm install -D @testing-library/react --legacy-peer-deps` first and re-run — check `package.json` for it before assuming it's missing.

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/StatusBadge.tsx src/components/ui/__tests__/StatusBadge.test.tsx
git commit -m "feat: add unified StatusBadge component covering all status enums"
```

---

### Task 12: Migrate duplicated status pills to StatusBadge

**Files:**
- Modify: `src/app/jobs/JobsClient.tsx`
- Modify: `src/app/jobs/[id]/page.tsx`
- Modify: `src/app/customers/[id]/CustomerDetail.tsx`
- Modify: `src/app/portal/[token]/page.tsx`
- Modify: `src/app/invoices/InvoiceList.tsx`
- Modify: `src/app/invoices/[id]/InvoiceDetail.tsx`
- Modify: `src/app/variations/VariationsList.tsx`

**Interfaces:**
- Consumes: `StatusBadge` from Task 11.

This is the fix for the confirmed real inconsistency: `JobStatus.active` currently renders as **emerald** in `JobsClient.tsx` but **amber** in three other files.

- [ ] **Step 1: `JobsClient.tsx`**

Remove the local `STATUS_BADGE_CLASS` object (lines 345-350). Add the import: `import { StatusBadge } from "@/components/ui/StatusBadge";`. At both render sites (lines 431 and 497) that currently use `STATUS_BADGE_CLASS[job.status]` to build a `<span>`, replace with `<StatusBadge status={job.status} />`.

- [ ] **Step 2: `jobs/[id]/page.tsx`**

Remove the local `STATUS_BADGE` object (lines 8-13). Add the `StatusBadge` import. At the render site (line 52), replace with `<StatusBadge status={job.status} />`.

- [ ] **Step 3: `customers/[id]/CustomerDetail.tsx`**

Remove the local `STATUS_BADGE` object (lines 304-309, identical to the previous file's). Add the `StatusBadge` import. At the render site (line 421), replace with `<StatusBadge status={job.status} />` (confirm the exact variable name holding the job's status at that call site — it may not literally be named `job`).

- [ ] **Step 4: `portal/[token]/page.tsx`**

Remove the local status-map object (lines 4-9). Add the `StatusBadge` import. At the render site (line 67, which currently has a `?? "bg-slate-100 text-slate-600"` fallback for an unmapped status), replace with `<StatusBadge status={...} />` using the same status value — `StatusBadge`'s `Status` type already covers every real `JobStatus` value, so the fallback is no longer needed.

- [ ] **Step 5: `InvoiceList.tsx` and `InvoiceDetail.tsx`**

Both currently duplicate the same `STATUS_BADGE` object (`InvoiceList.tsx:23-27`, `InvoiceDetail.tsx:36-40`). Remove both, add the `StatusBadge` import to both files, replace both render sites with `<StatusBadge status={invoice.status} />` (confirm the exact variable name at each call site).

- [ ] **Step 6: `VariationsList.tsx`**

Remove `STATUS_STYLES` (lines 33-37) — but **keep** `STATUS_LABEL` (lines 39-43) only if it's used anywhere else in the file beyond the badge itself; if it's only used for the badge text, remove it too since `StatusBadge` now owns labels. Add the `StatusBadge` import, replace the pill render with `<StatusBadge status={variation.status} />`. Note: the old map had no entry for `pending` — `StatusBadge`'s new mapping does (slate), so this also fixes a pre-existing gap where a pending variation's pill may have rendered with no styling at all.

- [ ] **Step 7: Run the full test suite and typecheck**

Run: `npx vitest run && npx tsc --noEmit`
Expected: PASS, no errors.

- [ ] **Step 8: Manual verification**

Visit `/jobs`, `/jobs/[some-id]`, `/customers/[some-id]`, `/invoices`, `/variations` and confirm every "Active" job badge now renders the SAME color everywhere (the bug this task fixes), and every other status renders sensibly.

- [ ] **Step 9: Commit**

```bash
git add src/app/jobs/JobsClient.tsx src/app/jobs/\[id\]/page.tsx src/app/customers/\[id\]/CustomerDetail.tsx src/app/portal/\[token\]/page.tsx src/app/invoices/InvoiceList.tsx src/app/invoices/\[id\]/InvoiceDetail.tsx src/app/variations/VariationsList.tsx
git commit -m "fix: replace 6 duplicated status-pill implementations with unified StatusBadge (fixes Job active rendering 2 different colors across the app)"
```

---

## Part 6: Loading Skeletons

### Task 13: PageSkeleton helper + Jobs loading.tsx

**Files:**
- Create: `src/components/ui/PageSkeleton.tsx`
- Create: `src/app/jobs/loading.tsx`

**Interfaces:**
- Produces: `PageSkeleton({ children }: { children: React.ReactNode })` — approximates the persistent `AppShell` chrome (sidebar-width block + topbar-height block) as static skeleton shapes, since `AppShell` itself does async work and can't be reused directly inside a `loading.tsx` (Next.js suspends the entire route tree a `page.tsx` would have rendered, including any `AppShell` the page invokes internally — this codebase's pages call `AppShell` themselves rather than via a shared `layout.tsx`, confirmed across every page read this session). `children` is the page-specific content skeleton.

- [ ] **Step 1: Write PageSkeleton**

```tsx
// src/components/ui/PageSkeleton.tsx
export function PageSkeleton({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      {/* Sidebar-shaped placeholder (desktop only, matches Sidebar.tsx's w-64) */}
      <div className="hidden lg:block fixed left-0 top-0 h-screen w-64 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 animate-pulse" />
      <div className="lg:pl-64">
        {/* Topbar-shaped placeholder (matches TopBar.tsx's h-16) */}
        <div className="h-16 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 animate-pulse" />
        <main className="px-4 py-6 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Write the Jobs loading skeleton**

```tsx
// src/app/jobs/loading.tsx
import { PageSkeleton } from "@/components/ui/PageSkeleton";

export default function JobsLoading() {
  return (
    <PageSkeleton>
      <div className="space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="h-20 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 animate-pulse"
          />
        ))}
      </div>
    </PageSkeleton>
  );
}
```

- [ ] **Step 3: Run typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Manual verification**

Run `npm run dev`, throttle network in devtools (or add a temporary artificial delay to confirm — remove it after), navigate to `/jobs`. Confirm the skeleton briefly appears before the real content, and that it doesn't look jarringly different from the loaded page's chrome.

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/PageSkeleton.tsx src/app/jobs/loading.tsx
git commit -m "feat: add loading skeleton for /jobs via Next.js loading.tsx convention"
```

---

### Task 14: Dashboard and Schedule loading.tsx

**Files:**
- Create: `src/app/dashboard/loading.tsx`
- Create: `src/app/schedule/loading.tsx`

**Interfaces:**
- Consumes: `PageSkeleton` from Task 13.

- [ ] **Step 1: Dashboard skeleton**

```tsx
// src/app/dashboard/loading.tsx
import { PageSkeleton } from "@/components/ui/PageSkeleton";

export default function DashboardLoading() {
  return (
    <PageSkeleton>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="h-32 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 animate-pulse"
          />
        ))}
      </div>
    </PageSkeleton>
  );
}
```

- [ ] **Step 2: Schedule skeleton**

```tsx
// src/app/schedule/loading.tsx
import { PageSkeleton } from "@/components/ui/PageSkeleton";

export default function ScheduleLoading() {
  return (
    <PageSkeleton>
      <div className="grid grid-cols-7 gap-2">
        {Array.from({ length: 7 }).map((_, i) => (
          <div
            key={i}
            className="h-64 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 animate-pulse"
          />
        ))}
      </div>
    </PageSkeleton>
  );
}
```

- [ ] **Step 3: Run typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Manual verification**

Same throttled-network check as Task 13, for `/dashboard` and `/schedule`.

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/loading.tsx src/app/schedule/loading.tsx
git commit -m "feat: add loading skeletons for /dashboard and /schedule"
```

---

## Part 7: Glove-Friendly Touch Targets

### Task 15: Bump global-chrome icon buttons to 44px

**Files:**
- Modify: `src/components/nav/NotificationBell.tsx`
- Modify: `src/components/nav/TopBar.tsx`
- Modify: `src/components/nav/MobileNavClient.tsx`

**Interfaces:** none — pure className changes.

These three are the highest-visibility targets: global nav chrome visible to every role on every page (including technicians on mobile, the primary glove-use case).

- [ ] **Step 1: `NotificationBell.tsx`**

At line 84, change `h-9 w-9` to `h-11 w-11` in the button's className (44px, up from 36px).

- [ ] **Step 2: `TopBar.tsx`**

At line 108 (the search-close button), change `h-6 w-6` to `h-11 w-11` (44px, up from 24px — the smallest violation found).

- [ ] **Step 3: `MobileNavClient.tsx`**

At line 54 (the mobile drawer close button), change `h-8 w-8` to `h-11 w-11` (44px, up from 32px).

- [ ] **Step 4: Run the full test suite and typecheck**

Run: `npx vitest run && npx tsc --noEmit`
Expected: PASS, no errors.

- [ ] **Step 5: Manual verification**

On a real phone or devtools mobile emulation, confirm these three buttons now feel comfortably tappable and haven't visually broken their surrounding layout (a slightly larger tap target can shift adjacent spacing).

- [ ] **Step 6: Commit**

```bash
git add src/components/nav/NotificationBell.tsx src/components/nav/TopBar.tsx src/components/nav/MobileNavClient.tsx
git commit -m "fix: bump global nav icon buttons to 44px minimum tap target"
```

---

### Task 16: Bump modal-close icon buttons to 44px

**Files:**
- Modify: `src/app/jobs/[id]/DeleteVoiceNoteButton.tsx`
- Modify: `src/app/quotes/NewQuoteButton.tsx`
- Modify: `src/app/jobs/JobsClient.tsx`
- Modify: `src/app/schedule/AssignNewModal.tsx`
- Modify: `src/components/assistant/ChatWidget.tsx`

**Interfaces:** none — pure className changes.

These currently rely on `p-1` padding around a variably-sized icon rather than an explicit button size, which produces inconsistent, undersized hit areas (as small as ~22px). Standardize on an explicit `h-11 w-11 flex items-center justify-center` container instead of tuning padding per icon size.

- [ ] **Step 1: `DeleteVoiceNoteButton.tsx`**

At line 39, change:

```tsx
className="p-1 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-40"
```

to:

```tsx
className="h-11 w-11 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-40"
```

- [ ] **Step 2: `NewQuoteButton.tsx`**

At line 139, change `className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"` to `className="h-11 w-11 flex items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"`.

- [ ] **Step 3: `JobsClient.tsx`**

This file has the same close-button pattern at 4 sites. Three are byte-identical single-line occurrences at lines 63, 165, 283:

```tsx
<button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"><X className="w-5 h-5" /></button>
```

Replace all three with:

```tsx
<button onClick={onClose} className="h-11 w-11 flex items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"><X className="w-5 h-5" /></button>
```

The fourth, at line 608, differs (`onClick={() => setShowForm(false)}`, multi-line):

```tsx
              <button onClick={() => setShowForm(false)} className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">
                <X className="w-5 h-5" />
              </button>
```

Change to:

```tsx
              <button onClick={() => setShowForm(false)} className="h-11 w-11 flex items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">
                <X className="w-5 h-5" />
              </button>
```

- [ ] **Step 4: `AssignNewModal.tsx`**

At line 87, change:

```tsx
<button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">
  <X className="w-5 h-5" />
</button>
```

to:

```tsx
<button onClick={onClose} className="h-11 w-11 flex items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">
  <X className="w-5 h-5" />
</button>
```

- [ ] **Step 5: `ChatWidget.tsx`**

At line 142, change:

```tsx
<button onClick={() => setOpen(false)} className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700">
  <X className="w-4 h-4" />
</button>
```

to:

```tsx
<button onClick={() => setOpen(false)} className="h-11 w-11 flex items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700">
  <X className="w-4 h-4" />
</button>
```

- [ ] **Step 6: Run the full test suite and typecheck**

Run: `npx vitest run && npx tsc --noEmit`
Expected: PASS, no errors.

- [ ] **Step 7: Manual verification**

Open each of the 5 affected modals/panels (delete voice note, new quote, edit job, edit materials, new job, assign job, chat panel) and confirm the close button is now comfortably sized and the surrounding modal header layout still looks right (the button is now taller than the header text — confirm `items-center`/`justify-between` on the parent still keeps things visually aligned).

- [ ] **Step 8: Commit**

```bash
git add src/app/jobs/\[id\]/DeleteVoiceNoteButton.tsx src/app/quotes/NewQuoteButton.tsx src/app/jobs/JobsClient.tsx src/app/schedule/AssignNewModal.tsx src/components/assistant/ChatWidget.tsx
git commit -m "fix: bump modal-close icon buttons to 44px minimum tap target"
```

---

## Final Verification

- [ ] Run `npx vitest run` — full suite passes.
- [ ] Run `npx tsc --noEmit` — no errors.
- [ ] Manual pass on a real phone (or devtools mobile emulation) in both light and dark mode: theme toggle works and persists, sidebar quick-actions work on desktop, toasts appear on action failures, status badges are consistent across Jobs/Invoices/Variations/Customers, loading skeletons appear briefly on `/jobs`/`/dashboard`/`/schedule`, and touch targets feel comfortable.
- [ ] If possible, do the contrast check outdoors or in bright light — the actual motivating scenario for Part 1.
