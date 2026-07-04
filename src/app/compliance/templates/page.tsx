import { AppShell } from "@/components/layout/AppShell";
import { requireRole } from "@/lib/auth/clerk";
import { db } from "@/lib/db/client";
import { redirect } from "next/navigation";
import Link from "next/link";
import { DeleteTemplateButton } from "./TemplateBuilder";

const TYPE_LABELS:  Record<string, string> = { swms: "SWMS", jsa: "JSA", whs: "WHS" };
const TYPE_COLOURS: Record<string, string> = {
  swms: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  jsa:  "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  whs:  "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
};

export default async function TemplatesPage() {
  const user = await requireRole(["admin"]).catch(() => null);
  if (!user) redirect("/sign-in");

  const templates = await db.complianceTemplate.findMany({
    where: { isActive: true },
    orderBy: { createdAt: "asc" },
  });

  return (
    <AppShell>
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold">Compliance Templates</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Manage SWMS, JSA, and WHS templates</p>
          </div>
          <Link href="/compliance/templates/new" className="min-h-[40px] px-4 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-semibold text-sm flex items-center">
            New template
          </Link>
        </div>

        {templates.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400 py-8 text-center">No templates yet. Create one to get started.</p>
        ) : (
          <div className="space-y-2">
            {templates.map((t) => {
              const sectionCount = Array.isArray(t.sections) ? (t.sections as unknown[]).length : 0;
              const fieldCount   = Array.isArray(t.sections)
                ? (t.sections as Array<{ fields?: unknown[] }>).reduce((sum, s) => sum + (s.fields?.length ?? 0), 0)
                : 0;
              return (
                <div key={t.id} className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${TYPE_COLOURS[t.type] ?? ""}`}>
                          {TYPE_LABELS[t.type] ?? t.type}
                        </span>
                        <p className="font-medium truncate">{t.name}</p>
                      </div>
                      <p className="text-xs text-slate-400">{sectionCount} sections · {fieldCount} fields</p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <Link href={`/compliance/templates/${t.id}/edit`} className="text-xs text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 underline underline-offset-2">
                        Edit
                      </Link>
                      <DeleteTemplateButton id={t.id} name={t.name} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}
