/**
 * Seed script — run with: pnpm seed
 *
 * Creates 4 example jobs and one Clerk test account per role.
 * Requires CLERK_SECRET_KEY and SEED_EMAIL_BASE in .env.local.
 *
 * SEED_EMAIL_BASE must be a real email you own, e.g. lukeherod7@gmail.com
 * Gmail and most providers support "+" aliases — the seed creates:
 *   lukeherod7+technician@gmail.com  → delivered to lukeherod7@gmail.com
 *   lukeherod7+director@gmail.com    → delivered to lukeherod7@gmail.com
 *   etc.
 *
 * On first sign-in for each account Clerk sends a verification code to your
 * real inbox. Enter it once and you're in. After that: email + TestLogin123!
 */

import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

// Load .env.local BEFORE creating any DB clients
loadEnvConfig(process.cwd());

const TEST_PASSWORD = "TestLogin123!";

// Build test-user email list from SEED_EMAIL_BASE, e.g. lukeherod7@gmail.com
// Produces lukeherod7+technician@gmail.com, lukeherod7+director@gmail.com, etc.
function buildTestUsers(emailBase: string) {
  const [local, domain] = emailBase.split("@");
  const make = (tag: string) => `${local}+${tag}@${domain}`;
  return [
    { role: "technician",      firstName: "Test", lastName: "Technician",    email: make("technician") },
    { role: "director",        firstName: "Test", lastName: "Director",       email: make("director") },
    { role: "service_manager", firstName: "Test", lastName: "Service Mgr",    email: make("service_manager") },
    { role: "admin",           firstName: "Test", lastName: "Admin",          email: make("admin") },
    { role: "sales_engineer",  firstName: "Test", lastName: "Sales Engineer", email: make("sales_engineer") },
    { role: "draftsman",       firstName: "Test", lastName: "Draftsman",      email: make("draftsman") },
  ] as const;
}

const JOBS = [
  { customerName: "Rio Tinto",           siteName: "Weipa Site A",          siteAddress: "Weipa QLD 4874",                        status: "active" as const,    quotedHours: 8 },
  { customerName: "Coca-Cola Europacific", siteName: "Milton Bottling Plant", siteAddress: "66 River Rd, Milton QLD 4064",          status: "active" as const,    quotedHours: 12 },
  { customerName: "Queensland Health",   siteName: "Royal Brisbane Hospital", siteAddress: "Butterfield St, Herston QLD 4006",      status: "scheduled" as const, quotedHours: 6 },
  { customerName: "BHP",                 siteName: "Mt Isa Copper Smelter",  siteAddress: "Mt Isa QLD 4825",                       status: "scheduled" as const, quotedHours: 16 },
];

async function getOrCreateClerkUser(
  entry: (typeof TEST_USERS)[number],
  clerkKey: string,
): Promise<string | null> {
  // Attempt to create
  const createRes = await fetch("https://api.clerk.com/v1/users", {
    method: "POST",
    headers: { Authorization: `Bearer ${clerkKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      email_address: [entry.email],
      password: TEST_PASSWORD,
      first_name: entry.firstName,
      last_name: entry.lastName,
      public_metadata: { role: entry.role },
      skip_password_checks: true,
      skip_legal_checks: true,
    }),
  });

  if (createRes.ok) {
    const data = await createRes.json() as { id: string };
    return data.id;
  }

  const errBody = await createRes.json().catch(() => ({})) as { errors?: Array<{ code: string }> };
  const code = errBody?.errors?.[0]?.code ?? "";

  if (code === "form_identifier_exists" || code === "duplicate_record" || createRes.status === 422) {
    // User already exists — look them up by email
    const listRes = await fetch(
      `https://api.clerk.com/v1/users?email_address=${encodeURIComponent(entry.email)}&limit=1`,
      { headers: { Authorization: `Bearer ${clerkKey}` } },
    );
    if (!listRes.ok) return null;
    const list = await listRes.json() as Array<{ id: string }>;
    const existing = list[0];
    if (!existing) return null;

    // Make sure public_metadata has the correct role
    await fetch(`https://api.clerk.com/v1/users/${existing.id}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${clerkKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ public_metadata: { role: entry.role } }),
    });

    return existing.id;
  }

  console.warn(`  ⚠ Could not create Clerk user ${entry.email}: status ${createRes.status} code ${code}`);
  return null;
}

async function main() {
  const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
  const db = new PrismaClient({ adapter });

  try {
    const clerkKey = process.env.CLERK_SECRET_KEY;
    if (!clerkKey) {
      console.error("❌  CLERK_SECRET_KEY not set in .env.local — cannot create test accounts.");
      process.exit(1);
    }

    const emailBase = process.env.SEED_EMAIL_BASE;
    if (!emailBase || !emailBase.includes("@")) {
      console.error("❌  SEED_EMAIL_BASE not set in .env.local.");
      console.error("   Add your real email, e.g.:  SEED_EMAIL_BASE=lukeherod7@gmail.com");
      console.error("   The seed creates Gmail aliases like lukeherod7+technician@gmail.com");
      console.error("   Verification codes are delivered to your real inbox — enter once, done.");
      process.exit(1);
    }

    const TEST_USERS = buildTestUsers(emailBase);

    console.log("🌱 Clearing existing data…");
    await db.authEvent.deleteMany();
    await db.pushSubscription.deleteMany();
    await db.complianceDocument.deleteMany();
    await db.complianceTemplate.deleteMany();
    await db.timeEntry.deleteMany();
    await db.variation.deleteMany();
    await db.invoice.deleteMany();
    await db.assignment.deleteMany();
    await db.job.deleteMany();
    await db.user.deleteMany();

    console.log("🏗️  Seeding jobs…");
    const jobs = await Promise.all(JOBS.map((data) => db.job.create({ data })));
    jobs.forEach((j) => console.log(`  ✓ ${j.customerName} — ${j.siteName}`));

    console.log("\n👤 Creating test users in Clerk + DB…");
    const createdUsers: Array<{ role: string; email: string; clerkId: string }> = [];

    for (const entry of TEST_USERS) {
      const clerkId = await getOrCreateClerkUser(entry, clerkKey);
      if (!clerkId) {
        console.log(`  ✗ ${entry.role.padEnd(16)} ${entry.email} — failed`);
        continue;
      }

      const fullName = `${entry.firstName} ${entry.lastName}`;
      await db.user.upsert({
        where: { clerkId },
        update: { role: entry.role, name: fullName, email: entry.email, isActive: true },
        create: { clerkId, name: fullName, email: entry.email, role: entry.role, phone: "", isActive: true },
      });

      createdUsers.push({ role: entry.role, email: entry.email, clerkId });
      console.log(`  ✓ ${entry.role.padEnd(16)} ${entry.email}`);
    }

    // Assign the technician to the active jobs
    const tech = createdUsers.find((u) => u.role === "technician");
    if (tech) {
      const dbTech = await db.user.findUnique({ where: { clerkId: tech.clerkId } });
      const activeJobs = jobs.filter((j) => j.status === "active");
      if (dbTech) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        for (const job of activeJobs) {
          await db.assignment.create({ data: { userId: dbTech.id, jobId: job.id, assignedDate: today } });
          console.log(`  ✓ Assigned technician → ${job.customerName} — ${job.siteName}`);
        }
      }
    }

    console.log("\n✅ Seed complete!\n");
    console.log("Test credentials — sign in at /sign-in");
    console.log("─".repeat(60));
    for (const u of createdUsers) {
      console.log(`  ${u.role.padEnd(16)} ${u.email}`);
    }
    console.log(`  ${"Password:".padEnd(16)} ${TEST_PASSWORD}`);
    console.log("─".repeat(60));
    console.log("\nFirst sign-in for each account: Clerk sends a code to your inbox.");
    console.log("Enter it once — after that it's just email + password.");
  } finally {
    await db.$disconnect();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
