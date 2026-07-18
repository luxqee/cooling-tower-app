import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { del } from "@vercel/blob";
import { indexDocument } from "../src/lib/ai/semanticSearch";

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
  "518fcc62-0409-4f47-960b-844b0732dcef", // seed-job-riotinto2 (earlier completed job — repeat-customer history)
  "b2024ae1-ec76-4dde-8a7c-952726c63970", // seed-job-bhp-cancelled
  "25173781-06ee-45b6-af24-416a08b28108", // seed-job-glencore2 (previous quarterly visit, before the current active one)
  "c0390a2a-ff0a-4ea5-a814-b76d72dc46c0", // seed-job-stanwell2 (second, currently active, engagement)
  "56906a71-bfe9-47a6-95e0-918d524fb102", // seed-job-capricorn (new customer's first job)
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
  "e57c9861-0db7-4093-b449-267915c90ec3", // seed-customer-capricorn
];

async function main() {
  console.log("🧹 Cleaning up old data...");

  // Remove all data for jobs that are not part of the seed (test/dev leftovers).
  // Must delete child records first because there are no cascade deletes in the schema.
  //
  // ComplianceDocument PDFs are uploaded to Vercel Blob storage (see
  // api/compliance/documents/route.ts) — their blob files must be deleted
  // alongside the DB row, or every reseed leaves another orphaned PDF behind
  // (exactly the "old PDF of an old safety document" problem this was added
  // to fix).
  const staleDocsWithPdfs = await db.complianceDocument.findMany({
    where: { jobId: { notIn: SEED_JOB_IDS }, pdfUrl: { not: null } },
    select: { pdfUrl: true },
  });
  for (const doc of staleDocsWithPdfs) {
    if (doc.pdfUrl) await del(doc.pdfUrl).catch(() => {});
  }
  await db.complianceDocument.deleteMany({ where: { jobId: { notIn: SEED_JOB_IDS } } });
  await db.timeEntry.deleteMany({ where: { jobId: { notIn: SEED_JOB_IDS } } });
  await db.variation.deleteMany({ where: { jobId: { notIn: SEED_JOB_IDS } } });
  await db.assignment.deleteMany({ where: { jobId: { notIn: SEED_JOB_IDS } } });
  await db.invoice.deleteMany({ where: { jobId: { notIn: SEED_JOB_IDS } } });
  await db.jobCommunication.deleteMany({ where: { jobId: { notIn: SEED_JOB_IDS } } });
  await db.materialEntry.deleteMany({ where: { jobId: { notIn: SEED_JOB_IDS } } });
  await db.jobAsset.deleteMany({ where: { jobId: { notIn: SEED_JOB_IDS } } });
  await db.voiceNotePhoto.deleteMany({ where: { voiceNote: { jobId: { notIn: SEED_JOB_IDS } } } });
  await db.voiceNote.deleteMany({ where: { jobId: { notIn: SEED_JOB_IDS } } });
  await db.documentChunk.deleteMany({ where: { jobId: { notIn: SEED_JOB_IDS } } });
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
    {
      id: "e57c9861-0db7-4093-b449-267915c90ec3",
      name: "Capricorn Minerals Ltd",
      abn: "84 617 235 990",
      contactPerson: "Naomi Falk",
      email: "facilities@capricornminerals.com.au",
      phone: "(07) 4972 5560",
      address: "88 Boyne Rd, Gladstone QLD 4680",
      notes: "New customer — first job quoted via referral from QAL.",
    },
  ];

  for (const c of customers) {
    await db.customer.upsert({ where: { id: c.id }, update: c, create: c });
  }
  console.log("  ✓ Customers (7, matching the seed jobs' companies)");

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
    // ── Additional jobs: repeat-customer history, a cancellation, a second
    // active job, and a brand-new customer's first job — so the app reads
    // like it's had several weeks of real activity, not a single snapshot.
    {
      id: "518fcc62-0409-4f47-960b-844b0732dcef",
      customerName: "Rio Tinto",
      customerId: "6f1e32aa-f961-468e-96fd-9336dc2c34d5",
      siteName: "Weipa Processing Plant",
      siteAddress: "1 Bauxite Rd, Weipa QLD 4874",
      status: "complete" as const,
      jobType: "Quarterly Inspection",
      quotedHours: 14,
      quotedCost: 2950,
    },
    {
      id: "b2024ae1-ec76-4dde-8a7c-952726c63970",
      customerName: "BHP",
      customerId: "69c31a1c-e330-44a3-9af6-a1cc2bef7abf",
      siteName: "Hay Point Coal Terminal",
      siteAddress: "Port Road, Hay Point QLD 4740",
      status: "cancelled" as const,
      jobType: "Emergency Repair",
      quotedHours: 6,
      quotedCost: 1100,
    },
    {
      id: "25173781-06ee-45b6-af24-416a08b28108",
      customerName: "Glencore",
      customerId: "b22b7ca9-2025-444d-a5bf-59308220f8eb",
      siteName: "Mt Isa Copper Operations",
      siteAddress: "22 Marian St, Mount Isa QLD 4825",
      status: "complete" as const,
      jobType: "Annual Service",
      quotedHours: 38,
      quotedCost: 8200,
    },
    {
      id: "c0390a2a-ff0a-4ea5-a814-b76d72dc46c0",
      customerName: "Stanwell Corporation",
      customerId: "98cf136c-bd96-4933-ae98-fad4f9ce31c9",
      siteName: "Stanwell Power Station",
      siteAddress: "Stanwell Rd, Stanwell QLD 4702",
      status: "active" as const,
      jobType: "Annual Service",
      quotedHours: 28,
      quotedCost: 6100,
    },
    {
      id: "56906a71-bfe9-47a6-95e0-918d524fb102",
      customerName: "Capricorn Minerals Ltd",
      customerId: "e57c9861-0db7-4093-b449-267915c90ec3",
      siteName: "Boyne Island Site",
      siteAddress: "88 Boyne Rd, Gladstone QLD 4680",
      status: "scheduled" as const,
      jobType: "Initial Site Assessment",
      quotedHours: 10,
      quotedCost: 2100,
    },
  ];

  for (const j of jobs) {
    await db.job.upsert({ where: { id: j.id }, update: j, create: j });
  }
  console.log("  ✓ Jobs (11 jobs: 5 complete, 2 active, 3 scheduled, 1 cancelled)");

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
      // Rio Tinto — earlier quarterly inspection, 1 day, Sarah
      { userId: sarahId, jobId: "518fcc62-0409-4f47-960b-844b0732dcef", assignedDate: d("2026-05-20T00:00:00Z") },
      // Glencore — contract-commencement service, 2 days, Jake + Mike
      { userId: jakeId, jobId: "25173781-06ee-45b6-af24-416a08b28108", assignedDate: d("2026-05-05T00:00:00Z"), endDate: d("2026-05-06T00:00:00Z") },
      { userId: mikeId, jobId: "25173781-06ee-45b6-af24-416a08b28108", assignedDate: d("2026-05-05T00:00:00Z"), endDate: d("2026-05-06T00:00:00Z") },
      // Stanwell — second engagement, ongoing since 16 Jul, Mike + Sarah
      { userId: mikeId,  jobId: "c0390a2a-ff0a-4ea5-a814-b76d72dc46c0", assignedDate: d("2026-07-16T00:00:00Z"), endDate: d("2026-07-19T00:00:00Z") },
      { userId: sarahId, jobId: "c0390a2a-ff0a-4ea5-a814-b76d72dc46c0", assignedDate: d("2026-07-16T00:00:00Z"), endDate: d("2026-07-19T00:00:00Z") },
      // Capricorn Minerals — first job, upcoming 28 Jul, Jake
      { userId: jakeId, jobId: "56906a71-bfe9-47a6-95e0-918d524fb102", assignedDate: d("2026-07-28T00:00:00Z") },
    ],
  });
  console.log("  ✓ Assignments (19 across all jobs)");

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
      // Rio Tinto earlier inspection — Sarah 7.5h
      { userId: sarahId, jobId: "518fcc62-0409-4f47-960b-844b0732dcef", clockInTime: d("2026-05-20T07:00:00Z"), clockOutTime: d("2026-05-20T14:30:00Z"), durationMinutes: 450, status: "complete" },
      // Glencore contract-commencement service — Jake 9.5h + 9h, Mike 9h + 8.5h
      { userId: jakeId, jobId: "25173781-06ee-45b6-af24-416a08b28108", clockInTime: d("2026-05-05T07:00:00Z"), clockOutTime: d("2026-05-05T16:30:00Z"), durationMinutes: 570, status: "complete" },
      { userId: mikeId, jobId: "25173781-06ee-45b6-af24-416a08b28108", clockInTime: d("2026-05-05T07:00:00Z"), clockOutTime: d("2026-05-05T16:00:00Z"), durationMinutes: 540, status: "complete" },
      { userId: jakeId, jobId: "25173781-06ee-45b6-af24-416a08b28108", clockInTime: d("2026-05-06T07:00:00Z"), clockOutTime: d("2026-05-06T16:00:00Z"), durationMinutes: 540, status: "complete" },
      { userId: mikeId, jobId: "25173781-06ee-45b6-af24-416a08b28108", clockInTime: d("2026-05-06T07:00:00Z"), clockOutTime: d("2026-05-06T15:30:00Z"), durationMinutes: 510, status: "complete" },
      // Stanwell second engagement — Sarah day 1 complete (8h), Mike still clocked in (active)
      { userId: sarahId, jobId: "c0390a2a-ff0a-4ea5-a814-b76d72dc46c0", clockInTime: d("2026-07-16T07:00:00Z"), clockOutTime: d("2026-07-16T15:00:00Z"), durationMinutes: 480, status: "complete" },
      { userId: mikeId,  jobId: "c0390a2a-ff0a-4ea5-a814-b76d72dc46c0", clockInTime: d("2026-07-18T06:45:00Z"), clockOutTime: null, durationMinutes: null, status: "active" },
    ],
  });
  console.log("  ✓ Time entries (20 — Jake active on Glencore, Mike active on Stanwell)");

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
      // Rio Tinto earlier inspection — 1 approved ($260)
      {
        jobId: "518fcc62-0409-4f47-960b-844b0732dcef", technicianId: sarahId,
        description: "Re-torque loose access panel bolts — vibration noted during operation, panel was working loose",
        costEstimate: 260, status: "approved", directorDecision: "approved",
        decisionReason: "Approved — quick fix while on site.",
        submittedAt: d("2026-05-20T12:00:00Z"), decidedAt: d("2026-05-20T13:00:00Z"),
      },
      // Glencore contract-commencement service — 1 approved ($1,650)
      {
        jobId: "25173781-06ee-45b6-af24-416a08b28108", technicianId: mikeId,
        description: "Replace corroded drift eliminators — original units past service life, causing excess water carryover",
        costEstimate: 1650, status: "approved", directorDecision: "approved",
        decisionReason: "Approved — good to address at contract start.",
        submittedAt: d("2026-05-05T13:30:00Z"), decidedAt: d("2026-05-06T08:00:00Z"),
      },
      // Stanwell second engagement — 1 pending
      {
        jobId: "c0390a2a-ff0a-4ea5-a814-b76d72dc46c0", technicianId: mikeId,
        description: "Replace corroded access ladder rungs — 2 rungs show significant corrosion, fall risk",
        costEstimate: 540, status: "pending", directorDecision: null,
        decisionReason: null,
        submittedAt: d("2026-07-18T07:30:00Z"), decidedAt: null,
      },
    ],
  });
  console.log("  ✓ Variations (10: 6 approved, 1 rejected, 2 pending, 1 queried)");

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
      {
        jobId: "518fcc62-0409-4f47-960b-844b0732dcef",
        invoiceNumber: "INV-2026-0003",
        status: "paid",
        baseAmount: 1100,
        variationsTotal: 260,
        totalAmount: 1360,
        notes: null,
        sentAt: d("2026-05-25T02:00:00Z"),
        sentToEmail: "procurement@riotinto.com",
        paidAt: d("2026-06-03T04:00:00Z"),
      },
      {
        jobId: "25173781-06ee-45b6-af24-416a08b28108",
        invoiceNumber: "INV-2026-0004",
        status: "sent",
        baseAmount: 5300,
        variationsTotal: 1650,
        totalAmount: 6950,
        notes: "First invoice under the new quarterly contract.",
        sentAt: d("2026-05-10T02:00:00Z"),
        sentToEmail: "sitemaintenance@glencore.com.au",
        paidAt: null,
      },
    ],
  });
  console.log("  ✓ Invoices (5 — 2 paid, 2 sent, 1 draft)");

  // ─── Compliance templates ─────────────────────────────────────────────────
  // SWMS and WHS Management Plan get a minimal custom section — their real,
  // legally-mandated content is code-injected via getStatutorySections() in
  // src/lib/compliance/statutorySections.ts, never stored here. JSA and
  // Induction have no statutory core, so their full content lives here.
  // NOTE: `update` mirrors `create` on every one of these upserts (rather than
  // `update: {}`) so that re-running the seed script against a database that
  // already has these rows always brings them up to the current content —
  // an empty update object is a silent no-op that leaves stale data in place.
  const jsaSections = [
    { id: "jsa_details", title: "Job Details", fields: [
      { id: "jsa_task_description", label: "Task description", type: "textarea", required: true },
      { id: "jsa_location", label: "Location", type: "text", required: true },
      { id: "jsa_date", label: "Date", type: "date", required: true },
      { id: "jsa_prepared_by", label: "Prepared by", type: "text", required: true },
    ]},
    { id: "jsa_risk_assessment", title: "Risk Assessment", fields: [
      { id: "jsa_risk_table", label: "Task steps, hazards, and control measures", type: "table", required: true,
        columns: [
          { id: "step", label: "Task Step" },
          { id: "hazard", label: "Hazard" },
          { id: "risk_rating", label: "Risk Rating" },
          { id: "control", label: "Control Measure" },
        ] },
    ]},
    { id: "jsa_ppe", title: "PPE Required", fields: [
      { id: "jsa_ppe_checklist", label: "PPE required for this task", type: "checklist", required: false,
        options: ["Hard hat", "Safety glasses", "Gloves", "Hi-vis clothing", "Steel-cap boots", "Hearing protection", "Respiratory protection", "Fall-arrest harness"] },
    ]},
    { id: "jsa_signoff", title: "Sign-off", fields: [
      { id: "jsa_worker_signatures", label: "Workers involved", type: "signature-list", required: true },
      { id: "jsa_supervisor_signature", label: "Supervisor name & signature", type: "signature", required: false },
    ]},
  ];
  await db.complianceTemplate.upsert({
    where: { id: "seed-tmpl-jsa" },
    update: { name: "Job Safety Analysis (JSA)", type: "jsa", isActive: true, sections: jsaSections },
    create: { id: "seed-tmpl-jsa", name: "Job Safety Analysis (JSA)", type: "jsa", isActive: true, sections: jsaSections },
  });

  const swmsSections = [
    { id: "swms_notes", title: "Additional Notes", fields: [
      { id: "swms_additional_notes", label: "Additional site-specific notes (optional)", type: "textarea", required: false },
    ]},
  ];
  await db.complianceTemplate.upsert({
    where: { id: "seed-tmpl-swms" },
    update: { name: "Safe Work Method Statement (SWMS)", type: "swms", isActive: true, sections: swmsSections },
    create: { id: "seed-tmpl-swms", name: "Safe Work Method Statement (SWMS)", type: "swms", isActive: true, sections: swmsSections },
  });

  const whsmpSections = [
    { id: "whsmp_notes", title: "Additional Notes", fields: [
      { id: "whsmp_additional_notes", label: "Additional project-specific notes (optional)", type: "textarea", required: false },
    ]},
  ];
  await db.complianceTemplate.upsert({
    where: { id: "seed-tmpl-whsmp" },
    update: { name: "WHS Management Plan", type: "whs_management_plan", isActive: true, sections: whsmpSections },
    create: { id: "seed-tmpl-whsmp", name: "WHS Management Plan", type: "whs_management_plan", isActive: true, sections: whsmpSections },
  });

  const inductionSections = [
    { id: "induction_details", title: "Site Details", fields: [
      { id: "induction_site", label: "Site / location", type: "text", required: true },
      { id: "induction_date", label: "Date", type: "date", required: true },
      { id: "induction_conducted_by", label: "Person conducting induction", type: "text", required: true },
    ]},
    { id: "induction_topics", title: "Topics Covered", fields: [
      { id: "induction_topics_checklist", label: "Topics covered in this induction", type: "checklist", required: false,
        options: ["Site-specific hazards", "Emergency procedures & muster point", "Emergency contact numbers", "PPE requirements", "Amenities/facilities location", "Permit-to-work requirements", "Hazard/incident reporting procedure"] },
    ]},
    { id: "induction_ack", title: "Worker Acknowledgment", fields: [
      { id: "induction_attendee_signatures", label: "Attendees", type: "signature-list", required: true },
      { id: "induction_date_acknowledged", label: "Date acknowledged", type: "date", required: false },
    ]},
  ];
  await db.complianceTemplate.upsert({
    where: { id: "seed-tmpl-induction" },
    update: { name: "Site Safety Induction", type: "induction", isActive: true, sections: inductionSections },
    create: { id: "seed-tmpl-induction", name: "Site Safety Induction", type: "induction", isActive: true, sections: inductionSections },
  });
  console.log("  ✓ Compliance templates (JSA, SWMS, WHS Management Plan, Induction)");

  // ─── Compliance documents (submitted, not just templates) ─────────────────
  await db.complianceDocument.deleteMany({ where: { jobId: { in: SEED_JOB_IDS } } });

  await db.complianceDocument.createMany({
    data: [
      {
        jobId: "8d30c260-1f99-4280-af15-4c802866c526", templateId: "seed-tmpl-jsa", createdById: jakeId,
        values: {
          jsa_task_description: "Quarterly inspection of cooling tower fan assembly and fill media.",
          jsa_location: "Weipa Processing Plant — Fan Deck",
          jsa_date: "2026-06-10",
          jsa_prepared_by: "Jake Morrison",
          jsa_risk_table: [
            { step: "Isolate fan motor and lock out", hazard: "Electrical shock, unexpected start-up", risk_rating: "High", control: "LOTO applied, isolation tested before work begins" },
            { step: "Access fan deck via ladder", hazard: "Fall from height", risk_rating: "Medium", control: "3-point contact maintained, fall-arrest harness anchored" },
            { step: "Inspect and clean fill media", hazard: "Chemical exposure (biocide residue)", risk_rating: "Medium", control: "Chemical-resistant gloves and safety glasses worn" },
          ],
          jsa_ppe_checklist: ["Hard hat", "Safety glasses", "Gloves", "Fall-arrest harness"],
          jsa_worker_signatures: [{ name: "Jake Morrison", signature: "" }],
          jsa_supervisor_signature: "",
        },
        submittedAt: d("2026-06-10T06:45:00Z"),
      },
      {
        jobId: "c3f79548-f16b-4d32-b937-51cf7d42cb34", templateId: "seed-tmpl-swms", createdById: mikeId,
        values: {
          statutory_pcbu_name: "CT Field Ops Pty Ltd",
          statutory_pcbu_contact: "(07) 3123 4567",
          statutory_works_manager: "Tom Wilson",
          statutory_works_manager_phone: "0445 678 901",
          statutory_work_activity: "Quarterly inspection and chemical descaling of cooling tower heat exchanger.",
          statutory_workplace_location: "Terminal block C, ground level — Hay Point Coal Terminal",
          statutory_hrcw_confined_space: true,
          statutory_hrcw_chemical_lines: true,
          statutory_task_table: [
            { task: "Isolate and lock out chemical dosing lines", hazards: "Chemical exposure, electrical isolation failure", controls: "LOTO applied, PPE worn, isolation verified before work begins" },
            { task: "Descale heat exchanger", hazards: "Chemical exposure, confined space entry", controls: "Confined space permit, forced ventilation, continuous gas monitoring" },
          ],
          statutory_compliance_person: "Mike Davis",
          statutory_compliance_measures: "Daily toolbox talk and visual inspection of isolation points before work resumes each shift.",
          statutory_review_person: "Tom Wilson",
          statutory_review_method: "Reviewed at completion of each shift against actual site conditions.",
          statutory_review_date: "2026-06-22",
          statutory_worker_signatures: [{ name: "Mike Davis", signature: "" }],
        },
        submittedAt: d("2026-06-22T07:15:00Z"),
      },
      {
        jobId: "25173781-06ee-45b6-af24-416a08b28108", templateId: "seed-tmpl-whsmp", createdById: tomId,
        values: {
          statutory_client_name: "Glencore",
          statutory_whsmp_pc_name: "CT Field Ops Pty Ltd",
          statutory_major_subcontractors: "None — all works performed by CT Field Ops directly.",
          statutory_project_location: "Mt Isa Copper Operations, Processing Building West Wing",
          statutory_start_date: "2026-05-05",
          statutory_duration: "Ongoing — quarterly service contract",
          statutory_scope_of_works: "Quarterly cooling tower servicing, inspection, and minor component replacement under a 12-month maintenance contract.",
          statutory_responsible_persons_table: [
            { name: "Tom Wilson", position: "Service Manager", responsibility: "Overall WHS compliance for the contract" },
            { name: "Jake Morrison", position: "Lead Technician", responsibility: "Day-to-day site safety, toolbox talks" },
          ],
          statutory_consultation_arrangements: "Pre-start toolbox talk each site visit; site WHS issues raised directly with Glencore's site maintenance coordinator.",
          statutory_incident_management: "Any incident reported to Glencore site control room immediately and to CT Field Ops service manager within 1 hour, logged in the incident register.",
          statutory_site_rules: "Full PPE mandatory site-wide; sign in/out at site security; no isolation of plant without a permit signed by the Glencore shift supervisor.",
          statutory_pc_signature: "",
          statutory_pc_signature_date: "2026-05-05",
          statutory_review_provisions: "Reviewed at the start of each quarterly visit and after any incident or change in scope.",
          whsmp_additional_notes: "First visit under the new contract — see also the site induction completed by Glencore's HSE team on arrival.",
        },
        submittedAt: d("2026-05-05T06:30:00Z"),
      },
      {
        jobId: "c0390a2a-ff0a-4ea5-a814-b76d72dc46c0", templateId: "seed-tmpl-induction", createdById: mikeId,
        values: {
          induction_site: "Stanwell Power Station — Cooling Tower Bank 1",
          induction_date: "2026-07-16",
          induction_conducted_by: "Stanwell Site HSE Officer",
          induction_topics_checklist: ["Site-specific hazards", "Emergency procedures & muster point", "Emergency contact numbers", "PPE requirements", "Permit-to-work requirements"],
          induction_attendee_signatures: [
            { name: "Mike Davis", signature: "" },
            { name: "Sarah Chen", signature: "" },
          ],
          induction_date_acknowledged: "2026-07-16",
        },
        submittedAt: d("2026-07-16T06:15:00Z"),
      },
      {
        jobId: "518fcc62-0409-4f47-960b-844b0732dcef", templateId: "seed-tmpl-jsa", createdById: sarahId,
        values: {
          jsa_task_description: "Quarterly inspection and access panel re-torque on cooling tower structure.",
          jsa_location: "Weipa Processing Plant — Fan Deck",
          jsa_date: "2026-05-20",
          jsa_prepared_by: "Sarah Chen",
          jsa_risk_table: [
            { step: "Access fan deck via ladder", hazard: "Fall from height", risk_rating: "Medium", control: "3-point contact maintained, fall-arrest harness anchored" },
            { step: "Re-torque access panel bolts", hazard: "Pinch points, dropped tools", risk_rating: "Low", control: "Tool lanyards used, gloves worn" },
          ],
          jsa_ppe_checklist: ["Hard hat", "Safety glasses", "Gloves", "Fall-arrest harness"],
          jsa_worker_signatures: [{ name: "Sarah Chen", signature: "" }],
          jsa_supervisor_signature: "",
        },
        submittedAt: d("2026-05-20T06:30:00Z"),
      },
    ],
  });
  console.log("  ✓ Compliance documents (5 submitted — JSA×2, SWMS, WHS Management Plan, Induction — all 4 types represented)");

  // ─── Job communications (Phase 3 batch a) ─────────────────────────────────
  // DocumentChunk rows for these communications must be cleared first —
  // jobCommunication.deleteMany + createMany assigns fresh random ids each
  // run, so any previously-indexed chunk would otherwise become permanently
  // orphaned (pointing at a sourceId that no longer exists), polluting
  // semantic search with stale, unreachable results.
  await db.documentChunk.deleteMany({ where: { jobId: { in: SEED_JOB_IDS }, sourceType: "JobCommunication" } });
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
      {
        jobId: "b2024ae1-ec76-4dde-8a7c-952726c63970", authorId: tomId, type: "client_call",
        body: "Craig Ferris called to cancel — BHP's own maintenance crew resolved the issue internally before we could attend. No callout fee charged.",
        createdAt: d("2026-06-15T04:00:00Z"),
      },
      {
        jobId: "25173781-06ee-45b6-af24-416a08b28108", authorId: tomId, type: "internal_note",
        body: "First visit under the new quarterly contract went smoothly. Naomi at Glencore mentioned they may want to add a second tower to the contract scope — follow up next quarter.",
        createdAt: d("2026-05-06T05:00:00Z"),
      },
      {
        jobId: "c0390a2a-ff0a-4ea5-a814-b76d72dc46c0", authorId: tomId, type: "field_instruction",
        body: "Ladder rung variation is pending approval — do not use the affected ladder section until it's signed off, use the alternate access stair instead.",
        createdAt: d("2026-07-18T07:45:00Z"),
      },
      {
        jobId: "56906a71-bfe9-47a6-95e0-918d524fb102", authorId: tomId, type: "client_call",
        body: "Naomi Falk confirmed site access for the 28th — Jake to bring his own PPE, Capricorn doesn't stock visitor gear yet.",
        createdAt: d("2026-07-17T05:30:00Z"),
      },
    ],
  });
  console.log("  ✓ Job communications (9 across 6 jobs — client calls, internal notes, field instructions)");

  // ─── Voice notes ────────────────────────────────────────────────────────────
  // Reuses real audio recordings already sitting in Blob storage from earlier
  // manual testing (never referenced by a DB row until now) rather than
  // uploading new placeholder files — so playback in the UI actually works.
  // Same orphaned-embedding risk as job communications above: clear any
  // DocumentChunk pointing at a voice note this cleanup is about to remove.
  await db.documentChunk.deleteMany({ where: { jobId: { in: SEED_JOB_IDS }, sourceType: "VoiceNote" } });
  await db.voiceNotePhoto.deleteMany({ where: { voiceNote: { jobId: { in: SEED_JOB_IDS } } } });
  await db.voiceNote.deleteMany({ where: { jobId: { in: SEED_JOB_IDS } } });

  const voiceNotes = [
    {
      id: "seed-vn-riotinto2", jobId: "518fcc62-0409-4f47-960b-844b0732dcef", technicianId: sarahId,
      audioUrl: "https://fcklf2vxlrwgthln.private.blob.vercel-storage.com/voice-notes/f5b67a7d-5c61-4404-8ce9-c52ac3af77fa/1783558714816.webm",
      durationSeconds: 35,
      transcript: "Quick note on the Rio Tinto inspection — found the access panel bolts on the north tower were working loose, probably from vibration. Re-torqued them and logged a variation. Otherwise fan assembly and fill media look good for this quarter, no other concerns.",
      summary: "Access panel bolts re-torqued on north tower after vibration loosening — variation logged. Fan and fill media otherwise in good condition.",
      actionItems: ["Monitor access panel bolts next visit for re-loosening"],
      status: "transcribed" as const,
    },
    {
      id: "seed-vn-glencore2", jobId: "25173781-06ee-45b6-af24-416a08b28108", technicianId: jakeId,
      audioUrl: "https://fcklf2vxlrwgthln.private.blob.vercel-storage.com/voice-notes/f5b67a7d-5c61-4404-8ce9-c52ac3af77fa/1783562159680.webm",
      durationSeconds: 78,
      transcript: "First visit under the new Glencore contract, west wing tower. Drift eliminators are badly corroded, well past service life — logged a variation for a full replacement set, Mike's got the quote ready. Water distribution looks even across the deck, no blockages. Basin's clean, no debris buildup. Overall the tower's been under-maintained for a while but nothing else urgent today. Naomi from Glencore mentioned they might want to bring a second tower onto the contract next quarter, worth following up.",
      summary: "Drift eliminators corroded and replaced under variation. Basin and water distribution in good condition. Customer may expand contract to a second tower — follow up next quarter.",
      actionItems: ["Follow up with Glencore about adding a second tower to the contract"],
      status: "transcribed" as const,
    },
    {
      id: "seed-vn-glencore-active", jobId: "1e8e4c27-feb5-47fa-811b-d68bc2b3c8a6", technicianId: jakeId,
      audioUrl: "https://fcklf2vxlrwgthln.private.blob.vercel-storage.com/voice-notes/f5b67a7d-5c61-4404-8ce9-c52ac3af77fa/1783601705862.webm",
      durationSeconds: 420,
      transcript: "Day two on the Glencore annual service. Tower 3 fan belt is definitely on its way out, cracking and glazing right across it — put a variation in yesterday, waiting on approval before we touch it, so we've capped that tower at 60% load for now per Tom's instruction. Tower 1 float valve is leaking too, Tom's asked for a photo before he signs off the variation, I'll grab that this afternoon. Everything else on the mechanical side is tracking fine, motors are running within spec, no unusual noise or vibration on towers 1 and 2. Sarah's finishing up the water treatment log now. We should be done and clocked off by tomorrow arvo if the parts for tower 3 show up on time.",
      summary: "Tower 3 fan belt replacement pending variation approval, load capped at 60% in the meantime. Tower 1 float valve leak — photo required before variation approval. Towers 1 and 2 mechanically sound. On track to finish tomorrow afternoon.",
      actionItems: ["Photograph Tower 1 float valve leak for variation approval", "Confirm Tower 3 fan belt delivery"],
      status: "transcribed" as const,
    },
    {
      id: "seed-vn-stanwell2", jobId: "c0390a2a-ff0a-4ea5-a814-b76d72dc46c0", technicianId: mikeId,
      audioUrl: "https://fcklf2vxlrwgthln.private.blob.vercel-storage.com/voice-notes/f5b67a7d-5c61-4404-8ce9-c52ac3af77fa/1783601776952.webm",
      durationSeconds: 200,
      transcript: "Stanwell annual service, second day. Found two rungs on the north access ladder with significant corrosion, flagged it as a fall risk and put a variation in this morning — using the alternate stair in the meantime, told the site HSE officer so it's on their radar too. Rest of the tower's in decent shape for its age. Sarah's about to start on the water treatment checks, I'll keep going on the mechanical inspection.",
      summary: "Corroded access ladder rungs identified as a fall risk — variation submitted, alternate access in use, site HSE notified. Tower otherwise in reasonable condition.",
      actionItems: ["Await variation approval for ladder rung replacement"],
      status: "transcribed" as const,
    },
  ];

  for (const vn of voiceNotes) {
    await db.voiceNote.upsert({ where: { id: vn.id }, update: vn, create: vn });
  }

  // Index a couple of transcripts for semantic search — same real embedding
  // pipeline the app uses for genuine voice notes (src/lib/ai/semanticSearch.ts),
  // so the AI assistant's "search notes" feature has real, findable content.
  await indexDocument("VoiceNote", "seed-vn-glencore2", "25173781-06ee-45b6-af24-416a08b28108", voiceNotes[1].transcript);
  await indexDocument("VoiceNote", "seed-vn-glencore-active", "1e8e4c27-feb5-47fa-811b-d68bc2b3c8a6", voiceNotes[2].transcript);
  console.log("  ✓ Voice notes (4, reusing real recordings — 2 indexed for semantic search)");

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
      {
        jobId: "25173781-06ee-45b6-af24-416a08b28108", createdById: jakeId,
        description: "Replacement drift eliminator set", supplierName: "CoolTower Parts Co",
        quantity: 1, estimatedCost: 1580, actualCost: 1650, status: "reconciled",
        createdAt: d("2026-05-05T13:45:00Z"), reconciledAt: d("2026-05-09T02:00:00Z"),
      },
      {
        jobId: "c0390a2a-ff0a-4ea5-a814-b76d72dc46c0", createdById: mikeId,
        description: "Access ladder rung set (galvanised)", supplierName: null,
        quantity: 2, estimatedCost: 260, status: "pending",
        createdAt: d("2026-07-18T07:35:00Z"),
      },
    ],
  });
  console.log("  ✓ Material entries (7 — reconciled, pending, and received across 5 jobs)");

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
    {
      id: "1b32b1f8-8852-4c03-9598-dd3a4830a7f8", createdById: tomId,
      customerId: "e57c9861-0db7-4093-b449-267915c90ec3",
      customerName: "Capricorn Minerals Ltd", siteName: "Boyne Island Site", jobType: "Initial Site Assessment",
      lineItems: [
        { description: "Site assessment — 10 hrs", qty: 10, unitPrice: 145 },
        { description: "Travel", qty: 1, unitPrice: 210 },
      ],
      totalAmount: 1660, status: "accepted" as const, validUntil: d("2026-08-15T00:00:00Z"),
    },
  ];
  for (const q of quotes) {
    await db.quote.upsert({ where: { id: q.id }, update: q, create: q });
  }
  console.log("  ✓ Quotes (5 — draft, sent, accepted×2, declined)");

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
  console.log("\n🔐 Real OAuth logins:");
  console.log("   Google (your gmail)  → matches the existing lukeherod7@gmail.com account above by email — no seed change needed.");
  console.log("   GitHub                → first sign-in auto-creates a new user via the Clerk webhook, role defaults");
  console.log("                            to technician, name is pulled from your GitHub profile. Nothing to seed —");
  console.log("                            just sign in once, then change the role in /team if it doesn't come through as \"Luke Herod\".");
  console.log("\n📋 Jobs (11 — 5 complete, 2 active, 3 scheduled, 1 cancelled), spanning 5 May – 28 Jul:");
  console.log("   COMPLETE  — Rio Tinto Weipa Annual Service      (10 Jun) → INV-2026-0001 PAID  $8,900");
  console.log("   COMPLETE  — Rio Tinto Weipa Quarterly Insp.     (20 May) → INV-2026-0003 PAID  $1,360");
  console.log("   COMPLETE  — BHP Hay Point Quarterly Inspection  (22 Jun) → INV-2026-0002 SENT  $3,363");
  console.log("   CANCELLED — BHP Hay Point Emergency Repair      (15 Jun) → cancelled by customer, no charge");
  console.log("   COMPLETE  — Stanwell Power Station Emergency    (1 Jul)  → Draft invoice        $480");
  console.log("   COMPLETE  — Glencore Mt Isa contract-start visit (5 May) → INV-2026-0004 SENT  $6,950");
  console.log("   ACTIVE    — Glencore Mt Isa Annual Service      (7 Jul)  → Jake clocked in now");
  console.log("   ACTIVE    — Stanwell Power Station 2nd visit    (16 Jul) → Mike clocked in now");
  console.log("   SCHEDULED — Incitec Pivot Gibson Island         → Thu 10 Jul");
  console.log("   SCHEDULED — Queensland Alumina Gladstone        → Mon 14 Jul");
  console.log("   SCHEDULED — Capricorn Minerals Boyne Island     → Tue 28 Jul (new customer, first job)");
  console.log("\n🆕 Full feature coverage:");
  console.log("   Communication log  — 9 entries across 6 jobs");
  console.log("   Voice notes        — 4 (reusing real recordings), 2 indexed for semantic search");
  console.log("   Compliance docs    — 5 submitted, all 4 types represented (JSA×2, SWMS, WHS Mgmt Plan, Induction)");
  console.log("   Assets             — 4 cooling towers, linked to service history");
  console.log("   Job costing        — 7 material entries (reconciled/received/pending)");
  console.log("   Quotes             — 5 (draft, sent, accepted×2, declined) at /quotes");
  console.log("   Contracts          — 3 (Rio Tinto renews ~1 week out, BHP lapsed, Glencore linked to its active job)");
  console.log("   Customers          — 7 (added Capricorn Minerals as a new/first-job customer)");
  console.log("   Customer portal    — http://localhost:3000/portal/demo-portal-token-riotinto");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => db.$disconnect());
