"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SignOutButton } from "@clerk/nextjs";
import { cn } from "@/lib/utils/cn";
import { Settings, LogOut } from "lucide-react";
import { navItems, type UserRole } from "@/lib/nav-config";

interface Props {
  visibleHrefs: string[];
  user: { name: string; role: UserRole } | null;
  onNavigate?: () => void;
}

export function NavLinks({ visibleHrefs, user, onNavigate }: Props) {
  const pathname = usePathname();
  const visibleItems = navItems.filter((item) =>
    visibleHrefs.includes(item.href)
  );
  const canSeeSettings = user?.role === "admin" || user?.role === "director";

  return (
    <>
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <div className="mb-2 px-3 text-2xs font-mono uppercase tracking-wider text-slate-500 dark:text-slate-500">
          Operations
        </div>
        <ul className="space-y-0.5">
          {visibleItems.map((item) => {
            const isActive =
              pathname === item.href || pathname.startsWith(item.href + "/");
            const Icon = item.icon;

            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={onNavigate}
                  className={cn(
                    "group relative flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                    isActive
                      ? "bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-50 font-medium"
                      : "text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100"
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
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="border-t border-slate-200 dark:border-slate-800 p-3">
        <div className="mb-2 flex items-center gap-3 rounded-md px-3 py-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900 text-xs font-medium text-amber-700 dark:text-amber-300">
            {user ? user.name.charAt(0).toUpperCase() : "?"}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
              {user ? user.name : "Not signed in"}
            </div>
            <div className="text-2xs font-mono uppercase tracking-wider text-slate-500">
              {user ? user.role.replace("_", " ") : "No role"}
            </div>
          </div>
        </div>
        <div className="space-y-0.5">
          {canSeeSettings && (
            <Link
              href="/settings"
              onClick={onNavigate}
              className="flex items-center gap-3 rounded-md px-3 py-1.5 text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100"
            >
              <Settings className="h-4 w-4" />
              Settings
            </Link>
          )}
          {user ? (
            <SignOutButton>
              <button className="flex w-full items-center gap-3 rounded-md px-3 py-1.5 text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100">
                <LogOut className="h-4 w-4" />
                Sign out
              </button>
            </SignOutButton>
          ) : (
            <Link
              href="/sign-in"
              className="flex items-center gap-3 rounded-md px-3 py-1.5 text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100"
            >
              <LogOut className="h-4 w-4" />
              Sign in
            </Link>
          )}
        </div>
      </div>
    </>
  );
}
