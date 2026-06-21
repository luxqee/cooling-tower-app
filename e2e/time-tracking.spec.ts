import { test, expect } from "@playwright/test";
import path from "path";

const technicianAuth = path.join(__dirname, ".auth/technician.json");

test.describe("Time Tracking — Technician", () => {
  test.use({ storageState: technicianAuth });

  test("page loads and shows time tracking heading", async ({ page }) => {
    await page.goto("/time-tracking");
    await expect(page.getByRole("heading", { name: /Time Tracking/i })).toBeVisible();
  });

  test("can clock in to a job", async ({ page }) => {
    await page.goto("/time-tracking");

    // If already clocked in, clock out first so we start clean
    const clockOutBtn = page.getByRole("button", { name: /Clock Out/i });
    if (await clockOutBtn.isVisible().catch(() => false)) {
      await clockOutBtn.click();
      await expect(page.getByText(/Not clocked in/i)).toBeVisible({ timeout: 8_000 });
    }

    await expect(page.getByText(/Not clocked in/i)).toBeVisible();

    // Select the first available job and clock in
    const select = page.getByRole("combobox");
    const options = await select.locator("option").all();
    const jobOptions = options.filter(async (o) => (await o.getAttribute("value")) !== "");
    if (jobOptions.length === 0) {
      test.skip(true, "No jobs seeded — run pnpm seed first");
    }
    await select.selectOption({ index: 1 }); // index 0 is the placeholder
    await page.getByRole("button", { name: /Clock In/i }).click();

    await expect(page.getByText(/Clocked in/i)).toBeVisible({ timeout: 8_000 });
  });

  test("Clock In button disappears when already clocked in", async ({ page }) => {
    await page.goto("/time-tracking");
    // At this point (after previous test) we should be clocked in
    // The Clock In button should not be visible
    const clockedIn = await page.getByText(/Clocked in/i).isVisible().catch(() => false);
    if (!clockedIn) {
      test.skip(true, "Not clocked in — run in full suite order");
    }
    await expect(page.getByRole("button", { name: /Clock In/i })).not.toBeVisible();
  });

  test("can clock out", async ({ page }) => {
    await page.goto("/time-tracking");

    // Ensure we are clocked in
    const notClocked = await page.getByText(/Not clocked in/i).isVisible().catch(() => false);
    if (notClocked) {
      const select = page.getByRole("combobox");
      await select.selectOption({ index: 1 });
      await page.getByRole("button", { name: /Clock In/i }).click();
      await expect(page.getByText(/Clocked in/i)).toBeVisible({ timeout: 8_000 });
    }

    await page.getByRole("button", { name: /Clock Out/i }).click();
    await expect(page.getByText(/Not clocked in/i)).toBeVisible({ timeout: 8_000 });
  });
});
