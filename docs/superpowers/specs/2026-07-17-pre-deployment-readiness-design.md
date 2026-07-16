# Pre-Deployment Readiness Design

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:writing-plans to turn this spec into a task-by-task implementation plan, then superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to build it.

**Goal:** Close the gaps identified in an earlier honest production-readiness audit — no CI, no error monitoring, no rate limiting, no security headers, no data export, hardcoded business-name references that block deploying this to a second business, real test-coverage gaps, and a deterministic query layer that only covers 2 of 26 models — so this app is trustworthy to run for a real business, not just usable by one developer who already knows where the bodies are buried.

**Architecture:** Eight independent, separately-shippable parts. Two of them (rate limiting, error monitoring) depend on external services (Upstash Redis, Sentry) this session has no credentials for — both are built as fully-functional code that **gracefully no-ops when the relevant env var is absent**, so the app behaves exactly as it does today until credentials are added, at which point the feature activates with no further code changes.

**Tech Stack:** Next.js 14, GitHub Actions, `@upstash/ratelimit` + `@upstash/redis`, `@sentry/nextjs`, Prisma 7, Vitest.

## Global Constraints

- No behavior change to any existing feature except where explicitly the point (rate limiting, security headers).
- Every part that touches `BusinessProfile` defaults must not break the existing seed data or existing tests that assert on current values — check before changing.
- Rate limiting and error monitoring must be **inert with zero configuration** — a deployment with no `UPSTASH_*`/`SENTRY_*` env vars set must behave identically to today, not throw, not block requests, not silently fail closed.
- New CI workflow must not require any secret this repo doesn't already have in Vercel/GitHub (it runs tests/typecheck against the existing test suite, which mocks external services — no live `DATABASE_URL`/API keys needed for CI to pass).

---

## Part 1: CI (GitHub Actions)

New `.github/workflows/ci.yml`: on every push and PR to `main`, run `pnpm install --frozen-lockfile`, `pnpm exec vitest run`, `pnpm exec tsc --noEmit`. Fail the check if either fails. No deployment step (Vercel already auto-deploys on push independently) — this is purely a correctness gate, not a release pipeline. No secrets needed since the test suite mocks `db`/external clients throughout (confirmed: every route test in this repo uses `vi.mock("@/lib/db/client", ...)`).

## Part 2: Hardcoded business-name cleanup

17 confirmed literal occurrences of "CT Field Ops"/"Cooling Tower" across `src/app/layout.tsx` (title/meta/appleWebApp), `src/app/sign-in/[[...sign-in]]/page.tsx` and `sign-up` (heading), `src/components/nav/MobileNavClient.tsx` and `Sidebar.tsx` (nav header), `src/app/settings/page.tsx` and `SettingsForm.tsx` (fallbacks/placeholders), `src/app/api/settings/route.ts` and `logo/route.ts` (DB defaults), `src/app/api/invoices/[id]/pdf/route.ts`/`send/route.ts`, `src/app/api/quotes/[id]/pdf/route.ts` (sender-name fallbacks), `src/app/jobs/NewJobForm.tsx` (placeholder text), `src/lib/compliance/generatePdf.ts:119` (footer fallback — found during compliance-document work), and `prisma/schema.prisma:261` (`BusinessProfile.name`'s DB-level default).

Fix: every runtime read of the business name/description switches to `businessProfile?.name`/`industryDescription` (the pattern already correctly used in the AI assistant and voice-note code) with a **generic** fallback (`"Your Business"`, not a trade-specific string) only where `businessProfile` could genuinely be null. `NewJobForm.tsx`'s placeholder text becomes trade-neutral (`"e.g. North wing"` instead of `"North cooling tower"`). `prisma/schema.prisma`'s `BusinessProfile.name` default changes from `"CT Field Ops"` to `"Your Business"` — this needs a Prisma migration (a `@default` value change) and a data migration note: existing rows already have `"CT Field Ops"` stored explicitly (not relying on the default), so changing the schema default doesn't retroactively change stored data — that's expected and correct, this is about what a *new* deployment starts with.

## Part 3: Security headers

Add a `headers()` function to `next.config.mjs` (currently only has `reactStrictMode` + the Serwist wrapper): `Content-Security-Policy` (scoped to what this app actually loads — Clerk, Vercel Blob, the app's own origin; needs auditing against actual asset origins during implementation, not guessed), `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`. `Strict-Transport-Security` is likely redundant (Vercel sets this at the platform edge already) — verify during implementation rather than assume, and only add it in-app if Vercel doesn't.

## Part 4: Data export

New route `GET /api/export/customers`, `/api/export/jobs`, `/api/export/invoices` (role-gated to `director`/`admin`, matching this app's existing sensitive-data access pattern) — each streams a CSV of that business's own records. Reuses the existing `getActiveJobs`-style query functions where they exist (Jobs), adds equivalent simple `findMany` calls for Customers/Invoices otherwise (no need to force these through the deterministic query layer if they're a new, single-purpose read — see Part 7 for where that layer actually gets extended). A small "Export data" section on the Settings page, visible only to those roles, linking to the three endpoints.

## Part 5: Rate limiting (inert without credentials)

Add `@upstash/ratelimit` + `@upstash/redis`. New `src/lib/rateLimit.ts`: exports a `checkRateLimit(key: string): Promise<boolean>` that constructs an Upstash `Ratelimit` client **only if** `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN` are set; if absent, always returns `true` (allow) — a deployment with no Upstash account configured behaves exactly as today. Applied to `src/app/api/assistant/chat/route.ts` and `src/app/api/assistant/quick-action/route.ts` (the cost-bearing AI endpoints — a sliding window, e.g. 20 requests/user/hour, exact limit decided during planning) and `src/app/portal/[token]/page.tsx`'s token lookup (a coarser per-IP limit, since this route has no authenticated user to key on). **You'll need to create a free Upstash Redis database and add the two env vars for this to actually activate** — the code ships ready, but won't do anything until then.

## Part 6: Error monitoring (inert without credentials)

Add `@sentry/nextjs`, run its setup wizard pattern manually (client config, server config, edge config, `next.config.mjs` wrapper) gated the standard Sentry way — no DSN configured means the SDK no-ops by design (this is Sentry's own documented behavior, not something to build custom). Replace the handful of bare `console.error` calls in API route catch blocks with `Sentry.captureException(err)` (kept alongside `console.error`, not replacing it — Vercel's platform logs stay useful even with Sentry wired up). **You'll need to create a free Sentry account and add `SENTRY_DSN` for this to actually report anything.**

## Part 7: Extend the deterministic query layer

Confirmed duplicated status-filter logic exists, untouched, in `src/app/variations/page.tsx:22` and `src/app/team/page.tsx:20` — the same class of bug already fixed for Jobs/Customers earlier this session. Add `src/lib/variations/queries.ts` (`getPendingVariations()`, wrapping the `status: { in: ["approved","rejected","queried"] }`-style filter) and consider whether Team's job-status filter is worth its own function or is a one-off (single call site — likely stays inline, matching the precedent set for `jobs/page.tsx`'s single-use query in the earlier session). Quotes/Invoices/Compliance/Assets/Contracts get audited for the same pattern during planning — this part's exact scope is "whatever's actually duplicated," not a blanket rewrite of every query in those domains.

## Part 8: Test coverage — the highest-risk gap

`src/app/api/webhooks/clerk/route.ts` has no test coverage at all — this is how every user in the system gets provisioned (JIT user creation from Clerk webhooks). A bug here silently breaks onboarding for every future user. New `__tests__/route.test.ts` covering: valid webhook signature → user created/updated; invalid/missing signature → rejected; malformed payload → rejected gracefully, not a 500. Also close gaps on `src/app/api/time/clock-in`, `clock-out`, and `src/app/api/team/invite` (mutating, security-relevant routes currently untested) — PDF-generation routes (`invoices/[id]/pdf`, `quotes/[id]/pdf`) are lower priority (cosmetic failure mode, not a security/data-integrity one) and can follow later if time allows.

---

## Testing

Each part's testing is described inline above. Parts 1, 3, 5, 6 are infrastructure/config with no meaningful unit-test surface (CI config, headers, external-SDK wiring) — verified by manual/integration checks in the plan (a PR that triggers the new CI check, a `curl -I` confirming headers are present, confirming the app still boots with no Upstash/Sentry env vars set). Parts 2, 4, 7, 8 get real Vitest coverage matching this repo's established convention.

## Rollout

Land as 8 separate commits (one per part) so any can be reverted independently. Parts 5 and 6 ship "dark" (present in code, inactive without credentials) — after this lands, a follow-up step (outside this plan, since it requires you personally to create accounts) is: sign up for Upstash and Sentry, add the four env vars to Vercel, redeploy. No feature flag needed beyond that natural env-var gating.
