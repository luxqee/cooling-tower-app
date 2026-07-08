import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
const db = new PrismaClient({ adapter });

// All dates relative to demo baseline of 2026-07-08 (today)
const d = (iso: string) => new Date(iso);

async function main() {
  console.log("🌱 Seeding demo data...");

  // ─── Business profile ─────────────────────────────────────────────────────
  await db.businessProfile.upsert({
    where: { id: "seed-business-profile" },
    update: {},
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

  // ─── Users ────────────────────────────────────────────────────────────────
  const users = [
    {
      id: "seed-user-jake",
      clerkId: "user_seed_jake_morrison",
      name: "Jake Morrison",
      email: "jake.morrison@ctfieldops.com.au",
      phone: "0412 345 678",
      role: "technician" as const,
    },
    {
      id: "seed-user-sarah",
      clerkId: "user_seed_sarah_chen",
      name: "Sarah Chen",
      email: "sarah.chen@ctfieldops.com.au",
      phone: "0423 456 789",
      role: "technician" as const,
    },
    {
      id: "seed-user-mike",
      clerkId: "user_seed_mike_davis",
      name: "Mike Davis",
      email: "mike.davis@ctfieldops.com.au",
      phone: "0434 567 890",
      role: "technician" as const,
    },
    {
      id: "seed-user-tom",
      clerkId: "user_seed_tom_wilson",
      name: "Tom Wilson",
      email: "tom.wilson@ctfieldops.com.au",
      phone: "0445 678 901",
      role: "service_manager" as const,
    },
  ];

  for (const u of users) {
    await db.user.upsert({ where: { id: u.id }, update: {}, create: u });
  }
  console.log("  ✓ Users (Jake, Sarah, Mike, Tom)");

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
    await db.job.upsert({ where: { id: j.id }, update: {}, create: j });
  }
  console.log("  ✓ Jobs (6 jobs: 3 complete, 1 active, 2 scheduled)");

  // ─── Assignments ──────────────────────────────────────────────────────────
  const assignments = [
    // Rio Tinto — 2 days, 3 techs
    { id: "seed-asgn-rt-jake-d1", userId: "seed-user-jake", jobId: "seed-job-riotinto", assignedDate: d("2026-06-10T00:00:00Z"), endDate: d("2026-06-11T00:00:00Z") },
    { id: "seed-asgn-rt-sarah-d1", userId: "seed-user-sarah", jobId: "seed-job-riotinto", assignedDate: d("2026-06-10T00:00:00Z"), endDate: d("2026-06-11T00:00:00Z") },
    { id: "seed-asgn-rt-mike-d1", userId: "seed-user-mike", jobId: "seed-job-riotinto", assignedDate: d("2026-06-10T00:00:00Z"), endDate: null },
    // BHP — 1 day, 2 techs
    { id: "seed-asgn-bhp-jake", userId: "seed-user-jake", jobId: "seed-job-bhp", assignedDate: d("2026-06-22T00:00:00Z"), endDate: null },
    { id: "seed-asgn-bhp-mike", userId: "seed-user-mike", jobId: "seed-job-bhp", assignedDate: d("2026-06-22T00:00:00Z"), endDate: null },
    // Stanwell — 1 day, 1 tech
    { id: "seed-asgn-stanwell-mike", userId: "seed-user-mike", jobId: "seed-job-stanwell", assignedDate: d("2026-07-01T00:00:00Z"), endDate: null },
    // Glencore — 3 days, 2 techs (active now)
    { id: "seed-asgn-glencore-jake", userId: "seed-user-jake", jobId: "seed-job-glencore", assignedDate: d("2026-07-07T00:00:00Z"), endDate: d("2026-07-09T00:00:00Z") },
    { id: "seed-asgn-glencore-sarah", userId: "seed-user-sarah", jobId: "seed-job-glencore", assignedDate: d("2026-07-07T00:00:00Z"), endDate: d("2026-07-08T00:00:00Z") },
    // Incitec — upcoming
    { id: "seed-asgn-incitec-sarah", userId: "seed-user-sarah", jobId: "seed-job-incitec", assignedDate: d("2026-07-10T00:00:00Z"), endDate: null },
    { id: "seed-asgn-incitec-mike", userId: "seed-user-mike", jobId: "seed-job-incitec", assignedDate: d("2026-07-10T00:00:00Z"), endDate: null },
    // QAL — upcoming
    { id: "seed-asgn-qal-jake", userId: "seed-user-jake", jobId: "seed-job-qal", assignedDate: d("2026-07-14T00:00:00Z"), endDate: d("2026-07-15T00:00:00Z") },
    { id: "seed-asgn-qal-mike", userId: "seed-user-mike", jobId: "seed-job-qal", assignedDate: d("2026-07-14T00:00:00Z"), endDate: d("2026-07-15T00:00:00Z") },
  ];

  for (const a of assignments) {
    await db.assignment.upsert({ where: { id: a.id }, update: {}, create: a });
  }
  console.log("  ✓ Assignments (12 assignments across all jobs)");

  // ─── Time entries ─────────────────────────────────────────────────────────
  const timeEntries = [
    // Rio Tinto — day 1 (Jake 10.5h, Sarah 9.5h, Mike 8.5h)
    { id: "seed-te-rt-jake-d1", userId: "seed-user-jake", jobId: "seed-job-riotinto", clockInTime: d("2026-06-10T07:00:00Z"), clockOutTime: d("2026-06-10T17:30:00Z"), durationMinutes: 630, status: "complete" as const },
    { id: "seed-te-rt-sarah-d1", userId: "seed-user-sarah", jobId: "seed-job-riotinto", clockInTime: d("2026-06-10T07:00:00Z"), clockOutTime: d("2026-06-10T16:30:00Z"), durationMinutes: 570, status: "complete" as const },
    { id: "seed-te-rt-mike-d1", userId: "seed-user-mike", jobId: "seed-job-riotinto", clockInTime: d("2026-06-10T07:00:00Z"), clockOutTime: d("2026-06-10T15:30:00Z"), durationMinutes: 510, status: "complete" as const },
    // Rio Tinto — day 2 (Jake 9h, Sarah 8.5h)
    { id: "seed-te-rt-jake-d2", userId: "seed-user-jake", jobId: "seed-job-riotinto", clockInTime: d("2026-06-11T07:00:00Z"), clockOutTime: d("2026-06-11T16:00:00Z"), durationMinutes: 540, status: "complete" as const },
    { id: "seed-te-rt-sarah-d2", userId: "seed-user-sarah", jobId: "seed-job-riotinto", clockInTime: d("2026-06-11T07:00:00Z"), clockOutTime: d("2026-06-11T15:30:00Z"), durationMinutes: 510, status: "complete" as const },
    // BHP — day 1 (Jake 9.5h, Mike 9h)
    { id: "seed-te-bhp-jake", userId: "seed-user-jake", jobId: "seed-job-bhp", clockInTime: d("2026-06-22T07:30:00Z"), clockOutTime: d("2026-06-22T17:00:00Z"), durationMinutes: 570, status: "complete" as const },
    { id: "seed-te-bhp-mike", userId: "seed-user-mike", jobId: "seed-job-bhp", clockInTime: d("2026-06-22T07:30:00Z"), clockOutTime: d("2026-06-22T16:30:00Z"), durationMinutes: 540, status: "complete" as const },
    // Stanwell — (Mike 6.5h)
    { id: "seed-te-stanwell-mike", userId: "seed-user-mike", jobId: "seed-job-stanwell", clockInTime: d("2026-07-01T08:00:00Z"), clockOutTime: d("2026-07-01T14:30:00Z"), durationMinutes: 390, status: "complete" as const },
    // Glencore — day 1 complete (Jake 10h, Sarah 9.5h)
    { id: "seed-te-glencore-jake-d1", userId: "seed-user-jake", jobId: "seed-job-glencore", clockInTime: d("2026-07-07T07:00:00Z"), clockOutTime: d("2026-07-07T17:00:00Z"), durationMinutes: 600, status: "complete" as const },
    { id: "seed-te-glencore-sarah-d1", userId: "seed-user-sarah", jobId: "seed-job-glencore", clockInTime: d("2026-07-07T07:00:00Z"), clockOutTime: d("2026-07-07T16:30:00Z"), durationMinutes: 570, status: "complete" as const },
    // Glencore — day 2: Sarah complete (8.5h), Jake still clocked in (active)
    { id: "seed-te-glencore-sarah-d2", userId: "seed-user-sarah", jobId: "seed-job-glencore", clockInTime: d("2026-07-08T07:00:00Z"), clockOutTime: d("2026-07-08T15:30:00Z"), durationMinutes: 510, status: "complete" as const },
    { id: "seed-te-glencore-jake-d2", userId: "seed-user-jake", jobId: "seed-job-glencore", clockInTime: d("2026-07-08T07:00:00Z"), clockOutTime: null, durationMinutes: null, status: "active" as const },
  ];

  for (const te of timeEntries) {
    await db.timeEntry.upsert({ where: { id: te.id }, update: {}, create: te });
  }
  console.log("  ✓ Time entries (12 entries — Jake active on Glencore)");

  // ─── Variations ───────────────────────────────────────────────────────────
  // Rio Tinto: approved $1,400 + $800, rejected $2,200 → variationsTotal = $2,200
  // BHP: approved $680 → variationsTotal = $680
  // Stanwell: approved $480 → variationsTotal = $480
  // Glencore: pending $320, queried $450

  const variations = [
    // Rio Tinto — 2 approved, 1 rejected
    {
      id: "seed-var-rt-1",
      jobId: "seed-job-riotinto",
      technicianId: "seed-user-jake",
      description: "Replace Level 2 fill packs — deteriorated beyond service life, causing up to 20% efficiency loss",
      costEstimate: 1400,
      status: "approved" as const,
      directorDecision: "approved" as const,
      decisionReason: "Approved — critical for thermal efficiency. Order immediately.",
      submittedAt: d("2026-06-10T14:00:00Z"),
      decidedAt: d("2026-06-12T09:00:00Z"),
    },
    {
      id: "seed-var-rt-2",
      jobId: "seed-job-riotinto",
      technicianId: "seed-user-sarah",
      description: "Replace water distribution nozzles — 6 nozzles blocked, uneven water distribution across tower",
      costEstimate: 800,
      status: "approved" as const,
      directorDecision: "approved" as const,
      decisionReason: "Approved.",
      submittedAt: d("2026-06-10T15:30:00Z"),
      decidedAt: d("2026-06-12T09:05:00Z"),
    },
    {
      id: "seed-var-rt-3",
      jobId: "seed-job-riotinto",
      technicianId: "seed-user-sarah",
      description: "Replace basin liner — minor cracking noted at south-west corner, could develop into leak",
      costEstimate: 2200,
      status: "rejected" as const,
      directorDecision: "rejected" as const,
      decisionReason: "Defer to next annual service — non-urgent at this stage. Monitor over coming months.",
      submittedAt: d("2026-06-11T11:00:00Z"),
      decidedAt: d("2026-06-12T09:10:00Z"),
    },
    // BHP — 1 approved
    {
      id: "seed-var-bhp-1",
      jobId: "seed-job-bhp",
      technicianId: "seed-user-mike",
      description: "Chemical descaling treatment required — significant scale buildup on heat exchanger reducing flow rate by approx 30%",
      costEstimate: 680,
      status: "approved" as const,
      directorDecision: "approved" as const,
      decisionReason: "Approved — proceed immediately.",
      submittedAt: d("2026-06-22T13:00:00Z"),
      decidedAt: d("2026-06-23T08:30:00Z"),
    },
    // Stanwell — 1 approved
    {
      id: "seed-var-stanwell-1",
      jobId: "seed-job-stanwell",
      technicianId: "seed-user-mike",
      description: "Replace pump bearing — seized, causing vibration and risk of pump failure. Bearing on hand.",
      costEstimate: 480,
      status: "approved" as const,
      directorDecision: "approved" as const,
      decisionReason: "Approved — safety critical.",
      submittedAt: d("2026-07-01T09:30:00Z"),
      decidedAt: d("2026-07-01T10:00:00Z"),
    },
    // Glencore — 1 pending, 1 queried
    {
      id: "seed-var-glencore-1",
      jobId: "seed-job-glencore",
      technicianId: "seed-user-jake",
      description: "Replace fan belt on Tower 3 — showing visible cracking and glazing, risk of snap under load",
      costEstimate: 320,
      status: "pending" as const,
      directorDecision: null,
      decisionReason: null,
      submittedAt: d("2026-07-07T15:00:00Z"),
      decidedAt: null,
    },
    {
      id: "seed-var-glencore-2",
      jobId: "seed-job-glencore",
      technicianId: "seed-user-sarah",
      description: "Replace float valve assembly on Tower 1 — leaking, causing overflow and water loss",
      costEstimate: 450,
      status: "queried" as const,
      directorDecision: "queried" as const,
      decisionReason: "Please provide a photo of the damage before I approve — need to confirm it's the valve and not the inlet pipe.",
      submittedAt: d("2026-07-07T16:00:00Z"),
      decidedAt: d("2026-07-08T08:00:00Z"),
    },
  ];

  for (const v of variations) {
    await db.variation.upsert({ where: { id: v.id }, update: {}, create: v });
  }
  console.log("  ✓ Variations (7: 4 approved, 1 rejected, 1 pending, 1 queried)");

  // ─── Invoices ─────────────────────────────────────────────────────────────
  // Rio Tinto: actual 46h × $145 = $6,670 → director set $6,700 + variations $2,200 = $8,900 PAID
  // BHP: actual 18.5h × $145 = $2,682.50 → $2,683 + $680 = $3,363 SENT
  // Stanwell: draft — director hasn't set labour yet, but variation $480 is in
  // Glencore: no invoice (no approved variations yet)

  const invoices = [
    {
      id: "seed-inv-riotinto",
      jobId: "seed-job-riotinto",
      invoiceNumber: "INV-2026-0001",
      status: "paid" as const,
      baseAmount: 6700,
      variationsTotal: 2200,
      totalAmount: 8900,
      notes: "Annual service completed ahead of schedule. All defects resolved.",
      sentAt: d("2026-06-15T02:00:00Z"),
      sentToEmail: "procurement@riotinto.com",
      paidAt: d("2026-06-28T04:00:00Z"),
    },
    {
      id: "seed-inv-bhp",
      jobId: "seed-job-bhp",
      invoiceNumber: "INV-2026-0002",
      status: "sent" as const,
      baseAmount: 2683,
      variationsTotal: 680,
      totalAmount: 3363,
      notes: null,
      sentAt: d("2026-06-25T01:30:00Z"),
      sentToEmail: "maintenance.accounts@bhp.com",
      paidAt: null,
    },
    {
      id: "seed-inv-stanwell",
      jobId: "seed-job-stanwell",
      invoiceNumber: null,
      status: "draft" as const,
      baseAmount: 0,
      variationsTotal: 480,
      totalAmount: 480,
      notes: null,
      sentAt: null,
      sentToEmail: null,
      paidAt: null,
    },
  ];

  for (const inv of invoices) {
    await db.invoice.upsert({ where: { id: inv.id }, update: {}, create: inv });
  }
  console.log("  ✓ Invoices (INV-2026-0001 paid, INV-2026-0002 sent, Stanwell draft)");

  // ─── Compliance template ──────────────────────────────────────────────────
  await db.complianceTemplate.upsert({
    where: { id: "seed-tmpl-jsa" },
    update: {},
    create: {
      id: "seed-tmpl-jsa",
      name: "Job Safety Analysis (JSA)",
      type: "JSA",
      isActive: true,
      sections: [
        {
          id: "hazards",
          title: "Hazard Identification",
          fields: [
            { id: "working_at_height", label: "Working at height", type: "checkbox" },
            { id: "electrical_hazards", label: "Electrical hazards present", type: "checkbox" },
            { id: "chemical_exposure", label: "Chemical exposure risk", type: "checkbox" },
            { id: "confined_space", label: "Confined space entry", type: "checkbox" },
          ],
        },
        {
          id: "ppe",
          title: "PPE Required",
          fields: [
            { id: "hard_hat", label: "Hard hat", type: "checkbox" },
            { id: "safety_glasses", label: "Safety glasses", type: "checkbox" },
            { id: "gloves", label: "Chemical resistant gloves", type: "checkbox" },
            { id: "harness", label: "Fall arrest harness", type: "checkbox" },
          ],
        },
        {
          id: "sign_off",
          title: "Sign Off",
          fields: [
            { id: "site_briefing", label: "Site safety briefing completed", type: "checkbox" },
            { id: "supervisor_name", label: "Site supervisor name", type: "text" },
            { id: "emergency_contact", label: "Emergency contact number", type: "text" },
          ],
        },
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
        {
          id: "scope",
          title: "Scope of Work",
          fields: [
            { id: "work_description", label: "Description of work", type: "textarea" },
            { id: "location", label: "Exact work location", type: "text" },
            { id: "estimated_duration", label: "Estimated duration (hours)", type: "text" },
          ],
        },
        {
          id: "controls",
          title: "Risk Controls",
          fields: [
            { id: "permit_obtained", label: "Permit to work obtained", type: "checkbox" },
            { id: "isolation_complete", label: "Electrical isolation complete", type: "checkbox" },
            { id: "lockout_tagout", label: "Lockout/tagout applied", type: "checkbox" },
          ],
        },
      ],
    },
  });
  console.log("  ✓ Compliance templates (JSA, SWMS)");

  console.log("\n✅ Demo seed complete!");
  console.log("\n📋 Summary:");
  console.log("   Business: CT Field Ops Pty Ltd — $145/hr — Net 14 days");
  console.log("   Users: Jake Morrison, Sarah Chen, Mike Davis, Tom Wilson");
  console.log("   Jobs:");
  console.log("     ✓ COMPLETE — Rio Tinto Weipa (Annual Service)");
  console.log("     ✓ COMPLETE — BHP Hay Point (Quarterly Inspection)");
  console.log("     ✓ COMPLETE — Stanwell Power Station (Emergency Repair)");
  console.log("     ⚡ ACTIVE   — Glencore Mt Isa (Annual Service) — Jake clocked in");
  console.log("     📅 SCHEDULED — Incitec Pivot Gibson Island (Thu 10 Jul)");
  console.log("     📅 SCHEDULED — Queensland Alumina Gladstone (Mon 14 Jul)");
  console.log("   Invoices:");
  console.log("     INV-2026-0001 — Rio Tinto — $8,900 — PAID ✅");
  console.log("     INV-2026-0002 — BHP — $3,363 — SENT 📧");
  console.log("     (draft) — Stanwell — $480 — DRAFT ✏️");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => db.$disconnect());
