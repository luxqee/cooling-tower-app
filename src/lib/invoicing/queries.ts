import { db } from "@/lib/db/client";

/** All invoices with their job context, newest first. */
export async function getAllInvoicesWithJob(opts?: { take?: number }) {
  return db.invoice.findMany({
    include: {
      job: { select: { id: true, customerName: true, siteName: true, jobType: true } },
    },
    orderBy: { createdAt: "desc" },
    ...(opts?.take ? { take: opts.take } : {}),
  });
}
