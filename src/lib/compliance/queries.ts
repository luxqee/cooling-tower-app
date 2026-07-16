import { db } from "@/lib/db/client";

interface CallingUser {
  id: string;
  role: string;
}

/**
 * Compliance documents this user may see: technicians see only documents on
 * jobs they're assigned to; every other role sees all documents company-wide.
 */
export async function getComplianceDocumentsForUser(user: CallingUser) {
  let where;
  if (user.role === "technician") {
    const assignments = await db.assignment.findMany({ where: { userId: user.id } });
    where = { jobId: { in: assignments.map((a) => a.jobId) } };
  }

  return db.complianceDocument.findMany({
    where,
    include: {
      template: { select: { name: true, type: true } },
      job: { select: { customerName: true, siteName: true } },
      createdBy: { select: { name: true } },
    },
    orderBy: { submittedAt: "desc" },
    take: 200,
  });
}
