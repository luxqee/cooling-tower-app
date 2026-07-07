import { AppShell } from "@/components/layout/AppShell";
import { getSessionUser } from "@/lib/auth/clerk";
import { db } from "@/lib/db/client";
import { redirect, notFound } from "next/navigation";
import { TemplateBuilder } from "../../TemplateBuilder";
import type { TemplateSections } from "@/lib/compliance/types";

export default async function EditTemplatePage({ params }: { params: { id: string } }) {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");
  if (user.role !== "admin") redirect("/compliance");

  const template = await db.complianceTemplate.findUnique({ where: { id: params.id } }).catch(() => null);
  if (!template || !template.isActive) notFound();

  return (
    <AppShell>
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">Edit Template</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">{template.name}</p>
          </div>
          <a
            href={`/api/compliance/templates/${template.id}/preview`}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 inline-flex items-center gap-1.5 min-h-[36px] px-3 rounded-lg border border-slate-300 dark:border-slate-600 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          >
            Preview PDF ↗
          </a>
        </div>
        <TemplateBuilder
          templateId={template.id}
          initialData={{
            name: template.name,
            type: template.type,
            sections: template.sections as unknown as TemplateSections,
          }}
        />
      </div>
    </AppShell>
  );
}
