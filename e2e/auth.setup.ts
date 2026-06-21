import { test as setup, expect } from "@playwright/test";
import path from "path";

const technicianFile = path.join(__dirname, ".auth/technician.json");
const directorFile = path.join(__dirname, ".auth/director.json");

async function signIn(
  page: import("@playwright/test").Page,
  email: string,
  password: string
) {
  await page.goto("/sign-in");
  // Clerk multi-step: email first
  await page.getByLabel(/email address/i).fill(email);
  await page.getByRole("button", { name: /continue/i }).click();
  // Then password
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole("button", { name: /continue|sign in/i }).click();
}

setup("authenticate as technician", async ({ page }) => {
  await signIn(
    page,
    process.env.TEST_TECHNICIAN_EMAIL!,
    process.env.TEST_TECHNICIAN_PASSWORD!
  );
  // Technicians redirect to /time-tracking
  await page.waitForURL("**/time-tracking", { timeout: 15_000 });
  await expect(page.getByText(/Time Tracking/i)).toBeVisible();
  await page.context().storageState({ path: technicianFile });
});

setup("authenticate as director", async ({ page }) => {
  await signIn(
    page,
    process.env.TEST_DIRECTOR_EMAIL!,
    process.env.TEST_DIRECTOR_PASSWORD!
  );
  // Directors redirect to /dashboard
  await page.waitForURL("**/dashboard", { timeout: 15_000 });
  await expect(page.getByText(/Dashboard/i)).toBeVisible();
  await page.context().storageState({ path: directorFile });
});
