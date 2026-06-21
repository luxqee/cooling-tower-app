/**
 * Seed script — run with: pnpm seed
 * Clears all data then inserts example jobs, users, and assignments.
 *
 * To add your own Clerk IDs set these env vars:
 *   SEED_DIRECTOR_CLERK_ID=user_xxx
 *   SEED_TECHNICIAN_CLERK_ID=user_yyy
 *
 * Without those vars, jobs are still seeded but no users/assignments are created
 * (users are created automatically via JIT provisioning on first login).
 */

import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

const JOBS = [
  {
    customerName: "Rio Tinto",
    siteName: "Weipa Site A",
    siteAddress: "Weipa QLD 4874",
    status: "active" as const,
    quotedHours: 8,
  },
  {
    customerName: "Coca-Cola Europacific",
    siteName: "Milton Bottling Plant",
    siteAddress: "66 River Rd, Milton QLD 4064",
    status: "active" as const,
    quotedHours: 12,
  },
  {
    customerName: "Queensland Health",
    siteName: "Royal Brisbane Hospital",
    siteAddress: "Butterfield St, Herston QLD 4006",
    status: "scheduled" as const,
    quotedHours: 6,
  },
  {
    customerName: "BHP",
    siteName: "Mt Isa Copper Smelter",
    siteAddress: "Mt Isa QLD 4825",
    status: "scheduled" as const,
    quotedHours: 16,
  },
];

async function main() {
  console.log("🌱 Clearing existing data…");

  // Order matters — foreign key constraints
  await db.authEvent.deleteMany();
  await db.pushSubscription.deleteMany();
  await db.timeEntry.deleteMany();
  await db.variation.deleteMany();
  await db.invoice.deleteMany();
  await db.assignment.deleteMany();
  await db.job.deleteMany();

  // Only clear users if we're about to re-create them (avoid breaking JIT users)
  const directorClerkId = process.env.SEED_DIRECTOR_CLERK_ID;
  const technicianClerkId = process.env.SEED_TECHNICIAN_CLERK_ID;

  if (directorClerkId || technicianClerkId) {
    console.log("Clearing users (Clerk IDs provided)…");
    await db.user.deleteMany();
  }

  console.log("🏗️  Seeding jobs…");
  const jobs = await Promise.all(JOBS.map((data) => db.job.create({ data })));
  jobs.forEach((j) => console.log(`  ✓ ${j.customerName} — ${j.siteName} (${j.id})`));

  // If Clerk IDs supplied, also seed users and assignments
  if (directorClerkId) {
    const director = await db.user.upsert({
      where: { clerkId: directorClerkId },
      update: { role: "director", isActive: true },
      create: {
        clerkId: directorClerkId,
        name: "Test Director",
        email: process.env.TEST_DIRECTOR_EMAIL ?? "director@dev.example.com",
        phone: "0400000001",
        role: "director",
        isActive: true,
      },
    });
    console.log(`  ✓ Director: ${director.name} (${director.id})`);
  }

  if (technicianClerkId) {
    const tech = await db.user.upsert({
      where: { clerkId: technicianClerkId },
      update: { role: "technician", isActive: true },
      create: {
        clerkId: technicianClerkId,
        name: "Test Technician",
        email: process.env.TEST_TECHNICIAN_EMAIL ?? "technician@dev.example.com",
        phone: "0400000002",
        role: "technician",
        isActive: true,
      },
    });
    console.log(`  ✓ Technician: ${tech.name} (${tech.id})`);

    // Assign the technician to the first two active jobs today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const activeJobs = jobs.filter((j) => j.status === "active");
    for (const job of activeJobs.slice(0, 2)) {
      await db.assignment.create({
        data: { userId: tech.id, jobId: job.id, assignedDate: today },
      });
      console.log(`  ✓ Assigned ${tech.name} → ${job.customerName} ${job.siteName}`);
    }
  }

  console.log("\n✅ Seed complete!");
  console.log("\nNext steps:");
  if (!directorClerkId && !technicianClerkId) {
    console.log("  • Sign in to the app — your user will be created automatically (JIT)");
    console.log("  • Use Prisma Studio (pnpm studio) or the Team page to set your role");
    console.log("  • To also seed users/assignments, set SEED_DIRECTOR_CLERK_ID and SEED_TECHNICIAN_CLERK_ID");
  }
  console.log("  • Go to /dev/login to see dev credentials for each role");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => db.$disconnect());
