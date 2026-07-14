import { PageSkeleton } from "@/components/ui/PageSkeleton";

export default function JobsLoading() {
  return (
    <PageSkeleton>
      <div className="space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="h-20 rounded-lg border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-900 animate-pulse"
          />
        ))}
      </div>
    </PageSkeleton>
  );
}
