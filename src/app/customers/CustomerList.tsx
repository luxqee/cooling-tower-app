"use client";

import { useState } from "react";
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

export function CustomerList({ customers }: { customers: CustomerRow[] }) {
  const [query, setQuery] = useState("");
  const filtered = query.trim()
    ? customers.filter((c) => c.name.toLowerCase().includes(query.toLowerCase()))
    : customers;

  return (
    <div className="space-y-4">
      <input
        type="search"
        placeholder="Search customers…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="w-full min-h-[44px] rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 text-base"
      />

      {filtered.length === 0 && (
        <p className="text-sm text-slate-500 dark:text-slate-400 py-4">No customers found.</p>
      )}

      {filtered.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-700">
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
