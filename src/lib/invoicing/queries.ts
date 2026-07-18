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

/** Invoices sent but not yet paid — oldest first (longest overdue surfaces first). */
export async function getUnpaidInvoices(opts?: { take?: number }) {
  return db.invoice.findMany({
    where: { status: "sent" },
    include: {
      job: { select: { customerName: true, siteName: true } },
    },
    orderBy: { sentAt: "asc" },
    ...(opts?.take ? { take: opts.take } : {}),
  });
}
