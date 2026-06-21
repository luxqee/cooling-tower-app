"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

const ROLES = [
  { value: "technician", label: "Technician" },
  { value: "director", label: "Director" },
  { value: "service_manager", label: "Service Manager" },
  { value: "admin", label: "Admin" },
  { value: "sales_engineer", label: "Sales Engineer" },
  { value: "draftsman", label: "Draftsman" },
] as const;

type Role = (typeof ROLES)[number]["value"];

const ROLE_COLOURS: Record<string, string> = {
  technician: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  director: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
  service_manager: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  admin: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  sales_engineer: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  draftsman: "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300",
};

const ROLE_LABELS: Record<string, string> = Object.fromEntries(ROLES.map((r) => [r.value, r.label]));

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
  currentJob?: string | null;
}

interface TeamClientProps {
  users: User[];
  canEdit: boolean;
}

function UserRow({ user, canEdit }: { user: User; canEdit: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [role, setRole] = useState<Role>(user.role as Role);
  const [isActive, setIsActive] = useState(user.isActive);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      const res = await fetch(`/api/team/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role, isActive }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Failed to update.");
        return;
      }
      setEditing(false);
      setError(null);
      router.refresh();
    });
  }

  return (
    <div className={`rounded-xl border px-4 py-4 bg-white dark:bg-slate-800 space-y-3 ${
      isActive ? "border-slate-200 dark:border-slate-700" : "border-slate-200 dark:border-slate-700 opacity-50"
    }`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-0.5">
          <div className="flex items-center gap-2">
            <p className="font-medium">{user.name}</p>
            {!isActive && <span className="text-xs text-slate-400 font-mono">inactive</span>}
          </div>
          <p className="text-sm text-slate-500 truncate">{user.email}</p>
          {user.currentJob && (
            <p className="text-xs text-slate-400 truncate">{user.currentJob}</p>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {!editing && (
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${ROLE_COLOURS[user.role] ?? ""}`}>
              {ROLE_LABELS[user.role] ?? user.role}
            </span>
          )}
          {canEdit && !editing && (
            <button
              onClick={() => setEditing(true)}
              className="text-xs text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 underline underline-offset-2"
            >
              Edit
            </button>
          )}
        </div>
      </div>

      {editing && (
        <div className="space-y-3 pt-1 border-t border-slate-100 dark:border-slate-700">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-500">Role</label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as Role)}
                className="w-full min-h-[40px] rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-2 text-sm"
              >
                {ROLES.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-500">Status</label>
              <select
                value={isActive ? "active" : "inactive"}
                onChange={(e) => setIsActive(e.target.value === "active")}
                className="w-full min-h-[40px] rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-2 text-sm"
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button
              onClick={() => { setEditing(false); setRole(user.role as Role); setIsActive(user.isActive); setError(null); }}
              className="flex-1 min-h-[36px] rounded-lg border border-slate-300 dark:border-slate-600 text-sm"
            >
              Cancel
            </button>
            <button
              onClick={save}
              disabled={isPending}
              className="flex-1 min-h-[36px] rounded-lg bg-amber-500 hover:bg-amber-600 text-white font-semibold text-sm disabled:opacity-40"
            >
              {isPending ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function TeamClient({ users, canEdit }: TeamClientProps) {
  return (
    <div className="space-y-2">
      {users.map((u) => (
        <UserRow key={u.id} user={u} canEdit={canEdit} />
      ))}
    </div>
  );
}
