# CT Field Ops — Field Operations Platform

A multi-tenant field operations platform for cooling tower service businesses. Technicians capture time, variations, and compliance documents on-site from their phone. Directors and service managers get live visibility into crew activity and job status.

**Live app:** [cooling-tower-app-alpha.vercel.app](https://cooling-tower-app-alpha.vercel.app)

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS + dark mode |
| Auth | Clerk (JWT, role-based RBAC) |
| Database | PostgreSQL via Neon (serverless) |
| ORM | Prisma 7 with `@prisma/adapter-neon` |
| File Storage | Vercel Blob (private PDFs, photos) |
| PDF Generation | `@react-pdf/renderer` (server-side) |
| PWA | serwist v9 (service worker, offline shell) |
| Testing | Vitest |
| Package Manager | pnpm |
| Deployment | Vercel |

---

## Roles

| Role | Access |
|------|--------|
| `technician` | Jobs assigned to them, time tracking, compliance documents |
| `service_manager` | All jobs and team, schedule management |
| `director` | Full access including team invite and reporting |
| `admin` | Director + compliance template management |
| `sales_engineer` | Jobs and customer data |
| `draftsman` | Document and schedule read access |

---

## Feature Modules

### Phase 1 — Core Operations (complete)

**1a — Foundation**
- Next.js 14 App Router scaffold with full TypeScript
- Prisma 7 + Neon PostgreSQL database
- Clerk authentication with JIT user provisioning
- Role-based access control (6 roles) on all routes and API endpoints
- PWA service worker (serwist) with offline shell

**1b — Jobs & Time Tracking**
- Job lifecycle management (scheduled → active → complete)
- Mobile-first time entry with start/pause/stop
- Director dashboard with live crew status
- Scheduled-date calendar view

**1c — Variations**
- On-site variation capture with photo attachments (Vercel Blob)
- Approval workflow (pending → approved/rejected)
- Private photo proxy (`/api/photos`) for authenticated blob access

**1d — Launch Hardening**
- Seed script for demo data
- Dev login page for local testing
- Health endpoint (`/api/health`)
- 62 Vitest integration tests covering all API routes
- Email invite with pre-set role (director sends Clerk invitation)

---

### Phase 2 — Compliance & Documents (complete)

**2a — Compliance Document Templates**
- Admins build reusable SWMS, JSA, and WHS templates
- Section-based template editor: sections → fields (text, textarea, date, checkbox, checklist, signature)
- Signature capture via HTML5 canvas (mouse + touch)
- Technicians fill in templates against a specific job
- PDFs generated server-side with `@react-pdf/renderer` and stored privately in Vercel Blob
- All submitted documents accessible to every authenticated user
- 7-year retention (Australian WHS compliance requirement)

---

### Phase 2 — Planned

| Module | Description |
|--------|-------------|
| 2b | Quoting — site visit → quote generation → customer approval |
| 2c | Scheduling — drag-and-drop crew rostering |
| 2d | Reporting — job completion reports, time summaries, export to PDF |

---

### Phase 3 — Scale

Multi-tenancy (organisation isolation), customer portal, integrations (Xero, ServiceM8), advanced analytics.

---

## Local Development

```bash
# Install dependencies
pnpm install

# Set up environment variables (copy and fill in)
cp .env.example .env.local

# Required env vars:
# DATABASE_URL          — Neon PostgreSQL connection string
# CLERK_SECRET_KEY      — Clerk backend secret
# NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
# BLOB_READ_WRITE_TOKEN — Vercel Blob token
# NEXT_PUBLIC_APP_URL   — e.g. http://localhost:3000

# Run database migrations
pnpm prisma migrate dev

# Seed demo data
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
```

62 tests across 7 test files covering all API route handlers.

---

## Folder Structure

```
src/
├── app/
│   ├── (auth)/           # Sign-in / sign-up (Clerk)
│   ├── api/
│   │   ├── compliance/   # Templates + documents API
│   │   ├── jobs/         # Jobs CRUD
│   │   ├── photos/       # Private blob proxy
│   │   ├── team/         # Team management + invite
│   │   ├── time/         # Time tracking
│   │   └── variations/   # Variation approval
│   ├── compliance/       # Document list, fill-in, template builder
│   ├── dashboard/        # Director / service manager view
│   ├── dev-login/        # Local dev shortcut (disabled in prod)
│   ├── jobs/             # Job list and detail
│   ├── schedule/         # Crew calendar
│   ├── team/             # Team management
│   ├── time/             # Time entry
│   └── variations/       # Variation queue
├── lib/
│   ├── auth/             # Clerk helpers (requireRole, getSessionUser)
│   ├── compliance/       # PDF generation, shared types
│   ├── db/               # Prisma client (Neon adapter)
│   └── nav-config.ts     # Navigation items with role visibility
prisma/
├── schema.prisma         # Data model
└── migrations/           # Applied migrations
scripts/
└── seed.ts               # Demo data seeder
```

---

## Database Models

- `User` — synced from Clerk on first login; holds role + isActive
- `Job` — core work order; status: `scheduled | active | complete | cancelled`
- `TimeEntry` — clock-in/out records linked to job + user
- `Variation` — scope change requests with optional photo
- `ComplianceTemplate` — reusable SWMS/JSA/WHS template (sections JSON)
- `ComplianceDocument` — filled-in template instance with PDF stored in Vercel Blob
