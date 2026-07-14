"use client";

import { useState, useRef, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { navItems } from "@/lib/nav-config";
import { Search, X } from "lucide-react";
import { NotificationBell } from "./NotificationBell";
import { ThemeToggle } from "@/components/theme/ThemeToggle";

interface SearchResults {
  jobs: { id: string; customerName: string; siteName: string; status: string }[];
  customers: { id: string; name: string; contactPerson: string | null }[];
}

interface TopBarProps {
  showSearch?: boolean;
}

export function TopBar({ showSearch = false }: TopBarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const currentNav = navItems.find(
    (item) => pathname === item.href || pathname.startsWith(item.href + "/")
  );

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResults | null>(null);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const timeout = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(trimmed)}`);
        if (res.ok) setResults(await res.json());
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(timeout);
  }, [query]);

  function closeSearch() {
    setOpen(false);
    setQuery("");
    setResults(null);
  }

  function goTo(href: string) {
    closeSearch();
    router.push(href);
  }

  const hasResults = results && (results.jobs.length > 0 || results.customers.length > 0);
  const trimmedQuery = query.trim();

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-slate-300 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur pl-14 pr-4 lg:px-8">
      <div>
        <div className="text-2xs font-mono uppercase tracking-wider text-slate-500 dark:text-slate-500">
          Field Operations
        </div>
        <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-50">
          {currentNav?.label ?? "Overview"}
        </h1>
      </div>

      <div className="flex items-center gap-2">
        {showSearch && (
          <div ref={containerRef} className="relative">
            {open ? (
              <div className="flex items-center gap-1 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 pl-2 pr-1 h-9 w-40 sm:w-64">
                <Search className="h-3.5 w-3.5 shrink-0 text-slate-500" />
                <input
                  ref={inputRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Escape") closeSearch(); }}
                  placeholder="Search jobs, customers…"
                  className="flex-1 min-w-0 bg-transparent text-sm outline-none text-slate-900 dark:text-slate-100"
                />
                <button
                  type="button"
                  onClick={closeSearch}
                  aria-label="Close search"
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded text-slate-500 hover:text-slate-700 dark:hover:text-slate-200"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setOpen(true)}
                className="flex h-9 w-9 items-center justify-center rounded-md text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100 transition-colors"
                aria-label="Search"
              >
                <Search className="h-4 w-4" />
              </button>
            )}

            {open && trimmedQuery.length >= 2 && (
              <div className="absolute right-0 mt-2 w-72 sm:w-80 max-h-96 overflow-y-auto rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg">
                {loading && <p className="px-4 py-3 text-sm text-slate-500">Searching…</p>}
                {!loading && !hasResults && (
                  <p className="px-4 py-3 text-sm text-slate-500">No matches for &ldquo;{trimmedQuery}&rdquo;.</p>
                )}
                {!loading && results && results.jobs.length > 0 && (
                  <div className="py-1">
                    <p className="px-4 pt-2 pb-1 text-2xs font-mono uppercase tracking-wider text-slate-500">Jobs</p>
                    {results.jobs.map((job) => (
                      <button
                        key={job.id}
                        type="button"
                        onClick={() => goTo(`/jobs/${job.id}`)}
                        className="w-full text-left px-4 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-800"
                      >
                        <span className="font-medium text-slate-900 dark:text-slate-100">{job.customerName}</span>
                        <span className="text-slate-500"> — {job.siteName}</span>
                      </button>
                    ))}
                  </div>
                )}
                {!loading && results && results.customers.length > 0 && (
                  <div className="py-1 border-t border-slate-100 dark:border-slate-800">
                    <p className="px-4 pt-2 pb-1 text-2xs font-mono uppercase tracking-wider text-slate-500">Customers</p>
                    {results.customers.map((customer) => (
                      <button
                        key={customer.id}
                        type="button"
                        onClick={() => goTo(`/customers/${customer.id}`)}
                        className="w-full text-left px-4 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-800"
                      >
                        <span className="font-medium text-slate-900 dark:text-slate-100">{customer.name}</span>
                        {customer.contactPerson && <span className="text-slate-500"> — {customer.contactPerson}</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
        <ThemeToggle />
        <NotificationBell />
      </div>
    </header>
  );
}
