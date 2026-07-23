# Field Ops — Field Operations Platform

A phone-first field operations platform for service and maintenance businesses — built for a cooling tower servicing company as its first customer, kept trade-agnostic by design. Technicians capture time, variations, voice notes, and compliance documents on-site from their phone. Directors and service managers get live visibility into crew activity, job status, quoting, invoicing, and an AI assistant for day-to-day questions.

**Current scope:** single-tenant (one business per deployment) — see [Roadmap](#roadmap) below.

**Live app:** [cooling-tower-app-alpha.vercel.app](https://cooling-tower-app-alpha.vercel.app)

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS + dark mode |
| Auth | Clerk (JWT, role-based RBAC, Google/GitHub OAuth) |
| Database | PostgreSQL via Neon (serverless), pgvector for semantic search |
| ORM | Prisma 7 with `@prisma/adapter-neon` |
| File Storage | Vercel Blob (private PDFs, photos, voice recordings) |
| PDF Generation | `@react-pdf/renderer` (server-side) |
| AI | Anthropic Claude (company assistant, voice note summaries), AssemblyAI (transcription), Voyage AI (embeddings) |
| Error Monitoring | Sentry |
| Rate Limiting | Upstash Redis (inert until configured) |
| PWA | Serwist (service worker, offline shell) |
| Testing | Vitest (539 tests) |
| Package Manager | pnpm |
| CI/CD | GitHub Actions (typecheck + test on every push) |
| Deployment | Vercel |

---

## Roles

| Role | Access |
|------|--------|
| `technician` | Jobs assigned to them, time tracking, variations, voice notes, compliance documents |
| `service_manager` | All jobs and team, schedule management, time tracking |
| `director` | Full access — team invite, invoicing, reporting, AI assistant, system health |
| `admin` | Director + compliance template management |
| `sales_engineer` | Jobs, quotes, and customer data |

---

## Features

**Jobs & Scheduling** — job lifecycle (`scheduled → active → complete`, or `cancelled`), a weekly crew schedule grid for managers and a personal daily view for technicians, live crew status.

**Time Tracking** — mobile clock-in/out scoped to a technician's own assignment for the day.

**Variations** — on-site scope-change capture with photo attachments, director approval workflow (`pending → approved / rejected / queried`).

**Compliance Documents** — SWMS, JSA, WHS Management Plan, and Site Induction. SWMS and WHS Management Plan carry code-locked, WorkSafe-QLD-grounded statutory content that admins can't edit, merged ahead of admin-configurable custom sections; every generated PDF for those two carries a disclaimer that the content is AI-researched and not reviewed by a WHS professional. Custom field types include tables and multi-signature lists.

**Quoting & Invoicing** — quote → job → invoice pipeline with historical job-cost reference data (avg hours/cost by job type) to help price new quotes accurately.

**Customers, Assets & Contracts** — customer records linked to job history, tracked equipment/assets, maintenance contracts with renewal tracking.

**Voice Notes** — record on-site observations (audio/video), transcribed and summarised by AI, indexed for semantic search.

**AI Company Assistant** — a chat assistant with quick-action buttons (active jobs, this week's assignments, overdue jobs, pending variations, unpaid invoices) that answer instantly from the database with zero AI/token cost — the LLM is only used for genuinely open-ended questions and drafting (variations, quotes), never for answers a plain query already has.

**Customer Portal** — a token-based read-only view for customers to see their own job history, invoices, and compliance documents, without a login.

**Job Communications & Notifications** — a per-job communication log (calls, internal notes, field instructions) and push notifications for job assignments and approvals.

**Data Export & System Health** — CSV export for customers/jobs/invoices, and a live dashboard (`/settings/monitoring`) showing database size, storage usage, and AI cost broken down by feature.

---

## Local Development

```bash
# Install dependencies
pnpm install

# Set up environment variables (copy and fill in)
cp .env.example .env.local
# See .env.example for the full list and what's required vs. optional —
# rate limiting and error monitoring are inert-by-default and need no
# setup to run locally.

# Apply database migrations
npx prisma migrate dev

# Seed demo data (multiple customers, months of jobs, all 4 compliance
# document types, voice notes, quotes, invoices — enough to scroll)
pnpm seed

# Start dev server
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000)

---

## Running Tests

```bash
pnpm test          # run all tests
pnpm test --watch  # watch mode
npx tsc --noEmit   # typecheck
```

539 tests across 79 test files. CI runs both on every push to `main`.

---

## Folder Structure

```
src/
├── app/
│   ├── api/              # All API routes, grouped by domain
│   ├── assistant/        # AI company assistant chat + quick-actions
│   ├── compliance/       # Document list, fill-in form, template builder
│   ├── customers/        # Customer list, detail, creation
│   ├── invoices/         # Invoice list, detail, send
│   ├── jobs/             # Job list, detail, creation
│   ├── portal/           # Token-based customer portal (no login)
│   ├── quotes/           # Quote list, creation, historical pricing reference
│   ├── schedule/         # Crew calendar (manager grid + technician daily view)
│   ├── settings/         # Business profile, data export, system health
│   ├── team/              # Team management + invite
│   ├── time-tracking/    # Personal clock-in/out
│   └── variations/       # Variation submission + approval queue
├── lib/
│   ├── ai/               # Claude client, model registry, cost tracking
│   ├── assistant/        # Assistant tools (read/draft) + quick-action queries
│   ├── auth/              # Clerk helpers (requireRole, getSessionUser)
│   ├── compliance/       # PDF generation, statutory sections, shared types
│   ├── db/                # Prisma client (Neon adapter)
│   ├── monitoring/        # System health stats (DB size, storage, AI cost)
│   ├── rateLimit.ts       # Inert-by-default rate limiting (Upstash)
│   └── voice-notes/       # Voice note validation + processing
prisma/
├── schema.prisma          # Data model (26 models)
├── migrations/            # Applied migrations
└── seed.ts                # Demo data seeder
.github/workflows/
└── ci.yml                 # Typecheck + test on every push
```

---

## Database Models

26 models in `prisma/schema.prisma`, spanning: `User`, `Job`, `Customer`, `Assignment`, `TimeEntry`, `Variation`, `Invoice`, `Quote`, `Contract`, `Asset`, `ComplianceTemplate` / `ComplianceDocument`, `VoiceNote`, `JobCommunication`, `ChatSession` / `ChatMessage`, `DocumentChunk` (semantic search embeddings), `AiAuditLog` (per-call cost tracking), `Notification`, `CustomerPortalToken`, and supporting join/audit tables.

---

## Docs

Design specs and implementation plans for every feature area live in [`docs/superpowers/plans/`](docs/superpowers/plans/) and [`docs/superpowers/specs/`](docs/superpowers/specs/), in chronological order. The most relevant starting points:

| Document | Description |
|----------|-------------|
| [Expert Review — 2026-07-05](docs/reviews/2026-07-05-expert-review.md) | Solution, security, UX, and database findings from an early full-app review. |
| [Accurate Compliance Documents](docs/superpowers/specs/2026-07-17-accurate-compliance-documents-design.md) | Design for the WorkSafe-QLD-grounded statutory compliance content. |
| [Pre-Deployment Readiness](docs/superpowers/specs/2026-07-17-pre-deployment-readiness-design.md) | CI, security headers, rate limiting, monitoring, data export. |

---

## Roadmap

- **Simpro data import** — one-time migration path for businesses moving off Simpro, deliberately deferred until real customer data is available to migrate.
- **Multi-tenancy** — this app is currently built for one business per deployment. Turning it into a true multi-tenant product (isolated data per business, sharing one deployment) is a real second phase of work, not a quick add-on — see the reasoning in the pre-deployment readiness docs before starting it.
