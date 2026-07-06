import { getSessionUser } from "@/lib/auth/clerk";
import { navItems } from "@/lib/nav-config";
import { NavLinks } from "./NavLinks";

export async function Sidebar() {
  const user = await getSessionUser();
  const visibleHrefs = user
    ? navItems
        .filter((item) => item.visibleTo.includes(user.role))
        .map((item) => item.href)
    : [];

  return (
    <aside className="hidden lg:flex fixed left-0 top-0 z-30 h-screen w-64 flex-col border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
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
            CT Field Ops
          </span>
        </div>
      </div>

      <NavLinks
        visibleHrefs={visibleHrefs}
        user={user ? { name: user.name, role: user.role } : null}
      />
    </aside>
  );
}
