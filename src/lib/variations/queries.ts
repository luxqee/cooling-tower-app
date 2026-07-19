import { db } from "@/lib/db/client";

/** Pending variations awaiting a director/admin decision, with technician and job context. */
export async function getPendingVariations(opts?: { order?: "asc" | "desc"; take?: number }) {
  return db.variation.findMany({
    where: { status: "pending" },
    include: {
      technician: { select: { name: true } },
      job: { select: { id: true, customerName: true, siteName: true } },
    },
    orderBy: { submittedAt: opts?.order ?? "asc" },
    ...(opts?.take ? { take: opts.take } : {}),
  });
}
