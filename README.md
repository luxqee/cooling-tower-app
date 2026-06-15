# Cooling Tower Sales and Service — Field Operations Platform

A field operations platform built to close the data capture gap between field work and the back office. Phase 0 is the framework only — no features yet.

## Tech Stack

- **Next.js 15** (App Router) — full-stack React framework
- **TypeScript** — type safety
- **Tailwind CSS** — utility-first styling
- **PostgreSQL** (planned) — database
- **NextAuth.js / Auth.js** (planned) — authentication

## Phase 0 Scope

- Folder structure
- Next.js + Tailwind installed and configured
- Main UI shell with left-hand navigation
- Stubbed pages for each feature module (no functionality yet)
- Auth and database integration planned but not implemented

## Setup

```bash
npm install
npm run dev
```

Open http://localhost:3000

## Folder Structure

```
src/
├── app/                  # Next.js App Router pages
│   ├── dashboard/        # Director and service manager dashboards
│   ├── jobs/             # Active jobs view
│   ├── time-tracking/    # Time entry records
│   ├── variations/       # Variation approval queue
│   ├── schedule/         # Crew assignments
│   ├── team/             # Technicians overview
│   ├── login/            # Login screen (placeholder)
│   ├── layout.tsx        # Root layout
│   ├── page.tsx          # Landing → redirects to dashboard
│   └── globals.css       # Global styles
├── components/
│   ├── ui/               # Reusable UI primitives (Button, Card)
│   ├── nav/              # Sidebar navigation
│   └── layout/           # Shell layout component
├── lib/
│   ├── auth/             # Auth helpers (placeholder)
│   ├── db/               # Database helpers (placeholder)
│   └── utils/            # Utility functions
└── types/                # Shared TypeScript types
```

## Next Phases

- **Phase 1a** — Database schema, authentication, role-based access
- **Phase 1b** — Time tracking module
- **Phase 1c** — Variation capture module
- **Phase 1d** — Real user testing and launch
