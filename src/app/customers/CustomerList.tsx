"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface CustomerRow {
  id:            string;
  name:          string;
  abn:           string | null;
  contactPerson: string | null;
  email:         string | null;
  phone:         string | null;
  jobCount:      number;
}

// The initial `customers` prop is capped server-side (most recent 200, see
// customers/page.tsx) so the page never loads unbounded years of history.
// Typing a search query re-queries the server instead of filtering that
// capped list client-side — otherwise a customer outside the initial 200
// would be unfindable by search, which defeats the point of a search box.
export function CustomerList({ customers: initialCustomers }: { customers: CustomerRow[] }) {
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<CustomerRow[] | null>(null);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setSearchResults(null);
      return;
    }
    const ctrl = new AbortController();
    setSearching(true);
    const timer = setTimeout(() => {
      fetch(`/api/customers?q=${encodeURIComponent(trimmed)}`, { signal: ctrl.signal })
        .then((r) => (r.ok ? r.json() : []))
        .then((data: CustomerRow[]) => setSearchResults(data))
        .catch(() => {})
        .finally(() => setSearching(false));
    }, 250);
    return () => { clearTimeout(timer); ctrl.abort(); };
  }, [query]);

  const filtered = searchResults ?? initialCustomers;

  return (
    <div className="space-y-4">
      <input
        type="search"
        placeholder="Search customers…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="w-full min-h-[44px] rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 text-base"
      />

      {searching && (
        <p className="text-sm text-slate-500 dark:text-slate-400 py-1">Searching…</p>
      )}

      {!searching && filtered.length === 0 && (
        <p className="text-sm text-slate-500 dark:text-slate-400 py-4">No customers found.</p>
      )}

      {!searching && filtered.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-300 dark:border-slate-700">
                {["Name", "ABN", "Contact", "Email", "Phone", "Jobs"].map((h) => (
                  <th
                    key={h}
                    className="pb-2 pr-4 text-left text-xs font-medium text-slate-500 dark:text-slate-400 whitespace-nowrap"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr
                  key={c.id}
                  className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40"
                >
                  <td className="py-3 pr-4">
                    <Link
                      href={`/customers/${c.id}`}
                      className="font-medium text-amber-600 dark:text-amber-400 hover:underline"
                    >
                      {c.name}
                    </Link>
                  </td>
                  <td className="py-3 pr-4 text-slate-500">{c.abn ?? "—"}</td>
                  <td className="py-3 pr-4 text-slate-500">{c.contactPerson ?? "—"}</td>
                  <td className="py-3 pr-4 text-slate-500">{c.email ?? "—"}</td>
                  <td className="py-3 pr-4 text-slate-500">{c.phone ?? "—"}</td>
                  <td className="py-3 pr-4 text-slate-500">{c.jobCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
