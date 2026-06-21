/**
 * Seed script — run with: pnpm seed
 * Clears all data then inserts example jobs, users, and assignments.
 *
 * To also seed user rows and assignments, add these to .env.local:
 *   SEED_DIRECTOR_CLERK_ID=user_xxx
 *   SEED_TECHNICIAN_CLERK_ID=user_yyy
 *
 * Without those vars, jobs are still seeded but users are created automatically
 * via JIT provisioning on first login.
 */

import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

// Load .env.local BEFORE creating any DB clients
loadEnvConfig(process.cwd());

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
  // Create DB client INSIDE main() so DATABASE_URL is already set from loadEnvConfig
  const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
  const db = new PrismaClient({ adapter });

  try {
    console.log("🌱 Clearing existing data…");

    // Order matters — foreign key constraints
    await db.authEvent.deleteMany();
    await db.pushSubscription.deleteMany();
    await db.timeEntry.deleteMany();
    await db.variation.deleteMany();
    await db.invoice.deleteMany();
    await db.assignment.deleteMany();
    await db.job.deleteMany();

    const directorClerkId = process.env.SEED_DIRECTOR_CLERK_ID;
    const technicianClerkId = process.env.SEED_TECHNICIAN_CLERK_ID;

    if (directorClerkId || technicianClerkId) {
      console.log("  Clearing users (Clerk IDs provided)…");
      await db.user.deleteMany();
    }

    console.log("🏗️  Seeding jobs…");
    const jobs = await Promise.all(JOBS.map((data) => db.job.create({ data })));
    jobs.forEach((j) => console.log(`  ✓ ${j.customerName} — ${j.siteName}  (${j.id})`));

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
      console.log(`  ✓ Director: ${director.name}  (${director.id})`);
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
      console.log(`  ✓ Technician: ${tech.name}  (${tech.id})`);

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const activeJobs = jobs.filter((j) => j.status === "active");
      for (const job of activeJobs.slice(0, 2)) {
        await db.assignment.create({
          data: { userId: tech.id, jobId: job.id, assignedDate: today },
        });
        console.log(`  ✓ Assigned ${tech.name} → ${job.customerName} — ${job.siteName}`);
      }
    }

    console.log("\n✅ Seed complete!");
    if (!directorClerkId && !technicianClerkId) {
      console.log("\nNext steps:");
      console.log("  • Sign in to the app — your account is created automatically on first login");
      console.log("  • Visit /dev/login to see all users and switch between roles");
      console.log("  • To seed user rows too, add SEED_DIRECTOR_CLERK_ID / SEED_TECHNICIAN_CLERK_ID to .env.local");
    }
  } finally {
    await db.$disconnect();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
