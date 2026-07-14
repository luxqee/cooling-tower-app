export type Status =
  | "scheduled" | "active" | "complete" | "cancelled"      // JobStatus
  | "pending" | "approved" | "rejected" | "queried"        // VariationStatus (pending shared with others below)
  | "draft" | "sent" | "paid"                               // InvoiceStatus
  | "received" | "reconciled"                                // MaterialEntryStatus (pending shared)
  | "accepted" | "declined"                                  // QuoteStatus (draft/sent shared)
  | "lapsed"                                                 // ContractStatus (active/cancelled shared)
  | "transcribed" | "failed" | "awaiting_review";            // VoiceNoteStatus (pending shared)

export const STATUS_STYLES: Record<Status, string> = {
  scheduled: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
  pending: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
  draft: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",

  active: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300",
  sent: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300",
  queried: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300",
  received: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300",
  awaiting_review: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300",

  complete: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300",
  approved: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300",
  paid: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300",
  accepted: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300",
  reconciled: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300",
  transcribed: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300",

  cancelled: "bg-red-100 text-red-600 dark:bg-red-900 dark:text-red-400",
  rejected: "bg-red-100 text-red-600 dark:bg-red-900 dark:text-red-400",
  declined: "bg-red-100 text-red-600 dark:bg-red-900 dark:text-red-400",
  failed: "bg-red-100 text-red-600 dark:bg-red-900 dark:text-red-400",
  lapsed: "bg-red-100 text-red-600 dark:bg-red-900 dark:text-red-400",
};

export const STATUS_LABELS: Record<Status, string> = {
  scheduled: "Scheduled",
  pending: "Pending",
  draft: "Draft",
  active: "Active",
  sent: "Sent",
  queried: "Queried",
  received: "Received",
  awaiting_review: "Awaiting Review",
  complete: "Complete",
  approved: "Approved",
  paid: "Paid",
  accepted: "Accepted",
  reconciled: "Reconciled",
  transcribed: "Transcribed",
  cancelled: "Cancelled",
  rejected: "Rejected",
  declined: "Declined",
  failed: "Failed",
  lapsed: "Lapsed",
};

export function StatusBadge({ status }: { status: Status }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[status]}`}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}
