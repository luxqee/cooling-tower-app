import { AppShell } from "@/components/layout/AppShell";
import { requireRole } from "@/lib/auth/clerk";
import { PAGE_ACCESS } from "@/lib/permissions";
import { db } from "@/lib/db/client";
import { redirect } from "next/navigation";
import Link from "next/link";
import { CustomerList } from "./CustomerList";

export default async function CustomersPage() {
  const user = await requireRole(PAGE_ACCESS.customers).catch(() => null);
  if (!user) redirect("/");

  const customers = await db.customer.findMany({
    select: {
      id: true,
      name: true,
      abn: true,
      contactPerson: true,
      email: true,
      phone: true,
      _count: { select: { jobs: true } },
    },
    orderBy: { name: "asc" },
    take: 200,
  });

  const rows = customers.map((c) => ({
    id:            c.id,
    name:          c.name,
    abn:           c.abn,
    contactPerson: c.contactPerson,
    email:         c.email,
    phone:         c.phone,
    jobCount:      c._count.jobs,
  }));

  return (
    <AppShell>
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold">Customers</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
              Customer contacts and linked jobs
            </p>
          </div>
          {user.role === "admin" && (
            <Link
              href="/customers/new"
              className="px-4 min-h-[40px] flex items-center rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-semibold text-sm"
            >
              New customer
            </Link>
          )}
        </div>
        <CustomerList customers={rows} />
      </div>
    </AppShell>
  );
}
