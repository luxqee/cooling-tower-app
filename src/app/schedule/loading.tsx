import { PageSkeleton } from "@/components/ui/PageSkeleton";

export default function ScheduleLoading() {
  return (
    <PageSkeleton>
      <div className="grid grid-cols-7 gap-2">
        {Array.from({ length: 7 }).map((_, i) => (
          <div
            key={i}
            className="h-64 rounded-lg border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-900 animate-pulse"
          />
        ))}
      </div>
    </PageSkeleton>
  );
}
