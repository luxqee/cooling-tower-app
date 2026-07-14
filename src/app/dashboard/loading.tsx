import { PageSkeleton } from "@/components/ui/PageSkeleton";

export default function DashboardLoading() {
  return (
    <PageSkeleton>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="h-32 rounded-lg border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-900 animate-pulse"
          />
        ))}
      </div>
    </PageSkeleton>
  );
}
