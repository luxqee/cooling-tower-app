# UI Polish: Theme, Sidebar Quick-Actions & Consistency Design

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:writing-plans to turn this spec into a task-by-task implementation plan, then superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to build it.

**Goal:** Make the app read clearly on a phone in direct sunlight, give every role a manual light/dark toggle (not just whatever the OS happens to be set to), add a fast hover-triggered quick-actions panel to the desktop sidebar for the sections that support creating something, and clean up several UI inconsistencies (ad hoc error text, mismatched status pills, blank-until-loaded pages, undersized tap targets) that showed up repeatedly across the app during this session's work.

**Architecture:** Seven related but independently-shippable pieces, all working within the existing slate + amber Tailwind identity rather than replacing it: (1) a contrast-tightening pass on the existing color palette, (2) a `next-themes`-backed manual theme toggle living in the `TopBar` (visible to every role, unlike `/settings` which is director/admin-only), (3) an inline-expand hover panel on desktop sidebar items that have a real "create" action, (4) a `sonner`-backed toast system replacing scattered inline error text, (5) one shared `<StatusBadge>` component replacing duplicated pill styling, (6) `animate-pulse` loading skeletons shaped to each real page layout, (7) a 44px minimum-tap-target audit for glove-friendly mobile use.

**Tech Stack:** Next.js 14 App Router, Tailwind CSS, TypeScript. Two new dependencies: `next-themes` (theme persistence, SSR-safe, prevents flash-of-wrong-theme) and `sonner` (accessible toast notifications).

## Global Constraints

- No visual identity change — stay within the existing slate/amber palette family. This is a contrast and consistency pass, not a rebrand.
- Every role must be able to reach the theme toggle, including `technician` (who cannot see `/settings` — confirmed `settings: ["director", "admin"]` in `src/lib/permissions.ts`). The toggle lives in `TopBar`, which renders unconditionally in `AppShell` for every signed-in role.
- Sidebar hover quick-actions are desktop-only (`lg:` breakpoint, matching the existing `Sidebar` component's `hidden lg:flex`). No hover-equivalent is added to `MobileNav`/`BottomTabBar` — touch has no hover state, and mobile already has its own fast-access pattern (the bottom tab bar).
- Existing role-based nav visibility (`NavItem.visibleTo`, sourced from `PAGE_ACCESS` in `src/lib/permissions.ts`) is unchanged — quick-actions only ever appear on a nav item the current user can already see, and never bypass an existing role check on the destination page/route.
- No behavior change to any existing create flow's validation or submission logic — quick-actions only change how the form is *reached* (auto-opened via a query param instead of requiring an extra click), never what the form does once open.

---

## Part 1: Color Palette — Contrast Tightening

Keep the existing `slate` + `amber` palette (`tailwind.config.ts`) — this is a discipline pass on *usage*, not a new palette. Two changes:

- **Light mode secondary/tertiary text**: audit uses of `text-slate-400` on light backgrounds (the most common secondary-text class across pages) and bump to `text-slate-500` or `text-slate-600` where contrast against `bg-white`/`bg-slate-50` is currently borderline. Dark-mode equivalents (`dark:text-slate-400` on dark backgrounds) already have adequate contrast and stay as-is.
- **Light mode borders**: `border-slate-200` (used extensively for card/section dividers) is close to invisible in bright ambient light. Bump to `border-slate-300` in light mode; dark-mode borders are unaffected.
- **Accent color**: light-mode buttons/pills currently mix `bg-amber-500` and `bg-amber-600` inconsistently. Standardize on `amber-600` for light-mode primary actions (darker = more contrast against white) and keep `amber-500` for dark mode (brighter pops against near-black) — this already matches how most components are written; the work here is finding and fixing the inconsistent ones.

This is a broad, cross-cutting change (dozens of files use these utility classes) — the implementation plan should scope it as a systematic grep-and-verify pass over the most common offending patterns, not an exhaustive manual file-by-file rewrite. Spot-check the highest-traffic pages (Dashboard, Jobs list, Schedule) after the pass.

---

## Part 2: Manual Light/Dark Toggle

- Add `next-themes`. Set `darkMode: "class"` in `tailwind.config.ts` (currently unset, which defaults to Tailwind's `media` strategy — i.e. today's automatic-only behavior).
- Wrap the root layout (`src/app/layout.tsx`) with `next-themes`' `ThemeProvider`, `attribute="class"`, `defaultTheme="system"`, `enableSystem` — so a first-time visitor still gets their OS preference by default, but can override it.
- New `ThemeToggle` client component: a sun/moon icon button, added to `TopBar` next to the existing `NotificationBell`. Simple two-state light/dark toggle (not a three-state light→dark→system cycle) — the motivating case is a technician needing one tap to force light mode outdoors regardless of phone settings, and a 2-state toggle gets there in one click instead of up to two. `defaultTheme="system"` still means a first-time visitor's initial render matches their OS preference; the toggle only ever moves between explicit light/dark from that point on.
- `next-themes` handles localStorage persistence and the no-FOUC blocking script automatically; no custom flash-prevention code needed.
- `globals.css`'s existing `@media (prefers-color-scheme: dark)` block for the `--background`/`--foreground` CSS variables needs to move to a `.dark` class selector (or be replaced by Tailwind's `dark:` variants directly on `html`/`body`) to work with the new class-based strategy instead of the media-query strategy.

---

## Part 3: Sidebar Hover Quick-Actions

**Component change**: extend `NavItem` (`src/lib/nav-config.ts`) with an optional field:
```ts
quickAction?: { label: string; href: string };
```
Populated for exactly these five items (chosen because they have a real "create" action):

| Nav item | Quick action | Destination |
|---|---|---|
| Jobs | "+ Add Job" | `/jobs?new=1` — `JobsClient.tsx` already manages a `showForm` state for its modal-based `NewJobForm`; add a mount-time check of the `new` search param to auto-open it. |
| Schedule | "+ Assign Job" | `/schedule` (plain link, no auto-open) — the assignment modal (`AssignNewModal`) needs a date/technician context a query param can't cleanly default; auto-opening with a guessed date would be more confusing than landing on the page itself. |
| Compliance | "+ New Document" | `/compliance/new` — already a dedicated page, direct link. |
| Customers | "+ New Customer" | `/customers/new` — already a dedicated page, direct link. |
| Quotes | "+ New Quote" | `/quotes?new=1` — `NewQuoteButton.tsx`'s self-contained open state needs the same mount-time query-param check as Jobs. |

**Interaction**: inline-expand (validated in the visual companion) — on hover, the nav item's container grows from its normal collapsed height to reveal a one-line description (reusing `NavItem.description`, which exists today but is currently unused anywhere in the UI) plus the quick-action button, via a `max-height` transition (not `height`, to avoid layout-thrash on measurement). Items below push down slightly during the hover expansion — acceptable since only one item expands at a time and the transition is short (~150-180ms).

Implementation lives in `NavLinks.tsx` (the desktop sidebar's link-rendering component) — `MobileNavClient` is untouched.

---

## Part 4: Toast Notifications

Add `sonner`. One `<Toaster />` mounted once in the root layout. Replace the ad hoc inline error/success text patterns seen repeatedly this session (e.g. `VariationForm`'s `errors.submit` display, `PendingVoiceNoteReview`'s `error` state, etc.) with `toast.success(...)`/`toast.error(...)` calls at the same call sites. This is a wide-reaching but mechanical swap — the implementation plan should inventory every component with this inline-error-text pattern and convert them consistently, rather than converting an arbitrary subset. Form *validation* errors (inline, next to the specific invalid field) are a different, unrelated pattern and stay exactly as they are — only submission-result feedback (did the create/update/delete succeed or fail) moves to toasts.

---

## Part 5: Unified Status Badges

New component `src/components/ui/StatusBadge.tsx` — one status→{color, icon, label} mapping table covering every status value currently rendered as a pill across `Job.status`, `Variation.status`, `Quote.status`, `Invoice.status`, `ComplianceDocument` states, etc. (the plan should inventory the actual `enum`/status-string values from `prisma/schema.prisma` rather than guessing them). Existing pill markup at each of those call sites gets replaced with `<StatusBadge status="..." />`. Semantic colors (active/success = green family, pending/warning = amber family, overdue/error = red family) stay distinct from the amber *brand* accent — reusing brand amber for a "pending" badge would make it indistinguishable from a primary button.

---

## Part 6: Loading Skeletons

For the pages most likely to feel slow on a job-site connection — Jobs list, Dashboard widgets (`HoursOverview` and others), Schedule grid — add a matching `*Skeleton` component using Tailwind's `animate-pulse`, shaped to approximate the real content's layout (card outlines, text-line placeholders), shown via React Suspense boundaries or local loading state while the real data fetches. No new dependency; this is a Tailwind-only pattern already idiomatic in this codebase's styling approach.

---

## Part 7: Glove-Friendly Touch Targets

Audit interactive elements (buttons, links, inputs) on mobile-facing pages for a 44×44px minimum tap target — the existing standard already used in some places (`VariationForm`'s inputs/buttons use `min-h-[44px]`/`min-h-[48px]`) but not universally, particularly icon-only buttons (e.g. `TopBar`'s search/notification icon buttons are `h-9 w-9` = 36px, below the threshold). The plan should inventory icon-only interactive elements below 44px and bump them, prioritizing mobile-visible ones (technician-facing pages) over desktop-only admin screens.

---

## Testing

- Palette/contrast changes, toast conversion, and status-badge/skeleton components are visual — no new automated tests beyond existing suite continuing to pass (this codebase's convention: pages/interactive components aren't unit tested).
- `ThemeToggle` and the sidebar quick-action query-param auto-open logic (`JobsClient`, `NewQuoteButton`) are client-side interactive behavior — also outside this codebase's unit-testing convention (matches how `ChatWidget`'s quick-action buttons, built earlier this session, were verified: typecheck + full suite regression, not new unit tests).
- Manual verification checklist (desktop + a real mobile device, both light and dark, ideally outdoors or in bright light for the contrast changes) belongs in the implementation plan's final step.

---

## Rollout

Land as separate commits per part (7 parts, matching the numbering above) so any one piece can be reverted independently without affecting the others. No feature flag — this app has no existing flag mechanism and a UI polish pass doesn't warrant introducing one.
