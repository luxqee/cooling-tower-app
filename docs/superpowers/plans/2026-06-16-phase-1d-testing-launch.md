# Phase 1d — Testing & Launch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden the platform through real-device E2E tests, fix bugs found during 3-day technician trials, and go live with all 7 technicians and management roles.

**Architecture:** Playwright for E2E tests against a test database (separate Neon branch). Manual testing on real iOS/Android devices covers the PWA install, camera access, and push notifications. Launch is a Vercel production deployment with environment variables verified and all roles seeded in Clerk.

**Tech Stack:** Playwright · Neon database branching · Vercel production deployment · Clerk production environment

**Prerequisite:** Phase 1a, 1b, and 1c complete. All prior phase tests passing.

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `playwright.config.ts` | Playwright E2E config |
| Create | `e2e/auth.setup.ts` | Authenticate as each role, save session state |
| Create | `e2e/time-tracking.spec.ts` | E2E: clock in/out happy path, duplicate guard |
| Create | `e2e/variations.spec.ts` | E2E: submit variation, director approves, invoice created |
| Create | `e2e/rbac.spec.ts` | E2E: verify technicians can't access financial routes |
| Create | `scripts/seed.ts` | Seed test data into Neon (jobs, assignments) |
| Create | `docs/training/technician-guide.md` | One-page how-to for field technicians |
| Create | `docs/training/director-guide.md` | One-page how-to for directors |
| Create | `docs/launch-checklist.md` | Go-live checklist |

---

## Task 1: Install Playwright

**Files:** `package.json`

- [ ] **Step 1: Install**

```bash
pnpm add -D @playwright/test
pnpm dlx playwright install chromium webkit
```

- [ ] **Step 2: Add scripts to package.json**

```json
"e2e": "playwright test",
"e2e:ui": "playwright test --ui"
```

- [ ] **Step 3: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: add playwright for e2e testing"
```

---

## Task 2: Configure Playwright

**Files:** Create `playwright.config.ts`

- [ ] **Step 1: Write config**

```typescript
// playwright.config.ts
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  retries: 1,
  reporter: [["html", { open: "never" }]],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "setup",
      testMatch: /auth\.setup\.ts/,
    },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      dependencies: ["setup"],
    },
    {
      name: "Mobile Safari",
      use: { ...devices["iPhone 13"] },
      dependencies: ["setup"],
    },
  ],
  webServer: {
    command: "pnpm dev",
    port: 3000,
    reuseExistingServer: true,
  },
});
```

- [ ] **Step 2: Create e2e directory**

```bash
mkdir -p e2e
```

- [ ] **Step 3: Commit**

```bash
git add playwright.config.ts
git commit -m "chore: configure playwright with mobile safari and desktop chrome"
```

---

## Task 3: Set Up a Test Neon Database Branch

Neon supports database branching — create a separate branch for E2E tests so tests never touch the production database.

- [ ] **Step 1: Create a test branch in Neon**

Go to https://console.neon.tech → Your project → Branches → Create branch → Name: `test`.

Copy the connection strings for the `test` branch.

- [ ] **Step 2: Add test env vars**

Create `.env.test.local`:
```bash
DATABASE_URL="postgresql://...test-branch-url...?pgbouncer=true"
DIRECT_URL="postgresql://...test-branch-direct-url..."
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_xxx  # same as dev
CLERK_SECRET_KEY=sk_test_xxx
PLAYWRIGHT_BASE_URL=http://localhost:3000
```

- [ ] **Step 3: Run migrations against the test branch**

```bash
DATABASE_URL="$(grep DIRECT_URL .env.test.local | cut -d= -f2-)" pnpm dlx prisma migrate deploy
```

Expected: "All migrations have been successfully applied."

- [ ] **Step 4: Write the seed script**

Create `scripts/seed.ts`:

```typescript
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient({
  datasources: { db: { url: process.env.DIRECT_URL } },
});

async function main() {
  // Clear existing test data
  await db.timeEntry.deleteMany();
  await db.variation.deleteMany();
  await db.assignment.deleteMany();
  await db.invoice.deleteMany();
  await db.authEvent.deleteMany();
  await db.pushSubscription.deleteMany();
  await db.user.deleteMany();
  await db.job.deleteMany();

  // Seed jobs
  const job1 = await db.job.create({
    data: {
      customerName: "Rio Tinto",
      siteName: "Weipa Site A",
      siteAddress: "Weipa QLD 4874",
      status: "active",
      quotedHours: 8,
    },
  });

  const job2 = await db.job.create({
    data: {
      customerName: "Coca-Cola",
      siteName: "Milton Bottling Plant",
      siteAddress: "Milton QLD 4064",
      status: "active",
      quotedHours: 4,
    },
  });

  // Seed users (these Clerk IDs must match users in your Clerk test env)
  const techUser = await db.user.create({
    data: {
      clerkId: process.env.TEST_TECHNICIAN_CLERK_ID!,
      name: "Test Technician",
      email: "technician@test.ctss.com.au",
      phone: "0400000001",
      role: "technician",
      isActive: true,
    },
  });

  const directorUser = await db.user.create({
    data: {
      clerkId: process.env.TEST_DIRECTOR_CLERK_ID!,
      name: "Test Director",
      email: "director@test.ctss.com.au",
      phone: "0400000002",
      role: "director",
      isActive: true,
    },
  });

  // Assign technician to job1 today
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  await db.assignment.create({
    data: { userId: techUser.id, jobId: job1.id, assignedDate: today },
  });

  console.log("Seed complete:", { job1: job1.id, job2: job2.id, techUser: techUser.id, directorUser: directorUser.id });
}

main().catch(console.error).finally(() => db.$disconnect());
```

Add to `.env.test.local`:
```bash
TEST_TECHNICIAN_CLERK_ID=user_xxx   # from Clerk Dashboard
TEST_DIRECTOR_CLERK_ID=user_yyy
```

Add to `package.json` scripts:
```json
"seed:test": "dotenv -e .env.test.local ts-node scripts/seed.ts"
```

Install `ts-node` and `dotenv-cli`:
```bash
pnpm add -D ts-node dotenv-cli
```

- [ ] **Step 5: Run seed**

```bash
pnpm seed:test
```

Expected: "Seed complete: { job1: '...', ... }"

- [ ] **Step 6: Commit**

```bash
git add playwright.config.ts scripts/seed.ts
git commit -m "chore: e2e seed script and test neon branch setup"
```

---

## Task 4: Auth Setup for Playwright

**Files:** Create `e2e/auth.setup.ts`

Playwright needs to sign in as each role and save session cookies so test files don't need to log in separately.

- [ ] **Step 1: Write auth setup**

Create `e2e/auth.setup.ts`:

```typescript
import { test as setup } from "@playwright/test";
import path from "path";

const technicianFile = path.join(__dirname, ".auth/technician.json");
const directorFile = path.join(__dirname, ".auth/director.json");

setup("authenticate as technician", async ({ page }) => {
  await page.goto("/sign-in");
  await page.getByLabel(/email/i).fill(process.env.TEST_TECHNICIAN_EMAIL!);
  await page.getByRole("button", { name: /continue/i }).click();
  await page.getByLabel(/password/i).fill(process.env.TEST_TECHNICIAN_PASSWORD!);
  await page.getByRole("button", { name: /continue|sign in/i }).click();
  await page.waitForURL("/dashboard", { timeout: 10_000 });
  await page.context().storageState({ path: technicianFile });
});

setup("authenticate as director", async ({ page }) => {
  await page.goto("/sign-in");
  await page.getByLabel(/email/i).fill(process.env.TEST_DIRECTOR_EMAIL!);
  await page.getByRole("button", { name: /continue/i }).click();
  await page.getByLabel(/password/i).fill(process.env.TEST_DIRECTOR_PASSWORD!);
  await page.getByRole("button", { name: /continue|sign in/i }).click();
  await page.waitForURL("/dashboard", { timeout: 10_000 });
  await page.context().storageState({ path: directorFile });
});
```

Add to `.env.test.local`:
```bash
TEST_TECHNICIAN_EMAIL=technician@test.ctss.com.au
TEST_TECHNICIAN_PASSWORD=TestPass123!
TEST_DIRECTOR_EMAIL=director@test.ctss.com.au
TEST_DIRECTOR_PASSWORD=TestPass123!
```

Add `.auth/` to `.gitignore`:
```bash
echo "e2e/.auth/" >> .gitignore
```

- [ ] **Step 2: Create `.auth` directory**

```bash
mkdir -p e2e/.auth
```

- [ ] **Step 3: Commit**

```bash
git add e2e/auth.setup.ts .gitignore
git commit -m "chore: playwright auth setup for technician and director roles"
```

---

## Task 5: Time Tracking E2E Tests

**Files:** Create `e2e/time-tracking.spec.ts`

- [ ] **Step 1: Write tests**

Create `e2e/time-tracking.spec.ts`:

```typescript
import { test, expect } from "@playwright/test";
import path from "path";

const technicianAuth = path.join(__dirname, ".auth/technician.json");

test.describe("Time Tracking — Technician", () => {
  test.use({ storageState: technicianAuth });

  test("can clock in to an assigned job", async ({ page }) => {
    // Reseed before this test if needed — or ensure the seed ran
    await page.goto("/time-tracking");

    // Should see the clock-in card
    await expect(page.getByText("Not clocked in")).toBeVisible();
    await expect(page.getByText("Rio Tinto")).toBeVisible();

    // Select job and clock in
    await page.getByRole("combobox").selectOption({ label: /Rio Tinto/i });
    await page.getByRole("button", { name: /Clock In/i }).click();

    // Should now show clocked-in state with live timer
    await expect(page.getByText("Clocked in")).toBeVisible();
    await expect(page.getByText("Rio Tinto")).toBeVisible();
  });

  test("cannot clock in while already clocked in", async ({ page }) => {
    // This test assumes the previous test left us clocked in
    // If run in isolation, clock in first
    await page.goto("/time-tracking");
    // If already clocked in, this verifies the state
    // If not, clock in, then try again
    const notClocked = await page.getByText("Not clocked in").isVisible().catch(() => false);
    if (notClocked) {
      await page.getByRole("combobox").selectOption({ label: /Rio Tinto/i });
      await page.getByRole("button", { name: /Clock In/i }).click();
      await expect(page.getByText("Clocked in")).toBeVisible();
    }

    // The clock-in button should not be present when already clocked in
    await expect(page.getByRole("button", { name: /Clock In/i })).not.toBeVisible();
  });

  test("can clock out", async ({ page }) => {
    await page.goto("/time-tracking");

    // If not clocked in, clock in first
    const notClocked = await page.getByText("Not clocked in").isVisible().catch(() => false);
    if (notClocked) {
      await page.getByRole("combobox").selectOption({ label: /Rio Tinto/i });
      await page.getByRole("button", { name: /Clock In/i }).click();
      await expect(page.getByText("Clocked in")).toBeVisible();
    }

    await page.getByRole("button", { name: /Clock Out/i }).click();
    await expect(page.getByText("Not clocked in")).toBeVisible();
  });
});
```

- [ ] **Step 2: Run E2E tests**

```bash
pnpm seed:test && pnpm e2e --project=chromium
```

Expected: all 3 tests PASS.

- [ ] **Step 3: Commit**

```bash
git add e2e/time-tracking.spec.ts
git commit -m "test: e2e time tracking — clock in, duplicate guard, clock out"
```

---

## Task 6: Variation Capture E2E Tests

**Files:** Create `e2e/variations.spec.ts`

- [ ] **Step 1: Write tests**

Create `e2e/variations.spec.ts`:

```typescript
import { test, expect } from "@playwright/test";
import path from "path";

const technicianAuth = path.join(__dirname, ".auth/technician.json");
const directorAuth = path.join(__dirname, ".auth/director.json");

test.describe("Variations — Technician submission", () => {
  test.use({ storageState: technicianAuth });

  test("can submit a variation with valid input", async ({ page }) => {
    await page.goto("/variations/submit");
    await page.getByRole("combobox").selectOption({ label: /Rio Tinto/i });
    await page.getByPlaceholder(/Describe the extra work/i).fill(
      "Replaced corroded inlet pipe fitting on cooling tower 3"
    );
    await page.getByPlaceholder("0.00").fill("380");
    await page.getByRole("button", { name: /Submit Variation/i }).click();
    await expect(page.getByText("Variation submitted")).toBeVisible();
  });

  test("shows error when description is too short", async ({ page }) => {
    await page.goto("/variations/submit");
    await page.getByRole("combobox").selectOption({ label: /Rio Tinto/i });
    await page.getByPlaceholder(/Describe the extra work/i).fill("Too short");
    await page.getByPlaceholder("0.00").fill("100");
    await page.getByRole("button", { name: /Submit Variation/i }).click();
    await expect(page.getByText(/at least 10 characters/i)).toBeVisible();
  });

  test("shows error when cost is zero", async ({ page }) => {
    await page.goto("/variations/submit");
    await page.getByRole("combobox").selectOption({ label: /Rio Tinto/i });
    await page.getByPlaceholder(/Describe the extra work/i).fill(
      "Replaced corroded inlet pipe fitting"
    );
    await page.getByPlaceholder("0.00").fill("0");
    await page.getByRole("button", { name: /Submit Variation/i }).click();
    await expect(page.getByText(/greater than \$0/i)).toBeVisible();
  });
});

test.describe("Variations — Director approval", () => {
  test.use({ storageState: directorAuth });

  test("director sees pending variations and can approve", async ({ page }) => {
    await page.goto("/variations");
    // Assumes a variation was submitted by the technician test above
    await expect(page.getByText("Test Technician")).toBeVisible({ timeout: 10_000 });
    await page.getByRole("button", { name: /approved/i }).first().click();
    await page.getByRole("button", { name: /Confirm approved/i }).click();
    // Card should disappear from the list
    await expect(page.getByText("No pending variations")).toBeVisible({ timeout: 5_000 });
  });

  test("director cannot reject without a reason", async ({ page }) => {
    // Submit a new variation first via API to ensure there's one to decide on
    // This test can be run after re-seeding or in a full suite run
    await page.goto("/variations");
    const hasVariation = await page.getByText("Test Technician").isVisible().catch(() => false);
    if (!hasVariation) {
      test.skip(true, "No pending variations to test rejection");
    }
    await page.getByRole("button", { name: /rejected/i }).first().click();
    await page.getByRole("button", { name: /Confirm rejected/i }).click();
    await expect(page.getByText(/at least 10 characters/i)).toBeVisible();
  });
});
```

- [ ] **Step 2: Run E2E tests**

```bash
pnpm seed:test && pnpm e2e --project=chromium
```

Expected: all variation tests PASS (some may be skipped if run in isolation — run in full suite order).

- [ ] **Step 3: Commit**

```bash
git add e2e/variations.spec.ts
git commit -m "test: e2e variation submission and director approval flow"
```

---

## Task 7: RBAC E2E Tests

**Files:** Create `e2e/rbac.spec.ts`

- [ ] **Step 1: Write tests**

Create `e2e/rbac.spec.ts`:

```typescript
import { test, expect } from "@playwright/test";
import path from "path";

const technicianAuth = path.join(__dirname, ".auth/technician.json");

test.describe("RBAC — Technician cannot access financial routes", () => {
  test.use({ storageState: technicianAuth });

  test("technician gets 401 from /api/jobs/hours", async ({ request }) => {
    const res = await request.get("/api/jobs/hours");
    expect(res.status()).toBe(401);
  });

  test("technician gets 401 from /api/crew/live", async ({ request }) => {
    const res = await request.get("/api/crew/live");
    expect(res.status()).toBe(401);
  });

  test("technician gets 401 from GET /api/variations", async ({ request }) => {
    const res = await request.get("/api/variations");
    expect(res.status()).toBe(401);
  });
});
```

- [ ] **Step 2: Run RBAC tests**

```bash
pnpm e2e --project=chromium e2e/rbac.spec.ts
```

Expected: all 3 tests PASS.

- [ ] **Step 3: Commit**

```bash
git add e2e/rbac.spec.ts
git commit -m "test: rbac e2e — technician blocked from financial api routes"
```

---

## Task 8: Mobile Device Testing (Manual)

This task is manual — no code to write. Run through this checklist on real devices before go-live.

**Devices to test:**
- iPhone (iOS 16+, Safari) — most common technician device
- Android phone (Chrome) — secondary

- [ ] **PWA Install**
  - iOS Safari: Share → Add to Home Screen → icon appears on home screen
  - Android Chrome: Install prompt appears or use menu → Add to Home Screen
  - Tap the installed icon → app opens in standalone mode (no browser chrome)

- [ ] **Camera on variation form**
  - Navigate to Log Variation → tap photo field → camera opens (not file picker)
  - Take a photo → thumbnail appears before submission

- [ ] **Push notifications**
  - Accept push permission when prompted on first open
  - Submit a variation as technician → director device receives push notification within 60 seconds
  - Director approves → technician device receives push notification

- [ ] **Offline behaviour**
  - Turn on Aeroplane Mode
  - Clock-in attempt shows a clear error (network failure message, not a blank screen)
  - Variation submission attempt shows a clear error

- [ ] **Touch targets**
  - All buttons on the time tracking and variation pages are easy to tap without mis-tapping adjacent elements
  - Form inputs have comfortable tap areas — no need to pinch/zoom

- [ ] **iPhone SE (375px width)**
  - Open Chrome DevTools → responsive mode → 375px
  - Clock-in card: no overflow, job selector visible, button accessible
  - Variation form: all fields visible without horizontal scroll

---

## Task 9: Seed Production Data

Before go-live, seed real jobs and create real user accounts in Clerk production.

- [ ] **Step 1: Set up Clerk Production environment**

In Clerk Dashboard, switch from Development to Production. Create a new application or promote the existing one. Copy production keys.

Update Vercel project environment variables with production keys (not the test keys used during development).

- [ ] **Step 2: Create Clerk accounts for all 7 staff**

In Clerk Dashboard → Users → Add User for each person:

| Name | Role (`public_metadata`) | Email | Phone |
|------|--------------------------|-------|-------|
| Director 1 | `{"role":"director"}` | ... | ... |
| Director 2 | `{"role":"director"}` | ... | ... |
| Service Manager | `{"role":"service_manager"}` | ... | ... |
| Technician 1–7 | `{"role":"technician"}` | ... | ... |

- [ ] **Step 3: Verify webhook synced all users**

```bash
pnpm dlx prisma studio
```

Connect to the production database. Check the `User` table has a row for each person with the correct role.

- [ ] **Step 4: Create initial jobs in the DB**

Use Prisma Studio or a quick seed script to insert the jobs that are currently scheduled in Simpro. At minimum, create the jobs that will be active in the first week.

---

## Task 10: Go-Live Checklist

- [ ] **Vercel environment variables set (production)**
  - `DATABASE_URL` — Neon production pooled URL
  - `DIRECT_URL` — Neon production direct URL
  - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` — production key
  - `CLERK_SECRET_KEY` — production key
  - `CLERK_WEBHOOK_SECRET` — production webhook secret
  - `BLOB_READ_WRITE_TOKEN` — Vercel Blob production token
  - `NEXT_PUBLIC_VAPID_PUBLIC_KEY` — VAPID public key
  - `VAPID_PRIVATE_KEY` — VAPID private key
  - `VAPID_CONTACT_EMAIL` — contact email

- [ ] **Clerk webhook endpoint pointing to production URL**
  - Go to Clerk Dashboard → Webhooks → Update endpoint URL to `https://your-production-url.vercel.app/api/webhooks/clerk`

- [ ] **DNS / custom domain configured in Vercel (if applicable)**

- [ ] **Run `pnpm build` locally — zero errors**

```bash
pnpm build
```

- [ ] **Run full E2E suite against production URL**

```bash
PLAYWRIGHT_BASE_URL=https://your-production-url.vercel.app pnpm e2e
```

- [ ] **Run unit tests**

```bash
pnpm test
```

- [ ] **Monitoring**
  - Set up UptimeRobot to ping `https://your-production-url.vercel.app/api/health` every 5 minutes (NF-07: 99.5% uptime 6am–6pm AEST Mon–Fri)
  - Create `src/app/api/health/route.ts` that returns `{ status: "ok" }`

```typescript
// src/app/api/health/route.ts
import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ status: "ok" });
}
```

- [ ] **Conduct 3-day field trial**
  - Enrol 1–2 technicians with test jobs for 3 days
  - Observe clock-in/out behaviour in real conditions
  - Directors test variation approvals on real submissions
  - Note any UX friction, error messages, or crashes

- [ ] **Fix bugs from field trial**

- [ ] **Full go-live**
  - All 7 technicians onboarded with their Clerk accounts
  - Run short training session (30 min, see docs/training/)
  - Confirm all technicians can install the PWA and receive push notifications

---

## Task 11: Write Training Guides

**Files:** Create `docs/training/technician-guide.md`, `docs/training/director-guide.md`

- [ ] **Step 1: Technician guide**

Create `docs/training/technician-guide.md`:

```markdown
# CT Field Ops — Technician Quick Guide

## Install the App on Your Phone

**iPhone (Safari):**
1. Open Safari and go to [your-app-url]
2. Tap the Share button (box with arrow)
3. Tap "Add to Home Screen"
4. Tap "Add"

**Android (Chrome):**
1. Open Chrome and go to [your-app-url]
2. Tap the three-dot menu
3. Tap "Add to Home Screen"

When you first open the app, tap **Allow** when asked about notifications.

---

## Clocking In

1. Open the app — tap "Time Tracking" in the menu
2. Select your job from the dropdown
3. Tap **Clock In**
4. The timer starts — leave the app open or minimise it

## Clocking Out

1. Open Time Tracking
2. Tap **Clock Out**
3. Done — your hours are recorded

**Important:** Clock in and out every day, even if you're continuing the same job.

---

## Logging a Variation

Use this when you find extra work on site that wasn't in the original scope.

1. Tap "Log Variation" in the menu
2. Select the job
3. Describe what you found (minimum 10 words)
4. Enter the estimated cost in dollars
5. Optionally, take a photo as evidence
6. Tap **Submit Variation**

The director is notified immediately. You'll get a notification when they decide.

---

## Problems?

- **App won't load:** Check your internet signal. Try a 4G connection.
- **Can't see your job:** Contact your service manager — you may not be assigned yet.
- **Something looks wrong:** Screenshot it and send to your manager.
```

- [ ] **Step 2: Director guide**

Create `docs/training/director-guide.md`:

```markdown
# CT Field Ops — Director Quick Guide

## Dashboard

The dashboard shows:
- **Live Crew** — who is currently clocked in and where
- **Hours vs Quoted** — hours logged per job vs the quoted amount

Jobs highlighted in red are more than 10% over their quoted hours.

---

## Approving Variations

When a technician submits a variation, you receive a push notification.

1. Open the app and tap "Variations"
2. Review the description, cost estimate, and photo
3. Tap **Approved**, **Rejected**, or **Queried**
4. If rejecting or querying, enter a reason (required)
5. Tap **Confirm**

The technician is notified of your decision immediately.

**Approved variations** are automatically added to the job's invoice record.

---

## Notes

- Rejected variations require a reason of at least 10 characters.
- Queried variations go back to the technician for more information.
- You can see all approved variations in the Variations tab.
```

- [ ] **Step 3: Commit**

```bash
git add docs/training/ docs/launch-checklist.md e2e/ src/app/api/health/
git commit -m "docs: training guides, launch checklist, health endpoint"
```

---

## Phase 1d Completion Checklist

- [ ] All E2E tests pass on Chromium and Mobile Safari
- [ ] RBAC tests confirm technicians cannot access financial API routes
- [ ] Manual device testing complete on iPhone (Safari) and Android (Chrome)
- [ ] PWA installs correctly and push notifications delivered on real devices
- [ ] Production Vercel environment variables all set and verified
- [ ] Clerk production environment active with all 7 technicians created
- [ ] UptimeRobot monitoring the `/api/health` endpoint
- [ ] 3-day field trial complete with bugs fixed
- [ ] Training sessions run with technicians and directors
- [ ] Full go-live: all roles onboarded and using the platform
