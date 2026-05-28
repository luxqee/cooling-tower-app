import { LucideIcon } from "lucide-react";

interface PlaceholderPageProps {
  title: string;
  description: string;
  icon: LucideIcon;
  phase: string;
  features: string[];
}

export function PlaceholderPage({
  title,
  description,
  icon: Icon,
  phase,
  features,
}: PlaceholderPageProps) {
  return (
    <div className="max-w-3xl">
      <div className="mb-8 flex items-start gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800">
          <Icon className="h-6 w-6 text-amber-500" />
        </div>
        <div className="flex-1">
          <div className="mb-1 flex items-center gap-3">
            <h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-50">
              {title}
            </h2>
            <span className="rounded-md bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-2xs font-mono uppercase tracking-wider text-slate-600 dark:text-slate-400">
              Phase {phase}
            </span>
          </div>
          <p className="text-slate-600 dark:text-slate-400">{description}</p>
        </div>
      </div>

      <div className="rounded-lg border border-dashed border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-8">
        <div className="mb-4">
          <div className="text-2xs font-mono uppercase tracking-wider text-amber-600 dark:text-amber-500 mb-2">
            Not yet built
          </div>
          <h3 className="text-sm font-medium text-slate-900 dark:text-slate-100 mb-1">
            Planned for Phase {phase}
          </h3>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            This module is part of the project plan. The framework is in place
            but no functionality has been implemented yet.
          </p>
        </div>

        <div className="mt-6 pt-6 border-t border-slate-200 dark:border-slate-800">
          <div className="text-2xs font-mono uppercase tracking-wider text-slate-500 dark:text-slate-500 mb-3">
            Planned capabilities
          </div>
          <ul className="space-y-2">
            {features.map((feature, idx) => (
              <li
                key={idx}
                className="flex items-start gap-3 text-sm text-slate-700 dark:text-slate-300"
              >
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-slate-400 dark:bg-slate-600" />
                {feature}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
