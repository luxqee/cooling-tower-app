import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { requireRole } from "@/lib/auth/clerk";
import { db } from "@/lib/db/client";
import { redirect, notFound } from "next/navigation";

const STATUS_BADGE: Record<string, string> = {
  scheduled: "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300",
  active: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  complete: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400",
  cancelled: "bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400",
};

export default async function JobDetailPage({ params }: { params: { id: string } }) {
  const user = await requireRole(["director", "service_manager", "admin", "sales_engineer"]).catch(() => null);
  if (!user) redirect("/");

  const job = await db.job.findUnique({
    where: { id: params.id },
    include: {
      assignments: { include: { user: { select: { name: true } } } },
      timeEntries: { where: { status: "complete" }, select: { durationMinutes: true } },
      variations: { orderBy: { submittedAt: "desc" } },
      invoices: { select: { id: true, invoiceNumber: true, status: true, totalAmount: true } },
      complianceDocuments: { include: { template: { select: { name: true } } }, orderBy: { submittedAt: "desc" } },
      communications: { include: { author: { select: { name: true } } }, orderBy: { createdAt: "desc" } },
      assets: { include: { asset: { select: { id: true, serialNumber: true, assetType: true } } } },
      materialEntries: { orderBy: { createdAt: "desc" } },
      voiceNotes: { include: { technician: { select: { name: true } }, photos: true }, orderBy: { createdAt: "desc" } },
      contract: { select: { id: true, siteName: true, billingCadence: true } },
    },
  });

  if (!job) notFound();

  const loggedMinutes = job.timeEntries.reduce((sum, e) => sum + (e.durationMinutes ?? 0), 0);
  const loggedHours = Math.round((loggedMinutes / 60) * 10) / 10;
  const crew = [...new Set(job.assignments.map((a) => a.user.name))];
  const invoice = job.invoices[0] ?? null;

  return (
    <AppShell>
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        <div>
          <Link href="/jobs" className="text-xs text-amber-600 dark:text-amber-400 hover:underline">← Back to jobs</Link>
          <div className="flex items-start justify-between gap-4 mt-1">
            <div>
              <h1 className="text-xl font-semibold">{job.customerName}</h1>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">{job.siteName} · {job.siteAddress}</p>
            </div>
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize shrink-0 ${STATUS_BADGE[job.status] ?? "bg-slate-100 text-slate-600"}`}>
              {job.status}
            </span>
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 dark:border-slate-700 divide-y divide-slate-200 dark:divide-slate-700">
          <div className="flex px-4 py-3 text-sm">
            <span className="w-36 text-slate-500 dark:text-slate-400 shrink-0">Job type</span>
            <span>{job.jobType}</span>
          </div>
          <div className="flex px-4 py-3 text-sm">
            <span className="w-36 text-slate-500 dark:text-slate-400 shrink-0">Hours</span>
            <span className={loggedHours > job.quotedHours * 1.1 ? "text-red-600 font-semibold" : ""}>
              {loggedHours}h logged / {job.quotedHours}h quoted
            </span>
          </div>
          {job.quotedCost != null && (
            <div className="flex px-4 py-3 text-sm">
              <span className="w-36 text-slate-500 dark:text-slate-400 shrink-0">Quoted cost</span>
              <span>${Number(job.quotedCost).toFixed(2)}</span>
            </div>
          )}
          <div className="flex px-4 py-3 text-sm">
            <span className="w-36 text-slate-500 dark:text-slate-400 shrink-0">Crew</span>
            <span>{crew.length > 0 ? crew.join(", ") : "Unassigned"}</span>
          </div>
          {job.contract && (
            <div className="flex px-4 py-3 text-sm">
              <span className="w-36 text-slate-500 dark:text-slate-400 shrink-0">Contract</span>
              <span>Generated from a {job.contract.billingCadence} maintenance contract</span>
            </div>
          )}
          <div className="flex px-4 py-3 text-sm">
            <span className="w-36 text-slate-500 dark:text-slate-400 shrink-0">Invoice</span>
            {invoice ? (
              <Link href={`/invoices/${invoice.id}`} className="text-amber-600 dark:text-amber-400 hover:underline">
                {invoice.invoiceNumber ?? "Draft"} — {invoice.status} — ${Number(invoice.totalAmount).toFixed(2)}
              </Link>
            ) : (
              <span className="text-slate-400">No invoice yet</span>
            )}
          </div>
        </div>

        <section className="space-y-2">
          <h2 className="text-sm font-medium text-slate-700 dark:text-slate-300">Variations ({job.variations.length})</h2>
          {job.variations.length === 0 && <p className="text-sm text-slate-500">No variations submitted.</p>}
          {job.variations.length > 0 && (
            <div className="rounded-lg border border-slate-200 dark:border-slate-700 divide-y divide-slate-200 dark:divide-slate-700">
              {job.variations.map((v) => (
                <div key={v.id} className="px-4 py-3 text-sm flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate">{v.description}</p>
                    <p className="text-xs text-slate-500 capitalize">{v.status}</p>
                  </div>
                  <p className="font-medium shrink-0">${Number(v.costEstimate).toFixed(2)}</p>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="space-y-2">
          <h2 className="text-sm font-medium text-slate-700 dark:text-slate-300">Assets serviced ({job.assets.length})</h2>
          {job.assets.length === 0 && <p className="text-sm text-slate-500">No assets linked to this job.</p>}
          {job.assets.length > 0 && (
            <div className="rounded-lg border border-slate-200 dark:border-slate-700 divide-y divide-slate-200 dark:divide-slate-700">
              {job.assets.map((ja) => (
                <div key={ja.asset.id} className="px-4 py-3 text-sm">
                  <p className="font-medium">{ja.asset.serialNumber}</p>
                  <p className="text-xs text-slate-500">{ja.asset.assetType}</p>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="space-y-2">
          <h2 className="text-sm font-medium text-slate-700 dark:text-slate-300">Materials &amp; costs ({job.materialEntries.length})</h2>
          {job.materialEntries.length === 0 && <p className="text-sm text-slate-500">No materials logged.</p>}
          {job.materialEntries.length > 0 && (
            <div className="rounded-lg border border-slate-200 dark:border-slate-700 divide-y divide-slate-200 dark:divide-slate-700">
              {job.materialEntries.map((m) => (
                <div key={m.id} className="px-4 py-3 text-sm flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate">{m.description}</p>
                    <p className="text-xs text-slate-500 capitalize">{m.status}</p>
                  </div>
                  <p className="shrink-0">
                    ${Number(m.estimatedCost).toFixed(2)}
                    {m.actualCost != null && ` (actual $${Number(m.actualCost).toFixed(2)})`}
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="space-y-2">
          <h2 className="text-sm font-medium text-slate-700 dark:text-slate-300">Communication log ({job.communications.length})</h2>
          {job.communications.length === 0 && <p className="text-sm text-slate-500">No entries yet.</p>}
          {job.communications.length > 0 && (
            <div className="rounded-lg border border-slate-200 dark:border-slate-700 divide-y divide-slate-200 dark:divide-slate-700">
              {job.communications.map((c) => (
                <div key={c.id} className="px-4 py-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-amber-600 dark:text-amber-400 capitalize">{c.type.replace("_", " ")}</span>
                    <span className="text-xs text-slate-400">{new Date(c.createdAt).toLocaleDateString("en-AU")}</span>
                  </div>
                  <p className="mt-0.5">{c.body}</p>
                  {c.author?.name && <p className="text-xs text-slate-400 mt-0.5">— {c.author.name}</p>}
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="space-y-2">
          <h2 className="text-sm font-medium text-slate-700 dark:text-slate-300">Voice notes ({job.voiceNotes.length})</h2>
          {job.voiceNotes.length === 0 && <p className="text-sm text-slate-500">No voice notes recorded.</p>}
          {job.voiceNotes.length > 0 && (
            <div className="rounded-lg border border-slate-200 dark:border-slate-700 divide-y divide-slate-200 dark:divide-slate-700">
              {job.voiceNotes.map((note) => (
                <div key={note.id} className="px-4 py-3 text-sm space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-slate-500">{note.technician.name} · {new Date(note.createdAt).toLocaleDateString("en-AU")}</span>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${
                      note.status === "transcribed"
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400"
                        : note.status === "failed"
                          ? "bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400"
                          : note.status === "awaiting_review"
                            ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400"
                            : "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300"
                    }`}>
                      {note.status.replace("_", " ")}
                    </span>
                  </div>
                  {note.mediaType === "video" && (
                    <video controls className="w-full rounded-lg" src={`/api/photos?url=${encodeURIComponent(note.audioUrl)}`} />
                  )}
                  {note.transcript && <p className="text-slate-700 dark:text-slate-300">&ldquo;{note.transcript}&rdquo;</p>}
                  {note.summary && <p className="text-xs text-slate-500 dark:text-slate-400">{note.summary}</p>}
                  {note.photos.length > 0 && (
                    <div className="flex gap-2 flex-wrap">
                      {note.photos.map((photo) => (
                        <a key={photo.id} href={`/api/photos?url=${encodeURIComponent(photo.photoUrl)}`} target="_blank" rel="noopener noreferrer">
                          <img
                            src={`/api/photos?url=${encodeURIComponent(photo.photoUrl)}`}
                            alt="Attached"
                            className="w-16 h-16 object-cover rounded-lg border border-slate-200 dark:border-slate-700"
                          />
                        </a>
                      ))}
                    </div>
                  )}
                  {Array.isArray(note.actionItems) && note.actionItems.length > 0 && (
                    <ul className="list-disc list-inside text-xs text-slate-500 dark:text-slate-400">
                      {(note.actionItems as string[]).map((item, i) => <li key={i}>{item}</li>)}
                    </ul>
                  )}
                  {note.status === "pending" && <p className="text-xs text-slate-400">Transcribing…</p>}
                  {note.status === "failed" && <p className="text-xs text-red-500">Transcription failed for this recording.</p>}
                  {note.status === "awaiting_review" && <p className="text-xs text-amber-600 dark:text-amber-400">Waiting for the technician to review and send.</p>}
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="space-y-2">
          <h2 className="text-sm font-medium text-slate-700 dark:text-slate-300">Compliance documents ({job.complianceDocuments.length})</h2>
          {job.complianceDocuments.length === 0 && <p className="text-sm text-slate-500">No compliance documents submitted.</p>}
          {job.complianceDocuments.length > 0 && (
            <div className="rounded-lg border border-slate-200 dark:border-slate-700 divide-y divide-slate-200 dark:divide-slate-700">
              {job.complianceDocuments.map((doc) => (
                <div key={doc.id} className="px-4 py-3 text-sm flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate">{doc.template.name}</p>
                    <p className="text-xs text-slate-500">{new Date(doc.submittedAt).toLocaleDateString("en-AU")}</p>
                  </div>
                  <a
                    href={`/api/compliance/documents/${doc.id}/pdf`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-amber-600 dark:text-amber-400 hover:underline shrink-0"
                  >
                    Preview PDF
                  </a>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}
