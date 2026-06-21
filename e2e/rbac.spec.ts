import { test, expect } from "@playwright/test";
import path from "path";

const technicianAuth = path.join(__dirname, ".auth/technician.json");
const directorAuth = path.join(__dirname, ".auth/director.json");

// ─── Technician: blocked from management API routes ───────────────────────────

test.describe("RBAC — Technician blocked from management routes", () => {
  test.use({ storageState: technicianAuth });

  test("GET /api/jobs/hours returns 401", async ({ request }) => {
    const res = await request.get("/api/jobs/hours");
    expect(res.status()).toBe(401);
  });

  test("GET /api/crew/live returns 401", async ({ request }) => {
    const res = await request.get("/api/crew/live");
    expect(res.status()).toBe(401);
  });

  test("GET /api/variations (director list) returns 401", async ({ request }) => {
    const res = await request.get("/api/variations");
    expect(res.status()).toBe(401);
  });

  test("PATCH /api/variations/:id/decision returns 401", async ({ request }) => {
    const res = await request.patch("/api/variations/00000000-0000-0000-0000-000000000001/decision", {
      data: { decision: "approved" },
    });
    expect(res.status()).toBe(401);
  });

  test("technician navigating to /dashboard is redirected", async ({ page }) => {
    await page.goto("/dashboard");
    // Should redirect — either sign-in or time-tracking, not stay on dashboard
    await expect(page).not.toHaveURL(/\/dashboard/);
  });
});

// ─── Director: blocked from technician-only routes ───────────────────────────

test.describe("RBAC — Director blocked from technician-only routes", () => {
  test.use({ storageState: directorAuth });

  test("POST /api/upload/photo returns 401 for director", async ({ request }) => {
    const formData = new FormData();
    formData.append("file", new Blob(["test"], { type: "image/jpeg" }), "test.jpg");
    const res = await request.post("/api/upload/photo", {
      multipart: {
        file: {
          name: "test.jpg",
          mimeType: "image/jpeg",
          buffer: Buffer.from("fake image"),
        },
      },
    });
    expect(res.status()).toBe(401);
  });

  test("POST /api/variations returns 401 for director", async ({ request }) => {
    const res = await request.post("/api/variations", {
      data: {
        jobId: "00000000-0000-0000-0000-000000000001",
        description: "Test variation description for RBAC check",
        costEstimate: 100,
        photoUrl: null,
      },
    });
    expect(res.status()).toBe(401);
  });
});

// ─── Unauthenticated: all protected routes return 401 ──────────────────────

test.describe("RBAC — Unauthenticated requests blocked", () => {
  test("GET /api/jobs returns 401 without session", async ({ request }) => {
    const res = await request.get("/api/jobs");
    expect(res.status()).toBe(401);
  });

  test("GET /api/crew/live returns 401 without session", async ({ request }) => {
    const res = await request.get("/api/crew/live");
    expect(res.status()).toBe(401);
  });
});
