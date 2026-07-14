"use client";

import { useState } from "react";
import { Menu, X } from "lucide-react";
import { NavLinks } from "./NavLinks";
import type { UserRole } from "@/lib/nav-config";

interface Props {
  visibleHrefs: string[];
  user: { name: string; role: UserRole } | null;
}

export function MobileNavClient({ visibleHrefs, user }: Props) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="lg:hidden fixed top-3 left-3 z-50 flex h-11 w-11 items-center justify-center rounded-md text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        aria-label="Open menu"
      >
        <Menu className="h-5 w-5" />
      </button>

      {isOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
          onClick={() => setIsOpen(false)}
        />
      )}

      <aside
        className={`lg:hidden fixed left-0 top-0 z-50 flex h-screen w-72 flex-col border-r border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-900 transition-transform duration-200 ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-16 items-center justify-between border-b border-slate-300 dark:border-slate-800 px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-amber-500 text-slate-950 font-mono text-sm font-bold">
              CT
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-semibold leading-tight text-slate-900 dark:text-slate-100">
                Field Ops
              </span>
              <span className="text-2xs leading-tight text-slate-500 dark:text-slate-400 font-mono uppercase tracking-wider">
                CT Field Ops
              </span>
            </div>
          </div>
          <button
            onClick={() => setIsOpen(false)}
            className="flex h-11 w-11 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
            aria-label="Close menu"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <NavLinks
          visibleHrefs={visibleHrefs}
          user={user}
          onNavigate={() => setIsOpen(false)}
        />
      </aside>
    </>
  );
}
