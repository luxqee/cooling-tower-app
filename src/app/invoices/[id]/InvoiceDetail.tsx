"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ExternalLink } from "lucide-react";

interface Invoice {
  id: string;
  invoiceNumber: string | null;
  status: "draft" | "sent" | "paid";
  baseAmount: number;
  variationsTotal: number;
  totalAmount: number;
  notes: string | null;
  sentAt: string | null;
  sentToEmail: string | null;
  paidAt: string | null;
  createdAt: string;
}

interface Variation {
  id: string;
  description: string;
  costEstimate: number;
}

interface InvoiceDetailProps {
  invoice: Invoice;
  job: { customerName: string; siteName: string; siteAddress: string; jobType: string; actualHours: number };
  variations: Variation[];
  defaultHourlyRate: number | null;
  userRole: "admin" | "director";
}

const STATUS_BADGE: Record<string, string> = {
  draft: "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300",
  sent:  "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  paid:  "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400",
};

const inp = "w-full min-h-[44px] rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 text-base";

export function InvoiceDetail({ invoice: initial, job, variations, defaultHourlyRate, userRole }: InvoiceDetailProps) {
  const router = useRouter();
  const [invoice, setInvoice] = useState(initial);

  // Labour section
  const [labourMode, setLabourMode] = useState<"direct" | "calculator">("direct");
  const [baseInput, setBaseInput] = useState(initial.baseAmount > 0 ? String(initial.baseAmount) : "");
  const [hourlyRate, setHourlyRate] = useState(defaultHourlyRate != null ? String(defaultHourlyRate) : "");
  const [labourError, setLabourError] = useState<string | null>(null);
  const [isSavingLabour, startLabourTransition] = useTransition();

  // Notes section
  const [notes, setNotes] = useState(initial.notes ?? "");
  const [isSavingNotes, startNotesTransition] = useTransition();
  const [notesError, setNotesError] = useState<string | null>(null);

  // Send section
  const [sendEmail, setSendEmail] = useState("");
  const [sendError, setSendError] = useState<string | null>(null);
  const [isSending, startSendTransition] = useTransition();

  // Mark as paid
  const [isPaying, startPayTransition] = useTransition();
  const [payError, setPayError] = useState<string | null>(null);

  const calculatedLabour = hourlyRate ? job.actualHours * Number(hourlyRate) : null;

  async function patchInvoice(data: Record<string, unknown>) {
    const res = await fetch(`/api/invoices/${invoice.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
    return res.json() as Promise<Invoice>;
  }

  function saveLabour() {
    const amount = parseFloat(baseInput);
    if (isNaN(amount) || amount < 0) { setLabourError("Enter a valid amount."); return; }
    setLabourError(null);
    startLabourTransition(async () => {
      try {
        const updated = await patchInvoice({ baseAmount: amount });
        setInvoice(updated);
        router.refresh();
      } catch (e: unknown) {
        setLabourError((e as Error).message);
      }
    });
  }

  function saveNotes() {
    setNotesError(null);
    startNotesTransition(async () => {
      try {
        const updated = await patchInvoice({ notes: notes || null });
        setInvoice(updated);
        router.refresh();
      } catch (e: unknown) {
        setNotesError((e as Error).message);
      }
    });
  }

  function sendInvoice() {
    if (!sendEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(sendEmail)) {
      setSendError("Enter a valid email address.");
      return;
    }
    setSendError(null);
    startSendTransition(async () => {
      const res = await fetch(`/api/invoices/${invoice.id}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: sendEmail }),
      });
      const data = await res.json();
      if (!res.ok) { setSendError(data.error ?? "Failed to send."); return; }
      setInvoice((prev) => ({ ...prev, status: "sent", sentAt: data.sentAt, sentToEmail: data.sentToEmail }));
      router.refresh();
    });
  }

  function markPaid() {
    setPayError(null);
    startPayTransition(async () => {
      try {
        const updated = await patchInvoice({ status: "paid" });
        setInvoice(updated);
        router.refresh();
      } catch (e: unknown) {
        setPayError((e as Error).message);
      }
    });
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-1">
          <h1 className="text-xl font-semibold font-mono">
            {invoice.invoiceNumber ?? "Draft Invoice"}
          </h1>
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${STATUS_BADGE[invoice.status]}`}>
            {invoice.status}
          </span>
        </div>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {job.customerName} — {job.siteName}
        </p>
        <p className="text-xs text-slate-500 mt-0.5">
          Created {new Date(invoice.createdAt).toLocaleDateString("en-AU")}
        </p>
      </div>

      {/* Labour amount */}
      <div className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Labour amount</h2>
          <div className="flex gap-1 text-xs">
            {(["direct", "calculator"] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setLabourMode(mode)}
                className={`px-3 py-1 rounded-lg border transition-colors ${
                  labourMode === mode
                    ? "border-amber-500 bg-amber-500 text-white"
                    : "border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300"
                }`}
              >
                {mode === "direct" ? "Direct $" : "Calculator"}
              </button>
            ))}
          </div>
        </div>

        {labourMode === "direct" ? (
          <div className="flex gap-3 items-end">
            <div className="flex-1 space-y-1">
              <label className="text-xs font-medium text-slate-600 dark:text-slate-400">Labour ($)</label>
              <input type="number" inputMode="decimal" min={0} step={0.01} value={baseInput} onChange={(e) => setBaseInput(e.target.value)} placeholder="0.00" className={inp} />
            </div>
            <button onClick={saveLabour} disabled={isSavingLabour} className="min-h-[44px] px-5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white font-semibold text-sm disabled:opacity-40">
              {isSavingLabour ? "Saving…" : "Save"}
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Actual hours logged: <span className="font-semibold">{job.actualHours}h</span>
            </p>
            <div className="flex gap-3 items-end">
              <div className="flex-1 space-y-1">
                <label className="text-xs font-medium text-slate-600 dark:text-slate-400">Hourly rate ($/hr)</label>
                <input type="number" inputMode="decimal" min={0} step={0.01} value={hourlyRate} onChange={(e) => setHourlyRate(e.target.value)} placeholder="145.00" className={inp} />
              </div>
              <div className="flex-1 space-y-1">
                <label className="text-xs font-medium text-slate-600 dark:text-slate-400">Calculated total</label>
                <div className="min-h-[44px] rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3 flex items-center text-base font-semibold">
                  {calculatedLabour != null ? `$${calculatedLabour.toFixed(2)}` : "—"}
                </div>
              </div>
            </div>
            {calculatedLabour != null && (
              <button
                onClick={() => { setBaseInput(calculatedLabour.toFixed(2)); setLabourMode("direct"); }}
                className="text-sm text-amber-600 dark:text-amber-400 underline underline-offset-2"
              >
                Use ${calculatedLabour.toFixed(2)} as labour amount →
              </button>
            )}
          </div>
        )}
        {labourError && <p className="text-sm text-red-600">{labourError}</p>}
      </div>

      {/* Line items */}
      <div className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 p-5 space-y-3">
        <h2 className="text-sm font-semibold">Line items</h2>
        <div className="space-y-2">
          <div className="flex justify-between text-sm py-2 border-b border-slate-100 dark:border-slate-700">
            <span className="text-slate-600 dark:text-slate-400">Labour — {job.jobType}</span>
            <span className="font-medium">${invoice.baseAmount.toFixed(2)}</span>
          </div>
          {variations.map((v) => (
            <div key={v.id} className="flex justify-between text-sm py-2 border-b border-slate-100 dark:border-slate-700">
              <span className="text-slate-600 dark:text-slate-400 mr-4">Variation: {v.description}</span>
              <span className="font-medium shrink-0">${v.costEstimate.toFixed(2)}</span>
            </div>
          ))}
          <div className="flex justify-between text-base font-bold pt-2">
            <span>Total</span>
            <span>${invoice.totalAmount.toFixed(2)}</span>
          </div>
        </div>
      </div>

      {/* Notes */}
      <div className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 p-5 space-y-3">
        <h2 className="text-sm font-semibold">Notes</h2>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="Optional notes shown on the invoice…"
          className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm resize-none"
        />
        {notesError && <p className="text-sm text-red-600">{notesError}</p>}
        <button onClick={saveNotes} disabled={isSavingNotes} className="min-h-[40px] px-4 rounded-lg border border-slate-300 dark:border-slate-600 text-sm font-medium disabled:opacity-40">
          {isSavingNotes ? "Saving…" : "Save notes"}
        </button>
      </div>

      {/* Send panel */}
      {invoice.status !== "paid" && (
        <div className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 p-5 space-y-4">
          <h2 className="text-sm font-semibold">Send invoice</h2>
          {invoice.sentAt && (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Last sent to <span className="font-medium">{invoice.sentToEmail}</span> on {new Date(invoice.sentAt).toLocaleString("en-AU")}
            </p>
          )}
          <div className="flex gap-3 items-end flex-wrap">
            <div className="flex-1 min-w-[200px] space-y-1">
              <label className="text-xs font-medium text-slate-600 dark:text-slate-400">Customer email</label>
              <input type="email" value={sendEmail} onChange={(e) => setSendEmail(e.target.value)} placeholder="customer@example.com" className={inp} />
            </div>
            <a href={`/api/invoices/${invoice.id}/pdf`} target="_blank" rel="noreferrer"
              className="flex items-center gap-1.5 min-h-[44px] px-4 rounded-lg border border-slate-300 dark:border-slate-600 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 shrink-0">
              <ExternalLink className="w-4 h-4" />
              Preview PDF
            </a>
            <button onClick={sendInvoice} disabled={isSending} className="min-h-[44px] px-5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white font-semibold text-sm disabled:opacity-40 shrink-0">
              {isSending ? "Sending…" : invoice.sentAt ? "Re-send" : "Send invoice"}
            </button>
          </div>
          {sendError && <p className="text-sm text-red-600">{sendError}</p>}
        </div>
      )}

      {/* Mark as paid — director only, shown when sent */}
      {invoice.status === "sent" && userRole === "director" && (
        <div className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 p-5 space-y-3">
          <h2 className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">Mark as paid</h2>
          <p className="text-sm text-emerald-700 dark:text-emerald-400">
            Confirm payment has been received for {invoice.invoiceNumber ?? "this invoice"}.
          </p>
          {payError && <p className="text-sm text-red-600">{payError}</p>}
          <button onClick={markPaid} disabled={isPaying} className="min-h-[44px] px-5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm disabled:opacity-40">
            {isPaying ? "Updating…" : "Mark as paid"}
          </button>
        </div>
      )}

      {/* Paid confirmation */}
      {invoice.status === "paid" && (
        <div className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 p-5">
          <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">
            ✓ Paid {invoice.paidAt ? `on ${new Date(invoice.paidAt).toLocaleDateString("en-AU")}` : ""}
          </p>
        </div>
      )}

      {/* Back link */}
      <Link href="/invoices" className="text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 underline underline-offset-2">
        ← Back to invoices
      </Link>
    </div>
  );
}
