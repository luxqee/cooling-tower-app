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
    await db.businessProfile.deleteMany();

    console.log("🏢 Seeding business profile…");
    await db.businessProfile.create({
      data: {
        name:    "CT Field Ops",
        abn:     "12 345 678 901",
        phone:   "1300 123 456",
        email:   "admin@ctfieldops.com.au",
        address: "123 Industrial Drive, Brisbane QLD 4000",
      },
    });
    console.log("  ✓ Business profile");

    console.log("🏗️  Seeding jobs…");
    const jobs = await Promise.all(JOBS.map((data) => db.job.create({ data })));
    jobs.forEach((j) => console.log(`  ✓ ${j.customerName} — ${j.siteName}`));

    console.log("\n📋 Seeding compliance templates…");
    const TEMPLATES = [
      {
        name: "SWMS — Cooling Tower Maintenance",
        type: "SWMS",
        isActive: true,
        sections: [
          {
            id: "s1", title: "Site & Job Details",
            fields: [
              { id: "s1f1", label: "Date",                    type: "date",     required: true  },
              { id: "s1f2", label: "Job Site / Location",     type: "text",     required: true  },
              { id: "s1f3", label: "Site Supervisor",         type: "text",     required: true  },
              { id: "s1f4", label: "Permit to Work Number",   type: "text",     required: false },
              { id: "s1f5", label: "Workers Present",         type: "textarea", required: true  },
            ],
          },
          {
            id: "s2", title: "Hazard Identification",
            fields: [
              { id: "s2f1", label: "Working at Heights Risk Identified",             type: "checkbox", required: false },
              { id: "s2f2", label: "Chemical / Biological Exposure Risk Identified", type: "checkbox", required: false },
              { id: "s2f3", label: "Electrical Hazards Identified",                  type: "checkbox", required: false },
              { id: "s2f4", label: "Confined Space Entry Required",                  type: "checkbox", required: false },
              { id: "s2f5", label: "Additional Hazards Noted",                       type: "textarea", required: false },
            ],
          },
          {
            id: "s3", title: "Control Measures",
            fields: [
              {
                id: "s3f1", label: "PPE Required", type: "checklist", required: true,
                options: ["Hard hat", "Safety harness", "Chemical gloves", "Eye protection", "Respiratory protection", "Non-slip footwear", "Hi-vis vest"],
              },
              { id: "s3f2", label: "Isolation & Lockout Procedures",  type: "textarea", required: true  },
              { id: "s3f3", label: "Emergency Contact / Rescue Plan",  type: "textarea", required: true  },
            ],
          },
          {
            id: "s4", title: "Work Procedure",
            fields: [
              { id: "s4f1", label: "Pre-Start Inspection Notes",                 type: "textarea", required: true  },
              { id: "s4f2", label: "Tower Access Method",                         type: "text",     required: true  },
              { id: "s4f3", label: "Cleaning & Descaling Procedure",              type: "textarea", required: false },
              { id: "s4f4", label: "Disinfection & Water Treatment Process",      type: "textarea", required: false },
            ],
          },
          {
            id: "s5", title: "Sign-Off",
            fields: [
              { id: "s5f1", label: "I have read and understood this SWMS", type: "checkbox",  required: true },
              { id: "s5f2", label: "Worker Name",                           type: "text",      required: true },
              { id: "s5f3", label: "Worker Signature",                      type: "signature", required: true },
              { id: "s5f4", label: "Supervisor Name",                       type: "text",      required: true },
              { id: "s5f5", label: "Supervisor Signature",                  type: "signature", required: true },
              { id: "s5f6", label: "Date Completed",                        type: "date",      required: true },
            ],
          },
        ],
      },
      {
        name: "JSA — Working at Heights",
        type: "JSA",
        isActive: true,
        sections: [
          {
            id: "j1", title: "Task Information",
            fields: [
              { id: "j1f1", label: "Task / Activity Description",          type: "textarea", required: true  },
              { id: "j1f2", label: "Date",                                  type: "date",     required: true  },
              { id: "j1f3", label: "Location",                              type: "text",     required: true  },
              { id: "j1f4", label: "Working at Heights Permit Number",      type: "text",     required: false },
              { id: "j1f5", label: "Estimated Duration",                    type: "text",     required: false },
            ],
          },
          {
            id: "j2", title: "Persons Involved",
            fields: [
              { id: "j2f1", label: "Names & Competencies",                                          type: "textarea", required: true  },
              { id: "j2f2", label: "All persons hold current Working at Heights certification",     type: "checkbox", required: true  },
              { id: "j2f3", label: "Rescue-trained person on-site",                                 type: "checkbox", required: true  },
            ],
          },
          {
            id: "j3", title: "Height Work Controls",
            fields: [
              { id: "j3f1", label: "Fall arrest system inspected and in-date",     type: "checkbox", required: true  },
              { id: "j3f2", label: "Anchor points rated and inspected",             type: "checkbox", required: true  },
              { id: "j3f3", label: "Exclusion zones established below work area",  type: "checkbox", required: true  },
              { id: "j3f4", label: "Rescue plan documented and understood",        type: "checkbox", required: true  },
              { id: "j3f5", label: "Wind / weather conditions assessed as safe",   type: "checkbox", required: false },
              { id: "j3f6", label: "Additional Control Notes",                     type: "textarea", required: false },
            ],
          },
          {
            id: "j4", title: "PPE Checklist",
            fields: [
              {
                id: "j4f1", label: "PPE Confirmed Present & Serviceable", type: "checklist", required: true,
                options: ["Full-body harness", "Shock-absorbing lanyard", "Hard hat", "Non-slip safety boots", "Gloves", "Safety glasses", "Hi-vis vest"],
              },
            ],
          },
          {
            id: "j5", title: "Risk Assessment",
            fields: [
              { id: "j5f1", label: "Initial Risk Rating (Likelihood × Consequence)", type: "text",     required: true  },
              { id: "j5f2", label: "Residual Risk Rating (after controls)",           type: "text",     required: true  },
              { id: "j5f3", label: "Risk Reduction Notes",                            type: "textarea", required: false },
            ],
          },
          {
            id: "j6", title: "Authorisation",
            fields: [
              { id: "j6f1", label: "Supervisor Name",      type: "text",      required: true },
              { id: "j6f2", label: "Supervisor Signature", type: "signature", required: true },
              { id: "j6f3", label: "Date Authorised",      type: "date",      required: true },
            ],
          },
        ],
      },
      {
        name: "WHS Pre-Start Safety Checklist",
        type: "WHS",
        isActive: true,
        sections: [
          {
            id: "w1", title: "Site Information",
            fields: [
              { id: "w1f1", label: "Site / Project Name",   type: "text",  required: true  },
              { id: "w1f2", label: "Date",                   type: "date",  required: true  },
              { id: "w1f3", label: "Weather Conditions",     type: "text",  required: false },
              { id: "w1f4", label: "Site Supervisor",        type: "text",  required: true  },
            ],
          },
          {
            id: "w2", title: "General Site Safety",
            fields: [
              { id: "w2f1", label: "Exclusion zones clearly marked",             type: "checkbox", required: false },
              { id: "w2f2", label: "First aid kit stocked and accessible",        type: "checkbox", required: true  },
              { id: "w2f3", label: "Emergency evacuation plan displayed",         type: "checkbox", required: true  },
              { id: "w2f4", label: "Safety Data Sheets (SDS) available on-site", type: "checkbox", required: false },
              { id: "w2f5", label: "Site induction completed by all workers",     type: "checkbox", required: true  },
            ],
          },
          {
            id: "w3", title: "Equipment Check",
            fields: [
              { id: "w3f1", label: "Primary Equipment in Use",                          type: "text",     required: true  },
              { id: "w3f2", label: "Equipment Defects / Damage Noted",                  type: "textarea", required: false },
              { id: "w3f3", label: "All equipment fit for purpose and in good condition", type: "checkbox", required: true  },
              { id: "w3f4", label: "Equipment inspection tags current",                  type: "checkbox", required: false },
            ],
          },
          {
            id: "w4", title: "Cooling Tower Specific",
            fields: [
              { id: "w4f1", label: "Water treatment records current and on-site",        type: "checkbox", required: true  },
              { id: "w4f2", label: "Legionella risk assessment current (≤ 12 months)",   type: "checkbox", required: true  },
              { id: "w4f3", label: "Date of Last Service / Disinfection",                type: "date",     required: false },
              { id: "w4f4", label: "Water temperature within normal operating range",    type: "checkbox", required: false },
              { id: "w4f5", label: "Chemical dosing levels verified",                    type: "checkbox", required: false },
              { id: "w4f6", label: "Drift eliminators in good condition",                type: "checkbox", required: false },
            ],
          },
          {
            id: "w5", title: "Pre-Start Briefing",
            fields: [
              { id: "w5f1", label: "Tool-box / pre-start briefing conducted",          type: "checkbox", required: true  },
              { id: "w5f2", label: "All workers acknowledged hazards and controls",     type: "checkbox", required: true  },
              {
                id: "w5f3", label: "Topics Covered in Briefing", type: "checklist", required: false,
                options: ["Hazard identification", "Emergency procedures", "PPE requirements", "Manual handling", "Chemical handling", "Working at heights", "Isolation procedures"],
              },
              { id: "w5f4", label: "Additional Notes from Briefing",                    type: "textarea", required: false },
            ],
          },
          {
            id: "w6", title: "Sign-Off",
            fields: [
              { id: "w6f1", label: "Completed By", type: "text",      required: true },
              { id: "w6f2", label: "Signature",     type: "signature", required: true },
              { id: "w6f3", label: "Date",           type: "date",      required: true },
            ],
          },
        ],
      },
    ];
    for (const tmpl of TEMPLATES) {
      const t = await db.complianceTemplate.create({ data: { ...tmpl, sections: tmpl.sections as any } });
      console.log(`  ✓ ${t.type} — ${t.name}`);
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
