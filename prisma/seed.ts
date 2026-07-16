import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
const db = new PrismaClient({ adapter });

const d = (iso: string) => new Date(iso);

// Job.id has no DB-level UUID format constraint (Job.id is a plain String
// column — @default(uuid()) is only used when no id is supplied), but every
// jobId Zod schema across the app (variations, schedule assignments,
// clock-in, compliance documents, asset-job linking) validates with
// z.string().uuid(). Seed job IDs must be real UUIDs or those endpoints
// 400 on any seeded job — see seed-ids.test.ts.
export const SEED_JOB_IDS = [
  "8d30c260-1f99-4280-af15-4c802866c526", // seed-job-riotinto
  "c3f79548-f16b-4d32-b937-51cf7d42cb34", // seed-job-bhp
  "67e75b3b-9505-4028-b41f-1a706ba891c2", // seed-job-stanwell
  "1e8e4c27-feb5-47fa-811b-d68bc2b3c8a6", // seed-job-glencore
  "ef78d400-db40-4b4c-96fb-819ed060aa34", // seed-job-incitec
  "cb4aef5a-a7e8-4411-bd89-a9b9e086bfce", // seed-job-qal
];

const SEED_USER_IDS = [
  "seed-user-jake",
  "seed-user-sarah",
  "seed-user-mike",
  "seed-user-tom",
];

// Same UUID-format requirement as SEED_JOB_IDS above, this time for
// customerId (contracts/validate.ts, quoting/validate.ts, assets/validate.ts,
// jobs/route.ts all require z.string().uuid()). See seed-ids.test.ts.
export const SEED_CUSTOMER_IDS = [
  "6f1e32aa-f961-468e-96fd-9336dc2c34d5", // seed-customer-riotinto
  "69c31a1c-e330-44a3-9af6-a1cc2bef7abf", // seed-customer-bhp
  "98cf136c-bd96-4933-ae98-fad4f9ce31c9", // seed-customer-stanwell
  "b22b7ca9-2025-444d-a5bf-59308220f8eb", // seed-customer-glencore
  "b2ddddcb-35a0-46a1-b0ef-f221d2571438", // seed-customer-incitec
  "ba6843fe-3e1b-482d-b4c9-c6a1a21a8c6b", // seed-customer-qal
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
  await db.jobCommunication.deleteMany({ where: { jobId: { notIn: SEED_JOB_IDS } } });
  await db.materialEntry.deleteMany({ where: { jobId: { notIn: SEED_JOB_IDS } } });
  await db.jobAsset.deleteMany({ where: { jobId: { notIn: SEED_JOB_IDS } } });
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

  // ─── Customers ────────────────────────────────────────────────────────────
  const customers = [
    {
      id: "6f1e32aa-f961-468e-96fd-9336dc2c34d5",
      name: "Rio Tinto",
      abn: "96 004 458 404",
      contactPerson: "Priya Nathan",
      email: "procurement@riotinto.com",
      phone: "(07) 3625 4100",
      address: "1 Bauxite Rd, Weipa QLD 4874",
      notes: "Annual service customer since 2019. Prefers scheduling around wet season (Nov–Apr).",
    },
    {
      id: "69c31a1c-e330-44a3-9af6-a1cc2bef7abf",
      name: "BHP",
      abn: "49 004 028 077",
      contactPerson: "Craig Ferris",
      email: "maintenance.accounts@bhp.com",
      phone: "(07) 4940 2500",
      address: "Port Road, Hay Point QLD 4740",
      notes: "Quarterly inspections. Site induction required 48h before arrival.",
    },
    {
      id: "98cf136c-bd96-4933-ae98-fad4f9ce31c9",
      name: "Stanwell Corporation",
      abn: "78 132 181 792",
      contactPerson: "Diane Osei",
      email: "assets@stanwell.com",
      phone: "(07) 4938 8000",
      address: "Stanwell Rd, Stanwell QLD 4702",
      notes: null,
    },
    {
      id: "b22b7ca9-2025-444d-a5bf-59308220f8eb",
      name: "Glencore",
      abn: "31 088 796 969",
      contactPerson: "Aaron Blake",
      email: "sitemaintenance@glencore.com.au",
      phone: "(07) 4744 4100",
      address: "22 Marian St, Mount Isa QLD 4825",
      notes: "Long-term maintenance contract customer.",
    },
    {
      id: "b2ddddcb-35a0-46a1-b0ef-f221d2571438",
      name: "Incitec Pivot",
      abn: "42 004 080 264",
      contactPerson: "Helen Marsh",
      email: "engineering@incitecpivot.com.au",
      phone: "(07) 3909 3333",
      address: "Gibson Island, Murarrie QLD 4172",
      notes: null,
    },
    {
      id: "ba6843fe-3e1b-482d-b4c9-c6a1a21a8c6b",
      name: "Queensland Alumina Ltd",
      abn: "37 009 660 872",
      contactPerson: "Rowan Kelly",
      email: "reliability@qal.com.au",
      phone: "(07) 4976 3111",
      address: "1 Parsons Rd, Gladstone QLD 4680",
      notes: null,
    },
  ];

  for (const c of customers) {
    await db.customer.upsert({ where: { id: c.id }, update: c, create: c });
  }
  console.log("  ✓ Customers (6, matching the seed jobs' companies)");

  // ─── Demo users ───────────────────────────────────────────────────────────
  // Two loginable aliases — sign in with email/password (not Google OAuth):
  //   lukeherod7+technician@gmail.com  → Jake Morrison (technician)
  //   lukeherod7+admin@gmail.com       → Tom Wilson   (service_manager)
  //
  // Sarah and Mike have internal emails — their names and data appear
  // throughout the app but you don't need to sign in as them.
  //
  // The clerkId below is a placeholder — it gets replaced by the real Clerk
  // ID on first login via the webhook's email-matching fallback.

  const users = [
    {
      id: "seed-user-jake",
      clerkId: "placeholder_jake_morrison",
      name: "Jake Morrison",
      email: "lukeherod7+technician@gmail.com",
      phone: "0412 345 678",
      role: "technician" as const,
    },
    {
      id: "seed-user-sarah",
      clerkId: "placeholder_sarah_chen",
      name: "Sarah Chen",
      email: "sarah.chen@ctfieldops.com.au",
      phone: "0423 456 789",
      role: "technician" as const,
    },
    {
      id: "seed-user-mike",
      clerkId: "placeholder_mike_davis",
      name: "Mike Davis",
      email: "mike.davis@ctfieldops.com.au",
      phone: "0434 567 890",
      role: "technician" as const,
    },
    {
      id: "seed-user-tom",
      clerkId: "placeholder_tom_wilson",
      name: "Tom Wilson",
      email: "lukeherod7+admin@gmail.com",
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
      id: "8d30c260-1f99-4280-af15-4c802866c526",
      customerName: "Rio Tinto",
      customerId: "6f1e32aa-f961-468e-96fd-9336dc2c34d5",
      siteName: "Weipa Processing Plant",
      siteAddress: "1 Bauxite Rd, Weipa QLD 4874",
      status: "complete" as const,
      jobType: "Annual Service",
      quotedHours: 32,
      quotedCost: 7000,
    },
    {
      id: "c3f79548-f16b-4d32-b937-51cf7d42cb34",
      customerName: "BHP",
      customerId: "69c31a1c-e330-44a3-9af6-a1cc2bef7abf",
      siteName: "Hay Point Coal Terminal",
      siteAddress: "Port Road, Hay Point QLD 4740",
      status: "complete" as const,
      jobType: "Quarterly Inspection",
      quotedHours: 16,
      quotedCost: 3500,
    },
    {
      id: "67e75b3b-9505-4028-b41f-1a706ba891c2",
      customerName: "Stanwell Corporation",
      customerId: "98cf136c-bd96-4933-ae98-fad4f9ce31c9",
      siteName: "Stanwell Power Station",
      siteAddress: "Stanwell Rd, Stanwell QLD 4702",
      status: "complete" as const,
      jobType: "Emergency Repair",
      quotedHours: 8,
      quotedCost: 1200,
    },
    {
      id: "1e8e4c27-feb5-47fa-811b-d68bc2b3c8a6",
      customerName: "Glencore",
      customerId: "b22b7ca9-2025-444d-a5bf-59308220f8eb",
      siteName: "Mt Isa Copper Operations",
      siteAddress: "22 Marian St, Mount Isa QLD 4825",
      status: "active" as const,
      jobType: "Annual Service",
      quotedHours: 40,
      quotedCost: 8500,
    },
    {
      id: "ef78d400-db40-4b4c-96fb-819ed060aa34",
      customerName: "Incitec Pivot",
      customerId: "b2ddddcb-35a0-46a1-b0ef-f221d2571438",
      siteName: "Gibson Island Fertiliser Plant",
      siteAddress: "Gibson Island, Murarrie QLD 4172",
      status: "scheduled" as const,
      jobType: "Quarterly Inspection",
      quotedHours: 12,
      quotedCost: 2800,
    },
    {
      id: "cb4aef5a-a7e8-4411-bd89-a9b9e086bfce",
      customerName: "Queensland Alumina Ltd",
      customerId: "ba6843fe-3e1b-482d-b4c9-c6a1a21a8c6b",
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

  const jakeId  = await resolveUserId("seed-user-jake",  "lukeherod7+technician@gmail.com");
  const sarahId = await resolveUserId("seed-user-sarah", "sarah.chen@ctfieldops.com.au");
  const mikeId  = await resolveUserId("seed-user-mike",  "mike.davis@ctfieldops.com.au");
  const tomId   = await resolveUserId("seed-user-tom",   "lukeherod7+admin@gmail.com");

  // ─── Assignments ──────────────────────────────────────────────────────────
  // Delete and recreate so userId references stay correct after real logins.
  await db.assignment.deleteMany({ where: { jobId: { in: SEED_JOB_IDS } } });

  await db.assignment.createMany({
    data: [
      // Rio Tinto — 2 days, Jake + Sarah both days, Mike day 1 only
      { userId: jakeId,  jobId: "8d30c260-1f99-4280-af15-4c802866c526", assignedDate: d("2026-06-10T00:00:00Z"), endDate: d("2026-06-11T00:00:00Z") },
      { userId: sarahId, jobId: "8d30c260-1f99-4280-af15-4c802866c526", assignedDate: d("2026-06-10T00:00:00Z"), endDate: d("2026-06-11T00:00:00Z") },
      { userId: mikeId,  jobId: "8d30c260-1f99-4280-af15-4c802866c526", assignedDate: d("2026-06-10T00:00:00Z") },
      // BHP — 1 day, Jake + Mike
      { userId: jakeId, jobId: "c3f79548-f16b-4d32-b937-51cf7d42cb34", assignedDate: d("2026-06-22T00:00:00Z") },
      { userId: mikeId, jobId: "c3f79548-f16b-4d32-b937-51cf7d42cb34", assignedDate: d("2026-06-22T00:00:00Z") },
      // Stanwell — 1 day, Mike
      { userId: mikeId, jobId: "67e75b3b-9505-4028-b41f-1a706ba891c2", assignedDate: d("2026-07-01T00:00:00Z") },
      // Glencore — 3 days Jake, 2 days Sarah (active)
      { userId: jakeId,  jobId: "1e8e4c27-feb5-47fa-811b-d68bc2b3c8a6", assignedDate: d("2026-07-07T00:00:00Z"), endDate: d("2026-07-09T00:00:00Z") },
      { userId: sarahId, jobId: "1e8e4c27-feb5-47fa-811b-d68bc2b3c8a6", assignedDate: d("2026-07-07T00:00:00Z"), endDate: d("2026-07-08T00:00:00Z") },
      // Incitec — upcoming Thu 10 Jul
      { userId: sarahId, jobId: "ef78d400-db40-4b4c-96fb-819ed060aa34", assignedDate: d("2026-07-10T00:00:00Z") },
      { userId: mikeId,  jobId: "ef78d400-db40-4b4c-96fb-819ed060aa34", assignedDate: d("2026-07-10T00:00:00Z") },
      // QAL — upcoming Mon 14 Jul
      { userId: jakeId, jobId: "cb4aef5a-a7e8-4411-bd89-a9b9e086bfce", assignedDate: d("2026-07-14T00:00:00Z"), endDate: d("2026-07-15T00:00:00Z") },
      { userId: mikeId, jobId: "cb4aef5a-a7e8-4411-bd89-a9b9e086bfce", assignedDate: d("2026-07-14T00:00:00Z"), endDate: d("2026-07-15T00:00:00Z") },
    ],
  });
  console.log("  ✓ Assignments (12 across all jobs)");

  // ─── Time entries ─────────────────────────────────────────────────────────
  await db.timeEntry.deleteMany({ where: { jobId: { in: SEED_JOB_IDS } } });

  await db.timeEntry.createMany({
    data: [
      // Rio Tinto day 1 — Jake 10.5h, Sarah 9.5h, Mike 8.5h
      { userId: jakeId,  jobId: "8d30c260-1f99-4280-af15-4c802866c526", clockInTime: d("2026-06-10T07:00:00Z"), clockOutTime: d("2026-06-10T17:30:00Z"), durationMinutes: 630, status: "complete" },
      { userId: sarahId, jobId: "8d30c260-1f99-4280-af15-4c802866c526", clockInTime: d("2026-06-10T07:00:00Z"), clockOutTime: d("2026-06-10T16:30:00Z"), durationMinutes: 570, status: "complete" },
      { userId: mikeId,  jobId: "8d30c260-1f99-4280-af15-4c802866c526", clockInTime: d("2026-06-10T07:00:00Z"), clockOutTime: d("2026-06-10T15:30:00Z"), durationMinutes: 510, status: "complete" },
      // Rio Tinto day 2 — Jake 9h, Sarah 8.5h
      { userId: jakeId,  jobId: "8d30c260-1f99-4280-af15-4c802866c526", clockInTime: d("2026-06-11T07:00:00Z"), clockOutTime: d("2026-06-11T16:00:00Z"), durationMinutes: 540, status: "complete" },
      { userId: sarahId, jobId: "8d30c260-1f99-4280-af15-4c802866c526", clockInTime: d("2026-06-11T07:00:00Z"), clockOutTime: d("2026-06-11T15:30:00Z"), durationMinutes: 510, status: "complete" },
      // BHP — Jake 9.5h, Mike 9h
      { userId: jakeId, jobId: "c3f79548-f16b-4d32-b937-51cf7d42cb34", clockInTime: d("2026-06-22T07:30:00Z"), clockOutTime: d("2026-06-22T17:00:00Z"), durationMinutes: 570, status: "complete" },
      { userId: mikeId, jobId: "c3f79548-f16b-4d32-b937-51cf7d42cb34", clockInTime: d("2026-06-22T07:30:00Z"), clockOutTime: d("2026-06-22T16:30:00Z"), durationMinutes: 540, status: "complete" },
      // Stanwell — Mike 6.5h
      { userId: mikeId, jobId: "67e75b3b-9505-4028-b41f-1a706ba891c2", clockInTime: d("2026-07-01T08:00:00Z"), clockOutTime: d("2026-07-01T14:30:00Z"), durationMinutes: 390, status: "complete" },
      // Glencore day 1 — Jake 10h, Sarah 9.5h (complete)
      { userId: jakeId,  jobId: "1e8e4c27-feb5-47fa-811b-d68bc2b3c8a6", clockInTime: d("2026-07-07T07:00:00Z"), clockOutTime: d("2026-07-07T17:00:00Z"), durationMinutes: 600, status: "complete" },
      { userId: sarahId, jobId: "1e8e4c27-feb5-47fa-811b-d68bc2b3c8a6", clockInTime: d("2026-07-07T07:00:00Z"), clockOutTime: d("2026-07-07T16:30:00Z"), durationMinutes: 570, status: "complete" },
      // Glencore day 2 — Sarah done (8.5h), Jake still clocked in (active)
      { userId: sarahId, jobId: "1e8e4c27-feb5-47fa-811b-d68bc2b3c8a6", clockInTime: d("2026-07-08T07:00:00Z"), clockOutTime: d("2026-07-08T15:30:00Z"), durationMinutes: 510, status: "complete" },
      { userId: jakeId,  jobId: "1e8e4c27-feb5-47fa-811b-d68bc2b3c8a6", clockInTime: d("2026-07-07T21:00:00Z"), clockOutTime: null, durationMinutes: null, status: "active" },
    ],
  });
  console.log("  ✓ Time entries (12 — Jake active on Glencore)");

  // ─── Variations ───────────────────────────────────────────────────────────
  await db.variation.deleteMany({ where: { jobId: { in: SEED_JOB_IDS } } });

  await db.variation.createMany({
    data: [
      // Rio Tinto — 2 approved ($1,400 + $800), 1 rejected
      {
        jobId: "8d30c260-1f99-4280-af15-4c802866c526", technicianId: jakeId,
        description: "Replace Level 2 fill packs — deteriorated beyond service life, causing up to 20% efficiency loss",
        costEstimate: 1400, status: "approved", directorDecision: "approved",
        decisionReason: "Approved — critical for thermal efficiency. Order immediately.",
        submittedAt: d("2026-06-10T14:00:00Z"), decidedAt: d("2026-06-12T09:00:00Z"),
      },
      {
        jobId: "8d30c260-1f99-4280-af15-4c802866c526", technicianId: sarahId,
        description: "Replace water distribution nozzles — 6 blocked, causing uneven water distribution across tower",
        costEstimate: 800, status: "approved", directorDecision: "approved",
        decisionReason: "Approved.",
        submittedAt: d("2026-06-10T15:30:00Z"), decidedAt: d("2026-06-12T09:05:00Z"),
      },
      {
        jobId: "8d30c260-1f99-4280-af15-4c802866c526", technicianId: sarahId,
        description: "Replace basin liner — minor cracking noted at south-west corner, could develop into leak",
        costEstimate: 2200, status: "rejected", directorDecision: "rejected",
        decisionReason: "Defer to next annual service — non-urgent at this stage. Monitor over coming months.",
        submittedAt: d("2026-06-11T11:00:00Z"), decidedAt: d("2026-06-12T09:10:00Z"),
      },
      // BHP — 1 approved ($680)
      {
        jobId: "c3f79548-f16b-4d32-b937-51cf7d42cb34", technicianId: mikeId,
        description: "Chemical descaling treatment — significant scale buildup on heat exchanger reducing flow rate by ~30%",
        costEstimate: 680, status: "approved", directorDecision: "approved",
        decisionReason: "Approved — proceed immediately.",
        submittedAt: d("2026-06-22T13:00:00Z"), decidedAt: d("2026-06-23T08:30:00Z"),
      },
      // Stanwell — 1 approved ($480)
      {
        jobId: "67e75b3b-9505-4028-b41f-1a706ba891c2", technicianId: mikeId,
        description: "Replace pump bearing — seized, causing vibration and risk of pump failure. Bearing on hand.",
        costEstimate: 480, status: "approved", directorDecision: "approved",
        decisionReason: "Approved — safety critical.",
        submittedAt: d("2026-07-01T09:30:00Z"), decidedAt: d("2026-07-01T10:00:00Z"),
      },
      // Glencore — 1 pending, 1 queried (sent back)
      {
        jobId: "1e8e4c27-feb5-47fa-811b-d68bc2b3c8a6", technicianId: jakeId,
        description: "Replace fan belt on Tower 3 — visible cracking and glazing, risk of snap under load",
        costEstimate: 320, status: "pending", directorDecision: null,
        decisionReason: null,
        submittedAt: d("2026-07-07T15:00:00Z"), decidedAt: null,
      },
      {
        jobId: "1e8e4c27-feb5-47fa-811b-d68bc2b3c8a6", technicianId: sarahId,
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
        jobId: "8d30c260-1f99-4280-af15-4c802866c526",
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
        jobId: "c3f79548-f16b-4d32-b937-51cf7d42cb34",
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
        jobId: "67e75b3b-9505-4028-b41f-1a706ba891c2",
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
      type: "jsa",
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
      type: "swms",
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

  // ─── Compliance documents (submitted, not just templates) ─────────────────
  await db.complianceDocument.deleteMany({ where: { jobId: { in: SEED_JOB_IDS } } });

  await db.complianceDocument.createMany({
    data: [
      {
        jobId: "8d30c260-1f99-4280-af15-4c802866c526", templateId: "seed-tmpl-jsa", createdById: jakeId,
        values: {
          working_at_height: true, electrical_hazards: false, chemical_exposure: true, confined_space: false,
          hard_hat: true, safety_glasses: true, gloves: true, harness: true,
          site_briefing: true, supervisor_name: "Priya Nathan", emergency_contact: "0400 111 222",
        },
        submittedAt: d("2026-06-10T06:45:00Z"),
      },
      {
        jobId: "c3f79548-f16b-4d32-b937-51cf7d42cb34", templateId: "seed-tmpl-swms", createdById: mikeId,
        values: {
          work_description: "Quarterly inspection and chemical descaling of cooling tower heat exchanger.",
          location: "Terminal block C, ground level",
          estimated_duration: "16",
          permit_obtained: true, isolation_complete: true, lockout_tagout: true,
        },
        submittedAt: d("2026-06-22T07:15:00Z"),
      },
    ],
  });
  console.log("  ✓ Compliance documents (2 submitted — JSA for Rio Tinto, SWMS for BHP)");

  // ─── Job communications (Phase 3 batch a) ─────────────────────────────────
  await db.jobCommunication.deleteMany({ where: { jobId: { in: SEED_JOB_IDS } } });

  await db.jobCommunication.createMany({
    data: [
      {
        jobId: "8d30c260-1f99-4280-af15-4c802866c526", authorId: tomId, type: "client_call",
        body: "Called Priya Nathan to confirm access arrangements for the annual service. Site induction booked for 7am arrival.",
        createdAt: d("2026-06-09T23:00:00Z"),
      },
      {
        jobId: "8d30c260-1f99-4280-af15-4c802866c526", authorId: tomId, type: "internal_note",
        body: "Customer mentioned budget is tight this year — get variation sign-off in writing before ordering parts.",
        createdAt: d("2026-06-10T00:00:00Z"),
      },
      {
        jobId: "1e8e4c27-feb5-47fa-811b-d68bc2b3c8a6", authorId: tomId, type: "field_instruction",
        body: "Tower 3 fan belt is on order, ETA Wednesday. Don't run Tower 3 above 60% load until it's replaced.",
        createdAt: d("2026-07-07T22:00:00Z"),
      },
      {
        jobId: "1e8e4c27-feb5-47fa-811b-d68bc2b3c8a6", authorId: tomId, type: "internal_note",
        body: "Site contact Aaron Blake is on leave until the 14th — escalate anything urgent to the site duty manager instead.",
        createdAt: d("2026-07-08T01:00:00Z"),
      },
      {
        jobId: "c3f79548-f16b-4d32-b937-51cf7d42cb34", authorId: tomId, type: "client_call",
        body: "Craig Ferris confirmed invoice INV-2026-0002 is in this week's payment run.",
        createdAt: d("2026-06-26T03:00:00Z"),
      },
    ],
  });
  console.log("  ✓ Job communications (5 across 3 jobs — client calls, internal notes, a field instruction)");

  // ─── Assets (Phase 3 batch b) ──────────────────────────────────────────────
  const assets = [
    {
      id: "seed-asset-riotinto-1", customerId: "6f1e32aa-f961-468e-96fd-9336dc2c34d5",
      serialNumber: "BAC-VT1-40-2891", assetType: "BAC VT1-40 Cooling Tower", location: "Roof level 3, north",
    },
    {
      id: "seed-asset-riotinto-2", customerId: "6f1e32aa-f961-468e-96fd-9336dc2c34d5",
      serialNumber: "BAC-VT1-40-2892", assetType: "BAC VT1-40 Cooling Tower", location: "Roof level 3, south",
    },
    {
      id: "seed-asset-glencore-1", customerId: "b22b7ca9-2025-444d-a5bf-59308220f8eb",
      serialNumber: "EVAPCO-AT-112", assetType: "Evapco AT Series Cooling Tower", location: "Processing building, west wing",
    },
    {
      id: "seed-asset-bhp-1", customerId: "69c31a1c-e330-44a3-9af6-a1cc2bef7abf",
      serialNumber: "MARLEY-NC-8408", assetType: "Marley NC Cooling Tower", location: "Terminal block C",
    },
  ];
  for (const a of assets) {
    await db.asset.upsert({ where: { id: a.id }, update: a, create: a });
  }

  await db.jobAsset.deleteMany({ where: { jobId: { in: SEED_JOB_IDS } } });
  await db.jobAsset.createMany({
    data: [
      { jobId: "8d30c260-1f99-4280-af15-4c802866c526", assetId: "seed-asset-riotinto-1" },
      { jobId: "8d30c260-1f99-4280-af15-4c802866c526", assetId: "seed-asset-riotinto-2" },
      { jobId: "1e8e4c27-feb5-47fa-811b-d68bc2b3c8a6", assetId: "seed-asset-glencore-1" },
      { jobId: "c3f79548-f16b-4d32-b937-51cf7d42cb34", assetId: "seed-asset-bhp-1" },
    ],
  });
  console.log("  ✓ Assets (4, linked to jobs for service history)");

  // ─── Material entries / job costing (Phase 3 batch c) ─────────────────────
  await db.materialEntry.deleteMany({ where: { jobId: { in: SEED_JOB_IDS } } });

  await db.materialEntry.createMany({
    data: [
      {
        jobId: "8d30c260-1f99-4280-af15-4c802866c526", createdById: jakeId,
        description: "Replacement fill pack set (Level 2)", supplierName: "CoolTower Parts Co",
        quantity: 1, estimatedCost: 980, actualCost: 1015, status: "reconciled",
        createdAt: d("2026-06-10T14:30:00Z"), reconciledAt: d("2026-06-13T02:00:00Z"),
      },
      {
        jobId: "8d30c260-1f99-4280-af15-4c802866c526", createdById: sarahId,
        description: "Water distribution nozzles x6", supplierName: "CoolTower Parts Co",
        quantity: 6, estimatedCost: 210, status: "pending",
        createdAt: d("2026-06-10T15:45:00Z"),
      },
      {
        jobId: "1e8e4c27-feb5-47fa-811b-d68bc2b3c8a6", createdById: sarahId,
        description: "Chemical biocide treatment (5L)", supplierName: "ChemTreat Australia",
        quantity: 1, estimatedCost: 165, actualCost: 172, status: "reconciled",
        createdAt: d("2026-07-07T08:30:00Z"), reconciledAt: d("2026-07-07T18:00:00Z"),
      },
      {
        jobId: "1e8e4c27-feb5-47fa-811b-d68bc2b3c8a6", createdById: jakeId,
        description: "Fan belt, Tower 3", supplierName: null,
        quantity: 1, estimatedCost: 85, status: "pending",
        createdAt: d("2026-07-07T15:10:00Z"),
      },
      {
        jobId: "c3f79548-f16b-4d32-b937-51cf7d42cb34", createdById: mikeId,
        description: "Descaling chemical treatment kit", supplierName: "ChemTreat Australia",
        quantity: 1, estimatedCost: 420, actualCost: 445, status: "received",
        createdAt: d("2026-06-22T13:15:00Z"),
      },
    ],
  });
  console.log("  ✓ Material entries (5 — two Glencore, one reconciled/one pending; one Rio Tinto reconciled; one BHP received)");

  // ─── Quotes (Phase 3 batch d) ───────────────────────────────────────────────
  const quotes = [
    {
      id: "seed-quote-1", createdById: tomId,
      customerName: "Rio Tinto", siteName: "Weipa Processing Plant", jobType: "Annual Service",
      lineItems: [
        { description: "Labour — 32 hrs", qty: 32, unitPrice: 145 },
        { description: "Callout fee", qty: 1, unitPrice: 250 },
      ],
      totalAmount: 4890, status: "accepted" as const, validUntil: d("2026-07-31T00:00:00Z"),
    },
    {
      id: "seed-quote-2", createdById: tomId,
      customerName: "Newcrest Mining", siteName: "Cadia Valley Operations", jobType: "Initial Site Assessment",
      lineItems: [
        { description: "Site assessment — 6 hrs", qty: 6, unitPrice: 145 },
        { description: "Travel", qty: 1, unitPrice: 380 },
      ],
      totalAmount: 1250, status: "sent" as const, validUntil: d("2026-08-15T00:00:00Z"),
    },
    {
      id: "seed-quote-3", createdById: tomId,
      customerName: "Glencore", siteName: "Mt Isa Copper Operations", jobType: "Quarterly Inspection",
      lineItems: [{ description: "Labour — 16 hrs", qty: 16, unitPrice: 145 }],
      totalAmount: 2320, status: "draft" as const, validUntil: null,
    },
    {
      id: "seed-quote-4", createdById: tomId,
      customerName: "BHP", siteName: "Hay Point Coal Terminal", jobType: "Emergency Repair",
      lineItems: [
        { description: "Labour — 8 hrs", qty: 8, unitPrice: 145 },
        { description: "Emergency callout surcharge", qty: 1, unitPrice: 300 },
      ],
      totalAmount: 1460, status: "declined" as const, validUntil: d("2026-06-30T00:00:00Z"),
    },
  ];
  for (const q of quotes) {
    await db.quote.upsert({ where: { id: q.id }, update: q, create: q });
  }
  console.log("  ✓ Quotes (4 — draft, sent, accepted, declined)");

  // ─── Maintenance contracts (Phase 3 batch e) ───────────────────────────────
  const contracts = [
    {
      id: "seed-contract-riotinto", customerId: "6f1e32aa-f961-468e-96fd-9336dc2c34d5",
      siteName: "Weipa Processing Plant", value: 28000, billingCadence: "quarterly" as const,
      serviceIntervalDays: 90, startDate: d("2026-04-08T00:00:00Z"), renewalDate: d("2026-07-15T00:00:00Z"),
      status: "active" as const,
    },
    {
      id: "seed-contract-glencore", customerId: "b22b7ca9-2025-444d-a5bf-59308220f8eb",
      siteName: "Mt Isa Copper Operations", value: 34000, billingCadence: "quarterly" as const,
      serviceIntervalDays: 90, startDate: d("2026-05-01T00:00:00Z"), renewalDate: d("2026-08-01T00:00:00Z"),
      status: "active" as const,
    },
    {
      id: "seed-contract-bhp", customerId: "69c31a1c-e330-44a3-9af6-a1cc2bef7abf",
      siteName: "Hay Point Coal Terminal", value: 14000, billingCadence: "monthly" as const,
      serviceIntervalDays: 30, startDate: d("2026-01-01T00:00:00Z"), renewalDate: d("2026-02-01T00:00:00Z"),
      status: "lapsed" as const,
    },
  ];
  for (const c of contracts) {
    await db.contract.upsert({ where: { id: c.id }, update: c, create: c });
  }
  await db.job.update({ where: { id: "1e8e4c27-feb5-47fa-811b-d68bc2b3c8a6" }, data: { contractId: "seed-contract-glencore" } });
  console.log("  ✓ Maintenance contracts (3 — one renewing soon, one lapsed, one linked to a job)");

  // ─── Customer portal token (Phase 3 batch f) ───────────────────────────────
  await db.customerPortalToken.upsert({
    where: { id: "seed-portal-token-riotinto" },
    update: { expiresAt: d("2026-08-07T00:00:00Z") },
    create: {
      id: "seed-portal-token-riotinto",
      customerId: "6f1e32aa-f961-468e-96fd-9336dc2c34d5",
      token: "demo-portal-token-riotinto",
      expiresAt: d("2026-08-07T00:00:00Z"),
    },
  });
  console.log("  ✓ Customer portal token (Rio Tinto — /portal/demo-portal-token-riotinto)");

  // ─── Summary ──────────────────────────────────────────────────────────────
  console.log("\n✅ Seed complete!\n");
  console.log("👤 Demo logins (use email/password — NOT Google sign-in):");
  console.log("   lukeherod7+technician@gmail.com → Jake Morrison  (technician)");
  console.log("   lukeherod7+admin@gmail.com      → Tom Wilson     (service manager)");
  console.log("   lukeherod7@gmail.com            → your account   (director/admin)");
  console.log("\n📋 Jobs:");
  console.log("   COMPLETE — Rio Tinto Weipa Annual Service      → INV-2026-0001 PAID  $8,900");
  console.log("   COMPLETE — BHP Hay Point Quarterly Inspection  → INV-2026-0002 SENT  $3,363");
  console.log("   COMPLETE — Stanwell Power Station Emergency     → Draft invoice        $480");
  console.log("   ACTIVE   — Glencore Mt Isa Annual Service      → Jake clocked in now");
  console.log("   SCHEDULED — Incitec Pivot Gibson Island        → Thu 10 Jul");
  console.log("   SCHEDULED — Queensland Alumina Gladstone       → Mon 14 Jul");
  console.log("\n🆕 Phase 3 data:");
  console.log("   Communication log  — 5 entries across Rio Tinto, Glencore, BHP jobs");
  console.log("   Assets             — 4 cooling towers, linked to service history");
  console.log("   Job costing        — 4 material entries (1 reconciled, 1 received, 2 pending)");
  console.log("   Quotes             — 4 (draft, sent, accepted, declined) at /quotes");
  console.log("   Contracts          — 3 (Rio Tinto renews ~1 week out, BHP lapsed, Glencore linked to its active job)");
  console.log("   Customer portal    — http://localhost:3000/portal/demo-portal-token-riotinto");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => db.$disconnect());
