# Pre-Deployment Readiness Implementation Plan

> Building directly this run (no subagent dispatch, per established fast-track preference) — this doc tracks the task breakdown, not a subagent-brief format.

Full context: `docs/superpowers/specs/2026-07-17-pre-deployment-readiness-design.md`.

## Task 1: CI (GitHub Actions)

- New `.github/workflows/ci.yml`: on `push`/`pull_request` to `main`, checkout, setup pnpm + Node, `pnpm install --frozen-lockfile`, `pnpm exec vitest run`, `pnpm exec tsc --noEmit`.
- Verify by pushing and confirming the check appears on GitHub (or trust the YAML syntax and confirm locally that the equivalent commands pass, since this session may not push mid-task).
- Commit.

## Task 2: Hardcoded business-name cleanup

- Read each of the 17 confirmed occurrences fresh (file contents may have shifted since the audit) and replace with `businessProfile?.name`/`industryDescription` reads, generic fallback (`"Your Business"`) only where genuinely needed.
- `prisma/schema.prisma`: `BusinessProfile.name`'s `@default("CT Field Ops")` → `@default("Your Business")` — run `npx prisma migrate dev --name generic_business_profile_default` (or the pnpm equivalent) to generate the migration.
- `src/app/jobs/NewJobForm.tsx`: placeholder text → trade-neutral.
- Verify: `npx vitest run` — check specifically whether any existing test asserts the literal "CT Field Ops" string (several likely do, e.g. settings/invoice tests) and update those fixtures deliberately, not accidentally.
- Commit.

## Task 3: Security headers

- `next.config.mjs`: add `headers()` returning CSP (audit actual script/style/connect origins in use — Clerk, Vercel Blob, the app's own origin — before writing the policy, don't guess), `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`.
- Verify Vercel doesn't already set HSTS at the edge (check response headers on the live deployment) before deciding whether to add it in-app too.
- Manual verify: `curl -I` against a local dev boot, confirm headers present.
- Commit.

## Task 4: Data export

- New `src/app/api/export/customers/route.ts`, `jobs/route.ts`, `invoices/route.ts` — role-gated (`director`/`admin`), stream CSV.
- Settings page: "Export data" section linking to the three endpoints, visible only to those roles.
- Tests for all three routes (auth gate, CSV shape) matching this repo's existing route-test conventions.
- Commit.

## Task 5: Rate limiting (inert without credentials)

- Add `@upstash/ratelimit` + `@upstash/redis` (`pnpm add`).
- New `src/lib/rateLimit.ts`: `checkRateLimit(key): Promise<boolean>`, lazily constructs the Upstash client only if both env vars are present; returns `true` unconditionally otherwise.
- Apply to `src/app/api/assistant/chat/route.ts`, `quick-action/route.ts` (per-user key), and the portal token lookup (per-IP key).
- Test: `checkRateLimit` with no env vars set always returns `true` (confirms the inert-by-default guarantee — this is the one truly load-bearing test in this task).
- Commit.

## Task 6: Error monitoring (inert without credentials)

- Add `@sentry/nextjs`, standard config files (`sentry.client.config.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts`), wrap `next.config.mjs` with `withSentryConfig`.
- Replace bare `console.error` in API route catch blocks with `Sentry.captureException(err)` alongside the existing `console.error` (not replacing it).
- Verify: app boots and behaves identically with no `SENTRY_DSN` set (Sentry's own documented no-op behavior — confirm, don't just assume).
- Commit.

## Task 7: Extend deterministic query layer

- New `src/lib/variations/queries.ts`: `getPendingVariations()` wrapping `variations/page.tsx:22`'s duplicated filter.
- Migrate `variations/page.tsx` to use it.
- Audit Quotes/Invoices/Compliance/Assets/Contracts for the same duplicated-filter pattern during this task (not pre-decided) — only build shared functions for what's actually duplicated, matching this session's established YAGNI discipline on this exact kind of work.
- Tests for the new query function(s), matching `src/lib/jobs/queries.ts`'s existing test pattern.
- Commit.

## Task 8: Test coverage — Clerk webhook + other security-relevant gaps

- New `src/app/api/webhooks/clerk/__tests__/route.test.ts`: valid signature → user created/updated; invalid/missing signature → rejected; malformed payload → graceful rejection not 500.
- New tests for `src/app/api/time/clock-in`, `clock-out`, `src/app/api/team/invite` if not already covered (re-verify current coverage first — the earlier audit may be slightly stale by the time this task runs).
- Commit.

## Final Verification

- `npx vitest run && npx tsc --noEmit` clean.
- Confirm app boots with zero new env vars set (Parts 5/6's inert-by-default guarantee) — this is the one constraint that must never regress.
