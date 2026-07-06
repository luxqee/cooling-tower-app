"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils/cn";
import type { LucideIcon } from "lucide-react";

export interface TabItem {
  href: string;
  label: string;
  Icon: LucideIcon;
}

interface Props {
  tabs: TabItem[];
}

export function BottomTabBarClient({ tabs }: Props) {
  const pathname = usePathname();

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 flex h-16 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 pb-[env(safe-area-inset-bottom)]">
      {tabs.map(({ href, label, Icon }) => {
        const isActive = pathname === href || pathname.startsWith(href + "/");
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex flex-1 flex-col items-center justify-center gap-0.5 text-xs font-medium transition-colors",
              isActive
                ? "text-amber-600 dark:text-amber-400"
                : "text-slate-500 dark:text-slate-400"
            )}
          >
            <Icon className={cn("h-5 w-5", isActive && "text-amber-600 dark:text-amber-400")} />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
