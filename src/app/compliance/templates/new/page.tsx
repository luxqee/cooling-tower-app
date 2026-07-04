import { AppShell } from "@/components/layout/AppShell";
import { getSessionUser } from "@/lib/auth/clerk";
import { redirect } from "next/navigation";
import { TemplateBuilder } from "../TemplateBuilder";

export default async function NewTemplatePage() {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");
  if (user.role !== "admin") redirect("/compliance");

  return (
    <AppShell>
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">
        <div>
          <h1 className="text-xl font-semibold">New Template</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Build a new compliance document template.</p>
        </div>
        <TemplateBuilder />
      </div>
    </AppShell>
  );
}
