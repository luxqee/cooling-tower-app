"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { navItems } from "@/lib/nav-config";
import { cn } from "@/lib/utils/cn";
import { Settings, LogOut } from "lucide-react";

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed left-0 top-0 z-30 flex h-screen w-64 flex-col border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
      {/* Brand */}
      <div className="flex h-16 items-center gap-3 border-b border-slate-200 dark:border-slate-800 px-6">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-amber-500 text-slate-950 font-mono text-sm font-bold">
          CT
        </div>
        <div className="flex flex-col">
          <span className="text-sm font-semibold leading-tight text-slate-900 dark:text-slate-100">
            Field Ops
          </span>
          <span className="text-2xs leading-tight text-slate-500 dark:text-slate-400 font-mono uppercase tracking-wider">
            Phase 0
          </span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <div className="mb-2 px-3 text-2xs font-mono uppercase tracking-wider text-slate-500 dark:text-slate-500">
          Operations
        </div>
        <ul className="space-y-0.5">
          {navItems.map((item) => {
            const isActive =
              pathname === item.href || pathname.startsWith(item.href + "/");
            const Icon = item.icon;

            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    "group relative flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                    isActive
                      ? "bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-50 font-medium"
                      : "text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-850 hover:text-slate-900 dark:hover:text-slate-100"
                  )}
                >
                  {isActive && (
                    <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r bg-amber-500" />
                  )}
                  <Icon
                    className={cn(
                      "h-4 w-4 shrink-0",
                      isActive
                        ? "text-amber-500"
                        : "text-slate-500 dark:text-slate-500 group-hover:text-slate-700 dark:group-hover:text-slate-300"
                    )}
                  />
                  <span className="flex-1">{item.label}</span>
                  <span className="text-2xs font-mono text-slate-400 dark:text-slate-600">
                    {item.phase}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* User section (placeholder for auth) */}
      <div className="border-t border-slate-200 dark:border-slate-800 p-3">
        <div className="mb-2 flex items-center gap-3 rounded-md px-3 py-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-200 dark:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-300">
            ?
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
              Not signed in
            </div>
            <div className="text-2xs font-mono uppercase tracking-wider text-slate-500">
              No role
            </div>
          </div>
        </div>
        <div className="space-y-0.5">
          <Link
            href="#"
            className="flex items-center gap-3 rounded-md px-3 py-1.5 text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-850 hover:text-slate-900 dark:hover:text-slate-100"
          >
            <Settings className="h-4 w-4" />
            Settings
          </Link>
          <Link
            href="/login"
            className="flex items-center gap-3 rounded-md px-3 py-1.5 text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-850 hover:text-slate-900 dark:hover:text-slate-100"
          >
            <LogOut className="h-4 w-4" />
            Sign in
          </Link>
        </div>
      </div>
    </aside>
  );
}
