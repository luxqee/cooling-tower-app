/**
 * Seed script — run with: pnpm seed
 *
 * Creates 4 example jobs and one Clerk test account per role.
 * Requires CLERK_SECRET_KEY in .env.local to create Clerk accounts.
 *
 * Test credentials (all roles, shared password):
 *   test.technician@ctfieldops.dev
 *   test.director@ctfieldops.dev
 *   test.service_manager@ctfieldops.dev
 *   test.admin@ctfieldops.dev
 *   test.sales_engineer@ctfieldops.dev
 *   test.draftsman@ctfieldops.dev
 *   Password: TestLogin123!
 */

import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

// Load .env.local BEFORE creating any DB clients
loadEnvConfig(process.cwd());

const TEST_PASSWORD = "TestLogin123!";

const TEST_USERS = [
  { role: "technician",      firstName: "Test", lastName: "Technician",    email: "test.technician@ctfieldops.dev" },
  { role: "director",        firstName: "Test", lastName: "Director",       email: "test.director@ctfieldops.dev" },
  { role: "service_manager", firstName: "Test", lastName: "Service Mgr",    email: "test.service_manager@ctfieldops.dev" },
  { role: "admin",           firstName: "Test", lastName: "Admin",          email: "test.admin@ctfieldops.dev" },
  { role: "sales_engineer",  firstName: "Test", lastName: "Sales Engineer", email: "test.sales_engineer@ctfieldops.dev" },
  { role: "draftsman",       firstName: "Test", lastName: "Draftsman",      email: "test.draftsman@ctfieldops.dev" },
] as const;

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

    const clerkKey = process.env.CLERK_SECRET_KEY;
    if (!clerkKey) {
      console.log("\n⚠  CLERK_SECRET_KEY not set — skipping Clerk user creation.");
      console.log("   Add it to .env.local and re-run to create test accounts.");
      return;
    }

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
    console.log("Test credentials (all roles, same password):");
    console.log("─".repeat(55));
    for (const u of createdUsers) {
      console.log(`  ${u.role.padEnd(16)} ${u.email}`);
    }
    console.log(`  ${"Password:".padEnd(16)} ${TEST_PASSWORD}`);
    console.log("─".repeat(55));
    console.log("\nSign in at /sign-in or visit /dev for a role-switcher guide.");
  } finally {
    await db.$disconnect();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
