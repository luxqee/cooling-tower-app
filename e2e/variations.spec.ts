import { test, expect } from "@playwright/test";
import path from "path";

const technicianAuth = path.join(__dirname, ".auth/technician.json");
const directorAuth = path.join(__dirname, ".auth/director.json");

test.describe("Variations — Technician submission", () => {
  test.use({ storageState: technicianAuth });

  test("page loads", async ({ page }) => {
    await page.goto("/variations/submit");
    await expect(page.getByRole("heading", { name: /Log a Variation/i })).toBeVisible();
  });

  test("shows error when description is empty", async ({ page }) => {
    await page.goto("/variations/submit");
    // Select a job if available
    const select = page.getByRole("combobox");
    const optionCount = await select.locator("option").count();
    if (optionCount > 1) await select.selectOption({ index: 1 });

    // Leave description empty, fill cost, submit
    await page.getByPlaceholder("0.00").fill("200");
    await page.getByRole("button", { name: /Submit Variation/i }).click();

    await expect(page.getByText(/Please enter a description/i)).toBeVisible();
  });

  test("shows error when cost is zero or empty", async ({ page }) => {
    await page.goto("/variations/submit");
    const select = page.getByRole("combobox");
    const optionCount = await select.locator("option").count();
    if (optionCount > 1) await select.selectOption({ index: 1 });

    await page.getByPlaceholder(/Describe the extra work/i).fill("Replaced faulty float valve assembly on cooling tower unit");
    await page.getByPlaceholder("0.00").fill("0");
    await page.getByRole("button", { name: /Submit Variation/i }).click();

    await expect(page.getByText(/greater than \$0/i)).toBeVisible();
  });

  test("can submit a variation with valid input", async ({ page }) => {
    await page.goto("/variations/submit");

    const select = page.getByRole("combobox");
    const optionCount = await select.locator("option").count();
    if (optionCount <= 1) {
      test.skip(true, "No jobs in DB — run pnpm seed first");
    }
    await select.selectOption({ index: 1 });

    await page.getByPlaceholder(/Describe the extra work/i).fill(
      "Replaced corroded inlet pipe fitting on cooling tower 3 — unexpected rusting on internal threads"
    );
    await page.getByPlaceholder("0.00").fill("380");
    await page.getByRole("button", { name: /Submit Variation/i }).click();

    await expect(page.getByText(/Variation submitted/i)).toBeVisible({ timeout: 15_000 });
  });
});

test.describe("Variations — Director approval flow", () => {
  test.use({ storageState: directorAuth });

  test("director sees the Variations page", async ({ page }) => {
    await page.goto("/variations");
    await expect(page.getByRole("heading", { name: /Variations/i })).toBeVisible();
  });

  test("director can approve a pending variation", async ({ page }) => {
    await page.goto("/variations");

    const hasVariation = await page
      .getByRole("button", { name: /^approved$/i })
      .first()
      .isVisible({ timeout: 5_000 })
      .catch(() => false);

    if (!hasVariation) {
      test.skip(true, "No pending variations — submit one as technician first");
    }

    await page.getByRole("button", { name: /^approved$/i }).first().click();
    await page.getByRole("button", { name: /Confirm approved/i }).click();

    // Card should disappear after decision
    await expect(
      page.getByRole("button", { name: /Confirm approved/i })
    ).not.toBeVisible({ timeout: 8_000 });
  });

  test("director cannot reject without a reason", async ({ page }) => {
    await page.goto("/variations");

    const hasVariation = await page
      .getByRole("button", { name: /^rejected$/i })
      .first()
      .isVisible({ timeout: 5_000 })
      .catch(() => false);

    if (!hasVariation) {
      test.skip(true, "No pending variations — submit one as technician first");
    }

    await page.getByRole("button", { name: /^rejected$/i }).first().click();
    // Try to confirm without entering a reason
    await page.getByRole("button", { name: /Confirm rejected/i }).click();
    await expect(page.getByText(/at least 10 characters/i)).toBeVisible();
  });

  test("director can reject with a reason", async ({ page }) => {
    await page.goto("/variations");

    const hasVariation = await page
      .getByRole("button", { name: /^rejected$/i })
      .first()
      .isVisible({ timeout: 5_000 })
      .catch(() => false);

    if (!hasVariation) {
      test.skip(true, "No pending variations — submit one as technician first");
    }

    await page.getByRole("button", { name: /^rejected$/i }).first().click();
    await page.getByPlaceholder(/Reason for rejection/i).fill(
      "The scope of work was already included in the original quote."
    );
    await page.getByRole("button", { name: /Confirm rejected/i }).click();

    await expect(
      page.getByRole("button", { name: /Confirm rejected/i })
    ).not.toBeVisible({ timeout: 8_000 });
  });
});
