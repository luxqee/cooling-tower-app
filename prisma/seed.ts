import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
const db = new PrismaClient({ adapter });

const d = (iso: string) => new Date(iso);

const SEED_JOB_IDS = [
  "seed-job-riotinto",
  "seed-job-bhp",
  "seed-job-stanwell",
  "seed-job-glencore",
  "seed-job-incitec",
  "seed-job-qal",
];

const SEED_USER_IDS = [
  "seed-user-jake",
  "seed-user-sarah",
  "seed-user-mike",
  "seed-user-tom",
];

async function main() {
  console.log("🧹 Cleaning up old data...");

  // Remove all data for jobs that are not part of the seed (test/dev leftovers).
  // Must delete child records first because there are no cascade deletes in the schema.
  await db.complianceDocument.deleteMany({ where: { jobId: { notIn: SEED_JOB_IDS } } });
  await db.timeEntry.deleteMany({ where: { jobId: { notIn: SEED_JOB_IDS } } });
  await db.variation.deleteMany({ where: { jobId: { notIn: SEED_JOB_IDS } } });
  await db.assignment.deleteMany({ where: { jobId: { notIn: SEED_JOB_IDS } } });
  await db.invoice.deleteMany({ where: { jobId: { notIn: SEED_JOB_IDS } } });
  await db.job.deleteMany({ where: { id: { notIn: SEED_JOB_IDS } } });

  // Remove test/placeholder user accounts — identified by having a clerkId that
  // contains "seed" or "placeholder" (i.e. not a real Clerk ID like user_2xxx).
  // Real accounts (e.g. lukeherod7@gmail.com) are left untouched.
  await db.user.deleteMany({
    where: {
      id: { notIn: SEED_USER_IDS },
      OR: [
        { clerkId: { contains: "seed" } },
        { clerkId: { contains: "placeholder" } },
        { clerkId: { contains: "test" } },
      ],
    },
  });

  console.log("  ✓ Old jobs, test users, and related records removed");

  // ─── Business profile ─────────────────────────────────────────────────────
  console.log("\n🌱 Seeding demo data...");

  await db.businessProfile.upsert({
    where: { id: "seed-business-profile" },
    update: {
      name: "CT Field Ops Pty Ltd",
      abn: "12 345 678 901",
      phone: "(07) 3123 4567",
      email: "admin@ctfieldops.com.au",
      address: "Level 3, 123 Eagle St, Brisbane QLD 4000",
      hourlyRate: 145,
      paymentTerms: "Payment due 14 days from invoice date",
    },
    create: {
      id: "seed-business-profile",
      name: "CT Field Ops Pty Ltd",
      abn: "12 345 678 901",
      phone: "(07) 3123 4567",
      email: "admin@ctfieldops.com.au",
      address: "Level 3, 123 Eagle St, Brisbane QLD 4000",
      hourlyRate: 145,
      paymentTerms: "Payment due 14 days from invoice date",
    },
  });
  console.log("  ✓ Business profile");

  // ─── Demo users ───────────────────────────────────────────────────────────
  // Emails use Gmail + aliases so you can sign in as each persona using your
  // own Gmail account. Gmail delivers all + aliases to your main inbox.
  // Sign in with email/password (not Google OAuth) for each alias.
  //
  // When you first sign in with e.g. lukeherod7+jake@gmail.com, Clerk creates
  // a new account and fires user.created. The webhook finds the user record by
  // email and links the real Clerk ID automatically.
  //
  // The clerkId below is a placeholder — it gets replaced by the real Clerk ID
  // on first login and is never used for authentication.

  const users = [
    {
      id: "seed-user-jake",
      clerkId: "placeholder_jake_morrison",
      name: "Jake Morrison",
      email: "lukeherod7+jake@gmail.com",
      phone: "0412 345 678",
      role: "technician" as const,
    },
    {
      id: "seed-user-sarah",
      clerkId: "placeholder_sarah_chen",
      name: "Sarah Chen",
      email: "lukeherod7+sarah@gmail.com",
      phone: "0423 456 789",
      role: "technician" as const,
    },
    {
      id: "seed-user-mike",
      clerkId: "placeholder_mike_davis",
      name: "Mike Davis",
      email: "lukeherod7+mike@gmail.com",
      phone: "0434 567 890",
      role: "technician" as const,
    },
    {
      id: "seed-user-tom",
      clerkId: "placeholder_tom_wilson",
      name: "Tom Wilson",
      email: "lukeherod7+tom@gmail.com",
      phone: "0445 678 901",
      role: "service_manager" as const,
    },
  ];

  for (const u of users) {
    // If a real Clerk user already signed in with this + alias email, their
    // record will have a different id. Merge rather than duplicate.
    const byEmail = await db.user.findUnique({ where: { email: u.email } });
    if (byEmail && byEmail.id !== u.id) {
      // Already linked to a real Clerk account — update name/role, leave IDs alone.
      await db.user.update({
        where: { id: byEmail.id },
        data: { name: u.name, role: u.role, phone: u.phone },
      });
      console.log(`    ↻ Merged into existing account: ${u.email}`);
    } else {
      await db.user.upsert({
        where: { id: u.id },
        update: { name: u.name, email: u.email, role: u.role, phone: u.phone },
        create: u,
      });
    }
  }
  console.log("  ✓ Demo users (Jake, Sarah, Mike, Tom)");

  // ─── Jobs ─────────────────────────────────────────────────────────────────
  const jobs = [
    {
      id: "seed-job-riotinto",
      customerName: "Rio Tinto",
      siteName: "Weipa Processing Plant",
      siteAddress: "1 Bauxite Rd, Weipa QLD 4874",
      status: "complete" as const,
      jobType: "Annual Service",
      quotedHours: 32,
      quotedCost: 7000,
    },
    {
      id: "seed-job-bhp",
      customerName: "BHP",
      siteName: "Hay Point Coal Terminal",
      siteAddress: "Port Road, Hay Point QLD 4740",
      status: "complete" as const,
      jobType: "Quarterly Inspection",
      quotedHours: 16,
      quotedCost: 3500,
    },
    {
      id: "seed-job-stanwell",
      customerName: "Stanwell Corporation",
      siteName: "Stanwell Power Station",
      siteAddress: "Stanwell Rd, Stanwell QLD 4702",
      status: "complete" as const,
      jobType: "Emergency Repair",
      quotedHours: 8,
      quotedCost: 1200,
    },
    {
      id: "seed-job-glencore",
      customerName: "Glencore",
      siteName: "Mt Isa Copper Operations",
      siteAddress: "22 Marian St, Mount Isa QLD 4825",
      status: "active" as const,
      jobType: "Annual Service",
      quotedHours: 40,
      quotedCost: 8500,
    },
    {
      id: "seed-job-incitec",
      customerName: "Incitec Pivot",
      siteName: "Gibson Island Fertiliser Plant",
      siteAddress: "Gibson Island, Murarrie QLD 4172",
      status: "scheduled" as const,
      jobType: "Quarterly Inspection",
      quotedHours: 12,
      quotedCost: 2800,
    },
    {
      id: "seed-job-qal",
      customerName: "Queensland Alumina Ltd",
      siteName: "Gladstone Refinery",
      siteAddress: "1 Parsons Rd, Gladstone QLD 4680",
      status: "scheduled" as const,
      jobType: "Fill Pack Replacement",
      quotedHours: 24,
      quotedCost: 5200,
    },
  ];

  for (const j of jobs) {
    await db.job.upsert({ where: { id: j.id }, update: j, create: j });
  }
  console.log("  ✓ Jobs (6 jobs: 3 complete, 1 active, 2 scheduled)");

  // Resolve the actual user IDs to use in assignments / time entries / variations.
  // After a real login the record may live under a different ID (the real Clerk user's id).
  async function resolveUserId(seedId: string, email: string): Promise<string> {
    const byEmail = await db.user.findUnique({ where: { email } });
    return byEmail?.id ?? seedId;
  }

  const jakeId  = await resolveUserId("seed-user-jake",  "lukeherod7+jake@gmail.com");
  const sarahId = await resolveUserId("seed-user-sarah", "lukeherod7+sarah@gmail.com");
  const mikeId  = await resolveUserId("seed-user-mike",  "lukeherod7+mike@gmail.com");

  // ─── Assignments ──────────────────────────────────────────────────────────
  // Delete and recreate so userId references stay correct after real logins.
  await db.assignment.deleteMany({ where: { jobId: { in: SEED_JOB_IDS } } });

  await db.assignment.createMany({
    data: [
      // Rio Tinto — 2 days, Jake + Sarah both days, Mike day 1 only
      { userId: jakeId,  jobId: "seed-job-riotinto", assignedDate: d("2026-06-10T00:00:00Z"), endDate: d("2026-06-11T00:00:00Z") },
      { userId: sarahId, jobId: "seed-job-riotinto", assignedDate: d("2026-06-10T00:00:00Z"), endDate: d("2026-06-11T00:00:00Z") },
      { userId: mikeId,  jobId: "seed-job-riotinto", assignedDate: d("2026-06-10T00:00:00Z") },
      // BHP — 1 day, Jake + Mike
      { userId: jakeId, jobId: "seed-job-bhp", assignedDate: d("2026-06-22T00:00:00Z") },
      { userId: mikeId, jobId: "seed-job-bhp", assignedDate: d("2026-06-22T00:00:00Z") },
      // Stanwell — 1 day, Mike
      { userId: mikeId, jobId: "seed-job-stanwell", assignedDate: d("2026-07-01T00:00:00Z") },
      // Glencore — 3 days Jake, 2 days Sarah (active)
      { userId: jakeId,  jobId: "seed-job-glencore", assignedDate: d("2026-07-07T00:00:00Z"), endDate: d("2026-07-09T00:00:00Z") },
      { userId: sarahId, jobId: "seed-job-glencore", assignedDate: d("2026-07-07T00:00:00Z"), endDate: d("2026-07-08T00:00:00Z") },
      // Incitec — upcoming Thu 10 Jul
      { userId: sarahId, jobId: "seed-job-incitec", assignedDate: d("2026-07-10T00:00:00Z") },
      { userId: mikeId,  jobId: "seed-job-incitec", assignedDate: d("2026-07-10T00:00:00Z") },
      // QAL — upcoming Mon 14 Jul
      { userId: jakeId, jobId: "seed-job-qal", assignedDate: d("2026-07-14T00:00:00Z"), endDate: d("2026-07-15T00:00:00Z") },
      { userId: mikeId, jobId: "seed-job-qal", assignedDate: d("2026-07-14T00:00:00Z"), endDate: d("2026-07-15T00:00:00Z") },
    ],
  });
  console.log("  ✓ Assignments (12 across all jobs)");

  // ─── Time entries ─────────────────────────────────────────────────────────
  await db.timeEntry.deleteMany({ where: { jobId: { in: SEED_JOB_IDS } } });

  await db.timeEntry.createMany({
    data: [
      // Rio Tinto day 1 — Jake 10.5h, Sarah 9.5h, Mike 8.5h
      { userId: jakeId,  jobId: "seed-job-riotinto", clockInTime: d("2026-06-10T07:00:00Z"), clockOutTime: d("2026-06-10T17:30:00Z"), durationMinutes: 630, status: "complete" },
      { userId: sarahId, jobId: "seed-job-riotinto", clockInTime: d("2026-06-10T07:00:00Z"), clockOutTime: d("2026-06-10T16:30:00Z"), durationMinutes: 570, status: "complete" },
      { userId: mikeId,  jobId: "seed-job-riotinto", clockInTime: d("2026-06-10T07:00:00Z"), clockOutTime: d("2026-06-10T15:30:00Z"), durationMinutes: 510, status: "complete" },
      // Rio Tinto day 2 — Jake 9h, Sarah 8.5h
      { userId: jakeId,  jobId: "seed-job-riotinto", clockInTime: d("2026-06-11T07:00:00Z"), clockOutTime: d("2026-06-11T16:00:00Z"), durationMinutes: 540, status: "complete" },
      { userId: sarahId, jobId: "seed-job-riotinto", clockInTime: d("2026-06-11T07:00:00Z"), clockOutTime: d("2026-06-11T15:30:00Z"), durationMinutes: 510, status: "complete" },
      // BHP — Jake 9.5h, Mike 9h
      { userId: jakeId, jobId: "seed-job-bhp", clockInTime: d("2026-06-22T07:30:00Z"), clockOutTime: d("2026-06-22T17:00:00Z"), durationMinutes: 570, status: "complete" },
      { userId: mikeId, jobId: "seed-job-bhp", clockInTime: d("2026-06-22T07:30:00Z"), clockOutTime: d("2026-06-22T16:30:00Z"), durationMinutes: 540, status: "complete" },
      // Stanwell — Mike 6.5h
      { userId: mikeId, jobId: "seed-job-stanwell", clockInTime: d("2026-07-01T08:00:00Z"), clockOutTime: d("2026-07-01T14:30:00Z"), durationMinutes: 390, status: "complete" },
      // Glencore day 1 — Jake 10h, Sarah 9.5h (complete)
      { userId: jakeId,  jobId: "seed-job-glencore", clockInTime: d("2026-07-07T07:00:00Z"), clockOutTime: d("2026-07-07T17:00:00Z"), durationMinutes: 600, status: "complete" },
      { userId: sarahId, jobId: "seed-job-glencore", clockInTime: d("2026-07-07T07:00:00Z"), clockOutTime: d("2026-07-07T16:30:00Z"), durationMinutes: 570, status: "complete" },
      // Glencore day 2 — Sarah done (8.5h), Jake still clocked in (active)
      { userId: sarahId, jobId: "seed-job-glencore", clockInTime: d("2026-07-08T07:00:00Z"), clockOutTime: d("2026-07-08T15:30:00Z"), durationMinutes: 510, status: "complete" },
      { userId: jakeId,  jobId: "seed-job-glencore", clockInTime: d("2026-07-08T07:00:00Z"), clockOutTime: null, durationMinutes: null, status: "active" },
    ],
  });
  console.log("  ✓ Time entries (12 — Jake active on Glencore)");

  // ─── Variations ───────────────────────────────────────────────────────────
  await db.variation.deleteMany({ where: { jobId: { in: SEED_JOB_IDS } } });

  await db.variation.createMany({
    data: [
      // Rio Tinto — 2 approved ($1,400 + $800), 1 rejected
      {
        jobId: "seed-job-riotinto", technicianId: jakeId,
        description: "Replace Level 2 fill packs — deteriorated beyond service life, causing up to 20% efficiency loss",
        costEstimate: 1400, status: "approved", directorDecision: "approved",
        decisionReason: "Approved — critical for thermal efficiency. Order immediately.",
        submittedAt: d("2026-06-10T14:00:00Z"), decidedAt: d("2026-06-12T09:00:00Z"),
      },
      {
        jobId: "seed-job-riotinto", technicianId: sarahId,
        description: "Replace water distribution nozzles — 6 blocked, causing uneven water distribution across tower",
        costEstimate: 800, status: "approved", directorDecision: "approved",
        decisionReason: "Approved.",
        submittedAt: d("2026-06-10T15:30:00Z"), decidedAt: d("2026-06-12T09:05:00Z"),
      },
      {
        jobId: "seed-job-riotinto", technicianId: sarahId,
        description: "Replace basin liner — minor cracking noted at south-west corner, could develop into leak",
        costEstimate: 2200, status: "rejected", directorDecision: "rejected",
        decisionReason: "Defer to next annual service — non-urgent at this stage. Monitor over coming months.",
        submittedAt: d("2026-06-11T11:00:00Z"), decidedAt: d("2026-06-12T09:10:00Z"),
      },
      // BHP — 1 approved ($680)
      {
        jobId: "seed-job-bhp", technicianId: mikeId,
        description: "Chemical descaling treatment — significant scale buildup on heat exchanger reducing flow rate by ~30%",
        costEstimate: 680, status: "approved", directorDecision: "approved",
        decisionReason: "Approved — proceed immediately.",
        submittedAt: d("2026-06-22T13:00:00Z"), decidedAt: d("2026-06-23T08:30:00Z"),
      },
      // Stanwell — 1 approved ($480)
      {
        jobId: "seed-job-stanwell", technicianId: mikeId,
        description: "Replace pump bearing — seized, causing vibration and risk of pump failure. Bearing on hand.",
        costEstimate: 480, status: "approved", directorDecision: "approved",
        decisionReason: "Approved — safety critical.",
        submittedAt: d("2026-07-01T09:30:00Z"), decidedAt: d("2026-07-01T10:00:00Z"),
      },
      // Glencore — 1 pending, 1 queried (sent back)
      {
        jobId: "seed-job-glencore", technicianId: jakeId,
        description: "Replace fan belt on Tower 3 — visible cracking and glazing, risk of snap under load",
        costEstimate: 320, status: "pending", directorDecision: null,
        decisionReason: null,
        submittedAt: d("2026-07-07T15:00:00Z"), decidedAt: null,
      },
      {
        jobId: "seed-job-glencore", technicianId: sarahId,
        description: "Replace float valve assembly on Tower 1 — leaking, causing overflow and water loss",
        costEstimate: 450, status: "queried", directorDecision: "queried",
        decisionReason: "Please provide a photo of the damage before I approve — need to confirm it's the valve and not the inlet pipe.",
        submittedAt: d("2026-07-07T16:00:00Z"), decidedAt: d("2026-07-08T08:00:00Z"),
      },
    ],
  });
  console.log("  ✓ Variations (7: 4 approved, 1 rejected, 1 pending, 1 queried)");

  // ─── Invoices ─────────────────────────────────────────────────────────────
  // Rio Tinto: 46h actual × $145 = $6,670 — director rounded to $6,700
  //   + approved variations $1,400 + $800 = $2,200 → total $8,900 PAID
  // BHP: 18.5h × $145 = $2,683
  //   + approved variation $680 → total $3,363 SENT
  // Stanwell: director hasn't set labour yet (baseAmount = 0, draft)
  //   variation $480 shows as variationsTotal → total $480 DRAFT
  await db.invoice.deleteMany({ where: { jobId: { in: SEED_JOB_IDS } } });

  await db.invoice.createMany({
    data: [
      {
        jobId: "seed-job-riotinto",
        invoiceNumber: "INV-2026-0001",
        status: "paid",
        baseAmount: 6700,
        variationsTotal: 2200,
        totalAmount: 8900,
        notes: "Annual service completed ahead of schedule. All defects resolved.",
        sentAt: d("2026-06-15T02:00:00Z"),
        sentToEmail: "procurement@riotinto.com",
        paidAt: d("2026-06-28T04:00:00Z"),
      },
      {
        jobId: "seed-job-bhp",
        invoiceNumber: "INV-2026-0002",
        status: "sent",
        baseAmount: 2683,
        variationsTotal: 680,
        totalAmount: 3363,
        notes: null,
        sentAt: d("2026-06-25T01:30:00Z"),
        sentToEmail: "maintenance.accounts@bhp.com",
        paidAt: null,
      },
      {
        jobId: "seed-job-stanwell",
        invoiceNumber: null,
        status: "draft",
        baseAmount: 0,
        variationsTotal: 480,
        totalAmount: 480,
        notes: null,
        sentAt: null,
        sentToEmail: null,
        paidAt: null,
      },
    ],
  });
  console.log("  ✓ Invoices (INV-2026-0001 paid, INV-2026-0002 sent, Stanwell draft)");

  // ─── Compliance templates ─────────────────────────────────────────────────
  await db.complianceTemplate.upsert({
    where: { id: "seed-tmpl-jsa" },
    update: {},
    create: {
      id: "seed-tmpl-jsa",
      name: "Job Safety Analysis (JSA)",
      type: "JSA",
      isActive: true,
      sections: [
        { id: "hazards", title: "Hazard Identification", fields: [
          { id: "working_at_height", label: "Working at height", type: "checkbox" },
          { id: "electrical_hazards", label: "Electrical hazards present", type: "checkbox" },
          { id: "chemical_exposure", label: "Chemical exposure risk", type: "checkbox" },
          { id: "confined_space", label: "Confined space entry", type: "checkbox" },
        ]},
        { id: "ppe", title: "PPE Required", fields: [
          { id: "hard_hat", label: "Hard hat", type: "checkbox" },
          { id: "safety_glasses", label: "Safety glasses", type: "checkbox" },
          { id: "gloves", label: "Chemical resistant gloves", type: "checkbox" },
          { id: "harness", label: "Fall arrest harness", type: "checkbox" },
        ]},
        { id: "sign_off", title: "Sign Off", fields: [
          { id: "site_briefing", label: "Site safety briefing completed", type: "checkbox" },
          { id: "supervisor_name", label: "Site supervisor name", type: "text" },
          { id: "emergency_contact", label: "Emergency contact number", type: "text" },
        ]},
      ],
    },
  });

  await db.complianceTemplate.upsert({
    where: { id: "seed-tmpl-swms" },
    update: {},
    create: {
      id: "seed-tmpl-swms",
      name: "Safe Work Method Statement (SWMS)",
      type: "SWMS",
      isActive: true,
      sections: [
        { id: "scope", title: "Scope of Work", fields: [
          { id: "work_description", label: "Description of work", type: "textarea" },
          { id: "location", label: "Exact work location", type: "text" },
          { id: "estimated_duration", label: "Estimated duration (hours)", type: "text" },
        ]},
        { id: "controls", title: "Risk Controls", fields: [
          { id: "permit_obtained", label: "Permit to work obtained", type: "checkbox" },
          { id: "isolation_complete", label: "Electrical isolation complete", type: "checkbox" },
          { id: "lockout_tagout", label: "Lockout/tagout applied", type: "checkbox" },
        ]},
      ],
    },
  });
  console.log("  ✓ Compliance templates (JSA, SWMS)");

  // ─── Summary ──────────────────────────────────────────────────────────────
  console.log("\n✅ Seed complete!\n");
  console.log("👤 Demo logins (use email/password — NOT Google sign-in):");
  console.log("   lukeherod7+jake@gmail.com  → Jake Morrison  (technician)");
  console.log("   lukeherod7+sarah@gmail.com → Sarah Chen     (technician)");
  console.log("   lukeherod7+mike@gmail.com  → Mike Davis     (technician)");
  console.log("   lukeherod7+tom@gmail.com   → Tom Wilson     (service manager)");
  console.log("   lukeherod7@gmail.com       → your account   (director/admin)");
  console.log("\n📋 Jobs:");
  console.log("   COMPLETE — Rio Tinto Weipa Annual Service      → INV-2026-0001 PAID  $8,900");
  console.log("   COMPLETE — BHP Hay Point Quarterly Inspection  → INV-2026-0002 SENT  $3,363");
  console.log("   COMPLETE — Stanwell Power Station Emergency     → Draft invoice        $480");
  console.log("   ACTIVE   — Glencore Mt Isa Annual Service      → Jake clocked in now");
  console.log("   SCHEDULED — Incitec Pivot Gibson Island        → Thu 10 Jul");
  console.log("   SCHEDULED — Queensland Alumina Gladstone       → Mon 14 Jul");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => db.$disconnect());
