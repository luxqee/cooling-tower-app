# Phase 1a — Database, Auth & RBAC Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire up Neon Postgres via Prisma, replace the auth placeholder with Clerk, and enforce role-based access control at the middleware, API, and UI layers.

**Architecture:** Neon Postgres is the database, accessed via Prisma ORM. Clerk owns all authentication (sessions, identity, lockout). Roles are stored in our `users` table and written via a Clerk webhook; `requireRole()` enforces access at every API boundary. The sidebar filters nav items client-side using the authenticated user's role.

**Tech Stack:** Next.js 14 App Router · TypeScript · Prisma · Neon Postgres · Clerk (`@clerk/nextjs`) · `svix` (webhook verification) · `zod` · `vitest`

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `prisma/schema.prisma` | All DB tables |
| Create | `prisma/.env` | DB connection string (gitignored) |
| Modify | `src/lib/db/client.ts` | Real Prisma singleton |
| Modify | `src/lib/auth/clerk.ts` | Replace placeholder — `requireRole`, `getSessionUser` |
| Create | `src/middleware.ts` | Clerk route protection |
| Modify | `src/app/layout.tsx` | Wrap in `ClerkProvider`, add PWA meta tags |
| Create | `public/manifest.json` | PWA manifest |
| Create | `src/app/api/webhooks/clerk/route.ts` | User sync + audit log |
| Modify | `src/components/nav/Sidebar.tsx` | Filter nav items by role |
| Create | `src/lib/auth/__tests__/clerk.test.ts` | Unit tests for `requireRole` |
| Create | `vitest.config.ts` | Vitest config |
| Modify | `package.json` | Add all Phase 1a dependencies |
| Create | `.env.local` | Clerk + Neon env vars (gitignored) |
| Modify | `.gitignore` | Ensure `.env*` and `prisma/.env` are excluded |

---

## Task 1: Install Phase 1a Dependencies

**Files:** Modify `package.json`

- [ ] **Step 1: Install dependencies**

```bash
pnpm add @clerk/nextjs svix @prisma/client zod
pnpm add -D prisma vitest @vitejs/plugin-react vite-tsconfig-paths
```

- [ ] **Step 2: Verify install**

```bash
pnpm list @clerk/nextjs prisma zod svix vitest
```

Expected: all five packages listed with version numbers.

- [ ] **Step 3: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: add phase 1a dependencies (clerk, prisma, zod, vitest)"
```

---

## Task 2: Configure Vitest

**Files:** Create `vitest.config.ts`

- [ ] **Step 1: Write vitest config**

```typescript
// vitest.config.ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  test: {
    environment: "node",
    globals: true,
  },
});
```

- [ ] **Step 2: Add test script to package.json**

In `package.json`, add to `"scripts"`:
```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 3: Verify vitest runs**

```bash
pnpm test
```

Expected: "No test files found" — that's fine, just confirms vitest runs.

- [ ] **Step 4: Commit**

```bash
git add vitest.config.ts package.json
git commit -m "chore: configure vitest"
```

---

## Task 3: Write Prisma Schema

**Files:** Create `prisma/schema.prisma`

- [ ] **Step 1: Initialise Prisma**

```bash
pnpm dlx prisma init --datasource-provider postgresql
```

This creates `prisma/schema.prisma` and `.env`. Move `.env` to `.env.local` if it doesn't already exist, or just fill in `.env.local` directly (Prisma reads it via `dotenv-cli` or you can pass `--env-file`).

- [ ] **Step 2: Write the schema**

Replace the contents of `prisma/schema.prisma`:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}

enum UserRole {
  technician
  director
  service_manager
  admin
  sales_engineer
  draftsman
}

enum JobStatus {
  scheduled
  active
  complete
  cancelled
}

enum TimeEntryStatus {
  active
  complete
}

enum VariationStatus {
  pending
  approved
  rejected
  queried
}

model User {
  id        String   @id @default(uuid())
  clerkId   String   @unique
  name      String
  email     String   @unique
  phone     String   @default("")
  role      UserRole
  isActive  Boolean  @default(true)
  createdAt DateTime @default(now())

  assignments Assignment[]
  timeEntries TimeEntry[]
  variations  Variation[]  @relation("TechnicianVariations")
  authEvents  AuthEvent[]
}

model Job {
  id           String    @id @default(uuid())
  customerName String
  siteName     String
  siteAddress  String
  status       JobStatus @default(scheduled)
  quotedHours  Float
  createdAt    DateTime  @default(now())

  assignments Assignment[]
  timeEntries TimeEntry[]
  variations  Variation[]
  invoices    Invoice[]

  @@index([status])
}

model Assignment {
  id           String   @id @default(uuid())
  userId       String
  jobId        String
  assignedDate DateTime @default(now())

  user User @relation(fields: [userId], references: [id])
  job  Job  @relation(fields: [jobId], references: [id])

  @@unique([userId, jobId, assignedDate])
}

model TimeEntry {
  id              String          @id @default(uuid())
  userId          String
  jobId           String
  clockInTime     DateTime
  clockOutTime    DateTime?
  durationMinutes Int?
  status          TimeEntryStatus @default(active)

  user User @relation(fields: [userId], references: [id])
  job  Job  @relation(fields: [jobId], references: [id])

  @@index([status])
  @@index([userId, status])
}

model Variation {
  id               String           @id @default(uuid())
  jobId            String
  technicianId     String
  description      String
  costEstimate     Float
  photoUrl         String?
  status           VariationStatus  @default(pending)
  directorDecision VariationStatus?
  decisionReason   String?
  submittedAt      DateTime         @default(now())
  decidedAt        DateTime?

  job        Job  @relation(fields: [jobId], references: [id])
  technician User @relation("TechnicianVariations", fields: [technicianId], references: [id])

  @@index([status])
  @@index([jobId])
}

model Invoice {
  id              String   @id @default(uuid())
  jobId           String
  baseAmount      Float
  variationsTotal Float
  totalAmount     Float
  createdAt       DateTime @default(now())

  job Job @relation(fields: [jobId], references: [id])
}

model AuthEvent {
  id        String   @id @default(uuid())
  userId    String?
  eventType String
  ipAddress String?
  userAgent String?
  createdAt DateTime @default(now())

  user User? @relation(fields: [userId], references: [id])

  @@index([userId])
  @@index([createdAt])
}
```

- [ ] **Step 3: Validate the schema**

```bash
pnpm dlx prisma validate
```

Expected: "The schema at `prisma/schema.prisma` is valid"

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat: define prisma schema for all phase 1 tables"
```

---

## Task 4: Configure Neon Postgres and Run Migration

**Files:** `.env.local`

- [ ] **Step 1: Create a Neon project**

Go to https://neon.tech → New Project → Region: `ap-southeast-2` (Sydney) → Copy the connection strings.

Neon gives you two connection strings:
- **Pooled** (for the app, via PgBouncer): used as `DATABASE_URL`
- **Direct** (for migrations): used as `DIRECT_URL`

- [ ] **Step 2: Populate `.env.local`**

```bash
# .env.local  — never commit this file
DATABASE_URL="postgresql://user:password@ep-xxx.ap-southeast-2.aws.neon.tech/neondb?sslmode=require&pgbouncer=true&connect_timeout=15"
DIRECT_URL="postgresql://user:password@ep-xxx.ap-southeast-2.aws.neon.tech/neondb?sslmode=require"
```

- [ ] **Step 3: Run the initial migration**

```bash
pnpm dlx prisma migrate dev --name init
```

Expected: prints table creation SQL, then "Your database is now in sync with your schema."

- [ ] **Step 4: Verify tables exist**

```bash
pnpm dlx prisma studio
```

Open the browser at http://localhost:5555. You should see all 7 models in the left sidebar (User, Job, Assignment, TimeEntry, Variation, Invoice, AuthEvent).

Close Prisma Studio with Ctrl+C.

- [ ] **Step 5: Commit**

```bash
git add prisma/migrations/
git commit -m "feat: run initial prisma migration against neon postgres"
```

---

## Task 5: Update Prisma Client Singleton

**Files:** Modify `src/lib/db/client.ts`

- [ ] **Step 1: Write the singleton**

Replace the full contents of `src/lib/db/client.ts`:

```typescript
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
```

- [ ] **Step 2: Generate Prisma client**

```bash
pnpm dlx prisma generate
```

Expected: "Generated Prisma Client"

- [ ] **Step 3: Verify TypeScript compiles**

```bash
pnpm tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/db/client.ts
git commit -m "feat: implement prisma client singleton"
```

---

## Task 6: Configure Clerk

**Files:** `.env.local`, `src/app/layout.tsx`

- [ ] **Step 1: Create a Clerk application**

Go to https://dashboard.clerk.com → Create Application → Name: "Cooling Tower Field Ops" → Enable Email, Phone Number sign-in → Copy keys.

- [ ] **Step 2: Add Clerk keys to `.env.local`**

```bash
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_xxx
CLERK_SECRET_KEY=sk_test_xxx
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/dashboard
NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/dashboard
```

- [ ] **Step 3: Wrap layout in ClerkProvider and add PWA meta tags**

Replace the full contents of `src/app/layout.tsx`:

```tsx
import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";

export const metadata: Metadata = {
  title: "Field Operations | Cooling Tower Sales and Service",
  description: "Field operations platform for cooling tower service teams",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "CT Field Ops",
  },
};

export const viewport: Viewport = {
  themeColor: "#f59e0b",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider>
      <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
        <head>
          <link rel="apple-touch-icon" href="/icons/icon-192.png" />
        </head>
        <body className="bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 antialiased">
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
```

- [ ] **Step 4: Create the PWA manifest**

Create `public/manifest.json`:

```json
{
  "name": "Cooling Tower Field Ops",
  "short_name": "CT Field Ops",
  "description": "Field operations platform for cooling tower service teams",
  "start_url": "/dashboard",
  "display": "standalone",
  "background_color": "#0a0e14",
  "theme_color": "#f59e0b",
  "orientation": "portrait",
  "icons": [
    {
      "src": "/icons/icon-192.png",
      "sizes": "192x192",
      "type": "image/png",
      "purpose": "any maskable"
    },
    {
      "src": "/icons/icon-512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "any maskable"
    }
  ]
}
```

- [ ] **Step 5: Add placeholder icons**

Create `public/icons/` directory and add two PNG icons — 192×192 and 512×512 — with the CT Field Ops logo or a simple amber square as placeholder. Real icons can be produced later with a tool like https://maskable.app.

```bash
mkdir -p public/icons
# Drop icon-192.png and icon-512.png into public/icons/
```

- [ ] **Step 6: Verify app starts**

```bash
pnpm dev
```

Open http://localhost:3000. Clerk should redirect to the sign-in page. Expected: Clerk's hosted sign-in UI loads.

- [ ] **Step 7: Commit**

```bash
git add src/app/layout.tsx public/manifest.json public/icons/
git commit -m "feat: add clerk provider and pwa manifest to layout"
```

---

## Task 7: Implement Clerk Middleware

**Files:** Create `src/middleware.ts`

- [ ] **Step 1: Write middleware**

```typescript
// src/middleware.ts
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isPublicRoute = createRouteMatcher([
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/api/webhooks(.*)",
]);

export default clerkMiddleware((auth, request) => {
  if (!isPublicRoute(request)) {
    auth().protect();
  }
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
```

- [ ] **Step 2: Verify redirect works**

```bash
pnpm dev
```

Open http://localhost:3000/dashboard in an incognito window. Expected: redirected to `/sign-in`.

- [ ] **Step 3: Commit**

```bash
git add src/middleware.ts
git commit -m "feat: protect all routes with clerk middleware"
```

---

## Task 8: Implement requireRole Helper

**Files:** Modify `src/lib/auth/clerk.ts` (rename from `session.ts` if needed), create `src/lib/auth/__tests__/clerk.test.ts`

- [ ] **Step 1: Write the failing test first**

Create `src/lib/auth/__tests__/clerk.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock Clerk's auth() before importing our module
vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(),
}));

// Mock the Prisma client
vi.mock("@/lib/db/client", () => ({
  db: {
    user: {
      findUnique: vi.fn(),
    },
  },
}));

import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db/client";
import { getSessionUser, requireRole } from "@/lib/auth/clerk";

const mockAuth = vi.mocked(auth);
const mockFindUnique = vi.mocked(db.user.findUnique);

const mockUser = {
  id: "user-123",
  clerkId: "clerk-abc",
  name: "Jake Torres",
  email: "jake@ctss.com.au",
  phone: "0400000000",
  role: "technician" as const,
  isActive: true,
  createdAt: new Date(),
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getSessionUser", () => {
  it("returns null when not signed in", async () => {
    mockAuth.mockReturnValue({ userId: null } as ReturnType<typeof auth>);
    const result = await getSessionUser();
    expect(result).toBeNull();
  });

  it("returns null when user not found in DB", async () => {
    mockAuth.mockReturnValue({ userId: "clerk-abc" } as ReturnType<typeof auth>);
    mockFindUnique.mockResolvedValue(null);
    const result = await getSessionUser();
    expect(result).toBeNull();
  });

  it("returns null when user is inactive", async () => {
    mockAuth.mockReturnValue({ userId: "clerk-abc" } as ReturnType<typeof auth>);
    mockFindUnique.mockResolvedValue({ ...mockUser, isActive: false });
    const result = await getSessionUser();
    expect(result).toBeNull();
  });

  it("returns session user when signed in and active", async () => {
    mockAuth.mockReturnValue({ userId: "clerk-abc" } as ReturnType<typeof auth>);
    mockFindUnique.mockResolvedValue(mockUser);
    const result = await getSessionUser();
    expect(result).toMatchObject({ id: "user-123", role: "technician" });
  });
});

describe("requireRole", () => {
  it("throws Unauthorized when not signed in", async () => {
    mockAuth.mockReturnValue({ userId: null } as ReturnType<typeof auth>);
    await expect(requireRole(["director"])).rejects.toThrow("Unauthorized");
  });

  it("throws Forbidden when role is not in the allowed list", async () => {
    mockAuth.mockReturnValue({ userId: "clerk-abc" } as ReturnType<typeof auth>);
    mockFindUnique.mockResolvedValue(mockUser); // technician
    await expect(requireRole(["director", "admin"])).rejects.toThrow("Forbidden");
  });

  it("returns the session user when role is allowed", async () => {
    mockAuth.mockReturnValue({ userId: "clerk-abc" } as ReturnType<typeof auth>);
    mockFindUnique.mockResolvedValue(mockUser); // technician
    const result = await requireRole(["technician", "director"]);
    expect(result.id).toBe("user-123");
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
pnpm test
```

Expected: FAIL — module `@/lib/auth/clerk` not found.

- [ ] **Step 3: Write the implementation**

Create (or replace) `src/lib/auth/clerk.ts`:

```typescript
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db/client";
import type { UserRole } from "@/lib/nav-config";

export interface SessionUser {
  id: string;
  clerkId: string;
  name: string;
  email: string;
  role: UserRole;
  isActive: boolean;
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const { userId } = auth();
  if (!userId) return null;

  const user = await db.user.findUnique({ where: { clerkId: userId } });
  if (!user || !user.isActive) return null;

  return {
    id: user.id,
    clerkId: user.clerkId,
    name: user.name,
    email: user.email,
    role: user.role as UserRole,
    isActive: user.isActive,
  };
}

export async function requireRole(allowedRoles: UserRole[]): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new Error("Unauthorized");
  if (!allowedRoles.includes(user.role)) throw new Error("Forbidden");
  return user;
}
```

- [ ] **Step 4: Delete the old placeholder**

If `src/lib/auth/session.ts` still exists, delete it:

```bash
rm src/lib/auth/session.ts
```

Update any imports in the codebase that referenced `@/lib/auth/session`:

```bash
grep -r "lib/auth/session" src/ --include="*.ts" --include="*.tsx"
```

Replace each import with `@/lib/auth/clerk`.

- [ ] **Step 5: Run tests — confirm they pass**

```bash
pnpm test
```

Expected: all 6 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/auth/clerk.ts src/lib/auth/__tests__/clerk.test.ts
git commit -m "feat: implement requireRole with clerk session — tested"
```

---

## Task 9: Implement Clerk Webhook (User Sync + Audit Log)

**Files:** Create `src/app/api/webhooks/clerk/route.ts`

- [ ] **Step 1: Set up webhook in Clerk dashboard**

Go to Clerk Dashboard → Webhooks → Add Endpoint.
- URL: `https://your-vercel-url.vercel.app/api/webhooks/clerk` (or use ngrok for local dev: `npx ngrok http 3000`)
- Events to subscribe: `user.created`, `user.updated`, `session.created`, `session.ended`, `session.removed`
- Copy the Signing Secret.

- [ ] **Step 2: Add webhook secret to `.env.local`**

```bash
CLERK_WEBHOOK_SECRET=whsec_xxx
```

- [ ] **Step 3: Write the webhook handler**

Create `src/app/api/webhooks/clerk/route.ts`:

```typescript
import { headers } from "next/headers";
import type { WebhookEvent } from "@clerk/nextjs/server";
import { Webhook } from "svix";
import { db } from "@/lib/db/client";
import type { UserRole } from "@/lib/nav-config";

export async function POST(req: Request) {
  const secret = process.env.CLERK_WEBHOOK_SECRET;
  if (!secret) return new Response("No webhook secret configured", { status: 500 });

  const headerPayload = headers();
  const svixId = headerPayload.get("svix-id");
  const svixTimestamp = headerPayload.get("svix-timestamp");
  const svixSignature = headerPayload.get("svix-signature");

  if (!svixId || !svixTimestamp || !svixSignature) {
    return new Response("Missing svix headers", { status: 400 });
  }

  const payload = await req.text();
  const wh = new Webhook(secret);
  let evt: WebhookEvent;

  try {
    evt = wh.verify(payload, {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    }) as WebhookEvent;
  } catch {
    return new Response("Invalid webhook signature", { status: 400 });
  }

  if (evt.type === "user.created" || evt.type === "user.updated") {
    const { id, first_name, last_name, email_addresses, public_metadata, phone_numbers } = evt.data;
    const email = email_addresses[0]?.email_address ?? "";
    const name = [first_name, last_name].filter(Boolean).join(" ");
    const role = (public_metadata?.role as UserRole) ?? "technician";
    const phone = phone_numbers[0]?.phone_number ?? "";

    await db.user.upsert({
      where: { clerkId: id },
      update: { name, email, role, phone },
      create: { clerkId: id, name, email, role, phone, isActive: true },
    });
  }

  if (evt.type === "session.created") {
    const user = await db.user.findUnique({ where: { clerkId: evt.data.user_id } });
    if (user) {
      await db.authEvent.create({ data: { eventType: "login", userId: user.id } });
    }
  }

  if (evt.type === "session.ended" || evt.type === "session.removed") {
    const user = await db.user.findUnique({ where: { clerkId: evt.data.user_id } });
    if (user) {
      await db.authEvent.create({ data: { eventType: "logout", userId: user.id } });
    }
  }

  return new Response("OK", { status: 200 });
}
```

- [ ] **Step 4: Test webhook locally with ngrok**

```bash
npx ngrok http 3000
```

Copy the ngrok URL, update it in the Clerk Webhook dashboard, then trigger a test event from Clerk Dashboard → Webhooks → Test. Check your terminal for the `[query]` log from Prisma confirming the DB write.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/webhooks/clerk/route.ts
git commit -m "feat: sync clerk users to db and write auth events via webhook"
```

---

## Task 10: Update Sidebar for Role-Based Navigation

**Files:** Modify `src/components/nav/Sidebar.tsx`

- [ ] **Step 1: Read the current Sidebar**

Read `src/components/nav/Sidebar.tsx` before editing to understand the current render pattern.

- [ ] **Step 2: Fetch the session user and filter nav items**

The Sidebar is a Server Component, so it can call `getSessionUser()` directly. Update `src/components/nav/Sidebar.tsx` to:

```tsx
import { getSessionUser } from "@/lib/auth/clerk";
import { navItems } from "@/lib/nav-config";
// ... existing imports kept

export async function Sidebar() {
  const user = await getSessionUser();
  const visibleItems = user
    ? navItems.filter((item) => item.visibleTo.includes(user.role))
    : [];

  return (
    // existing JSX structure — replace the `navItems.map(...)` call with `visibleItems.map(...)`
    // keep all existing class names and structure unchanged
  );
}
```

Do not restructure the JSX — only change the data source from `navItems` to `visibleItems`, and add the `getSessionUser()` call.

- [ ] **Step 3: Verify roles filter correctly**

Sign in as a user with role `technician` in Clerk (set `public_metadata: { role: "technician" }` in Clerk Dashboard for your test user). The sidebar should show zero nav items (technicians have no sidebar items in Phase 1a — their UI comes in Phase 1b).

Sign in as `director` — should see Dashboard and Team.

- [ ] **Step 4: Commit**

```bash
git add src/components/nav/Sidebar.tsx
git commit -m "feat: filter sidebar nav items by authenticated user role"
```

---

## Task 11: Set Role on a Test User

This task uses the Clerk Dashboard to manually assign a role so you can test RBAC end-to-end before the webhook is wired to a live environment.

- [ ] **Step 1: Open Clerk Dashboard → Users → select your test user**

- [ ] **Step 2: Edit `public_metadata`**

```json
{ "role": "director" }
```

Save. The next time the user's session refreshes, `auth().sessionClaims.publicMetadata.role` will include this value.

However, because `requireRole` reads from our **DB** (not Clerk metadata directly), you also need the webhook to have fired to sync this user into `users`. If the user was created before the webhook was set up:

```bash
pnpm dlx prisma studio
```

Manually create a row in the `User` table with `clerkId` matching your Clerk user ID and `role = director`.

- [ ] **Step 3: Verify protected API routes block the wrong role**

```bash
curl http://localhost:3000/api/jobs
```

Expected without a session cookie: 401 or redirect to sign-in.

---

## Task 12: TypeScript and Lint Check

- [ ] **Step 1: Check types**

```bash
pnpm tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 2: Lint**

```bash
pnpm lint
```

Fix any reported issues.

- [ ] **Step 3: Run all tests**

```bash
pnpm test
```

Expected: all tests PASS.

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "chore: phase 1a complete — db, auth, rbac all wired"
```

---

## Phase 1a Completion Checklist

- [ ] Neon Postgres connected, all tables created via Prisma migration
- [ ] Clerk sign-in/sign-up pages work
- [ ] Unauthenticated users are redirected to sign-in by middleware
- [ ] `requireRole()` throws for wrong role (tested and passing)
- [ ] Clerk webhook syncs users to DB on create/update
- [ ] Login/logout written to `auth_events` table
- [ ] Sidebar shows only role-appropriate nav items
- [ ] `pnpm tsc --noEmit` — zero errors
- [ ] `pnpm lint` — zero errors
- [ ] `pnpm test` — all tests PASS
- [ ] PWA manifest present at `/manifest.json`
- [ ] Deployed to Vercel with all env vars set in Vercel project settings
