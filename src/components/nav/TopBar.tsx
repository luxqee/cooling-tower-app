"use client";

import { usePathname } from "next/navigation";
import { navItems } from "@/lib/nav-config";
import { Bell, Search } from "lucide-react";

export function TopBar() {
  const pathname = usePathname();
  const currentNav = navItems.find(
    (item) => pathname === item.href || pathname.startsWith(item.href + "/")
  );

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur pl-14 pr-4 lg:px-8">
      <div>
        <div className="text-2xs font-mono uppercase tracking-wider text-slate-500 dark:text-slate-500">
          Field Operations
        </div>
        <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-50">
          {currentNav?.label ?? "Overview"}
        </h1>
      </div>

      <div className="flex items-center gap-2">
        <button
          className="flex h-9 w-9 items-center justify-center rounded-md text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100 transition-colors"
          aria-label="Search"
        >
          <Search className="h-4 w-4" />
        </button>
        <button
          className="relative flex h-9 w-9 items-center justify-center rounded-md text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100 transition-colors"
          aria-label="Notifications"
        >
          <Bell className="h-4 w-4" />
          <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-amber-500" />
        </button>
      </div>
    </header>
  );
}
